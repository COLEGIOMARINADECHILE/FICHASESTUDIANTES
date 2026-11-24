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
  /** Equipo PIE: por perfil o cargo. */
  isPieStaff() { const u = State.currentUser || {}; return /\bPIE\b|inclusi[oó]n|integraci[oó]n/i.test(`${u.role || ''} ${u.customRole || ''}`); },
  isAdminStaff() { return hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema'); },
  /** PIE: solo el Equipo PIE y los administrativos modifican. Riesgo de repitencia: también quienes editan fichas. */
  canEditArea(area) {
    if (area === 'PIE') return this.isPieStaff() || this.isAdminStaff();
    return this.isPieStaff() || this.isAdminStaff() || hasAccess('editar_fichas');
  },
  renderAreaPlans(area) {
    const A = AREAS[area];
    const can = this.canEditArea(area);
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
    const acciones = can ? `<div class="row-actions"><button class="btn btn--sm btn--primary" onclick="app.openCreateDoc('${area}')">${ico('file-plus')}${area === 'PIE' ? 'Crear documento PIE' : 'Crear plan de riesgo'}</button><button class="btn btn--sm" onclick="app.openPiePlansImport()">${ico('file-up')}Cargar planes (Word)</button><button class="btn btn--sm" onclick="app.openDriveLink()">${ico('folder-sync')}Vincular carpeta de Drive</button></div>`
      : chip(area === 'PIE' ? 'Solo lectura: edita el Equipo PIE' : 'Solo lectura', 'neutral', 'eye');
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
  /** ¿Puede modificar este documento? PIE: Equipo PIE y administrativos. */
  canEditEv(ev) { const a = this.evArea(ev || {}); return a ? this.canEditArea(a) : this.canEditDocs(); },
  docKind(mime, name) {
    const m = String(mime || ''), n = String(name || '').toLowerCase();
    if (/html/.test(m)) return 'html';
    if (/pdf/.test(m) || n.endsWith('.pdf')) return 'pdf';
    if (/^image\//.test(m) || /\.(png|jpe?g|gif|webp)$/.test(n)) return 'image';
    if (/wordprocessingml|google-apps\.document/.test(m) || n.endsWith('.docx')) return 'docx';
    if (/msword|opendocument\.text|rtf/.test(m) || /\.(doc|odt|rtf)$/.test(n)) return 'word';
    if (/spreadsheet|excel/.test(m) || /\.xlsx?$/.test(n)) return 'sheet';
    if (/^text\//.test(m) || n.endsWith('.txt')) return 'text';
    return 'other';
  },
  /** Word (.docx, .doc, .odt, .rtf), Documentos de Google y PDF (convertido) se pueden editar. */
  isEditableName(name, mime) { return ['docx', 'html', 'word', 'pdf'].includes(this.docKind(mime, name)); },
  /** Limpia HTML de un documento: sin scripts, eventos ni enlaces peligrosos. */
  safeHtml(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    // Casillas de Word (controles de formulario) -> símbolos que se pueden marcar
    doc.querySelectorAll('input[type="checkbox"]').forEach(i => i.replaceWith(doc.createTextNode(i.checked || i.hasAttribute('checked') ? '☒' : '☐')));
    doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form, input, button, select, textarea').forEach(n => n.remove());
    doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) || a.name === 'contenteditable') n.removeAttribute(a.name);
    }));
    // Celdas completamente en negrita son títulos: se centran; el resto del texto se justifica
    doc.querySelectorAll('td, th').forEach(n => {
      const total = n.textContent.replace(/\s/g, '').length;
      if (!total) return;
      const bold = [...n.querySelectorAll('strong, b')].filter(b => !b.parentElement.closest('strong, b')).reduce((t, b) => t + b.textContent.replace(/\s/g, '').length, 0);
      if (bold / total >= 0.9) n.classList.add('doc-head');
    });
    return doc.body.firstChild.innerHTML;
  },
  /**
   * Word -> HTML conservando lo que define el formato del colegio: imágenes y logos del cuerpo,
   * líneas en blanco y alineación de cada párrafo (títulos centrados, textos justificados).
   */
  async docxToHtml(bytes) {
    await this.loadMammoth();
    const { value } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, { ignoreEmptyParagraphs: false });
    let html = this.safeHtml(value);
    try {
      if (!window.JSZip) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      const zip = await JSZip.loadAsync(bytes);
      const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const parse = x => new DOMParser().parseFromString(x, 'application/xml');
      const jcDe = p => { const ppr = [...p.childNodes].find(n => n.localName === 'pPr'); const jc = ppr && [...ppr.childNodes].find(n => n.localName === 'jc'); return jc ? jc.getAttributeNS(W, 'val') || jc.getAttribute('w:val') : ''; };
      // Alineación definida por los estilos (por ejemplo, un título centrado por estilo)
      const porEstilo = {};
      const sx = zip.file('word/styles.xml');
      if (sx) [...parse(await sx.async('string')).getElementsByTagNameNS(W, 'style')].forEach(s => { const v = jcDe(s); if (v) porEstilo[s.getAttributeNS(W, 'styleId') || s.getAttribute('w:styleId')] = v; });
      const body = parse(await zip.file('word/document.xml').async('string')).getElementsByTagNameNS(W, 'body')[0];
      // Párrafos del cuerpo en orden (sin los de cuadros de texto, que el lector de Word no incluye)
      const enCuadro = p => { for (let n = p.parentNode; n && n.nodeType === 1; n = n.parentNode) if (n.localName === 'txbxContent') return true; return false; };
      const ps = [...body.getElementsByTagNameNS(W, 'p')].filter(p => !enCuadro(p));
      const alin = ps.map(p => { let v = jcDe(p); if (!v) { const ppr = [...p.childNodes].find(n => n.localName === 'pPr'); const st = ppr && [...ppr.childNodes].find(n => n.localName === 'pStyle'); if (st) v = porEstilo[st.getAttributeNS(W, 'val') || st.getAttribute('w:val')] || ''; } return v; });
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      const els = [...doc.body.firstChild.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li')];
      if (els.length === alin.length) {
        const css = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify', left: 'left', start: 'left' };
        els.forEach((e, i) => { const a = css[alin[i]]; if (a) e.style.textAlign = a; });
        html = doc.body.firstChild.innerHTML;
      }
    } catch (e) { console.warn('Alineación del documento no disponible:', e); }
    return html;
  },
  /** Vista fiel: el documento tal como se subió (encabezado, logos, pie), convertido a PDF por el servidor. */
  async loadFaithful() {
    const v = State.viewer;
    if (v.pdfUrl || v.cargandoFiel) return;
    v.cargandoFiel = true;
    try {
      const out = await API.call('exportarDocumento', { id: v.id, formato: 'pdf' });
      v.pdfUrl = URL.createObjectURL(new Blob([Uint8Array.from(atob(out.base64), c => c.charCodeAt(0))], { type: 'application/pdf' }));
    } catch (e) { v.vista = 'texto'; toast('No se pudo generar la vista fiel: ' + e.message, 'error'); }
    finally { v.cargandoFiel = false; }
    if (State.viewer === v && el('doc-viewer') && !el('doc-edit')) this.renderViewer();
  },
  setVista(vista) { State.viewer.vista = vista; this.renderViewer(); },
  async openEvidence(id, editar = false, comoWord = false) {
    const ev = State.rawEvidences.find(x => sameId(x.id, id)) || { id };
    const done = ui.busy(comoWord ? 'Convirtiendo a Word' : 'Abriendo documento', comoWord ? 'Se reconoce el texto del PDF para poder editarlo...' : 'Descargando el archivo de forma segura...');
    let f;
    try { f = await API.call('file', { id, comoWord }); }
    catch (e) { done(); return toast(e.message, 'error'); }
    const bytes = Uint8Array.from(atob(f.base64 || ''), c => c.charCodeAt(0));
    if (State.viewer?.url) URL.revokeObjectURL(State.viewer.url);
    const kind = this.docKind(f.mimeType, f.fileName);
    const url = URL.createObjectURL(new Blob([bytes], { type: kind === 'pdf' ? 'application/pdf' : (f.mimeType || 'application/octet-stream') }));
    State.viewer = { id, ev, f, kind, url, bytes, html: '', convertido: !!f.convertido, vista: kind === 'docx' && !API.demo && ev.storage === 'drive' ? 'fiel' : 'texto' };
    try {
      if (kind === 'docx') State.viewer.html = await this.docxToHtml(bytes);
      else if (kind === 'html') State.viewer.html = this.safeHtml(new TextDecoder().decode(bytes));
      else if (kind === 'sheet' && window.XLSX) { const wb = XLSX.read(bytes, { type: 'array' }); State.viewer.html = wb.SheetNames.map(n => `<h3>${esc(n)}</h3>${this.safeHtml(XLSX.utils.sheet_to_html(wb.Sheets[n], { header: '', footer: '' }))}`).join(''); }
      else if (kind === 'text') State.viewer.text = new TextDecoder().decode(bytes);
    } catch (e) { console.error(e); State.viewer.error = 'No se pudo mostrar el contenido: ' + e.message; }
    done();
    if (el('modal').hidden || !el('doc-viewer')) ui.modal({ title: f.fileName || ev.fileName || 'Documento', icon: 'file-text', tone: AREAS[this.evArea(ev)]?.tone || 'conv', size: 'xl', hideOk: true, cancelText: 'Cerrar', body: '<div id="doc-viewer" class="doc-viewer"></div>' });
    // Un PDF que se pidió editar se convierte primero a Word
    if (editar && kind === 'pdf' && !comoWord && this.canEditEv(ev)) return this.openEvidence(id, true, true);
    if (editar && this.canEditEv(ev) && State.viewer.html) this.editDocument(); else this.renderViewer();
  },
  viewerBar() {
    const v = State.viewer, ev = v.ev, can = this.canEditEv(ev);
    const editable = can && v.html && ['docx', 'html'].includes(v.kind) && ev.storage === 'drive';
    const pdfEditable = can && v.kind === 'pdf' && ev.storage === 'drive' && !API.demo;
    return `<div class="doc-viewer__bar">
      <div class="chips">${ev.type ? chip(ev.type, AREAS[this.evArea(ev)]?.tone || 'neutral') : ''}${ev.esModelo ? chip('Modelo', 'obs', 'stamp') : ''}${ev.archivado ? chip('En el archivo de la plataforma', 'conv', 'archive') : ev.storage === 'drive' ? chip('Vinculado desde Drive', 'neutral', 'link') : ''}${(ev.versiones || []).length ? chip(`${ev.versiones.length + 1} versiones`, 'obs', 'history') : ''}${!can && this.evArea(ev) === 'PIE' ? chip('Solo lectura', 'neutral', 'eye') : ''}</div>
      ${v.kind === 'docx' && !API.demo && ev.storage === 'drive' ? `<div class="segs" role="group" aria-label="Vista del documento"><button type="button" class="seg" aria-pressed="${v.vista === 'fiel'}" onclick="app.setVista('fiel')">${ico('file-image')}Como se subió</button><button type="button" class="seg" aria-pressed="${v.vista !== 'fiel'}" onclick="app.setVista('texto')">${ico('text')}Texto</button></div>` : ''}
      <div class="row-actions">
        ${editable ? `<button class="btn btn--sm btn--primary" onclick="app.editDocument()">${ico('pencil')}Editar</button>` : ''}
        ${pdfEditable ? `<button class="btn btn--sm btn--primary" onclick="app.openEvidence(${jsq(ev.id)}, true, true)" title="Reconoce el texto del PDF y lo abre como Word editable">${ico('pencil')}Convertir a Word y editar</button>` : ''}
        ${can && editable && ev.storage === 'drive' ? `<button class="btn btn--sm" onclick="app.toggleModelo()">${ico('stamp')}${ev.esModelo ? 'Quitar como modelo' : 'Usar como modelo'}</button>` : ''}
        ${can && ev.storage === 'drive' && !ev.archivado ? `<button class="btn btn--sm" onclick="app.archiveDocs([${jsq(ev.id)}], true)">${ico('archive')}Guardar en el archivo</button>` : ''}
        ${(ev.versiones || []).length ? `<button class="btn btn--sm" onclick="app.showVersions()">${ico('history')}Versiones</button>` : ''}
        <span class="split-btn" role="group" aria-label="Descargar">
          <button class="btn btn--sm" onclick="app.downloadDoc('pdf')">${ico('download')}PDF</button>
          <button class="btn btn--sm" onclick="app.downloadDoc('docx')">${ico('download')}Word</button>
        </span>
        ${v.f.url && v.f.url !== '#' ? `<a class="btn btn--sm" href="${esc(v.f.url)}" target="_blank" rel="noopener">${ico('external-link')}Abrir en Drive</a>` : ''}
      </div></div>`;
  },
  renderViewer() {
    const v = State.viewer;
    let body;
    if (v.error) body = `<p class="note">${ico('alert-triangle')}${esc(v.error)}</p>`;
    else if (v.kind === 'pdf') body = `<iframe class="doc-frame" src="${v.url}" title="${esc(v.f.fileName || 'Documento PDF')}"></iframe>`;
    else if (v.vista === 'fiel' && v.kind === 'docx') { body = v.pdfUrl ? `<iframe class="doc-frame" src="${v.pdfUrl}" title="Documento tal como se subió"></iframe>` : `<div class="doc-loading">${ico('loader')}Preparando la vista del documento tal como se subió (con encabezado y logos)...</div>`; this.loadFaithful(); }
    else if (v.kind === 'image') body = `<div class="doc-paper doc-paper--img"><img src="${v.url}" alt="${esc(v.f.fileName || 'Imagen del documento')}"></div>`;
    else if (v.html) body = `${v.convertido ? `<p class="note">${ico('info')}Documento convertido a Word para verlo y editarlo. Revise el formato antes de guardar.</p>` : ''}${/[☐☒☑]/.test(v.html) && this.canEditEv(v.ev) ? `<p class="note">${ico('square-check')}Este documento tiene casillas. Presione "Editar" para marcarlas.</p>` : ''}<div class="doc-paper">${v.html}</div>`;
    else if (v.text !== undefined) body = `<pre class="doc-paper prewrap">${esc(v.text)}</pre>`;
    else body = empty('file-question', 'Este formato no se puede mostrar en la página. Use la descarga en PDF o Word, o "Abrir en Drive".');
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
  async toggleModelo() {
    const ev = State.viewer.ev;
    try {
      await DB.save('evidences', { id: ev.id, esModelo: !ev.esModelo }, true);
      State.viewer.ev = State.rawEvidences.find(x => sameId(x.id, ev.id)) || { ...ev, esModelo: !ev.esModelo };
      toast(State.viewer.ev.esModelo ? 'Documento marcado como modelo: aparecerá primero al crear documentos de este tipo' : 'Ya no es modelo');
      this.renderViewer();
    } catch (e) { toast(e.message, 'error'); }
  },

  // ---------------- DESCARGA EN PDF O WORD ----------------
  saveBlob(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  async downloadDoc(fmt) {
    const v = State.viewer;
    const base = String(v.f.fileName || 'documento').replace(/\.\w{2,5}$/, '');
    // Si ya está en el formato pedido, se descarga tal cual
    if (v.bytes?.length && ((fmt === 'pdf' && v.kind === 'pdf') || (fmt === 'docx' && v.kind === 'docx' && !v.convertido))) return this.saveBlob(new Blob([v.bytes], { type: fmt === 'pdf' ? 'application/pdf' : v.f.mimeType }), v.f.fileName || `${base}.${fmt}`);
    const done = ui.busy('Preparando la descarga', fmt === 'pdf' ? 'Convirtiendo a PDF...' : 'Convirtiendo a Word...');
    try {
      if (API.demo || v.ev.storage !== 'drive') throw new Error('local');
      const out = await API.call('exportarDocumento', { id: v.id, formato: fmt });
      this.saveBlob(new Blob([Uint8Array.from(atob(out.base64), c => c.charCodeAt(0))], { type: out.mimeType }), out.fileName);
    } catch (e) {
      // Sin servidor: se genera desde el contenido mostrado
      if (!v.html) { done(); return toast(e.message === 'local' ? 'Este formato solo se puede convertir con el servidor configurado.' : e.message, 'error'); }
      if (fmt === 'pdf' && window.html2pdf) {
        const host = document.createElement('div');
        host.className = 'doc-host';
        host.innerHTML = `<div class="doc-paper doc-paper--print" style="width:720px">${v.html}</div>`;
        document.body.appendChild(host);
        document.documentElement.classList.add('is-exporting');
        try { await html2pdf().set({ margin: [15, 15, 15, 15], filename: `${base}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] } }).from(host.firstChild).save(); }
        finally { host.remove(); document.documentElement.classList.remove('is-exporting'); }
      } else {
        this.saveBlob(new Blob(['﻿', `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${v.html}</body></html>`], { type: 'application/msword' }), `${base}.doc`);
      }
    } finally { done(); }
  },

  // ---------------- EDITOR ----------------
  editDocument() {
    const v = State.viewer;
    if (!v.html) return toast('Este documento no se puede editar en la plataforma', 'error');
    const b = (cmd, icon, label, arg = '') => `<button type="button" class="icon-btn" title="${label}" aria-label="${label}" onmousedown="event.preventDefault()" onclick="document.execCommand('${cmd}', false, ${arg ? `'${arg}'` : 'null'})">${ico(icon)}</button>`;
    const nuevo = !!v.nuevo;
    el('doc-viewer').innerHTML = `
      <div class="doc-viewer__bar doc-editor__bar">
        <div class="row-actions" role="toolbar" aria-label="Formato">
          ${b('bold', 'bold', 'Negrita')}${b('italic', 'italic', 'Cursiva')}${b('underline', 'underline', 'Subrayado')}
          ${b('formatBlock', 'heading-2', 'Título', 'h2')}${b('formatBlock', 'pilcrow', 'Párrafo', 'p')}
          ${b('insertUnorderedList', 'list', 'Lista')}${b('insertOrderedList', 'list-ordered', 'Lista numerada')}
          ${b('undo', 'undo-2', 'Deshacer')}${b('redo', 'redo-2', 'Rehacer')}
          <button type="button" class="icon-btn" title="Insertar casilla" aria-label="Insertar casilla" onmousedown="event.preventDefault()" onclick="app.insertCheck()">${ico('square')}</button>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn--sm" onmousedown="event.preventDefault()" onclick="app.addTableChecks()" title="Pone una casilla en cada celda vacía de la tabla donde está el cursor">${ico('square-check')}Casillas en la tabla</button>
          <button type="button" class="btn btn--sm" onclick="app.markEmptyCells()">${ico('scan-search')}Marcar campos vacíos</button>
          <button type="button" class="btn btn--sm" onmousedown="event.preventDefault()" onclick="app.improveSelection()">${ico('sparkles')}Mejorar redacción (IA)</button>
          <button type="button" class="btn btn--sm" onclick="app.cancelEdit()">Cancelar</button>
          <button type="button" class="btn btn--sm btn--primary" onclick="app.saveDocument()">${ico('save')}${nuevo ? 'Guardar documento' : 'Guardar nueva versión'}</button>
        </div>
      </div>
      <p class="note">${ico('info')}${nuevo ? `Documento nuevo para <strong>${esc(v.ev.studentName || '')}</strong> basado en el modelo elegido. Complete los campos y guarde: queda en Word, con el encabezado, logos y pie de página del modelo, en la ficha y en el archivo de la plataforma.` : 'Complete o mejore el texto directamente en el documento. Al guardar se crea una nueva versión en Word que conserva el encabezado, los logos y el pie de página del original; la versión anterior se conserva.'} Pinche una casilla ☐ para marcarla (en una misma fila queda marcada solo una). Para mejorar la redacción, seleccione un párrafo: a la IA no se envía el nombre ni el RUN del estudiante.</p>
      <div id="doc-edit" class="doc-paper is-editing" contenteditable="true" spellcheck="true" lang="es">${v.html}</div>`;
    const ed = el('doc-edit');
    this.decorateChecks(ed);
    ed.addEventListener('click', e => this.onCheckClick(e));
    ed.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && e.target.closest?.('.chk')) { e.preventDefault(); this.toggleCheck(e.target.closest('.chk')); } });
    ui.guard = 'Hay cambios sin guardar en el documento. ¿Desea cerrarlo de todas formas?';
    icons();
    ed.focus();
  },
  cancelEdit() {
    if (!window.confirm('¿Descartar los cambios no guardados?')) return;
    if (State.viewer.nuevo) { ui.guard = null; ui.close(true); return; }
    this.renderViewer();
  },

  // ---------------- CASILLAS MARCABLES ----------------
  /** Convierte los símbolos ☐ ☒ ☑ en casillas que se marcan con un clic. */
  decorateChecks(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => /[☐☒☑✓✔]/.test(n.nodeValue) && !n.parentElement.closest('.chk') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const frag = document.createDocumentFragment();
      n.nodeValue.split(/([☐☒☑✓✔])/).forEach(part => {
        if (!part) return;
        if (/^[☐☒☑✓✔]$/.test(part)) frag.appendChild(this.checkEl(part !== '☐'));
        else frag.appendChild(document.createTextNode(part));
      });
      n.replaceWith(frag);
    });
  },
  checkEl(on) {
    const s = document.createElement('span');
    s.className = 'chk'; s.contentEditable = 'false'; s.tabIndex = 0;
    s.setAttribute('role', 'checkbox'); s.setAttribute('aria-checked', String(!!on));
    s.textContent = on ? '☒' : '☐';
    return s;
  },
  toggleCheck(c, exclusivo = true) {
    const on = c.getAttribute('aria-checked') !== 'true';
    if (on && exclusivo) {
      // En una fila con varias columnas de casillas (L, EP, NL, NO...) queda marcada solo una
      const tr = c.closest('tr');
      const enOtrasCeldas = tr ? [...tr.querySelectorAll('.chk')].filter(x => x.closest('td, th') !== c.closest('td, th')) : [];
      if (enOtrasCeldas.length) enOtrasCeldas.forEach(x => { x.setAttribute('aria-checked', 'false'); x.textContent = '☐'; });
    }
    c.setAttribute('aria-checked', String(on));
    c.textContent = on ? '☒' : '☐';
  },
  onCheckClick(e) {
    let c = e.target.closest?.('.chk');
    // Un clic en una celda que solo tiene una casilla también la marca
    if (!c) { const td = e.target.closest?.('td'); if (td && td.querySelectorAll('.chk').length === 1 && !td.textContent.replace(/[☐☒\s]/g, '')) c = td.querySelector('.chk'); }
    if (c) { e.preventDefault(); this.toggleCheck(c); }
  },
  insertCheck() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !el('doc-edit').contains(sel.anchorNode)) return toast('Ponga el cursor donde quiere la casilla', 'error');
    const r = sel.getRangeAt(0);
    r.deleteContents();
    const c = this.checkEl(false);
    r.insertNode(c);
    r.setStartAfter(c); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  },
  addTableChecks() {
    const sel = window.getSelection();
    const table = sel.rangeCount ? (sel.anchorNode?.nodeType === 1 ? sel.anchorNode : sel.anchorNode?.parentElement)?.closest('#doc-edit table') : null;
    if (!table) return toast('Ponga el cursor dentro de la tabla donde quiere las casillas', 'error');
    let n = 0;
    table.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.children];
      if (cells.length < 2 || cells[0].classList.contains('doc-head') || cells.every(c => c.classList.contains('doc-head') || !c.textContent.trim())) return;
      cells.slice(1).forEach(td => { if (!td.textContent.trim() && !td.querySelector('.chk')) { td.innerHTML = ''; td.appendChild(this.checkEl(false)); td.classList.add('chk-cell'); n++; } });
    });
    toast(n ? `${n} casilla(s) agregadas. Pinche para marcar.` : 'No hay celdas vacías para poner casillas en esa tabla');
  },
  /** Devuelve las casillas a símbolos de texto (☐ / ☒) para guardar en Word. */
  undecorateChecks(root) { root.querySelectorAll('.chk').forEach(c => c.replaceWith(document.createTextNode(c.getAttribute('aria-checked') === 'true' ? '☒' : '☐'))); root.querySelectorAll('.chk-cell').forEach(c => { c.classList.remove('chk-cell'); c.style.textAlign = 'center'; }); },

  markEmptyCells() {
    const ed = el('doc-edit');
    if (!ed) return;
    let n = 0;
    ed.querySelectorAll('td, th').forEach(c => {
      const vacia = !c.textContent.replace(/[\s _.\-:]/g, '');
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
  /** HTML listo para Word: sin marcas del editor, con casillas como símbolos y alineación explícita. */
  editorHtml() {
    const clone = el('doc-edit').cloneNode(true);
    this.undecorateChecks(clone);
    clone.querySelectorAll('.is-empty-cell').forEach(c => c.classList.remove('is-empty-cell'));
    clone.querySelectorAll('.doc-head').forEach(n => { n.style.textAlign = 'center'; n.classList.remove('doc-head'); });
    clone.querySelectorAll('[class=""]').forEach(c => c.removeAttribute('class'));
    clone.querySelectorAll('p, td, li').forEach(n => { if (n.textContent.trim().length > 90 && !n.style.textAlign && !n.closest('[style*="center"]')) n.style.textAlign = 'justify'; });
    return clone.innerHTML;
  },
  planEstrategias(html) {
    const p = this.parsePlanHtml(html);
    return p.ambitos.flatMap(a => a.filas.map(f => ({ ambito: a.ambito, descripcion: f.indicador || f.acciones, acciones: f.acciones && f.indicador ? [{ descripcion: f.acciones }] : [], responsable: f.responsable, seguimiento: f.seguimiento })));
  },
  async saveDocument() {
    const v = State.viewer;
    const html = this.editorHtml();
    if (v.nuevo) return this.saveNewDocument(html);
    const done = ui.busy('Guardando nueva versión', 'Creando el documento Word en el archivo de la plataforma...');
    try {
      const doc = await API.call('guardarDocumento', { id: v.id, html });
      DB.upsertLocal('evidences', doc, false);
      v.ev = doc; v.html = html; v.convertido = false; v.kind = 'docx'; v.bytes = null;
      v.f = { ...v.f, fileName: doc.fileName, url: doc.url };
      // Si el documento es un plan, se actualizan sus ámbitos y estrategias en la ficha
      const plan = State.rawInclusionReports.find(r => sameId(r.evidenceId, v.id));
      if (plan && this.parsePlanHtml) {
        const est = this.planEstrategias(html);
        if (est.length) await DB.save('reports', { id: plan.id, actualizado: today(), estrategias: est }, true);
      }
      ui.guard = null;
      toast('Nueva versión guardada en el archivo de la plataforma');
      this.renderViewer();
      if (State.currentView === 'student_detail') this.changeDetailTab(State.detailTab);
    } catch (e) { toast('No se pudo guardar: ' + e.message, 'error'); }
    finally { done(); }
  },

  // ---------------- CREAR DOCUMENTOS Y PLANES DESDE MODELOS ----------------
  /** Tipos de documento del área: los conocidos más los que ya existen en los documentos cargados. */
  docTypesFor(area) {
    const base = area === 'PIE'
      ? PIE_DOC_TYPES.map(t => t[1]).filter(t => t !== 'Plan de riesgo de repitencia' && t !== 'Certificado de nacimiento')
      : ['Plan de riesgo de repitencia', 'Plan de acompañamiento pedagógico', 'Seguimiento del plan de acompañamiento', 'Informe a la familia'];
    const existentes = State.rawEvidences.filter(e => this.evArea(e) === area && e.type).map(e => e.type);
    return [...new Set([...base, ...existentes])];
  },
  /** Documentos que sirven de modelo: editables, del área; primero los marcados como modelo y los del mismo tipo. */
  modelsFor(area, type) {
    return State.rawEvidences.filter(e => this.evArea(e) === area && e.storage === 'drive' && this.isEditableName(e.fileName, e.mimeType))
      .sort((a, b) => (b.esModelo ? 1 : 0) - (a.esModelo ? 1 : 0) || ((b.type === type) - (a.type === type)) || String(b.date || '').localeCompare(String(a.date || '')));
  },
  openCreateDoc(area, studentId = State.selectedStudentId) {
    if (!this.canEditArea(area)) return toast(area === 'PIE' ? 'Solo el Equipo PIE y los administrativos pueden crear documentos PIE' : 'No tiene permiso para crear planes', 'error');
    const s = this.getStudent(studentId);
    if (!s) return toast('Abra primero la ficha del estudiante', 'error');
    const tipos = this.docTypesFor(area);
    State.createDoc = { area, studentId: s.id, type: area === 'PIE' ? (tipos.find(t => /^PAI/.test(t)) || tipos[0]) : tipos[0], modelId: '', limpiar: true, completar: true };
    ui.modal({ title: area === 'PIE' ? 'Crear documento PIE' : 'Crear plan por riesgo de repitencia', icon: 'file-plus', tone: AREAS[area].tone, size: 'md', okText: 'Crear y editar', body: '<div id="create-doc"></div>', onOk: () => { this.startFromModel(); return false; } });
    this.renderCreateDoc();
  },
  renderCreateDoc() {
    const c = State.createDoc, s = this.getStudent(c.studentId);
    const models = this.modelsFor(c.area, c.type);
    const mismos = models.filter(m => m.type === c.type), otros = models.filter(m => m.type !== c.type);
    if (c.modelId === '' && mismos.length) c.modelId = String(mismos[0].id);
    if (c.modelId === '' && !mismos.length) c.modelId = 'base';
    const opt = m => `<option value="${esc(m.id)}" ${sameId(m.id, c.modelId) ? 'selected' : ''}>${m.esModelo ? '★ ' : ''}${esc(m.studentName || '')} · ${esc(m.fileName || '')} · ${fmtDate(m.date) || ''}</option>`;
    el('create-doc').innerHTML = `<div class="stack">
      <p class="modal__msg">Estudiante: <strong>${esc(s.name)}</strong> (${esc(s.curso)}).</p>
      ${fieldHtml('Tipo de documento', `<select class="input" onchange="State.createDoc.type=this.value; State.createDoc.modelId=''; app.renderCreateDoc()">${options(this.docTypesFor(c.area).map(t => [t, t]), c.type)}</select>`)}
      ${fieldHtml('Modelo en que se basa', `<select class="input" onchange="State.createDoc.modelId=this.value">
        ${mismos.length ? `<optgroup label="${esc(c.type)} ya cargados">${mismos.map(opt).join('')}</optgroup>` : ''}
        <option value="base" ${c.modelId === 'base' ? 'selected' : ''}>Formato básico de la plataforma</option>
        ${otros.length ? `<optgroup label="Otros documentos del área">${otros.slice(0, 60).map(opt).join('')}</optgroup>` : ''}
      </select>`)}
      <label class="check"><input type="checkbox" ${c.limpiar ? 'checked' : ''} onchange="State.createDoc.limpiar=this.checked"><span>Usar solo la estructura del modelo (borra las respuestas del otro estudiante y desmarca las casillas)</span></label>
      <label class="check"><input type="checkbox" ${c.completar ? 'checked' : ''} onchange="State.createDoc.completar=this.checked"><span>Completar automáticamente nombre, RUN, curso, fecha, profesor jefe y asistencia</span></label>
      <p class="note">${ico('info')}Los modelos son los documentos que ya se cargaron (marcados con ★ los elegidos como "modelo"). Abra cualquier documento y presione "Usar como modelo" para que aparezca primero.</p>
    </div>`;
  },
  async startFromModel() {
    const c = State.createDoc, s = this.getStudent(c.studentId);
    const done = ui.busy('Preparando el documento', 'Leyendo el modelo...');
    try {
      let html = '', modelo = null;
      if (c.modelId && c.modelId !== 'base') {
        modelo = State.rawEvidences.find(e => sameId(e.id, c.modelId));
        const kind = this.docKind(modelo?.mimeType, modelo?.fileName);
        const f = await API.call('file', { id: c.modelId, comoWord: kind === 'pdf' });
        const bytes = Uint8Array.from(atob(f.base64 || ''), ch => ch.charCodeAt(0));
        if (this.docKind(f.mimeType, f.fileName) === 'docx') html = await this.docxToHtml(bytes);
        else if (/html/.test(f.mimeType || '')) html = this.safeHtml(new TextDecoder().decode(bytes));
        else throw new Error('Este modelo no se puede usar. Elija un documento Word.');
      } else html = this.safeHtml(this.baseTemplate(c.area, c.type));
      const ms = modelo ? State.rawStudents.find(x => sameId(x.id, modelo.studentId)) : null;
      html = this.prepareFromModel(html, ms, s, { ...c, limpiar: c.limpiar && !!modelo });
      const nombre = `${c.type.replace(/\s*\(.*\)$/, '')} ${today().slice(0, 4)} - ${this.clean(s.name)}`;
      State.viewer = { nuevo: { area: c.area, type: c.type, modelId: modelo ? modelo.id : '', modeloNombre: modelo ? modelo.fileName : 'formato básico', nombre }, id: '', html, kind: 'html', bytes: new Uint8Array(), url: '',
        ev: { studentId: String(s.id), studentName: s.name, area: c.area, type: c.type, storage: 'drive' }, f: { fileName: `${nombre}.docx` } };
      done();
      ui.modal({ title: `Nuevo: ${nombre}`, icon: 'file-plus', tone: AREAS[c.area].tone, size: 'xl', hideOk: true, cancelText: 'Cerrar', body: '<div id="doc-viewer" class="doc-viewer"></div>' });
      this.editDocument();
    } catch (e) { done(); toast(e.message, 'error'); }
  },
  /** Adapta el modelo al estudiante: cambia nombre y RUN, borra respuestas y completa los datos conocidos. */
  prepareFromModel(html, ms, s, o) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstChild;
    const nombre = this.formatStudentName ? this.formatStudentName(s.name) : s.name;
    const N = x => this.normalizarTexto(x);
    const textNodes = () => { const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) out.push(w.currentNode); return out; };
    // 1) Nombre y RUN del estudiante del modelo -> los del nuevo estudiante
    if (ms) {
      const tokens = new Set(N(ms.name).split(' ').filter(w => w.length > 2));
      const runModelo = this.limpiarRut(ms.rut || '');
      textNodes().forEach(n => {
        const parts = n.nodeValue.split(/(\s+)/);
        const out = [];
        for (let i = 0; i < parts.length;) {
          let j = i, words = 0;
          while (j < parts.length && (/^\s+$/.test(parts[j]) || tokens.has(N(parts[j].replace(/[^\p{L}]/gu, ''))))) { if (!/^\s+$/.test(parts[j])) words++; j++; }
          if (words >= 2) { while (j > i && /^\s+$/.test(parts[j - 1])) j--; out.push(nombre); i = j; }
          else { out.push(parts[i]); i++; }
        }
        let v = out.join('');
        if (runModelo) v = v.replace(/\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK]/g, m => this.limpiarRut(m) === runModelo ? (s.rut || '') : m);
        n.nodeValue = v;
      });
    }
    const LBL = /^(nombre|run|rut|curso|fecha|edad|profesor|profesora|establecimiento|colegio|escuela|a[ñn]o|asistencia|apoderad|diagn[oó]stico|nivel|asignatura|docente|especialista|domicilio|tel[eé]fono|responsable|firma|indicador|acciones|seguimiento|objetivo|[aá]mbito)/i;
    const esEtiqueta = c => c.classList.contains('doc-head') || /_{4,}/.test(c.textContent) || (c.textContent.trim().length < 45 && (LBL.test(N(c.textContent).toLowerCase()) || /:\s*$/.test(c.textContent.trim())));
    // 2) Solo la estructura: se vacían las respuestas y se desmarcan las casillas
    if (o.limpiar) {
      root.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.children];
        const conCasillas = cells.some(c => /[☐☒☑✓✔]/.test(c.textContent));
        cells.forEach((c, i) => {
          if (esEtiqueta(c)) return;
          if (/[☐☒☑✓✔]/.test(c.textContent)) { c.innerHTML = c.innerHTML.replace(/[☒☑✓✔]/g, '☐'); return; }
          // En una lista de cotejo, la primera columna es el ítem a evaluar: se conserva
          if (conCasillas && i === 0) return;
          c.innerHTML = '';
        });
      });
      textNodes().forEach(n => { if (/[☒☑✓✔]/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/[☒☑✓✔]/g, '☐'); });
    }
    // 3) Datos conocidos del estudiante en las celdas que siguen a su etiqueta
    if (o.completar) {
      const edad = (() => { const f = s.fechaNacimiento ? new Date(s.fechaNacimiento) : null; if (!f || isNaN(f)) return ''; const d = new Date(); let a = d.getFullYear() - f.getFullYear(); if (d < new Date(d.getFullYear(), f.getMonth(), f.getDate())) a--; return `${a} años`; })();
      const datos = [
        [/^nombre(s)?( completo)?( del| de la)?( estudiante| alumno\(a\)| alumno| alumna)?$/, nombre],
        [/^(run|rut)( del estudiante)?$/, s.rut || ''],
        [/^curso$/, s.curso || ''],
        [/^fecha( de (elaboracion|emision|inicio|confeccion))?$/, fmtDate(today())],
        [/^fecha de nacimiento$/, s.fechaNacimiento ? fmtDate(s.fechaNacimiento) : ''],
        [/^edad$/, edad],
        [/^profesor(a)? jef(e|a)$/, this.profJefeOf(s.curso) || ''],
        [/^(establecimiento|colegio|escuela)$/, this.brand ? this.brand().tagline : 'Colegio Marina de Chile'],
        [/^ano( escolar)?$/, today().slice(0, 4)],
        [/^(porcentaje de )?asistencia$/, s.asistencia ? `${s.asistencia.real} %` : ''],
        [/^apoderad(o|a)( \(a\))?$/, s.contacto?.apoderado || '']
      ];
      const valor = t => { const k = N(t).toLowerCase().replace(/[:.]/g, '').replace(/\s+/g, ' ').trim(); const hit = datos.find(([re]) => re.test(k)); return hit && hit[1] ? hit[1] : null; };
      root.querySelectorAll('td, th').forEach(c => {
        const v = valor(c.textContent);
        const sig = c.nextElementSibling;
        if (v && sig && !sig.textContent.trim()) sig.textContent = v;
      });
      // Párrafos del tipo "Nombre: ______"
      textNodes().forEach(n => {
        n.nodeValue = n.nodeValue.replace(/(Nombre(?: completo)?(?: del estudiante)?|RUN|RUT|Curso|Fecha)\s*:\s*_{2,}/gi, (m, lab) => { const v = valor(lab); return v ? `${lab}: ${v}` : m; });
      });
    }
    return root.innerHTML;
  },
  /** Formatos básicos cuando todavía no hay un modelo cargado. */
  baseTemplate(area, type) {
    const id = `<table><tr><td><strong>Nombre completo</strong></td><td></td><td><strong>RUN</strong></td><td></td></tr><tr><td><strong>Curso</strong></td><td></td><td><strong>Fecha</strong></td><td></td></tr><tr><td><strong>Profesor jefe</strong></td><td></td><td><strong>Asistencia</strong></td><td></td></tr></table>`;
    const ambito = n => `<tr><td><strong>ÁMBITO ${n}</strong></td><td></td><td></td><td></td></tr><tr><td><strong>INDICADOR</strong></td><td><strong>ACCIONES</strong></td><td><strong>RESPONSABLE</strong></td><td><strong>SEGUIMIENTO</strong></td></tr><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr>`;
    const evalTabla = items => `<table><tr><td><strong>Objetivos abordados durante el periodo</strong></td><td><strong>L</strong></td><td><strong>EP</strong></td><td><strong>NL</strong></td><td><strong>NO</strong></td></tr>${items.map(i => `<tr><td>${i}</td><td>☐</td><td>☐</td><td>☐</td><td>☐</td></tr>`).join('')}</table><p><em>L: logrado. EP: en proceso. NL: no logrado. NO: no observado.</em></p>`;
    const firmas = `<p></p><table><tr><td><p>_______________________</p><p>Profesional responsable</p></td><td><p>_______________________</p><p>Apoderado(a)</p></td><td><p>_______________________</p><p>Coordinación</p></td></tr></table>`;
    if (area === 'Repitencia') return `<h2>${esc(type.toUpperCase())}</h2><p>Decreto N° 67/2018 de evaluación, calificación y promoción escolar.</p>${id}
      <p><strong>1. ANTECEDENTES QUE FUNDAMENTEN LA INTERVENCIÓN Y APOYO.</strong></p><table><tr><td><strong>HISTORIAL ACADÉMICO (Información significativa: informes médicos o psicopedagógicos, cambios de centros, absentismo, apoyos recibidos, áreas no superadas, repeticiones, situación familiar)</strong></td></tr><tr><td></td></tr></table>
      <p><strong>2. ÁMBITOS DE INTERVENCIÓN.</strong></p><table>${ambito('PEDAGÓGICO')}${ambito('ASISTENCIA')}${ambito('FAMILIAR')}${ambito('SOCIOEMOCIONAL')}</table>
      <p><strong>3. EVALUACIÓN DEL PLAN.</strong></p>${evalTabla(['Mejora del rendimiento en las asignaturas descendidas', 'Asistencia igual o superior al 85 %', 'Participación de la familia en las acciones acordadas', 'Cumplimiento de los compromisos del estudiante'])}${firmas}`;
    if (/PAI|PACI|plan/i.test(type)) return `<h2>${esc(type.toUpperCase())}</h2><p>Programa de Integración Escolar (Decreto N° 170/2009 y Decreto N° 83/2015).</p>${id}
      <table><tr><td><strong>Diagnóstico</strong></td><td></td></tr><tr><td><strong>Profesional especialista</strong></td><td></td></tr><tr><td><strong>Fecha de la última evaluación</strong></td><td></td></tr></table>
      <p><strong>1. FORTALEZAS Y NECESIDADES DE APOYO.</strong></p><table><tr><td><strong>Fortalezas</strong></td></tr><tr><td></td></tr><tr><td><strong>Necesidades de apoyo</strong></td></tr><tr><td></td></tr></table>
      <p><strong>2. ÁMBITOS DE INTERVENCIÓN.</strong></p><table>${ambito('PEDAGÓGICO')}${ambito('SOCIOEMOCIONAL')}${ambito('FAMILIAR')}</table>
      <p><strong>3. EVALUACIÓN DE OBJETIVOS.</strong></p>${evalTabla(['', '', '', ''])}${firmas}`;
    return `<h2>${esc(type.toUpperCase())}</h2><p>Programa de Integración Escolar.</p>${id}
      <p><strong>1. MOTIVO.</strong></p><table><tr><td></td></tr></table>
      <p><strong>2. ANTECEDENTES Y RESULTADOS.</strong></p><table><tr><td></td></tr></table>
      <p><strong>3. CONCLUSIONES.</strong></p><table><tr><td></td></tr></table>
      <p><strong>4. SUGERENCIAS Y APOYOS.</strong></p><table><tr><td></td></tr></table>${firmas}`;
  },
  async saveNewDocument(html) {
    const v = State.viewer, n = v.nuevo, s = this.getStudent(v.ev.studentId);
    const done = ui.busy('Guardando el documento', 'Creando el Word en la carpeta del estudiante...');
    try {
      const out = await API.call('crearDocumento', { studentId: s.id, studentName: s.name, curso: s.curso, html, nombre: n.nombre, area: n.area, modeloId: n.modelId || '' });
      const evId = 'drv_' + out.fileId, anio = today().slice(0, 4);
      const ev = { id: evId, studentId: String(s.id), studentName: s.name, course: s.curso, date: today(), anio, area: n.area, areaFija: true, type: n.type, description: `Creado en la plataforma desde ${n.modeloNombre}`, fileName: out.fileName, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive', driveId: out.fileId, url: out.url, archivado: true, modeloId: n.modelId || '', ...(API.demo ? { demoHtml: html } : {}) };
      await DB.save('evidences', ev);
      if (/plan|\bpai\b|paci/i.test(n.type)) await DB.save('reports', { id: 'plan_' + out.fileId, studentId: String(s.id), type: n.type, area: n.area, areaFija: true, date: today(), anio, responsablePlan: State.currentUser.name, fuente: out.fileName, evidenceId: evId, estrategias: this.planEstrategias(html) });
      State.areaVer = (State.areaVer || 0) + 1;
      ui.guard = null;
      State.viewer = { ...v, nuevo: null, id: evId, ev, html, kind: 'docx', bytes: null, f: { fileName: out.fileName, url: out.url, mimeType: ev.mimeType } };
      toast('Documento creado y guardado en la ficha');
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
