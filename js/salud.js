'use strict';
// =====================================================================
// CERTIFICADOS MÉDICOS Y SUSPENSIONES
// - Cualquier funcionario sube certificados (PDF, foto o enlace de Drive).
// - Los días hábiles del reposo justifican inasistencias en la ficha.
// - Carga masiva: se identifica al estudiante y las fechas; lo no
//   identificado queda en "Certificados por asignar".
// - Convivencia, inspectoría y dirección registran suspensiones.
// =====================================================================
const CERT_TIPOS = ['Certificado médico', 'Licencia médica', 'Certificado de atención de urgencia', 'Certificado dental', 'Otro justificativo de salud'];
const SUSP_TIPOS = ['Suspensión de clases', 'Suspensión con trabajo pedagógico en casa', 'Reducción de jornada', 'Asistencia solo a rendir evaluaciones'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

Object.assign(app, {
  canCert() { return hasAccess('registro_rapido') || hasAccess('agregar_entrevistas') || hasAccess('editar_fichas') || hasAccess('ver_fichas'); },
  canSuspend() { const u = State.currentUser || {}; return hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema') || hasAccess('gestionar_protocolos') || /convivencia|inspector|direct|administra/i.test(`${u.role || ''} ${u.customRole || ''}`); },

  // ---------------- FECHAS ----------------
  isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
  parseIso(s) { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; },
  addDays(iso, n) { const d = this.parseIso(iso); if (!d) return ''; d.setDate(d.getDate() + n); return this.isoDate(d); },
  diasCorridos(a, b) { const x = this.parseIso(a), y = this.parseIso(b || a); return x && y ? Math.max(0, Math.round((y - x) / 864e5) + 1) : 0; },
  /** Días hábiles (lunes a viernes) entre dos fechas, ambas incluidas: son los que cuentan como asistencia justificada. */
  diasHabiles(a, b) {
    const x = this.parseIso(a), y = this.parseIso(b || a);
    if (!x || !y || y < x) return 0;
    let n = 0;
    for (const d = new Date(x); d <= y; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++;
    return n;
  },
  /** Fechas del reposo en el texto de un certificado: "desde ... hasta ...", "X días de reposo", "inicio reposo"... */
  parseCertificado(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ');
    const fechaRe = '(\\d{1,2})\\s*[\\/\\-.]\\s*(\\d{1,2})\\s*[\\/\\-.]\\s*(\\d{2,4})|(\\d{1,2})\\s+de\\s+(' + MESES_ES.join('|') + ')\\s+(?:de\\s+|del\\s+)?(\\d{4})';
    const aIso = m => {
      if (!m) return '';
      let d, mo, y;
      if (m[1]) { d = +m[1]; mo = +m[2]; y = +m[3]; } else { d = +m[4]; mo = MESES_ES.indexOf(m[5].toLowerCase()) + 1; y = +m[6]; }
      if (y < 100) y += 2000;
      if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2020 && y <= 2035)) return '';
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };
    const tras = (palabras) => { const m = t.match(new RegExp(`(?:${palabras})[^0-9]{0,25}(?:${fechaRe})`, 'i')); return m ? aIso(m) : ''; };
    let inicio = tras('desde|a contar del?|a partir del?|inicio(?: del)? reposo|fecha de inicio|inicio');
    let termino = tras('hasta|t[eé]rmino(?: del)? reposo|fecha de t[eé]rmino|hasta el');
    const nDias = (t.match(/(\d{1,2})\s*\(?[a-záéíóú ]{0,12}\)?\s*d[ií]as?\s*(?:de\s+)?reposo/i) || t.match(/reposo\s*(?:m[eé]dico\s*)?(?:absoluto\s*|relativo\s*)?(?:por|de|durante)?\s*(\d{1,2})\s*d[ií]as/i) || t.match(/(?:n[°º]?\s*de\s*)?d[ií]as(?:\s+de\s+reposo)?\s*:\s*(\d{1,2})/i) || [])[1];
    const todas = [...t.matchAll(new RegExp(fechaRe, 'gi'))].map(m => aIso(m)).filter(Boolean).sort();
    if (!inicio && todas.length) inicio = todas[0];
    if (!termino && inicio && nDias) termino = this.addDays(inicio, +nDias - 1);
    if (!termino && inicio && todas.length > 1 && todas[todas.length - 1] > inicio && this.diasCorridos(inicio, todas[todas.length - 1]) <= 60) termino = todas[todas.length - 1];
    if (!termino) termino = inicio;
    return { inicio, termino, diasReposo: inicio ? this.diasCorridos(inicio, termino) : (nDias ? +nDias : 0), seguro: !!(inicio && (nDias || /hasta|t[eé]rmino/i.test(t))) };
  },

  // ---------------- ESTADO EN LA FICHA ----------------
  certsOf(id) { return State.rawEvidences.filter(e => e.categoria === 'certificado' && !e.pendiente && sameId(e.studentId, id)).sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || ''))); },
  suspOf(s) { return (s.suspensiones || []).slice().sort((a, b) => String(b.inicio).localeCompare(String(a.inicio))); },
  suspEstado(x) { const h = today(); return x.estado === 'anulada' ? ['Anulada', 'neutral'] : x.termino < h ? ['Terminada', 'neutral'] : x.inicio > h ? ['Próxima', 'obs'] : ['Vigente', 'proto']; },
  healthChips(s) {
    const h = today();
    const cert = this.certsOf(s.id).find(e => e.inicio <= h && e.termino >= h);
    const sus = (s.suspensiones || []).find(x => x.estado !== 'anulada' && x.inicio <= h && x.termino >= h);
    return `${cert ? chip(`Con reposo médico hasta el ${fmtDate(cert.termino)}`, 'enf', 'heart-pulse') : ''}${sus ? chip(`Suspendido(a) hasta el ${fmtDate(sus.termino)}`, 'proto', 'calendar-off') : ''}`;
  },

  // ---------------- PESTAÑA DE LA FICHA ----------------
  renderSalud() {
    const s = this.current();
    const certs = this.certsOf(s.id), susp = this.suspOf(s);
    const puedeBorrar = e => hasAccess('editar_fichas') || String(e.uploaderId) === String(State.currentUser.id);
    const acciones = `<div class="row-actions">${this.canCert() ? `<button class="btn btn--sm btn--primary" onclick="app.openCertModal(${jsq(s.id)})">${ico('file-plus')}Subir certificado médico</button>` : ''}${this.canSuspend() ? `<button class="btn btn--sm" onclick="app.openSuspModal(${jsq(s.id)})">${ico('calendar-off')}Registrar suspensión</button>` : ''}</div>`;
    const totalJust = certs.reduce((t, e) => t + (+e.diasHabiles || 0), 0);
    this.panel(`${this.panelHead('Certificados médicos y suspensiones', 'heart-pulse', acciones)}
      <div class="stats stats--4">
        <div class="stat" data-tone="enf"><span class="stat__num num">${certs.length}</span><span class="stat__label">Certificados</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${totalJust}</span><span class="stat__label">Días hábiles justificados</span></div>
        <div class="stat" data-tone="proto"><span class="stat__num num">${susp.filter(x => x.estado !== 'anulada').length}</span><span class="stat__label">Suspensiones</span></div>
        <div class="stat"><span class="stat__num num">${susp.filter(x => x.estado !== 'anulada').reduce((t, x) => t + (+x.dias || 0), 0)}</span><span class="stat__label">Días de suspensión</span></div>
      </div>
      <h3 class="rk-sub">${ico('file-heart')}Certificados y licencias</h3>
      ${certs.length ? `<div class="table-wrap"><table class="table table--dense"><thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th class="t-num">Reposo</th><th class="t-num">Días hábiles justificados</th><th>Subido por</th><th class="t-actions">Acciones</th></tr></thead><tbody>
        ${certs.map(e => `<tr><td>${chip(e.type || 'Certificado', 'enf')}${e.observacion ? `<span class="cell-sub">${esc(e.observacion)}</span>` : ''}</td><td class="num small">${fmtDate(e.inicio)}</td><td class="num small">${fmtDate(e.termino)}</td><td class="t-num num">${e.diasReposo || '-'} días</td><td class="t-num num"><strong>${e.diasHabiles ?? 0}</strong></td><td class="small">${esc(e.uploadedBy || '')}</td>
          <td class="t-actions"><span class="row-actions"><button class="icon-btn" title="Ver documento" aria-label="Ver documento" onclick="app.openEvidence(${jsq(e.id)})">${ico('eye')}</button>${this.canCert() ? `<button class="icon-btn" title="Corregir fechas" aria-label="Corregir fechas" onclick="app.openCertModal(${jsq(s.id)}, ${jsq(e.id)})">${ico('pencil')}</button>` : ''}${puedeBorrar(e) ? `<button class="icon-btn icon-btn--danger" title="Eliminar" aria-label="Eliminar certificado" onclick="app.deleteCert(${jsq(e.id)})">${ico('trash-2')}</button>` : ''}</span></td></tr>`).join('')}
        </tbody></table></div>` : empty('file-heart', 'Sin certificados médicos registrados.', 'enf')}
      <p class="note">${ico('info')}Los días hábiles (lunes a viernes) del reposo se suman a los días justificados de la asistencia. No registre diagnósticos: basta con el documento y las fechas.</p>
      <h3 class="rk-sub">${ico('calendar-off')}Suspensiones</h3>
      ${susp.length ? `<div class="table-wrap"><table class="table table--dense"><thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th class="t-num">Días hábiles</th><th>Motivo</th><th>Registrada por</th><th>Estado</th><th class="t-actions"></th></tr></thead><tbody>
        ${susp.map(x => { const [e, tone] = this.suspEstado(x); return `<tr ${x.estado === 'anulada' ? 'class="is-muted"' : ''}><td class="small">${esc(x.tipo)}</td><td class="num small">${fmtDate(x.inicio)}</td><td class="num small">${fmtDate(x.termino)}</td><td class="t-num num">${x.dias}</td><td class="small">${esc(x.motivo || '')}</td><td class="small">${esc(x.por || '')}</td><td>${chip(e, tone)}</td>
          <td class="t-actions">${this.canSuspend() && x.estado !== 'anulada' ? `<span class="row-actions"><button class="icon-btn" title="Editar" aria-label="Editar suspensión" onclick="app.openSuspModal(${jsq(s.id)}, ${jsq(x.id)})">${ico('pencil')}</button><button class="icon-btn icon-btn--danger" title="Anular" aria-label="Anular suspensión" onclick="app.anularSusp(${jsq(s.id)}, ${jsq(x.id)})">${ico('x-circle')}</button></span>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : empty('calendar-off', 'Sin suspensiones registradas.', 'neutral')}`);
  },

  // ---------------- UN CERTIFICADO ----------------
  studentLabel(s) { return `${this.clean(s.name)} — ${s.curso || this.courseNameOf(s)}${s.rut ? ` — ${s.rut}` : ''}`; },
  studentByLabel(v) { const t = String(v || '').trim(); return State.rawStudents.find(s => this.studentLabel(s) === t) || State.rawStudents.find(s => this.clean(s.name).toLowerCase() === t.toLowerCase()); },
  studentDatalist(id = 'cert-students') { return `<datalist id="${id}">${State.rawStudents.filter(s => s.status !== 'blocked').map(s => `<option value="${esc(this.studentLabel(s))}">`).join('')}</datalist>`; },
  openCertModal(studentId, evId = null) {
    const s = State.rawStudents.find(x => sameId(x.id, studentId));
    const ev = evId ? State.rawEvidences.find(e => sameId(e.id, evId)) : null;
    State.certForm = { modo: 'archivo', inicio: ev?.inicio || today(), termino: ev?.termino || today(), tipo: ev?.type || CERT_TIPOS[0] };
    ui.modal({
      title: ev ? 'Corregir fechas del certificado' : 'Subir certificado médico', icon: 'heart-pulse', tone: 'enf', size: 'md', okText: ev ? 'Guardar cambios' : 'Subir y registrar',
      body: `<div class="stack">
        ${s ? `<p class="modal__msg"><strong>${esc(this.clean(s.name))}</strong>, ${esc(s.curso || this.courseNameOf(s))}</p>` : ''}
        ${ev ? '' : `<div class="segs" role="group" aria-label="Origen del documento"><button type="button" class="seg" id="cm-a" aria-pressed="true" onclick="State.certForm.modo='archivo'; el('cm-a').setAttribute('aria-pressed','true'); el('cm-l').setAttribute('aria-pressed','false'); el('cm-file-w').hidden=false; el('cm-link-w').hidden=true">${ico('upload')}Archivo (PDF o foto)</button><button type="button" class="seg" id="cm-l" aria-pressed="false" onclick="State.certForm.modo='enlace'; el('cm-l').setAttribute('aria-pressed','true'); el('cm-a').setAttribute('aria-pressed','false'); el('cm-file-w').hidden=true; el('cm-link-w').hidden=false">${ico('link')}Enlace de Drive</button></div>
        <div id="cm-file-w"><input type="file" id="cm-file" class="file" accept=".pdf,image/*" aria-label="Archivo del certificado"></div>
        <div id="cm-link-w" hidden>${fieldHtml('Enlace del archivo en Google Drive', '<input id="cm-link" class="input" placeholder="https://drive.google.com/file/d/...">')}</div>`}
        ${fieldHtml('Tipo', `<select id="cm-tipo" class="input">${options(CERT_TIPOS.map(t => [t, t]), State.certForm.tipo)}</select>`)}
        <div class="grid-2">
          ${fieldHtml('Inicio del reposo', `<input type="date" id="cm-ini" class="input" value="${esc(State.certForm.inicio)}" onchange="app.certCalc()">`)}
          ${fieldHtml('Término del reposo', `<input type="date" id="cm-fin" class="input" value="${esc(State.certForm.termino)}" onchange="app.certCalc()">`)}
        </div>
        <p class="note" id="cm-calc"></p>
        ${fieldHtml('Observación (opcional, sin diagnóstico)', `<input id="cm-obs" class="input" value="${esc(ev?.observacion || '')}" placeholder="Ej: presentado por la apoderada en inspectoría">`)}
      </div>`,
      onOk: () => this.saveCert(studentId, ev)
    });
    this.certCalc();
  },
  certCalc() { const a = el('cm-ini').value, b = el('cm-fin').value || a; el('cm-calc').innerHTML = a ? `${ico('calendar-check')}Reposo de <strong>${this.diasCorridos(a, b)} día(s)</strong>; se justifican <strong>${this.diasHabiles(a, b)} día(s) hábiles</strong> de inasistencia.` : ''; icons(); },
  async saveCert(studentId, ev) {
    const inicio = el('cm-ini').value, termino = el('cm-fin').value || inicio;
    if (!inicio) { toast('Indique el inicio del reposo', 'error'); return false; }
    if (termino < inicio) { toast('El término no puede ser anterior al inicio', 'error'); return false; }
    const tipo = el('cm-tipo').value, observacion = el('cm-obs').value.trim();
    const s = State.rawStudents.find(x => sameId(x.id, studentId));
    const done = ui.busy('Registrando certificado', '');
    try {
      let id = ev?.id;
      if (!ev) {
        let sub;
        if (State.certForm.modo === 'enlace') {
          const link = el('cm-link').value.trim();
          if (!link) { done(); toast('Pegue el enlace de Drive', 'error'); return false; }
          sub = await API.call('subirCertificado', { driveUrl: link, tipo });
        } else {
          const f = el('cm-file').files[0];
          if (!f) { done(); toast('Elija el archivo del certificado', 'error'); return false; }
          if (f.size > 10 * 1024 * 1024) { done(); toast('El archivo supera los 10 MB', 'error'); return false; }
          sub = await API.call('subirCertificado', { base64: String(await readFileAsDataURL(f)).split(',')[1], fileName: f.name, mimeType: f.type, tipo });
        }
        DB.upsertLocal('evidences', sub.evidence);
        id = sub.evidence.id;
      }
      await this.assignCertLocal({ id, studentId, inicio, termino, tipo, observacion });
      done();
      notice({ type: 'success', title: ev ? 'Certificado actualizado' : 'Certificado registrado', msg: `${this.clean(s.name)}: reposo del ${fmtDate(inicio)} al ${fmtDate(termino)}. Se justifican ${this.diasHabiles(inicio, termino)} día(s) hábiles de inasistencia.` });
      this.afterHealthChange();
    } catch (e) { done(); notice({ type: 'error', title: 'No se registró el certificado', msg: e.message }); return false; }
  },
  /** Asigna en el servidor y actualiza lo que se ve en la página. */
  async assignCertLocal({ id, studentId, inicio, termino, tipo, observacion = '' }) {
    const out = await API.call('asignarCertificado', { id, studentId, inicio, termino, tipo, observacion, diasReposo: this.diasCorridos(inicio, termino), diasHabiles: this.diasHabiles(inicio, termino) });
    DB.upsertLocal('evidences', out.evidence);
    State.rawStudents.forEach(st => { if (st.justificativos) st.justificativos = st.justificativos.filter(j => j.evidenceId !== id); });
    const s = State.rawStudents.find(x => sameId(x.id, studentId));
    if (s) s.justificativos = out.justificativos;
    return out;
  },
  deleteCert(id) {
    const e = State.rawEvidences.find(x => sameId(x.id, id));
    ui.confirm({ title: 'Eliminar certificado', msg: `¿Eliminar <strong>${esc(e?.fileName || 'el certificado')}</strong>? También se quitan los días justificados que sumaba.`, action: async () => {
      await DB.remove('evidences', id);
      State.rawStudents.forEach(st => { if (st.justificativos) st.justificativos = st.justificativos.filter(j => j.evidenceId !== id); });
      notice({ type: 'success', title: 'Certificado eliminado', msg: 'Se quitaron los días justificados asociados.' });
      this.afterHealthChange();
    } });
  },
  afterHealthChange() {
    if (State.currentView === 'student_detail') { this.render(); this.changeDetailTab('salud'); }
    else this.render();
  },

  // ---------------- VARIOS CERTIFICADOS A LA VEZ ----------------
  openBulkCerts() {
    ui.modal({
      title: 'Subir varios certificados médicos', icon: 'files', tone: 'enf', size: 'md', okText: 'Leer certificados',
      body: `<div class="stack">
        <p class="modal__msg">Elija los certificados (PDF o fotos) y, si están en Drive, pegue sus enlaces. El sistema lee cada documento, identifica al estudiante (por RUN o nombre) y los días de reposo. Los que no logre identificar quedan en <strong>"Certificados por asignar"</strong> para asignarlos usted.</p>
        <input type="file" id="bc-files" class="file" accept=".pdf,image/*" multiple aria-label="Certificados">
        ${fieldHtml('Enlaces de Drive (uno por línea, opcional)', '<textarea id="bc-links" class="input" rows="3" placeholder="https://drive.google.com/file/d/..."></textarea>')}
        ${fieldHtml('Tipo', `<select id="bc-tipo" class="input">${options(CERT_TIPOS.map(t => [t, t]), CERT_TIPOS[0])}</select>`)}
        <p class="note">${ico('shield-check')}Las fotos y los PDF escaneados se leen con el reconocimiento de texto de Google. Revise siempre el estudiante y las fechas antes de asignar.</p>
      </div>`,
      onOk: () => {
        const files = [...el('bc-files').files], links = el('bc-links').value.split('\n').map(x => x.trim()).filter(Boolean), tipo = el('bc-tipo').value;
        if (!files.length && !links.length) { toast('Elija archivos o pegue enlaces', 'error'); return false; }
        ui.close();
        this.processBulkCerts(files, links, tipo);
        return false;
      }
    });
  },
  async pdfTextOf(file) {
    try {
      const pdf = await this.pdfjs().getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      let t = '';
      for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) t += ' ' + (await (await pdf.getPage(p)).getTextContent()).items.map(i => i.str).join(' ');
      return t;
    } catch (e) { return ''; }
  },
  /** Estudiante del certificado: primero por RUN, luego por nombre en el texto y por último por el nombre del archivo. */
  certStudent(texto, fileName) {
    const pool = State.rawStudents.filter(s => s.status !== 'blocked').map(s => ({ ...s, name: this.clean(s.name) }));
    const porRun = this.findStudentByRun(texto).student;
    if (porRun) return porRun;
    const enTexto = texto && this.studentInText ? this.studentInText(texto, pool) : null;
    if (enTexto) return State.rawStudents.find(s => sameId(s.id, enTexto.id));
    return this.findStudentByName(String(fileName || '').replace(/\.\w+$/, '').replace(/[_\-.]+/g, ' '));
  },
  async processBulkCerts(files, links, tipo) {
    const done = ui.busy('Leyendo certificados', '');
    const rows = [], errores = [];
    const total = files.length + links.length;
    let n = 0;
    const procesar = async (sub, texto, fileName) => {
      const s = this.certStudent(texto, fileName);
      const f = this.parseCertificado(texto);
      rows.push({ id: sub.evidence.id, fileName: sub.evidence.fileName || fileName, studentId: s ? String(s.id) : '', label: s ? this.studentLabel(s) : '', inicio: f.inicio, termino: f.termino, seguro: f.seguro, identificado: !!s, incluir: !!(s && f.inicio), tipo });
    };
    for (const file of files) {
      el('busy-msg').textContent = `${++n} de ${total}: ${file.name}`;
      try {
        if (file.size > 10 * 1024 * 1024) throw new Error('supera 10 MB');
        const esPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
        const textoPdf = esPdf ? await this.pdfTextOf(file) : '';
        const ocr = textoPdf.replace(/\s/g, '').length < 40;
        const sub = await API.call('subirCertificado', { base64: String(await readFileAsDataURL(file)).split(',')[1], fileName: file.name, mimeType: file.type, tipo, ocr });
        DB.upsertLocal('evidences', sub.evidence);
        await procesar(sub, `${textoPdf} ${sub.texto || ''}`, file.name);
      } catch (e) { errores.push(`${file.name}: ${e.message}`); }
    }
    for (const link of links) {
      el('busy-msg').textContent = `${++n} de ${total}: enlace de Drive`;
      try {
        const sub = await API.call('subirCertificado', { driveUrl: link, tipo, ocr: true });
        DB.upsertLocal('evidences', sub.evidence);
        await procesar(sub, sub.texto || '', sub.evidence.fileName);
      } catch (e) { errores.push(`${link.slice(0, 60)}: ${e.message}`); }
    }
    done();
    if (errores.length) notice({ type: rows.length ? 'warn' : 'error', title: rows.length ? 'Algunos certificados no se pudieron leer' : 'No se pudo leer ningún certificado', items: errores });
    if (!rows.length) return;
    State.certRows = rows;
    this.openCertReview('Revisar certificados', 'Asignar los seleccionados');
  },

  // ---------------- REVISIÓN Y BANDEJA "POR ASIGNAR" ----------------
  pendingCerts() { return State.rawEvidences.filter(e => e.categoria === 'certificado' && e.pendiente); },
  openPendingCerts() {
    const p = this.pendingCerts();
    if (!p.length) return notice({ type: 'success', title: 'No hay certificados por asignar', msg: 'Todos los certificados subidos están asignados a un estudiante.' });
    State.certRows = p.map(e => ({ id: e.id, fileName: e.fileName, studentId: '', label: '', inicio: '', termino: '', identificado: false, incluir: false, tipo: e.type || CERT_TIPOS[0], subidoPor: e.uploadedBy, fecha: e.date }));
    this.openCertReview('Certificados por asignar', 'Asignar los completados');
  },
  openCertReview(title, okText) {
    ui.modal({ title, icon: 'file-heart', tone: 'enf', size: 'xl', okText, body: `${this.studentDatalist()}<div id="cert-review"></div>`, onOk: () => this.saveCertReview() });
    this.renderCertReview();
  },
  certRowSet(i, k, v) {
    const r = State.certRows[i];
    if (k === 'label') { const s = this.studentByLabel(v); r.label = v; r.studentId = s ? String(s.id) : ''; if (s) r.label = this.studentLabel(s); r.incluir = !!(r.studentId && r.inicio); }
    else if (k === 'diasReposo') { const d = Math.max(1, parseInt(v, 10) || 1); if (r.inicio) r.termino = this.addDays(r.inicio, d - 1); }
    else { r[k] = v; if (k === 'inicio' && (!r.termino || r.termino < v)) r.termino = v; if (k !== 'incluir') r.incluir = !!(r.studentId && r.inicio) || r.incluir; }
    this.renderCertReview();
  },
  renderCertReview() {
    const rows = State.certRows;
    const fila = (r, i) => `<tr class="${r.studentId ? '' : 'is-alert'}">
      <td><input type="checkbox" aria-label="Asignar ${esc(r.fileName)}" ${r.incluir ? 'checked' : ''} ${r.studentId && r.inicio ? '' : 'disabled'} onchange="app.certRowSet(${i}, 'incluir', this.checked)"></td>
      <td><button type="button" class="link-btn cell-title" onclick="app.openEvidence(${jsq(r.id)})">${esc(r.fileName)}</button>${r.subidoPor ? `<span class="cell-sub">Subido por ${esc(r.subidoPor)} el ${fmtDate(r.fecha)}</span>` : ''}</td>
      <td><input class="input" list="cert-students" value="${esc(r.label)}" placeholder="Escriba el nombre o RUN" aria-label="Estudiante" onchange="app.certRowSet(${i}, 'label', this.value)">${r.identificado && r.studentId ? '<span class="cell-sub">Identificado en el documento</span>' : ''}</td>
      <td><input type="date" class="input" value="${esc(r.inicio)}" aria-label="Inicio del reposo" onchange="app.certRowSet(${i}, 'inicio', this.value)"></td>
      <td><input type="date" class="input" value="${esc(r.termino)}" aria-label="Término del reposo" onchange="app.certRowSet(${i}, 'termino', this.value)"></td>
      <td><input type="number" min="1" class="input input--num num" value="${r.inicio ? this.diasCorridos(r.inicio, r.termino) : ''}" aria-label="Días de reposo" onchange="app.certRowSet(${i}, 'diasReposo', this.value)"></td>
      <td class="t-num num">${r.inicio ? this.diasHabiles(r.inicio, r.termino) : '-'}</td>
      <td>${!r.inicio ? chip('Falta la fecha', 'warn') : r.seguro === false ? chip('Revise las fechas', 'warn') : r.inicio ? chip('Fechas detectadas', 'conv') : ''}</td></tr>`;
    const head = '<thead><tr><th>Asignar</th><th>Documento</th><th>Estudiante</th><th>Inicio</th><th>Término</th><th class="t-num">Días de reposo</th><th class="t-num">Días hábiles</th><th>Estado</th></tr></thead>';
    const ident = rows.map((r, i) => [r, i]).filter(([r]) => r.identificado), resto = rows.map((r, i) => [r, i]).filter(([r]) => !r.identificado);
    const listos = rows.filter(r => r.incluir && r.studentId && r.inicio).length;
    el('cert-review').innerHTML = `
      <div class="stats stats--4">
        <div class="stat"><span class="stat__num num">${rows.length}</span><span class="stat__label">Certificados</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${ident.length}</span><span class="stat__label">Estudiante identificado</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${resto.length}</span><span class="stat__label">Por asignar</span></div>
        <div class="stat" data-tone="enf"><span class="stat__num num">${listos}</span><span class="stat__label">Listos para asignar</span></div>
      </div>
      ${ident.length ? `<h3 class="rk-sub">${ico('user-check')}Identificados (${ident.length})</h3><div class="table-wrap"><table class="table table--dense cert-table">${head}<tbody>${ident.map(([r, i]) => fila(r, i)).join('')}</tbody></table></div>` : ''}
      ${resto.length ? `<h3 class="rk-sub">${ico('user-search')}Por asignar (${resto.length})</h3><p class="muted small">No se pudo identificar al estudiante. Escriba su nombre o RUN y elíjalo de la lista. Los que no asigne ahora quedan guardados en "Certificados por asignar".</p><div class="table-wrap"><table class="table table--dense cert-table">${head}<tbody>${resto.map(([r, i]) => fila(r, i)).join('')}</tbody></table></div>` : ''}`;
    icons();
  },
  async saveCertReview() {
    const sel = State.certRows.filter(r => r.incluir && r.studentId && r.inicio);
    if (!sel.length) { toast('Complete el estudiante y la fecha de al menos un certificado', 'error'); return false; }
    ui.close();
    const done = ui.busy('Asignando certificados', '');
    let ok = 0; const errores = [];
    for (const [n, r] of sel.entries()) {
      el('busy-msg').textContent = `${n + 1} de ${sel.length}: ${r.label}`;
      try { await this.assignCertLocal({ id: r.id, studentId: r.studentId, inicio: r.inicio, termino: r.termino || r.inicio, tipo: r.tipo }); ok++; }
      catch (e) { errores.push(`${r.fileName}: ${e.message}`); }
    }
    done();
    const pendientes = this.pendingCerts().length;
    notice({ type: errores.length ? (ok ? 'warn' : 'error') : 'success', title: 'Certificados asignados', msg: `${ok} certificado(s) quedaron en la ficha de cada estudiante y sus días hábiles justifican inasistencias.`,
      items: [...errores, pendientes ? `${pendientes} certificado(s) quedan en "Certificados por asignar".` : ''].filter(Boolean), actions: pendientes ? [['Ver por asignar', () => this.openPendingCerts()]] : [] });
    this.render();
    return true;
  },

  // ---------------- SUSPENSIONES ----------------
  openSuspModal(studentId, id = null) {
    const s = this.getStudent(studentId);
    const x = id ? (s.suspensiones || []).find(v => sameId(v.id, id)) : null;
    const protocolos = (s.history || []).filter(h => h.type === PROTOCOLO || /convivencia|entrevista/i.test(h.type || '')).slice(0, 30);
    ui.modal({
      title: x ? 'Editar suspensión' : 'Registrar suspensión', icon: 'calendar-off', tone: 'proto', size: 'md', okText: 'Guardar suspensión',
      body: `<div class="stack">
        <p class="modal__msg"><strong>${esc(s.name)}</strong>, ${esc(s.curso)}</p>
        ${fieldHtml('Medida', `<select id="su-tipo" class="input">${options(SUSP_TIPOS.map(t => [t, t]), x?.tipo || SUSP_TIPOS[0])}</select>`)}
        <div class="grid-2">
          ${fieldHtml('Día de inicio', `<input type="date" id="su-ini" class="input" value="${esc(x?.inicio || today())}" onchange="app.suspCalc()">`)}
          ${fieldHtml('Día de término', `<input type="date" id="su-fin" class="input" value="${esc(x?.termino || today())}" onchange="app.suspCalc()">`)}
        </div>
        <p class="note" id="su-calc"></p>
        ${fieldHtml('Motivo y medida aplicada según el Reglamento Interno', `<textarea id="su-motivo" class="input" rows="3" placeholder="Hecho, falta según el RIE y medida">${esc(x?.motivo || '')}</textarea>`)}
        ${protocolos.length ? fieldHtml('Registro relacionado (opcional)', `<select id="su-int" class="input"><option value="">Ninguno</option>${options(protocolos.map(h => [String(h.id), `${fmtDate(h.date)} · ${h.type}`]), x?.interventionId || '')}</select>`) : ''}
        <p class="note">${ico('scale')}Recuerde aplicar el debido proceso del Reglamento Interno y la Circular N° 482: informar al estudiante y a su apoderado, y resguardar su derecho a la educación (por ejemplo, con trabajo pedagógico).</p>
      </div>`,
      onOk: () => this.saveSusp(studentId, x)
    });
    this.suspCalc();
  },
  suspCalc() { const a = el('su-ini').value, b = el('su-fin').value || a; el('su-calc').innerHTML = a ? `${ico('calendar-check')}${this.diasHabiles(a, b)} día(s) hábiles de suspensión.` : ''; icons(); },
  async saveSusp(studentId, x) {
    const inicio = el('su-ini').value, termino = el('su-fin').value || inicio;
    if (!inicio) { toast('Indique el día de inicio', 'error'); return false; }
    if (termino < inicio) { toast('El término no puede ser anterior al inicio', 'error'); return false; }
    const motivo = el('su-motivo').value.trim();
    if (!motivo) { toast('Escriba el motivo de la suspensión', 'error'); return false; }
    try {
      const out = await API.call('registrarSuspension', { studentId, id: x?.id, inicio, termino, dias: this.diasHabiles(inicio, termino), tipo: el('su-tipo').value, motivo, interventionId: el('su-int')?.value || '' });
      const s = State.rawStudents.find(v => sameId(v.id, studentId));
      s.suspensiones = out.suspensiones;
      notice({ type: 'success', title: x ? 'Suspensión actualizada' : 'Suspensión registrada', msg: `${this.clean(s.name)}: ${el('su-tipo').value.toLowerCase()} del ${fmtDate(inicio)} al ${fmtDate(termino)} (${this.diasHabiles(inicio, termino)} día(s) hábiles). Queda indicada en la ficha.` });
      setTimeout(() => this.afterHealthChange(), 0);
    } catch (e) { notice({ type: 'error', title: 'No se registró la suspensión', msg: e.message }); return false; }
  },
  anularSusp(studentId, id) {
    ui.prompt({ title: 'Anular suspensión', msg: 'La suspensión quedará registrada como anulada (no se borra). Indique el motivo:', icon: 'x-circle', okText: 'Anular', action: async motivo => {
      const out = await API.call('registrarSuspension', { studentId, id, anular: true, motivoAnulacion: motivo });
      State.rawStudents.find(v => sameId(v.id, studentId)).suspensiones = out.suspensiones;
      notice({ type: 'success', title: 'Suspensión anulada', msg: 'Se mantiene en el historial como anulada.' });
      this.afterHealthChange();
    } });
  }
});

// Acceso desde el registro rápido: certificado por estudiante, varios a la vez y los pendientes
(() => {
  const rql = app.renderQuickList;
  app.renderQuickList = function () {
    rql.call(this);
    const q = (State.quickSearch || '').toLowerCase();
    const visibles = (State.quickList || []).filter(s => !q || s.name.toLowerCase().includes(q) || String(s.rut || '').includes(q));
    el('quick-list').querySelectorAll('tbody tr').forEach((tr, i) => {
      const s = visibles[i];
      const box = tr.querySelector('.row-actions');
      if (s && box && this.canCert()) box.insertAdjacentHTML('beforeend', `<button class="btn btn--sm" onclick="app.openCertModal(${jsq(s.id)})">${ico('heart-pulse')}Certificado</button>`);
    });
    const p = this.pendingCerts().length;
    if (this.canCert()) el('quick-list').insertAdjacentHTML('afterbegin', `<div class="row-actions quick-certs"><button class="btn" onclick="app.openBulkCerts()">${ico('files')}Subir varios certificados médicos</button><button class="btn" onclick="app.openPendingCerts()">${ico('inbox')}Certificados por asignar${p ? ` (${p})` : ''}</button></div>`);
    icons();
  };
})();
