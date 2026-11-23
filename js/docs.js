'use strict';
// =====================================================================
// DOCUMENTOS DE LOS ESTUDIANTES
// - Áreas: planes y documentos PIE separados de los planes por riesgo de repitencia
// - Visor dentro de la plataforma (PDF, Word, Excel, imágenes)
// - Editor de documentos Word: guarda una nueva versión en el archivo del sistema
// - Copia de documentos vinculados al archivo del sistema
// - Privacidad al usar IA (Ley 19.628 y Ley 21.719) y varias claves de Groq
// =====================================================================
const AREAS = {
  PIE: { label: 'Programa PIE', corto: 'PIE', tone: 'pie', icon: 'puzzle', plan: 'Plan PIE' },
  Repitencia: { label: 'Riesgo de repitencia', corto: 'Riesgo de repitencia', tone: 'warn', icon: 'alert-triangle', plan: 'Plan de riesgo de repitencia' }
};
const RE_PIE_DOC = /\bpaci\b|\bpai\b|plan de apoyo individual|adecuaci[oó]n curricular/i;
const RE_REPITENCIA = /repitencia|repetir|riesgo de (repet|reprob)|acompa[ñn]amiento|decreto\s*(n[°º.]?\s*)?67|riesgo acad[eé]mico/i;

const IA_AVISO = `Antes de enviar datos a la IA (Groq, servicio externo con servidores fuera de Chile):
• Solo se envían datos agregados o seudonimizados: sin nombres, RUN, correos ni teléfonos de estudiantes o familias.
• No se envían diagnósticos ni datos de salud; solo cantidades y tipos de apoyo.
• La finalidad es exclusivamente pedagógica y de gestión del establecimiento.
• El resultado es una propuesta: debe revisarlo un profesional antes de usarlo o compartirlo.
• Cada consulta queda registrada en la bitácora.
Se aplica la Ley N° 19.628 sobre protección de la vida privada (vigente) y los principios de la Ley N° 21.719 (licitud, finalidad, proporcionalidad, seguridad y confidencialidad; datos de niños, niñas y adolescentes tratados en su interés superior).`;

Object.assign(app, {
  // ---------------- ÁREAS: PIE / RIESGO DE REPITENCIA ----------------
  areaFromText(t) { t = String(t || ''); if (RE_PIE_DOC.test(t)) return 'PIE'; if (RE_REPITENCIA.test(t)) return 'Repitencia'; return 'PIE'; },
  /** Área de un plan (colección reports). */
  planArea(r) {
    if (r.areaFija && r.area) return r.area;
    if (r.area === 'Repitencia') return 'Repitencia';
    return this.areaFromText(`${r.type || ''} ${r.fuente || ''} ${r.titulo || ''}`);
  },
  /** Área de un documento ('' si es un respaldo general). */
  evArea(e) {
    if (!e.area) return '';
    if (e.areaFija || e.area !== 'PIE') return e.area;
    // El documento de un plan sigue al plan
    const key = `${State.rawInclusionReports.length}|${State.lastSync}|${State.areaVer || 0}`;
    if (this._planByEv?.key !== key) { const m = new Map(); State.rawInclusionReports.forEach(r => { if (r.evidenceId) m.set(String(r.evidenceId), r); }); this._planByEv = { key, m }; }
    const plan = this._planByEv.m.get(String(e.id));
    if (plan) return this.planArea(plan);
    return this.areaFromText(`${e.type || ''} ${e.fileName || ''} ${e.description || ''} ${e.titulo || ''}`);
  },
  areaIndex(area) {
    const key = `${area}|${State.rawEvidences.length}|${State.rawInclusionReports.length}|${State.lastSync}|${State.areaVer || 0}`;
    this._areaIdx = this._areaIdx || {};
    if (this._areaIdx[area]?.key === key) return this._areaIdx[area].idx;
    const idx = new Map();
    const get = id => { const k = String(id); if (!idx.has(k)) idx.set(k, { plans: 0, docs: 0, ultima: '' }); return idx.get(k); };
    State.rawInclusionReports.forEach(r => { if (this.planArea(r) !== area) return; const x = get(r.studentId); x.plans++; if ((r.date || '') > x.ultima) x.ultima = r.date || ''; });
    State.rawEvidences.forEach(e => { if (this.evArea(e) !== area) return; const x = get(e.studentId); x.docs++; if ((e.date || '') > x.ultima) x.ultima = e.date || ''; });
    this._areaIdx[area] = { key, idx };
    return idx;
  },
  /** ¿Está en riesgo de repitencia? Por marca manual en la ficha o por tener plan/documentos de esa área. */
  isRep(s) {
    if (s.riesgoRepitencia?.activo) return true;
    const p = this.areaIndex('Repitencia').get(String(s.id));
    return !!(p && (p.plans || p.docs));
  },
  repBadge(s) {
    if (!this.isRep(s)) return '';
    const r = s.riesgoRepitencia;
    const title = r?.activo ? `Marcado por ${r.por || ''} el ${fmtDate(r.fecha)}${r.motivo ? ': ' + r.motivo : ''}` : 'Tiene plan por riesgo de repitencia';
    return `<span class="pie-badge pie-badge--rep" title="${esc(title)}">${ico('alert-triangle')}Riesgo de repitencia</span>`;
  },
  canMarkRep() { return hasAccess('editar_fichas') || hasAccess('gestionar_usuarios'); },
  /** Botón de la ficha para marcar o quitar la marca manual de riesgo de repitencia. */
  repToggleHtml(s) {
    if (!this.canMarkRep()) return '';
    const r = s.riesgoRepitencia;
    return r?.activo
      ? `<button type="button" class="btn btn--sm" onclick="app.toggleRep(${jsq(s.id)}, false)">${ico('x')}Quitar marca de riesgo de repitencia</button>`
      : `<button type="button" class="btn btn--sm" onclick="app.toggleRep(${jsq(s.id)}, true)">${ico('alert-triangle')}Marcar en riesgo de repitencia</button>`;
  },
  toggleRep(id, activo) {
    const s = this.getStudent(id);
    if (!s) return;
    const guardar = async motivo => {
      const data = activo
        ? { activo: true, motivo: motivo || '', fecha: today(), por: State.currentUser.name }
        : { ...(s.riesgoRepitencia || {}), activo: false, quitadoPor: State.currentUser.name, fechaQuitado: today() };
      await DB.save('students', { id: s.id, riesgoRepitencia: data }, true);
      State.areaVer = (State.areaVer || 0) + 1;
      toast(activo ? 'Estudiante marcado en riesgo de repitencia' : 'Se quitó la marca de riesgo de repitencia');
      this.render();
    };
    if (activo) {
      ui.modal({
        title: 'Marcar en riesgo de repitencia', icon: 'alert-triangle', tone: 'warn', size: 'md', okText: 'Marcar',
        body: `<p class="modal__msg"><strong>${esc(s.name)}</strong> quedará identificado(a) en su ficha, en las listas del curso y en "Programa PIE y riesgo de repitencia".</p>
          ${fieldHtml('Motivo (opcional)', '<textarea id="rep-motivo" class="input" rows="3" placeholder="Ej: promedio bajo 4,0 en Lenguaje y Matemática; asistencia 82 %"></textarea>')}`,
        onOk: () => guardar(el('rep-motivo').value.trim())
      });
    } else {
      const porPlan = (() => { const p = this.areaIndex('Repitencia').get(String(s.id)); return !!(p && (p.plans || p.docs)); })();
      ui.confirm({ title: 'Quitar marca de riesgo de repitencia', icon: 'x', tone: 'warn', okText: 'Quitar marca',
        msg: `¿Quitar la marca de <strong>${esc(s.name)}</strong>?${porPlan ? ' Seguirá apareciendo en riesgo porque tiene un plan de acompañamiento; para quitarlo, mueva ese plan a PIE o elimínelo.' : ''}`,
        action: () => guardar('') });
    }
  },
  areaBadges(s) { return this.pieBadge(s) + this.repBadge(s); },

  /** Pestaña de la ficha: planes y documentos de un área. */
  renderAreaPlans(area) {
    const A = AREAS[area];
    const can = this.canImportPie();
    const otra = area === 'PIE' ? 'Repitencia' : 'PIE';
    const reports = State.rawInclusionReports.filter(r => sameId(r.studentId, State.selectedStudentId) && this.planArea(r) === area);
    const mover = (kind, id) => can ? `<button class="btn btn--sm" onclick="app.moveArea('${kind}', ${jsq(id)}, '${otra}')">${ico('arrow-right-left')}Mover a ${AREAS[otra].corto}</button>` : '';
    const html = reports.map(r => {
      const ev = r.evidenceId ? State.rawEvidences.find(e => sameId(e.id, r.evidenceId)) : null;
      return `<article class="record" data-tone="${A.tone}">
        <header class="record__head"><span class="record__icon">${ico('file-text')}</span><div><span class="record__date num">${fmtDate(r.date) || 'Sin fecha'}</span><h3>${esc(r.type || A.plan)}</h3></div>${chip(A.corto, A.tone, A.icon)}</header>
        <p class="muted small">Registrado por ${esc(r.responsablePlan || 'Equipo')}${r.fuente ? ` · ${esc(r.fuente)}` : ''}${ev?.editadoPor ? ` · Editado por ${esc(ev.editadoPor)} el ${fmtDate(ev.fechaEdicion)}` : ''}</p>
        ${(r.estrategias || []).length ? `<div class="stack">${r.estrategias.map(e => `
          <div class="strategy"><span class="cell__label">${esc(e.ambito || 'Estrategia')}</span><p class="prewrap">${esc(e.descripcion)}</p>
          ${(e.acciones || []).length ? `<ul class="bullets">${e.acciones.map(a => `<li>${esc(a.descripcion)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`
          : '<p class="muted">No se encontraron acciones o estrategias explícitas en este plan.</p>'}
        <footer class="record__foot"><span></span><span class="row-actions">
          ${ev ? `<button class="btn btn--sm" onclick="app.openEvidence(${jsq(ev.id)})">${ico('eye')}Ver documento</button>` : ''}
          ${ev && can ? `<button class="btn btn--sm" onclick="app.openEvidence(${jsq(ev.id)}, true)">${ico('pencil')}Editar</button>` : ''}
          ${mover('plan', r.id)}</span></footer>
      </article>`;
    }).join('');
    const docs = this.getStudentEvidences(State.selectedStudentId).filter(e => this.evArea(e) === area);
    const porAnio = {};
    docs.forEach(d => { const y = d.anio || String(d.date || '').slice(0, 4) || 'Sin año'; (porAnio[y] = porAnio[y] || []).push(d); });
    const docsHtml = Object.keys(porAnio).sort().reverse().map(y => `
      <div class="pie-year"><h3>${esc(y)}</h3><div class="table-wrap"><table class="table table--dense"><thead><tr><th>Tipo</th><th>Documento</th><th>Fecha</th><th>Ubicación</th><th class="t-actions">Acciones</th></tr></thead><tbody>
      ${porAnio[y].map(d => `<tr>
        <td>${chip(d.type || 'Documento', A.tone)}</td>
        <td><button type="button" class="link-btn cell-title" onclick="app.openEvidence(${jsq(d.id)})">${esc(d.fileName)}</button><span class="cell-sub">${esc(d.editadoPor ? `Editado por ${d.editadoPor} · ${(d.versiones || []).length + 1} versiones` : (d.description || ''))}</span></td>
        <td class="num small">${fmtDate(d.date)}</td>
        <td>${d.archivado ? chip('En el archivo', 'conv', 'archive') : chip('Vinculado', 'neutral', 'link')}</td>
        <td class="t-actions"><span class="row-actions">
          <button class="icon-btn" aria-label="Ver ${esc(d.fileName)}" title="Ver" onclick="app.openEvidence(${jsq(d.id)})">${ico('eye')}</button>
          ${can && this.isEditableName(d.fileName, d.mimeType) ? `<button class="icon-btn" aria-label="Editar ${esc(d.fileName)}" title="Editar" onclick="app.openEvidence(${jsq(d.id)}, true)">${ico('pencil')}</button>` : ''}
          ${can ? `<button class="icon-btn" aria-label="Mover a ${AREAS[otra].corto}" title="Mover a ${AREAS[otra].corto}" onclick="app.moveArea('doc', ${jsq(d.id)}, '${otra}')">${ico('arrow-right-left')}</button>` : ''}
        </span></td></tr>`).join('')}
      </tbody></table></div></div>`).join('');
    const sinArchivar = docs.filter(d => !d.archivado && d.storage === 'drive');
    const acciones = can ? `<div class="row-actions"><button class="btn btn--sm" onclick="app.openPiePlansImport()">${ico('file-up')}Cargar planes (Word)</button><button class="btn btn--sm" onclick="app.openDriveLink()">${ico('folder-sync')}Vincular carpeta de Drive</button></div>` : '';
    const archivar = can && sinArchivar.length ? `<button class="btn btn--sm" onclick="app.archiveDocs(${jsq(sinArchivar.map(d => d.id))})">${ico('archive')}Guardar ${sinArchivar.length} en el archivo</button>` : '';
    this.panel(`${this.panelHead(area === 'PIE' ? 'Planes PIE' : 'Planes por riesgo de repitencia', A.icon, acciones)}<div class="stack">${html || empty('network', area === 'PIE' ? 'No hay planes PIE cargados para este estudiante.' : 'No hay planes por riesgo de repitencia para este estudiante.', A.tone)}</div>
      ${this.panelHead(`Documentos ${area === 'PIE' ? 'PIE' : 'de riesgo de repitencia'} (${docs.length})`, 'folder-open', archivar)}${docsHtml || empty('folder-open', 'No hay documentos vinculados en esta área.', A.tone)}`);
  },
  renderRepitencia() { this.renderAreaPlans('Repitencia'); },

  /** Cambia un plan o documento de área (y su par vinculado). */
  async moveArea(kind, id, area) {
    const ops = [];
    if (kind === 'plan') {
      const r = State.rawInclusionReports.find(x => sameId(x.id, id));
      if (!r) return;
      ops.push({ col: 'reports', id: r.id, data: { area, areaFija: true }, merge: true });
      if (r.evidenceId) ops.push({ col: 'evidences', id: r.evidenceId, data: { area, areaFija: true }, merge: true });
    } else {
      ops.push({ col: 'evidences', id, data: { area, areaFija: true }, merge: true });
      State.rawInclusionReports.filter(r => sameId(r.evidenceId, id)).forEach(r => ops.push({ col: 'reports', id: r.id, data: { area, areaFija: true }, merge: true }));
    }
    try { await DB.batch(ops); State.areaVer = (State.areaVer || 0) + 1; toast(`Movido a ${AREAS[area].label}`); this.render(); }
    catch (e) { toast(e.message, 'error'); }
  },

  /** Revisión masiva: separa los planes por riesgo de repitencia de los planes PIE. */
  openClassifyPlans() {
    const rows = State.rawInclusionReports.map(r => {
      const s = State.rawStudents.find(x => sameId(x.id, r.studentId));
      return { id: r.id, evidenceId: r.evidenceId || '', nombre: s ? this.clean(s.name) : '(estudiante no encontrado)', curso: s ? this.courseNameOf(s) : '', fuente: r.fuente || '', tipo: r.type || '', area: this.planArea(r), antes: this.planArea(r), titulo: r.titulo || '' };
    }).sort((a, b) => (ALL_COURSES.indexOf(a.curso) - ALL_COURSES.indexOf(b.curso)) || a.nombre.localeCompare(b.nombre));
    State.classify = { rows };
    ui.modal({ title: 'Separar planes PIE y planes por riesgo de repitencia', icon: 'arrow-right-left', tone: 'warn', size: 'xl', okText: 'Guardar clasificación', body: '<div id="classify-content"></div>', onOk: () => this.saveClassify() });
    this.renderClassify();
  },
  renderClassify() {
    const c = State.classify;
    const n = a => c.rows.filter(r => r.area === a).length;
    el('classify-content').innerHTML = `
      <p class="modal__msg">Revise el área de cada plan. "Detectar leyendo los documentos" abre cada plan guardado y busca palabras como <em>riesgo de repitencia</em>, <em>acompañamiento</em> o <em>Decreto 67</em> (y <em>PAI</em> o <em>PACI</em> para PIE). Puede corregir cualquier fila antes de guardar.</p>
      <div class="row-actions">
        <button type="button" class="btn" onclick="app.detectPlanAreas()">${ico('scan-search')}Detectar leyendo los documentos</button>
        <button type="button" class="btn" onclick="State.classify.rows.forEach(r => r.area='Repitencia'); app.renderClassify()">Todos a riesgo de repitencia</button>
        <button type="button" class="btn" onclick="State.classify.rows.forEach(r => r.area='PIE'); app.renderClassify()">Todos a PIE</button>
        ${chip(`${n('PIE')} PIE`, 'pie', 'puzzle')}${chip(`${n('Repitencia')} riesgo de repitencia`, 'warn', 'alert-triangle')}
      </div>
      <div class="table-wrap"><table class="table table--dense">
        <thead><tr><th>Estudiante</th><th>Archivo / tipo</th><th>Detectado en el documento</th><th>Área</th></tr></thead>
        <tbody>${c.rows.map((r, i) => `<tr ${r.area !== r.antes ? 'class="is-selected"' : ''}>
          <td><span class="cell-title">${esc(r.nombre)}</span><span class="cell-sub">${esc(r.curso)}</span></td>
          <td class="small">${esc(r.fuente || '-')}<span class="cell-sub">${esc(r.tipo)}</span></td>
          <td class="small">${esc(r.titulo ? r.titulo.slice(0, 110) : '-')}</td>
          <td><select class="input" aria-label="Área del plan de ${esc(r.nombre)}" onchange="State.classify.rows[${i}].area=this.value; app.renderClassify()">${options([['PIE', 'Programa PIE'], ['Repitencia', 'Riesgo de repitencia']], r.area)}</select></td></tr>`).join('') || '<tr><td colspan="4">No hay planes cargados.</td></tr>'}</tbody>
      </table></div>`;
    icons();
  },
  async detectPlanAreas() {
    const c = State.classify;
    const pend = c.rows.filter(r => r.evidenceId);
    if (!pend.length) return toast('Los planes no tienen documento guardado para leer', 'error');
    const done = ui.busy('Leyendo los planes', '');
    try {
      await this.loadMammoth();
      for (const [i, r] of pend.entries()) {
        el('busy-msg').textContent = `${i + 1} de ${pend.length}: ${r.nombre}`;
        try {
          const f = await API.call('file', { id: r.evidenceId });
          const bytes = Uint8Array.from(atob(f.base64), ch => ch.charCodeAt(0));
          let text = '';
          if (/word|docx/i.test(f.mimeType || '') || /\.docx$/i.test(f.fileName || '')) text = (await mammoth.extractRawText({ arrayBuffer: bytes.buffer })).value;
          else if (/html|text/i.test(f.mimeType || '')) text = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html').body.textContent;
          text = text.replace(/\s+/g, ' ').trim();
          const cab = text.slice(0, 1500);
          r.titulo = cab.slice(0, 200);
          r.area = this.areaFromText(`${r.fuente} ${cab}`);
        } catch (e) { r.titulo = 'No se pudo leer: ' + e.message; }
      }
    } finally { done(); }
    this.renderClassify();
  },
  async saveClassify() {
    const ops = [];
    State.classify.rows.forEach(r => {
      ops.push({ col: 'reports', id: r.id, data: { area: r.area, areaFija: true, ...(r.titulo ? { titulo: r.titulo } : {}) }, merge: true });
      if (r.evidenceId) ops.push({ col: 'evidences', id: r.evidenceId, data: { area: r.area, areaFija: true }, merge: true });
    });
    if (!ops.length) return true;
    const done = ui.busy('Guardando clasificación', `${State.classify.rows.length} planes`);
    try { await DB.batch(ops); State.areaVer = (State.areaVer || 0) + 1; toast('Clasificación guardada'); }
    finally { done(); }
    this.render();
  },

  // ---------------- VISOR DE DOCUMENTOS ----------------
  canEditDocs() { return this.canImportPie(); },
  docKind(mime, name) {
    const m = String(mime || ''), n = String(name || '').toLowerCase();
    if (/html/.test(m)) return 'html';
    if (/pdf/.test(m) || n.endsWith('.pdf')) return 'pdf';
    if (/^image\//.test(m) || /\.(png|jpe?g|gif|webp)$/.test(n)) return 'image';
    if (/wordprocessingml|google-apps\.document/.test(m) || n.endsWith('.docx')) return 'docx';
    if (/spreadsheet|excel/.test(m) || /\.xlsx?$/.test(n)) return 'sheet';
    if (/html/.test(m)) return 'html';
    if (/^text\//.test(m) || n.endsWith('.txt')) return 'text';
    return 'other';
  },
  isEditableName(name, mime) { return ['docx', 'html'].includes(this.docKind(mime, name)); },
  /** Limpia HTML de un documento: sin scripts, eventos ni enlaces peligrosos. */
  safeHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }));
    // Celdas y párrafos completamente en negrita son títulos: se centran; el resto del texto se justifica
    doc.querySelectorAll('td, th').forEach(n => {
      const total = n.textContent.replace(/\s/g, '').length;
      if (!total) return;
      const bold = [...n.querySelectorAll('strong, b')].filter(b => !b.parentElement.closest('strong, b') || b.parentElement === n).reduce((t, b) => t + b.textContent.replace(/\s/g, '').length, 0);
      if (bold / total >= 0.9) n.classList.add('doc-head');
    });
    return doc.body.firstChild.innerHTML;
  },
  async openEvidence(id, editar = false) {
    const ev = State.rawEvidences.find(x => sameId(x.id, id)) || { id };
    const done = ui.busy('Abriendo documento', 'Descargando el archivo de forma segura...');
    let f;
    try { f = await API.call('file', { id }); }
    catch (e) { done(); return toast(e.message, 'error'); }
    const bytes = Uint8Array.from(atob(f.base64 || ''), c => c.charCodeAt(0));
    if (State.viewer?.url) URL.revokeObjectURL(State.viewer.url);
    const kind = this.docKind(f.mimeType, f.fileName);
    const url = URL.createObjectURL(new Blob([bytes], { type: kind === 'pdf' ? 'application/pdf' : (f.mimeType || 'application/octet-stream') }));
    State.viewer = { id, ev, f, kind, url, bytes, html: '' };
    try {
      if (kind === 'docx') { await this.loadMammoth(); State.viewer.html = this.safeHtml((await mammoth.convertToHtml({ arrayBuffer: bytes.buffer })).value); }
      else if (kind === 'html') State.viewer.html = this.safeHtml(new TextDecoder().decode(bytes));
      else if (kind === 'sheet' && window.XLSX) { const wb = XLSX.read(bytes, { type: 'array' }); State.viewer.html = wb.SheetNames.map(n => `<h3>${esc(n)}</h3>${this.safeHtml(XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' }))}`).join(''); }
      else if (kind === 'text') State.viewer.text = new TextDecoder().decode(bytes);
    } catch (e) { console.error(e); State.viewer.error = 'No se pudo mostrar el contenido: ' + e.message; }
    done();
    ui.modal({ title: f.fileName || ev.fileName || 'Documento', icon: 'file-text', tone: AREAS[this.evArea(ev)]?.tone || 'conv', size: 'xl', hideOk: true, cancelText: 'Cerrar', body: '<div id="doc-viewer" class="doc-viewer"></div>' });
    if (editar && this.canEditDocs() && State.viewer.html) this.editDocument(); else this.renderViewer();
  },
  viewerBar() {
    const v = State.viewer, ev = v.ev, can = this.canEditDocs();
    const editable = can && v.html && ['docx', 'html'].includes(v.kind) && ev.storage === 'drive';
    return `<div class="doc-viewer__bar">
      <div class="chips">${ev.type ? chip(ev.type, AREAS[this.evArea(ev)]?.tone || 'neutral') : ''}${ev.archivado ? chip('En el archivo de la plataforma', 'conv', 'archive') : ev.storage === 'drive' ? chip('Vinculado desde Drive', 'neutral', 'link') : ''}${(ev.versiones || []).length ? chip(`${ev.versiones.length + 1} versiones`, 'obs', 'history') : ''}</div>
      <div class="row-actions">
        ${editable ? `<button class="btn btn--sm btn--primary" onclick="app.editDocument()">${ico('pencil')}Editar</button>` : ''}
        ${can && ev.storage === 'drive' && !ev.archivado ? `<button class="btn btn--sm" onclick="app.archiveDocs([${jsq(ev.id)}], true)">${ico('archive')}Guardar en el archivo</button>` : ''}
        ${(ev.versiones || []).length ? `<button class="btn btn--sm" onclick="app.showVersions()">${ico('history')}Versiones</button>` : ''}
        <a class="btn btn--sm" href="${v.url}" download="${esc(v.f.fileName || 'documento')}">${ico('download')}Descargar</a>
        ${v.f.url ? `<a class="btn btn--sm" href="${esc(v.f.url)}" target="_blank" rel="noopener">${ico('external-link')}Abrir en Drive</a>` : ''}
      </div></div>`;
  },
  renderViewer() {
    const v = State.viewer;
    let body;
    if (v.error) body = `<p class="note">${ico('alert-triangle')}${esc(v.error)}</p>`;
    else if (v.kind === 'pdf') body = `<iframe class="doc-frame" src="${v.url}" title="${esc(v.f.fileName || 'Documento PDF')}"></iframe>`;
    else if (v.kind === 'image') body = `<div class="doc-paper doc-paper--img"><img src="${v.url}" alt="${esc(v.f.fileName || 'Imagen del documento')}"></div>`;
    else if (v.html) body = `<div class="doc-paper">${v.html}</div>`;
    else if (v.text !== undefined) body = `<pre class="doc-paper prewrap">${esc(v.text)}</pre>`;
    else body = empty('file-question', 'Este formato no se puede mostrar en la página (por ejemplo, Word antiguo .doc). Use "Descargar" o "Abrir en Drive".');
    el('doc-viewer').innerHTML = this.viewerBar() + body;
    ui.guard = null;
    icons();
  },
  showVersions() {
    const ev = State.viewer.ev;
    const list = [...(ev.versiones || []), { fileName: ev.fileName, fecha: ev.fechaEdicion, por: ev.editadoPor, actual: true }].reverse();
    el('doc-viewer').innerHTML = `${this.viewerBar()}<div class="table-wrap"><table class="table table--dense"><thead><tr><th>Versión</th><th>Archivo</th><th>Fecha</th><th>Por</th></tr></thead><tbody>
      ${list.map((x, i) => `<tr><td>${x.actual ? chip('Actual', 'conv') : `#${list.length - i}`}</td><td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.fileName || '')}</a>` : esc(x.fileName || '')}</td><td class="small num">${fmtDate(x.fecha) || '-'}</td><td class="small">${esc(x.por || '-')}</td></tr>`).join('')}
      </tbody></table></div><p class="note">${ico('info')}Las versiones anteriores nunca se borran: quedan en Drive y se abren desde su nombre.</p>
      <div class="row-actions"><button class="btn btn--sm" onclick="app.renderViewer()">${ico('arrow-left')}Volver al documento</button></div>`;
    icons();
  },

  // ---------------- EDITOR ----------------
  editDocument() {
    const v = State.viewer;
    if (!v.html) return toast('Este documento no se puede editar en la plataforma', 'error');
    const b = (cmd, icon, label, arg = '') => `<button type="button" class="icon-btn" title="${label}" aria-label="${label}" onmousedown="event.preventDefault()" onclick="document.execCommand('${cmd}', false, ${arg ? `'${arg}'` : 'null'})">${ico(icon)}</button>`;
    el('doc-viewer').innerHTML = `
      <div class="doc-viewer__bar doc-editor__bar">
        <div class="row-actions" role="toolbar" aria-label="Formato">
          ${b('bold', 'bold', 'Negrita')}${b('italic', 'italic', 'Cursiva')}${b('underline', 'underline', 'Subrayado')}
          ${b('formatBlock', 'heading-2', 'Título', 'h2')}${b('formatBlock', 'pilcrow', 'Párrafo', 'p')}
          ${b('insertUnorderedList', 'list', 'Lista')}${b('insertOrderedList', 'list-ordered', 'Lista numerada')}
          ${b('undo', 'undo-2', 'Deshacer')}${b('redo', 'redo-2', 'Rehacer')}
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn--sm" onclick="app.markEmptyCells()">${ico('scan-search')}Marcar campos vacíos</button>
          <button type="button" class="btn btn--sm" onmousedown="event.preventDefault()" onclick="app.improveSelection()">${ico('sparkles')}Mejorar redacción (IA)</button>
          <button type="button" class="btn btn--sm" onclick="app.cancelEdit()">Cancelar</button>
          <button type="button" class="btn btn--sm btn--primary" onclick="app.saveDocument()">${ico('save')}Guardar nueva versión</button>
        </div>
      </div>
      <p class="note">${ico('info')}Complete o mejore el texto directamente en el documento. Al guardar se crea una nueva versión en Word en el archivo de la plataforma; la versión anterior se conserva. Para mejorar la redacción, seleccione un párrafo: a la IA solo se envía ese texto, sin el nombre ni el RUN del estudiante.</p>
      <div id="doc-edit" class="doc-paper is-editing" contenteditable="true" spellcheck="true" lang="es">${v.html}</div>`;
    ui.guard = 'Hay cambios sin guardar en el documento. ¿Desea cerrarlo de todas formas?';
    icons();
    el('doc-edit').focus();
  },
  cancelEdit() {
    if (!window.confirm('¿Descartar los cambios no guardados?')) return;
    this.renderViewer();
  },
  markEmptyCells() {
    const ed = el('doc-edit');
    if (!ed) return;
    let n = 0;
    ed.querySelectorAll('td, th').forEach(c => {
      const vacia = !c.textContent.replace(/[\s _.\-:]/g, '');
      c.classList.toggle('is-empty-cell', vacia);
      if (vacia) n++;
    });
    toast(n ? `${n} campo(s) vacío(s) marcados en amarillo` : 'No hay campos de tabla vacíos');
    ed.querySelector('.is-empty-cell')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  /** Datos del estudiante del documento abierto, para quitarlos antes de enviar texto a la IA. */
  viewerStudent() { const ev = State.viewer?.ev; return ev ? State.rawStudents.find(s => sameId(s.id, ev.studentId)) : null; },
  async improveSelection() {
    const sel = window.getSelection();
    const ed = el('doc-edit');
    if (!sel.rangeCount || sel.isCollapsed || !ed.contains(sel.anchorNode)) return toast('Seleccione primero el texto que quiere mejorar', 'error');
    const original = sel.toString().trim();
    if (original.length < 15) return toast('Seleccione un texto un poco más largo', 'error');
    if (original.length > 4000) return toast('Seleccione un texto más corto (máximo unos 4.000 caracteres)', 'error');
    if (!AI.ready() || !this.iaConsentQuick()) return;
    const range = sel.getRangeAt(0).cloneRange();
    const s = this.viewerStudent();
    const anon = this.anonimizar(original, s ? [s] : [], 'EL_ESTUDIANTE');
    const done = ui.busy('Mejorando la redacción', 'La IA revisa el texto seleccionado...');
    try {
      const out = await API.call('ai', { motivo: 'Mejora de redacción de un documento', json: false, prompt: `Eres un profesional de educación en Chile (PIE, UTP y convivencia escolar). Mejora la redacción del siguiente texto de un documento escolar: lenguaje técnico, claro, respetuoso y en español de Chile. Mantén el sentido y los datos; NO inventes información. Si falta un dato necesario, escribe [completar: qué falta]. Mantén el marcador EL_ESTUDIANTE tal cual. Responde solo con el texto mejorado, sin comillas ni comentarios.

TEXTO:
${anon}` });
      let txt = String(out.text || '').trim().replace(/^["“]|["”]$/g, '');
      if (!txt) throw new Error('La IA no devolvió texto');
      if (s) txt = txt.replace(/EL_ESTUDIANTE/g, this.formatStudentName ? this.formatStudentName(s.name) : s.name);
      range.deleteContents();
      range.insertNode(document.createTextNode(txt));
      toast('Texto mejorado. Revíselo antes de guardar.');
    } catch (e) { toast('No se pudo mejorar: ' + e.message, 'error'); }
    finally { done(); }
  },
  async saveDocument() {
    const v = State.viewer;
    const clone = el('doc-edit').cloneNode(true);
    clone.querySelectorAll('.is-empty-cell').forEach(c => c.classList.remove('is-empty-cell'));
    clone.querySelectorAll('[class=""]').forEach(c => c.removeAttribute('class'));
    // Los textos descriptivos quedan justificados también en el Word guardado
    clone.querySelectorAll('.doc-head').forEach(n => { n.style.textAlign = 'center'; n.classList.remove('doc-head'); });
    clone.querySelectorAll('p, td, li').forEach(n => { if (n.textContent.trim().length > 90 && !n.style.textAlign && !n.closest('[style*="center"]')) n.style.textAlign = 'justify'; });
    const html = clone.innerHTML;
    const done = ui.busy('Guardando nueva versión', 'Creando el documento Word en el archivo de la plataforma...');
    try {
      const doc = await API.call('guardarDocumento', { id: v.id, html });
      DB.upsertLocal('evidences', doc, false);
      v.ev = doc; v.html = html;
      v.f = { ...v.f, fileName: doc.fileName, url: doc.url };
      // Si el documento es un plan, se actualizan sus ámbitos y estrategias en la ficha
      const plan = State.rawInclusionReports.find(r => sameId(r.evidenceId, v.id));
      if (plan && this.parsePlanHtml) {
        const p = this.parsePlanHtml(html);
        if (p.ambitos.length) await DB.save('reports', { id: plan.id, actualizado: today(), estrategias: p.ambitos.flatMap(a => a.filas.map(f => ({ ambito: a.ambito, descripcion: f.indicador || f.acciones, acciones: f.acciones && f.indicador ? [{ descripcion: f.acciones }] : [], responsable: f.responsable, seguimiento: f.seguimiento }))) }, true);
      }
      ui.guard = null;
      toast('Nueva versión guardada en el archivo de la plataforma');
      this.renderViewer();
      if (State.currentView === 'student_detail') this.changeDetailTab(State.detailTab);
    } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); }
    finally { done(); }
  },

  // ---------------- ARCHIVO DE LA PLATAFORMA ----------------
  async archiveDocs(ids, desdeVisor = false) {
    ids = [...new Set(ids)];
    if (!ids.length) return;
    const done = ui.busy('Guardando en el archivo de la plataforma', `0 de ${ids.length}`);
    let ok = 0, err = 0;
    try {
      for (let i = 0; i < ids.length; i += 25) {
        el('busy-msg').textContent = `${Math.min(i + 25, ids.length)} de ${ids.length}`;
        const r = await API.call('archivarDocumentos', { ids: ids.slice(i, i + 25) });
        ok += r.archivados; err += (r.errores || []).length;
      }
      await this.refresh?.(true);
      toast(`${ok} documento(s) guardados en el archivo${err ? `, ${err} con error (revise que la cuenta del sistema tenga acceso)` : ''}`, err ? 'error' : undefined);
    } catch (e) { toast(e.message, 'error'); }
    finally { done(); }
    if (desdeVisor && State.viewer) { State.viewer.ev = State.rawEvidences.find(x => sameId(x.id, State.viewer.id)) || { ...State.viewer.ev, archivado: true }; this.renderViewer(); }
    else this.render();
  },

  // ---------------- PRIVACIDAD AL USAR IA ----------------
  /** Reemplaza nombres, RUN, correos y teléfonos por marcadores antes de enviar texto a la IA. */
  anonimizar(texto, estudiantes = [], marcador = '[estudiante]') {
    let t = String(texto || '');
    t = t.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK]\b/g, '[RUN]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
      .replace(/(\+?56\s?)?(9\s?)?\d{4}\s?\d{4}\b/g, '[teléfono]');
    const N = s => this.normalizarTexto(s);
    const palabras = new Set();
    estudiantes.forEach(s => N(s.name || '').split(' ').filter(w => w.length > 2 && !['DEL', 'LOS', 'LAS'].includes(w)).forEach(w => palabras.add(w)));
    if (palabras.size) {
      // Cada palabra del nombre se reemplaza (conservando la puntuación) y los marcadores seguidos se unen
      t = t.split(/(\s+)/).map(tok => { const w = tok.replace(/[^\p{L}]/gu, ''); return w && palabras.has(N(w)) ? tok.replace(w, marcador) : tok; }).join('');
      const m = marcador.replace(/[[\]]/g, '\\$&');
      t = t.replace(new RegExp(`${m}(\\s+${m})+`, 'g'), marcador);
    }
    return t;
  },
  iaConsentQuick() {
    if (State.iaOk) return true;
    if (!window.confirm(IA_AVISO + '\n\n¿Acepta enviar el texto seleccionado (sin datos personales) a la IA?')) return false;
    State.iaOk = true;
    return true;
  },
  /** Aviso de protección de datos antes de un análisis con IA. Resuelve true si el usuario acepta. */
  iaConsent(detalle) {
    return new Promise(resolve => {
      let ok = false;
      ui.modal({
        title: 'Uso de IA y protección de datos', icon: 'shield-check', tone: 'obs', size: 'md', okText: 'Acepto y enviar',
        body: `<div class="stack">
          <p class="modal__msg">${esc(IA_AVISO).replace(/\n/g, '<br>')}</p>
          ${detalle ? `<div class="subpanel"><h4>${ico('list-checks')}Datos que se enviarán</h4><p class="small">${detalle}</p></div>` : ''}
          <label class="check"><input type="checkbox" id="ia-acepto"><span>Revisé el aviso y confirmo que el uso tiene una finalidad pedagógica o de gestión del colegio.</span></label>
        </div>`,
        onOk: () => { if (!el('ia-acepto').checked) { toast('Marque la casilla para continuar', 'error'); return false; } ok = true; State.iaOk = true; return true; }
      });
      const obs = new MutationObserver(() => { if (el('modal').hidden) { obs.disconnect(); setTimeout(() => resolve(ok), 0); } });
      obs.observe(el('modal'), { attributes: true, attributeFilter: ['hidden'] });
    });
  },

  // ---------------- CLAVES DE IA (GROQ) ----------------
  aiKeysPanelHtml() {
    return `<div class="panel" id="ai-keys-panel"><div class="panel__head"><h2>${ico('key')}Claves de inteligencia artificial (Groq)</h2>${chip(State.variables.aiConfigured ? `${State.variables.aiKeysCount || 1} clave(s)` : 'Sin configurar', State.variables.aiConfigured ? 'conv' : 'warn')}</div>
      <p class="muted">Puede agregar todas las claves que quiera. El sistema usa la primera disponible y, si una agota su cuota o deja de funcionar, pasa automáticamente a la siguiente. Las claves se guardan en el servidor de Apps Script y nunca llegan al navegador.</p>
      <div id="ai-keys-list"><p class="muted small">Cargando claves...</p></div>
      <div class="grid-3 ai-keys-add">
        ${fieldHtml('Nombre (opcional)', '<input id="ai-key-label" class="input" placeholder="Ej: Cuenta UTP">')}
        ${fieldHtml('Nueva API Key', '<input type="password" id="ai-key-value" class="input" placeholder="gsk_..." autocomplete="off">')}
        <div class="field-end"><button class="btn btn--primary" onclick="app.addAiKey()">${ico('plus')}Agregar clave</button></div>
      </div>
      <p class="note">${ico('info')}Las claves gratuitas se crean en console.groq.com con una cuenta del colegio. Al usar la IA se aplica el aviso de protección de datos (Ley 19.628 y Ley 21.719).</p></div>`;
  },
  async loadAiKeys() {
    if (!el('ai-keys-list')) return;
    try {
      const { keys } = await API.call('iaClaves', {});
      State.variables.aiKeysCount = keys.length; State.variables.aiConfigured = keys.length > 0;
      const tono = e => e === 'disponible' ? 'conv' : e === 'cuota agotada' ? 'warn' : 'proto';
      el('ai-keys-list').innerHTML = keys.length ? `<div class="table-wrap"><table class="table table--dense"><thead><tr><th>Orden</th><th>Nombre</th><th>Clave</th><th>Agregada</th><th class="t-num">Usos</th><th>Último uso</th><th>Estado</th><th class="t-actions"></th></tr></thead><tbody>
        ${keys.map((k, i) => `<tr><td class="num">${i + 1}</td><td>${esc(k.label)}</td><td class="num">gsk_••••${esc(k.fin)}</td><td class="small num">${fmtDate(k.added) || '-'}</td><td class="t-num num">${k.usos}</td><td class="small num">${esc(k.ultimoUso || '-')}</td><td>${chip(k.estado, tono(k.estado))}</td>
          <td class="t-actions"><button class="icon-btn icon-btn--danger" title="Quitar clave" aria-label="Quitar ${esc(k.label)}" onclick="app.removeAiKey(${jsq(k.id)}, ${jsq(k.label)})">${ico('trash-2')}</button></td></tr>`).join('')}
        </tbody></table></div>` : empty('key', 'Aún no hay claves. Agregue al menos una para usar la IA.', 'warn');
      icons();
    } catch (e) { el('ai-keys-list').innerHTML = `<p class="note">${ico('alert-triangle')}${esc(e.message)}</p>`; icons(); }
  },
  async addAiKey() {
    const key = el('ai-key-value').value.trim(), label = el('ai-key-label').value.trim();
    if (!key) return toast('Pegue la API Key', 'error');
    try { await API.call('iaClaveAgregar', { key, label }); el('ai-key-value').value = ''; el('ai-key-label').value = ''; toast('Clave agregada'); this.loadAiKeys(); }
    catch (e) { toast(e.message, 'error'); }
  },
  removeAiKey(id, label) {
    ui.confirm({ title: 'Quitar clave de IA', msg: `¿Quitar la clave <strong>${esc(label)}</strong>? El sistema seguirá usando las demás.`, okText: 'Sí, quitar', action: async () => {
      await API.call('iaClaveQuitar', { id });
      toast('Clave quitada');
      this.renderAdmin(); icons();
    } });
  }
});

// Confirmación antes de cerrar el editor con cambios sin guardar
(() => {
  const close = ui.close.bind(ui);
  ui.close = function (force) {
    if (!force && this.guard && !window.confirm(this.guard)) return;
    this.guard = null;
    if (State.viewer?.url && !el('modal').hidden && el('doc-viewer')) { const u = State.viewer.url; setTimeout(() => URL.revokeObjectURL(u), 1000); State.viewer.url = ''; }
    close();
  };
})();
