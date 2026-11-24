'use strict';
// =====================================================================
// APOYO A LA ENTREVISTA
// Ventana lateral con el resumen de todo lo realizado con el estudiante
// (entrevistas, acuerdos, planes, anotaciones, calificaciones, asistencia)
// que acompaña al funcionario mientras entrevista y que puede cerrar.
// También genera la "Ficha de entrevistas" del estudiante para descargar.
// =====================================================================
Object.assign(app, {
  esEntrevista(h) { return !this.isCarta(h) && h.type !== PROTOCOLO && !h.anotacion; },
  acuerdoPendiente(a) { return a && a.text && !/complet|logrado|cumplid|finaliz/i.test(a.progress || ''); },
  edadDe(s) { const f = s.fechaNacimiento ? new Date(s.fechaNacimiento) : null; if (!f || isNaN(f)) return ''; const d = new Date(); let a = d.getFullYear() - f.getFullYear(); if (d < new Date(d.getFullYear(), f.getMonth(), f.getDate())) a--; return `${a} años`; },

  /** Todo lo relevante del estudiante, en una sola estructura (respeta la confidencialidad). */
  studentDigest(s) {
    const visibles = s.history.filter(h => this.canSeeConfidential(h));
    const ocultas = s.history.filter(h => !this.canSeeConfidential(h));
    const anios = Object.keys(s.calificaciones || {}).sort();
    const notas = anios.length ? s.calificaciones[anios[anios.length - 1]] : null;
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
    const bajo4 = notas ? (notas.asignaturas || []).map(a => ({ nombre: a.nombre, nota: num(a.valores[a.valores.length - 1]) })).filter(a => a.nota !== null && a.nota < 4) : [];
    return {
      entrevistas: visibles.filter(h => this.esEntrevista(h)),
      protocolos: visibles.filter(h => h.type === PROTOCOLO),
      cartas: visibles.filter(h => this.isCarta(h)),
      anotaciones: visibles.filter(h => h.anotacion),
      ocultas,
      acuerdos: visibles.flatMap(h => (h.agreements || []).filter(a => this.acuerdoPendiente(a)).map(a => ({ ...a, fecha: h.date, tipo: h.type }))),
      planes: State.studentPlans.filter(p => sameId(p.studentId, s.id)),
      planesArea: State.rawInclusionReports.filter(r => sameId(r.studentId, s.id)).map(r => ({ ...r, area: this.planArea(r) })),
      observaciones: (s.observations || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
      enfermeria: s.nursing || [],
      notas, anioNotas: anios[anios.length - 1] || '', bajo4,
      actas: State.rawEvidences.filter(e => sameId(e.studentId, s.id) && e.cartaId).length
    };
  },

  // ---------------- VENTANA LATERAL DURANTE LA ENTREVISTA ----------------
  autoResumen() { try { return localStorage.getItem('cm_auto_resumen') !== 'no'; } catch (e) { return true; } },
  setAutoResumen(v) { try { localStorage.setItem('cm_auto_resumen', v ? 'si' : 'no'); } catch (e) { /* sin almacenamiento */ } },
  openInterviewPanel(studentId = State.selectedStudentId) {
    const s = this.getStudent(studentId);
    if (!s) return;
    let p = el('interview-panel');
    if (!p) {
      p = document.createElement('aside');
      p.id = 'interview-panel';
      p.className = 'iv-panel';
      p.setAttribute('role', 'complementary');
      p.setAttribute('aria-label', 'Resumen del estudiante para la entrevista');
      document.body.appendChild(p);
    }
    p.dataset.student = String(s.id);
    p.hidden = false;
    p.classList.remove('is-min');
    document.body.classList.add('has-iv-panel');
    this.renderInterviewPanel();
  },
  closeInterviewPanel() {
    const p = el('interview-panel');
    if (p) p.hidden = true;
    document.body.classList.remove('has-iv-panel');
  },
  toggleInterviewPanelMin() { const p = el('interview-panel'); if (p) { p.classList.toggle('is-min'); document.body.classList.toggle('has-iv-panel', !p.classList.contains('is-min')); } },
  renderInterviewPanel() {
    const p = el('interview-panel');
    if (!p || p.hidden) return;
    const s = this.getStudent(p.dataset.student);
    if (!s) return this.closeInterviewPanel();
    const g = this.studentDigest(s);
    const c = s.contacto || {};
    const fecha = d => fmtDate(d) || 'Sin fecha';
    const corto = (t, n = 220) => { t = String(t || '').replace(/\*\*/g, '').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
    const sec = (id, icon, titulo, n, html, abierto = false) => `<details class="iv-sec" ${abierto ? 'open' : ''}><summary>${ico(icon)}<span>${titulo}</span>${n !== '' ? `<span class="iv-count">${n}</span>` : ''}</summary><div class="iv-body">${html}</div></details>`;
    const vacio = t => `<p class="muted small">${t}</p>`;
    p.innerHTML = `
      <header class="iv-head">
        <div><span class="iv-kicker">Resumen para la entrevista</span><h2>${esc(s.name)}</h2>
          <div class="chips">${chip(s.curso, 'conv')}${chip(s.rut || 'Sin RUN', 'neutral')}${this.areaBadges(s)}</div></div>
        <div class="iv-actions">
          <button type="button" class="icon-btn" title="Minimizar" aria-label="Minimizar el resumen" onclick="app.toggleInterviewPanelMin()">${ico('panel-right-close')}</button>
          <button type="button" class="icon-btn" title="Cerrar" aria-label="Cerrar el resumen" onclick="app.closeInterviewPanel()">${ico('x')}</button>
        </div>
      </header>
      <button type="button" class="iv-tab" onclick="app.toggleInterviewPanelMin()" aria-label="Abrir el resumen del estudiante">${ico('panel-right-open')}<span>Resumen</span></button>
      <div class="iv-scroll">
        <div class="iv-kpis">
          <div class="iv-kpi" data-alert="${s.asistencia.alerta}"><span class="num">${s.asistencia.real}%</span><small>Asistencia</small></div>
          <div class="iv-kpi"><span class="num">${s.asistencia.atrasos}</span><small>Atrasos</small></div>
          <div class="iv-kpi" data-alert="${!!g.notas && ivNum(g.notas.promedioGeneral) !== null && ivNum(g.notas.promedioGeneral) < 4.5}"><span class="num">${esc(g.notas?.promedioGeneral || '-')}</span><small>Promedio ${esc(g.anioNotas)}</small></div>
          <div class="iv-kpi"><span class="num">${g.entrevistas.length}</span><small>Entrevistas</small></div>
        </div>
        ${s.riesgoRepitencia?.activo ? `<p class="iv-alert">${ico('alert-triangle')}<span>Riesgo de repitencia${s.riesgoRepitencia.motivo ? `: ${esc(s.riesgoRepitencia.motivo)}` : ''}</span></p>` : ''}
        ${g.acuerdos.length ? `<p class="iv-alert iv-alert--info">${ico('list-checks')}<span>${g.acuerdos.length} acuerdo(s) pendiente(s) de revisar en esta entrevista</span></p>` : ''}

        ${sec('contacto', 'contact', 'Apoderado y contacto', '', `<dl class="iv-dl"><dt>Apoderado(a)</dt><dd>${esc(c.apoderado || 'Sin registrar')}${c.parentesco ? ` (${esc(c.parentesco)})` : ''}</dd><dt>Teléfono</dt><dd>${esc(c.telefono || '-')}${c.telefono2 ? ` / ${esc(c.telefono2)}` : ''}</dd><dt>Correo</dt><dd>${esc(c.email || '-')}</dd><dt>Profesor(a) jefe</dt><dd>${esc(this.profJefeOf(s.curso) || '-')}</dd>${this.edadDe(s) ? `<dt>Edad</dt><dd>${this.edadDe(s)}</dd>` : ''}</dl>`, true)}

        ${sec('acuerdos', 'list-checks', 'Acuerdos pendientes', g.acuerdos.length, g.acuerdos.length ? `<ul class="iv-list">${g.acuerdos.map(a => `<li><strong>${esc(corto(a.text, 160))}</strong><span>${a.responsable ? `Responsable: ${esc(a.responsable)} · ` : ''}${a.plazo ? `Plazo: ${esc(this.fmtPlazo(a))} · ` : ''}${esc(a.progress || 'No iniciado')}</span><em>${fecha(a.fecha)} · ${esc(a.tipo)}</em></li>`).join('')}</ul>` : vacio('No hay acuerdos pendientes.'), g.acuerdos.length > 0)}

        ${sec('entrevistas', 'messages-square', 'Entrevistas e intervenciones', g.entrevistas.length, g.entrevistas.length ? `<ul class="iv-list">${g.entrevistas.slice(0, 10).map(h => `<li><strong>${fecha(h.date)} · ${esc(h.type)}</strong>${this.interviewWho && this.interviewWho(h) ? `<em>${esc(this.interviewWho(h))}</em>` : ''}<span>${esc(corto(h.entrevista?.motivo ? `Motivo: ${h.entrevista.motivo}` : h.background))}</span><em>${esc(h.professional || '')}</em></li>`).join('')}</ul>${g.entrevistas.length > 10 ? vacio(`Y ${g.entrevistas.length - 10} más en la pestaña Intervenciones.`) : ''}` : vacio('Sin entrevistas registradas.'), true)}

        ${sec('notas', 'graduation-cap', `Calificaciones ${esc(g.anioNotas)}`, g.bajo4.length ? `${g.bajo4.length} bajo 4` : '', g.notas ? `<p class="small">Promedio general: <strong>${esc(g.notas.promedioGeneral || '-')}</strong>${g.notas.periodo ? ` (${esc(g.notas.periodo)})` : ''}</p>${g.bajo4.length ? `<ul class="iv-list iv-list--tight">${g.bajo4.map(a => `<li><strong>${esc(a.nombre)}</strong><span class="num">${String(a.nota).replace('.', ',')}</span></li>`).join('')}</ul>` : vacio('Sin asignaturas bajo 4,0.')}` : vacio('Sin notas cargadas.'), g.bajo4.length > 0)}

        ${sec('anotaciones', 'pen-line', 'Anotaciones', g.anotaciones.length, g.anotaciones.length ? `<p class="small">Positivas: <strong>${g.anotaciones.filter(h => h.anotacion.tipo === 'Positiva').length}</strong> · Negativas: <strong>${g.anotaciones.filter(h => h.anotacion.tipo !== 'Positiva').length}</strong></p><ul class="iv-list">${g.anotaciones.slice(0, 6).map(h => `<li><strong>${fecha(h.date)} · ${esc(h.anotacion.tipo)}</strong><span>${esc(corto(String(h.background).replace(/^Anotación \w+: /, ''), 140))}</span></li>`).join('')}</ul>` : vacio('Sin anotaciones.'))}

        ${sec('planes', 'clipboard-list', 'Planes', g.planes.length + g.planesArea.length, (g.planes.length || g.planesArea.length) ? `<ul class="iv-list">${g.planes.map(pl => `<li><strong>${esc(pl.type || 'Plan individual')}</strong><span>${esc(corto(pl.objective, 150))}</span><em>${esc(pl.status || 'En desarrollo')}${pl.evalQuant ? ` · logro ${pl.evalQuant}%` : ''}</em></li>`).join('')}${g.planesArea.map(r => `<li><strong>${esc(r.type || 'Plan')}</strong><span>${r.area === 'PIE' ? 'Programa PIE' : 'Riesgo de repitencia'} · ${fecha(r.date)}</span></li>`).join('')}</ul>` : vacio('Sin planes registrados.'))}

        ${sec('protocolos', 'alert-octagon', 'Protocolos y cartas', g.protocolos.length + g.cartas.length, (g.protocolos.length || g.cartas.length) ? `<ul class="iv-list">${g.protocolos.map(h => `<li><strong>${fecha(h.date)} · ${esc(h.protocol?.type || 'Protocolo')}</strong><span>Estado: ${esc(h.protocol?.status || 'En proceso')}</span></li>`).join('')}${g.cartas.map(h => `<li><strong>${fecha(h.date)} · ${esc(h.type)}</strong><span>${this.actaOf && this.actaOf(h.id) ? 'Acta firmada subida' : 'Sin acta firmada'}</span></li>`).join('')}</ul>` : vacio('Sin protocolos ni cartas.'))}

        ${sec('obs', 'eye', 'Observaciones docentes y enfermería', g.observaciones.length + g.enfermeria.length, `${g.observaciones.length ? `<ul class="iv-list">${g.observaciones.slice(0, 5).map(o => `<li><strong>${fecha(o.date)}</strong><span>${esc(corto(o.content || o.observacion || '', 150))}</span><em>${esc(o.professional || '')}</em></li>`).join('')}</ul>` : vacio('Sin observaciones docentes.')}${g.enfermeria.length ? `<p class="small">Atenciones de enfermería: <strong>${g.enfermeria.length}</strong></p>` : ''}`)}

        ${g.ocultas.length ? `<p class="note">${ico('lock')}${g.ocultas.length} registro(s) confidencial(es) no se muestran.</p>` : ''}
      </div>
      <footer class="iv-foot">
        <label class="check"><input type="checkbox" ${this.autoResumen() ? 'checked' : ''} onchange="app.setAutoResumen(this.checked)"><span>Abrir al iniciar una entrevista</span></label>
        <button type="button" class="btn btn--sm" onclick="app.openExportModal('ficha_entrevistas')">${ico('file-output')}Ficha de entrevistas</button>
      </footer>`;
    icons();
  },
  /** Inicia una entrevista nueva: abre el formulario y, al lado, el resumen del estudiante. */
  startInterview() {
    this.changeDetailTab('entrevistas');
    this.openInterventionForm();
    this.openInterviewPanel();
  }
});

const ivNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };

// Al abrir el formulario de una entrevista nueva se muestra el resumen (si el funcionario lo dejó activado)
(() => {
  const abrir = app.openInterventionForm;
  app.openInterventionForm = function (r = null) {
    abrir.call(this, r);
    if (!r && this.autoResumen()) this.openInterviewPanel();
  };
  // Si se cambia de estudiante o se sale de la ficha, el resumen se cierra; si cambian los datos, se actualiza
  const nav = app.navigate;
  app.navigate = function (v) { if (v !== 'student_detail') this.closeInterviewPanel(); return nav.call(this, v); };
  const rs = app.renderStudentDetail;
  app.renderStudentDetail = function () {
    const out = rs.call(this);
    const p = el('interview-panel');
    if (p && !p.hidden) { if (!sameId(p.dataset.student, State.selectedStudentId)) this.closeInterviewPanel(); else this.renderInterviewPanel(); }
    return out;
  };
})();

// Ficha de entrevistas del estudiante (PDF o Word)
app.REPORTS.ficha_entrevistas = function () {
  const s = app.current();
  const g = app.studentDigest(s);
  const c = s.contacto || {};
  const filas = [...g.entrevistas, ...g.protocolos, ...g.cartas].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    filename: `Ficha_Entrevistas_${String(s.name).replace(/\s+/g, '_')}.pdf`, title: 'FICHA DE ENTREVISTAS DEL ESTUDIANTE', student: true,
    body: `${docKv([[['Apoderado(a)', esc(c.apoderado || '-')], ['Teléfono', esc(c.telefono || '-')]], [['Profesor(a) jefe', esc(app.profJefeOf(s.curso) || '-')], ['Asistencia', `${s.asistencia.real} % (${s.asistencia.inasistencias} inasistencias, ${s.asistencia.atrasos} atrasos)`]], [['Promedio general', `${esc(g.notas?.promedioGeneral || '-')}${g.anioNotas ? ` (${esc(g.anioNotas)})` : ''}`], ['Anotaciones', `${g.anotaciones.filter(h => h.anotacion.tipo === 'Positiva').length} positivas / ${g.anotaciones.filter(h => h.anotacion.tipo !== 'Positiva').length} negativas`]]])}
      <div class="doc-avoid">${docH('Resumen de lo realizado con el estudiante')}
        ${docTable(['Ámbito', 'Cantidad', 'Detalle'], [
          ['Entrevistas e intervenciones', g.entrevistas.length, esc([...new Set(g.entrevistas.map(h => h.type))].slice(0, 5).join(', '))],
          ['Protocolos', g.protocolos.length, esc(g.protocolos.map(h => `${h.protocol?.type || 'Protocolo'} (${h.protocol?.status || 'En proceso'})`).join('; '))],
          ['Cartas de compromiso', g.cartas.length, g.actas ? `${g.actas} con acta firmada` : ''],
          ['Planes', g.planes.length + g.planesArea.length, esc([...g.planes.map(p => p.type || 'Plan individual'), ...g.planesArea.map(r => r.type || 'Plan')].join(', '))],
          ['Asignaturas bajo 4,0', g.bajo4.length, esc(g.bajo4.map(a => `${a.nombre} (${String(a.nota).replace('.', ',')})`).join(', '))],
          ['Observaciones docentes', g.observaciones.length, ''], ['Atenciones de enfermería', g.enfermeria.length, '']
        ], '')}</div>
      ${g.acuerdos.length ? `<div class="doc-avoid">${docH('Acuerdos pendientes')}${docTable(['Fecha', 'Acuerdo', 'Estado'], g.acuerdos.map(a => [fmtDate(a.fecha), esc(a.text), esc(a.progress || 'No iniciado')]), '')}</div>` : ''}
      ${docH('Registro de entrevistas')}
      ${filas.length ? filas.map(h => `<div class="doc-block doc-avoid"><div class="doc-block__head">${fmtDate(h.date)} · ${esc(h.type)} · ${esc(h.professional || '')}</div>
        <p class="doc-pre">${esc(String(h.background || '').replace(/\*\*/g, ''))}</p>
        ${(h.agreements || []).filter(a => a.text).length ? `<p><strong>Acuerdos:</strong></p><ul>${h.agreements.filter(a => a.text).map(a => `<li>${esc(a.text)} <em>(${esc(a.progress || 'No iniciado')})</em></li>`).join('')}</ul>` : ''}</div>`).join('') : '<p class="doc-empty">Sin entrevistas registradas.</p>'}
      ${g.ocultas.length ? `<p class="doc-muted">${g.ocultas.length} registro(s) confidencial(es) no se incluyen.</p>` : ''}`
  };
};

// =====================================================================
// FORMULARIO ÚNICO DE ENTREVISTA (ficha y registro rápido)
// =====================================================================
const IV_PARTICIPANTES = ['Estudiante', 'Apoderado(a)', 'Otro familiar', 'Red de apoyo', 'Funcionario(a) del colegio', 'Otro'];
const IV_TIPOS_RED = ['Oficina Local de la Niñez (OLN)', 'OPD', 'CESFAM', 'COSAM / salud mental', 'Hospital', 'Programa Mejor Niñez (PPF, PRM, PIE, DAM u otro)', 'Tribunal de Familia', 'Fiscalía', 'Carabineros / PDI', 'SENDA Previene', 'Habilidades para la Vida (JUNAEB)', 'Programa Familias (FOSIS)', 'Municipalidad / DIDECO', 'Fundación u ONG', 'Otra'];
const IV_RED = 'Entrevista con redes de apoyo';

Object.assign(app, {
  staffList() { const d = State.directorio && State.directorio.length ? State.directorio : State.users.filter(u => !u.eliminado && u.active !== false); return d.slice().sort((a, b) => a.name.localeCompare(b.name)); },
  staffLabel(u) { return `${u.name}${u.customRole || u.role ? ` — ${u.customRole || u.role}` : ''}`; },
  findStaff(label) { const t = String(label || '').trim().toLowerCase(); return this.staffList().find(u => this.staffLabel(u).toLowerCase() === t || u.name.toLowerCase() === t); },
  canSeeSummary() { return !this.isQuickOnly() && hasAccess('ver_fichas'); },
  ivTipos() {
    const t = (State.variables.interviewTypes || []).filter(x => x !== PROTOCOLO && !/protocolo|carta|anotaci/i.test(x));
    const base = t.length ? t : ['Entrevista Estudiante', 'Entrevista Apoderado', 'Entrevista Estudiante y Apoderado'];
    return base.includes(IV_RED) ? base : [...base, IV_RED];
  },
  /** Datos del apoderado registrados en la ficha (para prellenar). */
  apoderadoRow(s) { const c = s.contacto || {}; return { tipo: 'Apoderado(a)', nombre: c.apoderado || '', relacion: c.parentesco || '', correo: c.email || '', telefono: c.telefono || '' }; },
  /** Abre la entrevista. opts: { quick, id (para editar) } */
  openInterviewForm(studentId, opts = {}) {
    const s = State.rawStudents.find(x => sameId(x.id, studentId));
    if (!s) return;
    const prev = opts.id ? State.rawInterventions.find(x => sameId(x.id, opts.id)) : null;
    const e = prev?.entrevista;
    const tipo = prev?.type || opts.tipo || this.ivTipos().find(t => /estudiante/i.test(t)) || this.ivTipos()[0];
    State.ivForm = e ? {
      studentId: String(s.id), id: prev.id, quick: !!opts.quick, tipo, date: prev.date, hora: e.hora || '', lugar: e.lugar || '',
      apoyo: (e.apoyo || []).map(x => ({ ...x })), participantes: (e.participantes || []).map(x => ({ ...x })), red: e.red ? { ...e.red } : null,
      motivo: e.motivo || '', desarrollo: e.desarrollo || '', acuerdos: (prev.agreements || []).map(a => ({ ...a })), proxima: e.proxima ? { ...e.proxima } : { fecha: '', hora: '', con: '', lugar: '' },
      seguimiento: !!prev.solicitaSeguimiento, confidencial: !!prev.isPrivate, actualizarApoderado: true
    } : {
      studentId: String(s.id), id: null, quick: !!opts.quick, tipo, date: today(), hora: new Date().toTimeString().slice(0, 5), lugar: '',
      apoyo: [], participantes: [{ tipo: 'Estudiante', nombre: this.clean(s.name), relacion: s.curso || this.courseNameOf(s), correo: '', telefono: '' }], red: null,
      motivo: '', desarrollo: '', acuerdos: [{ text: '', responsable: '', responsableId: '', plazo: '', plazoTipo: 'dia' }], proxima: { fecha: '', hora: '', con: '', lugar: '' },
      seguimiento: false, confidencial: false, actualizarApoderado: true
    };
    if (!e) this.ivApplyTipo(tipo, true);
    ui.modal({ title: prev ? 'Editar entrevista' : 'Registrar entrevista', icon: 'messages-square', tone: 'conv', size: 'xl', okText: 'Guardar entrevista', body: '<div id="iv-form"></div>', onOk: () => this.saveInterviewForm() });
    ui.guard = 'La entrevista no se ha guardado. ¿Desea cerrarla de todas formas?';
    this.renderIvForm();
    if (this.canSeeSummary() && this.autoResumen() && !opts.sinResumen) this.openInterviewPanel(s.id);
  },
  /** Según el tipo: entrevista a apoderado agrega su fila con los datos guardados; con redes, abre la sección de la red. */
  ivApplyTipo(tipo, inicial = false) {
    const f = State.ivForm, s = State.rawStudents.find(x => sameId(x.id, f.studentId));
    f.tipo = tipo;
    if (/apoderad/i.test(tipo) && !f.participantes.some(p => /apoderad/i.test(p.tipo))) f.participantes.push(this.apoderadoRow(s));
    if (tipo === IV_RED && !f.red) {
      const ultima = (s.redes || []).slice(-1)[0];
      f.red = ultima ? { institucion: ultima.institucion, tipo: ultima.tipo, correo: ultima.correo || '', telefono: ultima.telefono || '' } : { institucion: '', tipo: '', correo: '', telefono: '' };
      if (ultima && !f.participantes.some(p => p.tipo === 'Red de apoyo')) (ultima.contactos || []).forEach(c => f.participantes.push({ tipo: 'Red de apoyo', nombre: c.nombre, relacion: c.cargo || '', correo: c.correo || '', telefono: c.telefono || '' }));
      if (!f.participantes.some(p => p.tipo === 'Red de apoyo')) f.participantes.push({ tipo: 'Red de apoyo', nombre: '', relacion: '', correo: '', telefono: '' });
    }
    if (!inicial) this.renderIvForm();
  },
  ivSet(path, v) { const ks = path.split('.'); let o = State.ivForm; ks.slice(0, -1).forEach(k => { o = o[k]; }); o[ks[ks.length - 1]] = v; },
  ivAdd(lista) {
    const f = State.ivForm;
    if (lista === 'participantes') f.participantes.push({ tipo: f.tipo === IV_RED ? 'Red de apoyo' : 'Otro familiar', nombre: '', relacion: '', correo: '', telefono: '' });
    if (lista === 'acuerdos') f.acuerdos.push({ text: '', responsable: '', responsableId: '', plazo: '', plazoTipo: 'dia' });
    if (lista === 'red') f.red = f.red || { institucion: '', tipo: '', correo: '', telefono: '' };
    this.renderIvForm();
  },
  ivRemove(lista, i) { if (lista === 'red') State.ivForm.red = null; else State.ivForm[lista].splice(i, 1); this.renderIvForm(); },
  ivAddApoyo() {
    const inp = el('iv-apoyo-input');
    const u = this.findStaff(inp.value);
    if (!u) return toast('Elija un funcionario de la lista (escriba parte de su nombre)', 'error');
    if (State.ivForm.apoyo.some(x => sameId(x.id, u.id))) return toast('Ese funcionario ya está agregado', 'error');
    State.ivForm.apoyo.push({ id: String(u.id), name: u.name, cargo: u.customRole || u.role || '' });
    this.renderIvForm();
  },
  /** Al escribir el nombre de un contacto ya guardado, se completan su relación, correo y teléfono. */
  ivPickContact(i, nombre) {
    const f = State.ivForm, p = f.participantes[i], s = State.rawStudents.find(x => sameId(x.id, f.studentId));
    p.nombre = nombre;
    const N = x => String(x || '').toLowerCase().trim();
    const c = (s.contactos || []).find(x => N(x.nombre) === N(nombre)) || (N((s.contacto || {}).apoderado) === N(nombre) ? { relacion: s.contacto.parentesco, correo: s.contacto.email, telefono: s.contacto.telefono } : null);
    if (c) { if (!p.relacion) p.relacion = c.relacion || ''; if (!p.correo) p.correo = c.correo || ''; if (!p.telefono) p.telefono = c.telefono || ''; this.renderIvForm(); }
  },
  ivSetResponsable(i, label) {
    const a = State.ivForm.acuerdos[i];
    const u = this.findStaff(label);
    a.responsable = u ? u.name : label.trim();
    a.responsableId = u ? String(u.id) : '';
  },
  renderIvForm() {
    const f = State.ivForm;
    const s = State.rawStudents.find(x => sameId(x.id, f.studentId));
    const inp = (path, v, attrs = '') => `<input class="input" value="${esc(v || '')}" oninput="app.ivSet('${path}', this.value)" ${attrs}>`;
    const staff = this.staffList();
    const contactos = [...new Set([(s.contacto || {}).apoderado, ...(s.contactos || []).map(c => c.nombre)].filter(Boolean))];
    const apod = f.participantes.find(p => /apoderad/i.test(p.tipo));
    const cambioApod = apod && s.contacto && ((apod.nombre && apod.nombre.toUpperCase() !== String(s.contacto.apoderado || '').toUpperCase()) || (apod.telefono && apod.telefono !== s.contacto.telefono) || (apod.correo && apod.correo !== s.contacto.email));
    const responsables = [...staff.map(u => this.staffLabel(u)), 'Estudiante', 'Apoderado(a)', ...(f.red?.institucion ? [`Red: ${f.red.institucion}`] : [])];
    el('iv-form').innerHTML = `
      <datalist id="iv-staff-list">${staff.map(u => `<option value="${esc(this.staffLabel(u))}">`).join('')}</datalist>
      <datalist id="iv-resp-list">${responsables.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
      <datalist id="iv-contact-list">${contactos.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="iv-form">
        <div class="iv-form__top">
          <p class="modal__msg"><strong>${esc(this.clean(s.name))}</strong>, ${esc(s.curso || this.courseNameOf(s))}</p>
          ${this.canSeeSummary() ? `<button type="button" class="btn btn--sm" onclick="app.openInterviewPanel(${jsq(s.id)})">${ico('panel-right-open')}Ver resumen del estudiante</button>` : ''}
        </div>

        <fieldset class="iv-block"><legend>${ico('calendar-clock')}Datos de la entrevista</legend>
          <div class="grid-4">
            ${fieldHtml('Tipo de entrevista', `<select class="input" onchange="app.ivApplyTipo(this.value)">${options(this.ivTipos().map(t => [t, t]), f.tipo)}</select>`, 'span-2')}
            ${fieldHtml('Fecha', `<input type="date" class="input" value="${esc(f.date)}" onchange="app.ivSet('date', this.value)">`)}
            ${fieldHtml('Hora', `<input type="time" class="input" value="${esc(f.hora)}" onchange="app.ivSet('hora', this.value)">`)}
          </div>
          ${fieldHtml('Lugar (opcional)', inp('lugar', f.lugar, 'placeholder="Oficina de convivencia, sala de reuniones, en línea..."'))}
        </fieldset>

        <fieldset class="iv-block"><legend>${ico('users')}Funcionarios que realizan la entrevista</legend>
          <div class="chips">${chip(`${State.currentUser.name} (responsable)`, 'conv', 'user-check')}${f.apoyo.map((p, i) => `<span class="chip chip--removable" data-tone="obs">${esc(p.name)}${p.cargo ? ` · ${esc(p.cargo)}` : ''}<button type="button" aria-label="Quitar a ${esc(p.name)}" onclick="app.ivRemove('apoyo', ${i})">${ico('x')}</button></span>`).join('')}</div>
          <div class="row-field"><input id="iv-apoyo-input" class="input" list="iv-staff-list" placeholder="Agregar funcionario que apoya: escriba parte de su nombre" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.ivAddApoyo();}"><button type="button" class="btn btn--sm" onclick="app.ivAddApoyo()">${ico('user-plus')}Agregar</button></div>
        </fieldset>

        ${f.red || f.tipo === IV_RED ? `<fieldset class="iv-block" data-tone="obs"><legend>${ico('network')}Red de apoyo</legend>
          <div class="grid-2">
            ${fieldHtml('Nombre de la institución', inp('red.institucion', f.red?.institucion, 'placeholder="OPD Concepción, CESFAM Lorenzo Arenas..."'))}
            ${fieldHtml('Tipo de red', `<select class="input" onchange="app.ivSet('red.tipo', this.value)"><option value="">Elegir...</option>${options(IV_TIPOS_RED.map(t => [t, t]), f.red?.tipo)}</select>`)}
            ${fieldHtml('Correo de contacto de la red', inp('red.correo', f.red?.correo, 'type="email" placeholder="contacto@institucion.cl"'))}
            ${fieldHtml('Teléfono de la red', inp('red.telefono', f.red?.telefono, 'type="tel" placeholder="+56 41 ..."'))}
          </div>
          ${f.tipo !== IV_RED ? `<button type="button" class="btn btn--sm" onclick="app.ivRemove('red')">${ico('x')}Quitar red</button>` : ''}
        </fieldset>` : `<button type="button" class="btn btn--sm" onclick="app.ivAdd('red')">${ico('network')}Participa una red de apoyo</button>`}

        <fieldset class="iv-block"><legend>${ico('user-round')}Personas entrevistadas y asistentes</legend>
          <p class="muted small">Incluya a todos los presentes: estudiante, apoderado(a), familiares e integrantes de la red. Todos firmarán el acta. El teléfono y el correo quedan guardados en la ficha para la próxima vez.</p>
          <div class="iv-people">${f.participantes.map((p, i) => `<div class="iv-person">
            <select class="input" aria-label="Calidad" onchange="app.ivSet('participantes.${i}.tipo', this.value); app.renderIvForm()">${options(IV_PARTICIPANTES.map(t => [t, t]), p.tipo)}</select>
            <input class="input" aria-label="Nombre" value="${esc(p.nombre)}" placeholder="Nombre completo" list="iv-contact-list" oninput="app.ivSet('participantes.${i}.nombre', this.value)" onchange="app.ivPickContact(${i}, this.value)">
            <input class="input" aria-label="Relación o cargo" value="${esc(p.relacion)}" placeholder="${p.tipo === 'Red de apoyo' ? 'Cargo (psicóloga, trabajador social...)' : p.tipo === 'Estudiante' ? 'Curso' : 'Parentesco (madre, abuelo...)'}" oninput="app.ivSet('participantes.${i}.relacion', this.value)">
            <input class="input" aria-label="Correo" type="email" value="${esc(p.correo)}" placeholder="Correo" oninput="app.ivSet('participantes.${i}.correo', this.value)">
            <input class="input" aria-label="Teléfono" type="tel" value="${esc(p.telefono)}" placeholder="Teléfono" oninput="app.ivSet('participantes.${i}.telefono', this.value)">
            <button type="button" class="icon-btn icon-btn--danger" title="Quitar" aria-label="Quitar a ${esc(p.nombre || 'participante')}" onclick="app.ivRemove('participantes', ${i})">${ico('trash-2')}</button>
          </div>`).join('')}</div>
          <div class="row-actions"><button type="button" class="btn btn--sm" onclick="app.ivAdd('participantes')">${ico('user-plus')}Agregar persona</button>
            ${!apod ? `<button type="button" class="btn btn--sm" onclick="State.ivForm.participantes.push(app.apoderadoRow(State.rawStudents.find(x => sameId(x.id, State.ivForm.studentId)))); app.renderIvForm()">${ico('user-round-plus')}Agregar apoderado(a) registrado</button>` : ''}</div>
          ${cambioApod ? `<label class="check"><input type="checkbox" ${f.actualizarApoderado ? 'checked' : ''} onchange="app.ivSet('actualizarApoderado', this.checked)"><span>Actualizar el apoderado(a), teléfono y correo en la ficha del estudiante con estos datos</span></label>` : ''}
        </fieldset>

        <fieldset class="iv-block"><legend>${ico('message-square-text')}Contenido</legend>
          ${fieldHtml('Motivo de la entrevista', `<textarea class="input" rows="2" placeholder="Por qué se realiza la entrevista" oninput="app.ivSet('motivo', this.value)">${esc(f.motivo)}</textarea>`)}
          ${fieldHtml('Desarrollo: lo conversado y observado', `<textarea class="input" rows="5" placeholder="Describa de forma objetiva lo conversado, lo observado y la postura de cada participante" oninput="app.ivSet('desarrollo', this.value)">${esc(f.desarrollo)}</textarea>`)}
        </fieldset>

        <fieldset class="iv-block"><legend>${ico('list-checks')}Acuerdos</legend>
          <div class="iv-agreements">${f.acuerdos.map((a, i) => `<div class="iv-agreement">
            <span class="iv-agreement__n num">${i + 1}</span>
            <textarea class="input" rows="2" aria-label="Acuerdo ${i + 1}" placeholder="Qué se acordó" oninput="app.ivSet('acuerdos.${i}.text', this.value)">${esc(a.text)}</textarea>
            <div class="iv-agreement__meta">
              <input class="input" list="iv-resp-list" aria-label="Responsable" value="${esc(a.responsable)}" placeholder="Responsable: busque un funcionario o escriba" onchange="app.ivSetResponsable(${i}, this.value)">
              <div class="row-field">
                <select class="input input--sm" aria-label="Tipo de plazo" onchange="app.ivSet('acuerdos.${i}.plazoTipo', this.value); app.ivSet('acuerdos.${i}.plazo', ''); app.renderIvForm()">${options([['dia', 'Plazo: día'], ['mes', 'Plazo: mes']], a.plazoTipo || 'dia')}</select>
                <input class="input" type="${a.plazoTipo === 'mes' ? 'month' : 'date'}" aria-label="Plazo" value="${esc(a.plazo)}" onchange="app.ivSet('acuerdos.${i}.plazo', this.value)">
              </div>
            </div>
            <button type="button" class="icon-btn icon-btn--danger" title="Quitar acuerdo" aria-label="Quitar acuerdo ${i + 1}" onclick="app.ivRemove('acuerdos', ${i})">${ico('trash-2')}</button>
          </div>`).join('')}</div>
          <button type="button" class="btn btn--sm" onclick="app.ivAdd('acuerdos')">${ico('plus')}Agregar acuerdo</button>
        </fieldset>

        <fieldset class="iv-block"><legend>${ico('calendar-plus')}Próxima entrevista (opcional)</legend>
          <div class="grid-4">
            ${fieldHtml('Fecha', `<input type="date" class="input" value="${esc(f.proxima.fecha)}" onchange="app.ivSet('proxima.fecha', this.value)">`)}
            ${fieldHtml('Hora', `<input type="time" class="input" value="${esc(f.proxima.hora)}" onchange="app.ivSet('proxima.hora', this.value)">`)}
            ${fieldHtml('Con quién', inp('proxima.con', f.proxima.con, 'placeholder="Apoderada y estudiante"'))}
            ${fieldHtml('Lugar', inp('proxima.lugar', f.proxima.lugar, 'placeholder="Oficina de convivencia"'))}
          </div>
        </fieldset>

        <div class="iv-block iv-block--plain">
          <label class="check"><input type="checkbox" ${f.seguimiento ? 'checked' : ''} onchange="app.ivSet('seguimiento', this.checked)"><span>Solicitar seguimiento del equipo de convivencia escolar</span></label>
          ${this.isQuickOnly() ? '' : `<label class="check"><input type="checkbox" ${f.confidencial ? 'checked' : ''} onchange="app.ivSet('confidencial', this.checked)"><span>Entrevista confidencial (solo la ve el equipo autorizado)</span></label>`}
          <p class="note">${ico('shield-check')}La información de la entrevista es confidencial y se rige por la Ley N° 21.719.${this.isQuickOnly() ? ' Con su perfil de registro rápido no podrá volver a abrirla; podrá imprimirla para las firmas al guardar.' : ''}</p>
        </div>
      </div>`;
    icons();
  },
  async saveInterviewForm() {
    const f = State.ivForm;
    if (!f.motivo.trim()) { toast('Escriba el motivo de la entrevista', 'error'); return false; }
    if (f.tipo === IV_RED && !(f.red?.institucion || '').trim()) { toast('Indique el nombre de la institución de la red de apoyo', 'error'); return false; }
    const mal = f.participantes.find(p => p.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.correo));
    if (mal) { toast(`El correo de ${mal.nombre || 'un participante'} no es válido`, 'error'); return false; }
    const out = await API.call('registrarEvento', {
      kind: 'entrevista', id: f.id || undefined, studentId: f.studentId, date: f.date, hora: f.hora, lugar: f.lugar, tipoEntrevista: f.tipo,
      apoyo: f.apoyo, participantes: f.participantes.filter(p => p.nombre.trim()), red: f.red, motivo: f.motivo.trim(), desarrollo: f.desarrollo.trim(),
      acuerdos: f.acuerdos.filter(a => a.text.trim()), proxima: f.proxima.fecha ? f.proxima : null, seguimiento: f.seguimiento, confidencial: f.confidencial,
      actualizarApoderado: f.actualizarApoderado, desdeRegistroRapido: f.quick
    });
    const s = State.rawStudents.find(x => sameId(x.id, f.studentId));
    Object.assign(s, { contacto: out.contacto || s.contacto, contactos: out.contactos || s.contactos, redes: out.redes || s.redes });
    State.lastInterview = out.intervention;
    if (!this.isQuickOnly() && out.intervention) DB.upsertLocal('interventions', out.intervention);
    if (f.quick && this.logQuick) this.logQuick(s, f.tipo);
    ui.guard = null;
    toast(f.id ? 'Entrevista actualizada' : 'Entrevista guardada en la ficha del estudiante');
    // Ofrecer el acta para firmar
    setTimeout(() => ui.modal({
      title: 'Entrevista guardada', icon: 'check-circle', tone: 'conv', size: 'sm', okText: 'Imprimir para firmar', cancelText: 'Cerrar',
      body: `<p class="modal__msg">Puede imprimir el acta de la entrevista para que la firmen quien la realizó y todas las personas presentes.</p>`,
      onOk: () => { this.printInterview(out.id); return false; }
    }), 50);
    if (!this.isQuickOnly()) setTimeout(() => this.render(), 0);
  },
  printInterview(id) {
    const iv = (State.lastInterview && sameId(State.lastInterview.id, id)) ? State.lastInterview : State.rawInterventions.find(x => sameId(x.id, id));
    if (!iv) return toast('No se encontró la entrevista', 'error');
    State.lastInterview = iv;
    State.selectedStudentId = iv.studentId;
    State.export.tempIntId = iv.id;
    this.openExportModal('entrevista');
  },
  /** Firmas del acta: quien entrevista, quienes apoyan y todas las personas presentes (incluida la red). */
  interviewSignatures(iv) {
    const e = iv.entrevista || {};
    const sigs = [{ role: String(e.entrevistador?.cargo || 'FUNCIONARIO/A RESPONSABLE').toUpperCase(), name: String(e.entrevistador?.name || iv.professional || '').toUpperCase() }];
    (e.apoyo || []).forEach(p => sigs.push({ role: String(p.cargo || 'FUNCIONARIO/A').toUpperCase(), name: p.name.toUpperCase() }));
    (e.participantes || []).forEach(p => sigs.push({ role: (p.tipo === 'Red de apoyo' ? `${p.relacion || 'Red de apoyo'}${e.red?.institucion ? `, ${e.red.institucion}` : ''}` : p.tipo === 'Estudiante' ? 'Estudiante' : `${p.tipo}${p.relacion ? ` (${p.relacion})` : ''}`).toUpperCase(), name: p.nombre.toUpperCase() }));
    return sigs.map(x => ({ id: newId(), ...x, checked: true }));
  },
  fmtPlazo(a) {
    if (!a.plazo) return 'Sin plazo';
    if (a.plazoTipo === 'mes') { const [y, m] = a.plazo.split('-'); return `${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][parseInt(m, 10) - 1] || ''} ${y}`; }
    return fmtDate(a.plazo);
  },
  /** Texto corto con quiénes participaron (por ejemplo, "con María Soto (madre) · red: OPD"). */
  interviewWho(iv) {
    const e = iv.entrevista;
    if (!e) return '';
    const p = (e.participantes || []).filter(x => x.tipo !== 'Estudiante').map(x => `${x.nombre}${x.relacion ? ` (${x.relacion})` : ''}`);
    return [p.length ? `con ${p.join(', ')}` : '', e.red?.institucion ? `red: ${e.red.institucion}` : ''].filter(Boolean).join(' · ');
  },
  /** Entrevista desde la ficha: el mismo formulario, con el resumen al lado. */
  startInterview() { this.openInterviewForm(State.selectedStudentId); },
  quickInterview(studentId) { this.openInterviewForm(studentId, { quick: true }); }
});

// La firma del acta incluye a todos los presentes; editar una entrevista nueva abre el mismo formulario
(() => {
  const exp = app.openExportModal;
  app.openExportModal = function (ctx) {
    exp.call(this, ctx);
    if (ctx === 'entrevista' && State.lastInterview) { State.export.customSignatures = this.interviewSignatures(State.lastInterview); this.renderCustomSignatures(); }
  };
  const edit = app.editIntervention;
  app.editIntervention = function (id) {
    const r = State.rawInterventions.find(x => sameId(x.id, id));
    if (r && r.entrevista) return this.openInterviewForm(r.studentId, { id });
    return edit.call(this, id);
  };
})();

// Acta de la entrevista (PDF o Word)
app.REPORTS.entrevista = function () {
  const iv = State.lastInterview || State.rawInterventions.find(x => sameId(x.id, State.export.tempIntId)) || {};
  const e = iv.entrevista || {};
  const parts = e.participantes || [];
  return {
    filename: `Entrevista_${String(iv.studentName || '').replace(/\s+/g, '_')}_${iv.date || ''}.pdf`, title: String(iv.type || 'ACTA DE ENTREVISTA').toUpperCase(), student: true,
    body: `${docKv([[['Fecha', fmtDate(iv.date)], ['Hora', esc(e.hora || '-')]], [['Lugar', esc(e.lugar || '-')], ['Realiza la entrevista', esc(e.entrevistador?.name || iv.professional || '')]], ...((e.apoyo || []).length ? [[['Apoyan la entrevista', esc(e.apoyo.map(p => `${p.name}${p.cargo ? ` (${p.cargo})` : ''}`).join(', '))], ['', '']]] : [])])}
      ${e.red ? `<div class="doc-avoid">${docH('Red de apoyo')}${docKv([[['Institución', esc(e.red.institucion)], ['Tipo de red', esc(e.red.tipo || '-')]], [['Correo', esc(e.red.correo || '-')], ['Teléfono', esc(e.red.telefono || '-')]]])}</div>` : ''}
      ${parts.length ? `<div class="doc-avoid">${docH('Personas entrevistadas y asistentes')}${docTable(['Nombre', 'Calidad', 'Relación o cargo', 'Correo', 'Teléfono'], parts.map(p => [esc(p.nombre), esc(p.tipo), esc(p.relacion || ''), esc(p.correo || ''), esc(p.telefono || '')]), '')}</div>` : ''}
      <div class="doc-avoid">${docH('Motivo')}<div class="doc-box doc-pre">${esc(e.motivo || '')}</div></div>
      ${e.desarrollo ? `<div class="doc-avoid">${docH('Desarrollo')}<div class="doc-box doc-pre">${esc(e.desarrollo)}</div></div>` : (!e.motivo ? `<div class="doc-box doc-pre">${esc(String(iv.background || '').replace(/\*\*/g, ''))}</div>` : '')}
      <div class="doc-avoid">${docH('Acuerdos')}${(iv.agreements || []).length ? docTable(['N°', 'Acuerdo', 'Responsable', 'Plazo'], iv.agreements.map((a, i) => [i + 1, esc(a.text), esc(a.responsable || '-'), esc(app.fmtPlazo(a))]), '') : '<p class="doc-muted">Sin acuerdos.</p>'}</div>
      ${e.proxima ? `<p><strong>Próxima entrevista:</strong> ${fmtDate(e.proxima.fecha)}${e.proxima.hora ? ` a las ${esc(e.proxima.hora)}` : ''}${e.proxima.con ? `, con ${esc(e.proxima.con)}` : ''}${e.proxima.lugar ? `, en ${esc(e.proxima.lugar)}` : ''}.</p>` : ''}
      <p class="doc-muted">Los participantes declaran conocer el contenido de esta acta. Información confidencial, protegida por la Ley N° 21.719 sobre protección de datos personales.</p>`
  };
};
