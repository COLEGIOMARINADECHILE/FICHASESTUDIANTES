'use strict';
// =====================================================================
// REUNIONES DE NIVEL (una serie por curso)
// a) Visión general del curso (profesor jefe)
// b) Casos relevantes, derivaciones y seguimiento (convivencia / profesor jefe)
// c) Asistencia y atrasos: casos críticos (inspectoría / trabajadora social)
// d) Situación académica y planes de apoyo (coordinación de ciclo / orientación)
// Cada sección muestra los datos de la plataforma para monitorear y se pueden
// insertar en el texto. Hay acuerdos con responsable y plazo (se marcan igual que
// en las entrevistas), participantes con cargo, asistencia con PIN y acta.
// Escriben los participantes; los demás solo leen; los paradocentes solo ven
// las reuniones a las que fueron invitados. Cerrada la reunión, queda de solo
// lectura (salvo marcar el cumplimiento de sus acuerdos) y el PIN deja de servir.
// =====================================================================
const REU_SECCIONES = [
  ['vision', 'a) Visión general del curso', 'Profesor(a) jefe', 'eye'],
  ['casos', 'b) Casos relevantes, derivaciones y seguimiento', 'Convivencia Escolar / Profesor(a) jefe', 'users'],
  ['asistencia', 'c) Asistencia y atrasos: casos críticos', 'Inspectoría / Trabajadora social', 'calendar-x'],
  ['academica', 'd) Situación académica y planes de apoyo', 'Coordinación de ciclo / Orientación', 'graduation-cap']
];

Object.assign(app, {
  reuniones() { return State.reuniones || []; },
  reunionesDe(course) { return this.reuniones().filter(r => r.course === course).sort((a, b) => String(b.fecha + (b.hora || '')).localeCompare(String(a.fecha + (a.hora || '')))); },
  reunion(id) { return this.reuniones().find(r => sameId(r.id, id)); },
  reuOrganiza(r) { const u = State.currentUser; return hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema') || hasAccess('editar_fichas') || (r && sameId(r.creadoPorId, u.id)); },
  reuParticipa(r) { return (r?.participantes || []).some(p => p.userId && sameId(p.userId, State.currentUser.id)); },
  reuPuedeEscribir(r) { return r && r.estado === 'abierta' && !State.verAnio && (this.reuOrganiza(r) || this.reuParticipa(r)); },
  reuPuedeMarcar(r) { return r && !State.verAnio && !r.anioArchivo && (this.reuOrganiza(r) || this.reuParticipa(r) || hasAccess('agregar_entrevistas')); },
  reuPuedeIniciar() { return !this.isQuickOnly() && !State.verAnio && (hasAccess('agregar_entrevistas') || hasAccess('editar_fichas') || hasAccess('gestionar_usuarios')); },
  staffList() { return (State.directorio && State.directorio.length ? State.directorio : State.users || []).filter(u => !u.eliminado && u.active !== false).slice().sort((a, b) => a.name.localeCompare(b.name, 'es')); },
  cargoDe(u) { return u.customRole || u.role || ''; },

  // ---------------- LISTA ----------------
  renderReuniones() {
    if (State.reunionId && this.reunion(State.reunionId)) return this.renderReunion(this.reunion(State.reunionId));
    State.reunionId = null;
    const cursos = this.isQuickOnly() ? [...new Set(this.reuniones().map(r => r.course))] : (this.myCourses ? this.myCourses() : ALL_COURSES);
    const course = State.reuCourse && cursos.includes(State.reuCourse) ? State.reuCourse : '';
    el('reu-toolbar').innerHTML = `<div class="row-actions">
        <select class="input" aria-label="Curso" onchange="State.reuCourse=this.value; app.renderReuniones()">${options([['', 'Todos los cursos'], ...ALL_COURSES.filter(c => cursos.includes(c)).map(c => [c, `${c}${this.reunionesDe(c).length ? ' ●' : ''}`])], course)}</select>
      </div>
      <div class="row-actions">
        <button class="btn" onclick="app.reuIngresarPin()">${ico('key-round')}Registrar mi asistencia con PIN</button>
        ${this.reuPuedeIniciar() ? `<button class="btn btn--primary" onclick="app.openNuevaReunion(${jsq(course)})">${ico('plus')}Nueva reunión de nivel</button>` : ''}
      </div>`;
    const lista = this.reuniones().filter(r => !course || r.course === course).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const abiertas = lista.filter(r => r.estado === 'abierta');
    const card = r => {
      const pres = (r.participantes || []).filter(p => p.presente).length;
      const ag = (r.agreements || []).filter(a => a.text);
      const hechos = ag.filter(a => this.agreementState(a) === 'si').length;
      return `<article class="reu-card" data-estado="${r.estado}">
        <div><span class="cell-title">${esc(r.course)} · ${fmtDate(r.fecha)}${r.hora ? ` · ${esc(r.hora)}` : ''}</span>
          <span class="cell-sub">${r.estado === 'abierta' ? chip('En curso', 'warn', 'radio') : chip('Cerrada', 'neutral', 'lock')} ${pres} presente(s) · ${ag.length ? `${hechos} de ${ag.length} acuerdos realizados` : 'sin acuerdos'} · Organiza ${esc(r.creadoPor || '')}${this.reuParticipa(r) ? ' · usted participa' : ''}</span></div>
        <div class="row-actions"><button class="btn btn--sm" onclick="app.openReunion(${jsq(r.id)})">${ico('folder-open')}${r.estado === 'abierta' && this.reuPuedeEscribir(r) ? 'Continuar' : 'Ver'}</button><button class="btn btn--sm" onclick="app.reuActa(${jsq(r.id)})">${ico('file-down')}Acta</button></div>
      </article>`;
    };
    el('reu-body').innerHTML = `<article class="entry"><div class="entry__head"><div class="entry__id"><h1 class="entry__name">Reuniones de nivel${course ? ` · ${esc(course)}` : ''}</h1>
        <div class="chips">${chip(`${lista.length} reunión(es)`, 'obs', 'users-round')}${abiertas.length ? chip(`${abiertas.length} en curso`, 'warn', 'radio') : ''}</div></div></div>
        <p class="entry__note entry__note--info">${ico('info')}Cada curso lleva su serie de reuniones: visión general, casos relevantes, asistencia y situación académica, con acuerdos que se revisan en la reunión siguiente. Escriben los participantes; el resto del equipo puede leerlas.${this.isQuickOnly() ? ' Usted ve solo las reuniones a las que fue invitado(a).' : ''}</p></article>
      ${lista.length ? `<div class="stack">${lista.map(card).join('')}</div>` : empty('users-round', this.isQuickOnly() ? 'No tiene reuniones de nivel asignadas. Si le entregaron un PIN, use "Registrar mi asistencia con PIN".' : 'Aún no hay reuniones de nivel. Inicie una con "Nueva reunión de nivel".', 'obs')}`;
    icons();
  },
  openReunion(id) { State.reunionId = id; this.navigate('reuniones'); },
  closeReunionView() { State.reunionId = null; this.navigate('reuniones'); },

  // ---------------- PIN ----------------
  reuIngresarPin() {
    ui.prompt({ title: 'Registrar asistencia con PIN', msg: 'Escriba el PIN de 6 dígitos que entregó quien organiza la reunión. Solo sirve mientras la reunión está abierta.', icon: 'key-round', type: 'text', placeholder: '000000', okText: 'Registrar asistencia', action: async v => {
      try {
        const r = await API.call('reunionPin', { pin: v });
        await DB.load();
        notice({ type: 'success', title: 'Asistencia registrada', msg: `Reunión de nivel de ${r.course} (${fmtDate(r.fecha)}). Ya puede ver la reunión y aportar información.` });
        this.openReunion(r.reunionId);
      } catch (e) { toast(e.message, 'error'); return false; }
    } });
  },
  nuevoPin() { return String(Math.floor(100000 + Math.random() * 900000)); },

  // ---------------- NUEVA REUNIÓN (ventana emergente con lo anterior) ----------------
  /** Participantes sugeridos para un curso: profesor jefe y equipos de convivencia, inspectoría, social, ciclo y orientación. */
  reuSugeridos(course) {
    const pj = String(this.profJefeOf(course) || '').toLowerCase();
    const re = /convivencia|inspector|social|orientaci|ciclo|utp|psic/i;
    return this.staffList().filter(u => (pj && String(u.name).toLowerCase() === pj) || re.test(`${u.role} ${u.customRole}`) || sameId(u.id, State.currentUser.id));
  },
  openNuevaReunion(course = '') {
    const cursos = this.myCourses ? this.myCourses() : ALL_COURSES;
    State.reuNueva = { course: course || State.reuCourse || '', sel: {} };
    if (State.reuNueva.course) this.reuSugeridos(State.reuNueva.course).forEach(u => { State.reuNueva.sel[u.id] = true; });
    ui.modal({
      title: 'Nueva reunión de nivel', icon: 'users-round', tone: 'conv', size: 'xl', okText: 'Comenzar reunión',
      body: `<div class="stack">
        <div class="grid-4">
          ${fieldHtml('Curso', `<select id="reu-n-course" class="input" onchange="app.reuNuevaCurso(this.value)"><option value="">Elija el curso...</option>${options(ALL_COURSES.filter(c => cursos.includes(c)).map(c => [c, c]), State.reuNueva.course)}</select>`)}
          ${fieldHtml('Fecha', `<input type="date" id="reu-n-fecha" class="input" value="${today()}">`)}
          ${fieldHtml('Hora', `<input type="time" id="reu-n-hora" class="input" value="${new Date().toTimeString().slice(0, 5)}">`)}
          ${fieldHtml('Lugar', '<input id="reu-n-lugar" class="input" placeholder="Sala de reuniones">')}
        </div>
        <div id="reu-n-prev"></div>
        <div id="reu-n-part"></div>
      </div>`,
      onOk: () => this.crearReunion()
    });
    this.renderNuevaReunion();
  },
  reuNuevaCurso(c) {
    State.reuNueva.course = c;
    State.reuNueva.sel = {};
    this.reuSugeridos(c).forEach(u => { State.reuNueva.sel[u.id] = true; });
    this.renderNuevaReunion();
  },
  renderNuevaReunion() {
    const n = State.reuNueva, c = n.course;
    const prev = c ? this.reunionesDe(c)[0] : null;
    el('reu-n-prev').innerHTML = !c ? '' : prev ? this.reuResumenAnteriorHtml(prev) : `<p class="note">${ico('info')}Es la primera reunión de nivel de ${esc(c)} registrada en la plataforma.</p>`;
    const staff = this.staffList();
    el('reu-n-part').innerHTML = c ? `<details class="reu-part-pick" open><summary><strong>${ico('users')}Participantes invitados</strong> <span class="muted small">(${Object.values(n.sel).filter(Boolean).length} seleccionados; podrán escribir en la reunión. Después se pueden agregar más y personas externas)</span></summary>
      <input type="search" class="input" placeholder="Buscar funcionario..." oninput="document.querySelectorAll('#reu-n-staff label').forEach(l => l.hidden = !l.textContent.toLowerCase().includes(this.value.toLowerCase()))">
      <div id="reu-n-staff" class="reu-staff">${staff.map(u => `<label class="check"><input type="checkbox" ${n.sel[u.id] ? 'checked' : ''} onchange="State.reuNueva.sel[${jsq(u.id)}]=this.checked"><span>${esc(u.name)} <span class="muted small">${esc(this.cargoDe(u))}</span></span></label>`).join('')}</div>
    </details>` : '';
    icons();
  },
  /** Resumen de la reunión anterior: puntos tratados, acuerdos (para marcar) y lo previsto para esta sesión. */
  reuResumenAnteriorHtml(prev) {
    const corto = (t, n = 260) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
    const ag = (prev.agreements || []).map((a, i) => ({ a, i })).filter(x => x.a.text);
    return `<section class="reu-prev">
      <h3>${ico('history')}Reunión anterior: ${fmtDate(prev.fecha)} ${prev.estado === 'abierta' ? chip('Aún abierta', 'warn') : ''}</h3>
      <div class="grid-2">${REU_SECCIONES.map(([k, t]) => prev['sec_' + k]?.texto ? `<div class="reu-prev__sec"><strong>${esc(t)}</strong><p class="prewrap small">${esc(corto(prev['sec_' + k].texto))}</p></div>` : '').join('') || '<p class="muted small">Sin puntos registrados.</p>'}</div>
      ${prev.proxima?.temas || prev.proxima?.fecha ? `<p class="reu-prev__next">${ico('calendar-clock')}<span><strong>Acordado para esta sesión:</strong> ${prev.proxima.fecha ? fmtDate(prev.proxima.fecha) + '. ' : ''}${esc(prev.proxima.temas || '')}</span></p>` : ''}
      <h4>${ico('list-checks')}Acuerdos de la reunión anterior (${ag.filter(x => this.agreementState(x.a) === 'si').length} de ${ag.length} realizados)</h4>
      ${ag.length ? `<div class="stack" data-reu-ags="${esc(String(prev.id))}">${ag.map(x => this.reuAcuerdoHtml(prev, x.a, x.i)).join('')}</div>` : '<p class="muted small">Sin acuerdos.</p>'}
    </section>`;
  },
  async crearReunion() {
    const n = State.reuNueva;
    if (!n.course) { toast('Elija el curso', 'error'); return false; }
    const staff = this.staffList();
    const me = State.currentUser;
    const participantes = staff.filter(u => n.sel[u.id] || sameId(u.id, me.id)).map(u => ({ id: 'u' + u.id, userId: String(u.id), nombre: u.name, cargo: this.cargoDe(u), presente: sameId(u.id, me.id), via: sameId(u.id, me.id) ? 'organiza' : '', hora: sameId(u.id, me.id) ? new Date().toTimeString().slice(0, 5) : '' }));
    const prev = this.reunionesDe(n.course)[0];
    const doc = {
      id: 'reu_' + Date.now(), course: n.course, anio: String(this.anioActual ? this.anioActual() : today().slice(0, 4)), fecha: el('reu-n-fecha').value || today(), hora: el('reu-n-hora').value, lugar: el('reu-n-lugar').value.trim(),
      estado: 'abierta', creadoPor: me.name, creadoPorId: String(me.id), participantes, pin: this.nuevoPin(), pinActivo: true,
      anterior: prev ? { reunionId: String(prev.id), fecha: prev.fecha } : null, agreements: [], proxima: { fecha: '', temas: '' }, creadaEl: new Date().toISOString()
    };
    try {
      await DB.save('reuniones', doc);
      this.openReunion(doc.id);
      notice({ type: 'success', title: `Reunión de nivel de ${n.course} iniciada`, msg: `PIN de asistencia: ${doc.pin}. Compártalo con los participantes para que registren su asistencia desde "Reuniones de nivel".` });
    } catch (e) { notice({ type: 'error', title: 'No se pudo iniciar la reunión', msg: e.message }); return false; }
  },

  // ---------------- DETALLE DE LA REUNIÓN ----------------
  renderReunion(r) {
    const puede = this.reuPuedeEscribir(r), org = this.reuOrganiza(r) && r.estado === 'abierta' && !State.verAnio;
    const prev = r.anterior ? this.reunion(r.anterior.reunionId) : null;
    el('reu-toolbar').innerHTML = `<button class="btn" onclick="app.closeReunionView()">${ico('arrow-left')}Todas las reuniones</button>
      <div class="row-actions">
        <button class="btn" onclick="app.reuRecargar()">${ico('refresh-cw')}Actualizar</button>
        <button class="btn" onclick="app.reuAcuerdosModal(${jsq(r.id)})">${ico('list-checks')}Acuerdos</button>
        <button class="btn" onclick="app.reuActa(${jsq(r.id)})">${ico('file-down')}Acta (PDF o Word)</button>
        ${org ? `<button class="btn btn--danger" onclick="app.cerrarReunion(${jsq(r.id)})">${ico('lock')}Cerrar reunión</button>` : ''}
      </div>`;
    const pres = (r.participantes || []).filter(p => p.presente);
    el('reu-body').innerHTML = `
      <article class="entry"><div class="entry__head"><div class="entry__id">
        <h1 class="entry__name">Reunión de nivel · ${esc(r.course)}</h1>
        <div class="chips">${chip(fmtDate(r.fecha) + (r.hora ? ` · ${r.hora}` : ''), 'obs', 'calendar')}${r.lugar ? chip(r.lugar, 'neutral', 'map-pin') : ''}${r.estado === 'abierta' ? chip('En curso', 'warn', 'radio') : chip(`Cerrada el ${fmtDate(r.fechaCierre)} ${r.horaCierre || ''}`, 'neutral', 'lock')}${chip(`Organiza: ${r.creadoPor}`, 'neutral', 'user')}${chip(`Profesor(a) jefe: ${this.profJefeOf(r.course) || 'sin registrar'}`, 'conv', 'user-check')}</div></div></div>
        ${!puede ? `<p class="entry__note entry__note--info">${ico(r.estado === 'abierta' ? 'eye' : 'lock')}${r.estado === 'abierta' ? 'Usted puede leer esta reunión. Solo los participantes escriben; si participa, registre su asistencia con el PIN.' : 'La reunión está cerrada: queda como acta y solo se puede marcar el cumplimiento de sus acuerdos.'}</p>` : ''}
      </article>

      ${r.estado === 'abierta' && org ? `<section class="panel reu-pin"><div><span class="cell__label">PIN de asistencia</span><span class="reu-pin__num num">${esc(r.pin || '------')}</span><span class="muted small">Los participantes entran a "Reuniones de nivel" → "Registrar mi asistencia con PIN". Deja de funcionar al cerrar la reunión.</span></div>
        <div class="row-actions"><button class="btn btn--sm" onclick="app.reuPinNuevo(${jsq(r.id)})">${ico('refresh-cw')}Generar otro PIN</button></div></section>` : ''}

      <section class="panel"><div class="panel__head"><h2>${ico('users')}Participantes (${pres.length} presentes de ${(r.participantes || []).length})</h2></div>
        <div class="table-wrap"><table class="table table--dense"><thead><tr><th>Nombre</th><th>Cargo</th><th>Asistencia</th>${org ? '<th class="t-actions"></th>' : ''}</tr></thead><tbody>
        ${(r.participantes || []).map((p, i) => `<tr><td><span class="cell-title">${esc(p.nombre)}</span>${p.userId ? '' : '<span class="cell-sub">Externo(a)</span>'}</td><td>${esc(p.cargo || '')}</td>
          <td>${org ? `<label class="check"><input type="checkbox" ${p.presente ? 'checked' : ''} onchange="app.reuPresente(${jsq(r.id)}, ${i}, this.checked)"><span>${p.presente ? `Presente${p.via === 'pin' ? ` con PIN (${esc(p.hora)})` : p.hora ? ` (${esc(p.hora)})` : ''}` : 'Ausente'}</span></label>` : (p.presente ? chip(`Presente${p.via === 'pin' ? ' con PIN' : ''}${p.hora ? ' ' + p.hora : ''}`, 'conv', 'check') : chip('Ausente', 'neutral'))}</td>
          ${org ? `<td class="t-actions">${sameId(p.userId, r.creadoPorId) ? '' : `<button class="icon-btn icon-btn--danger" title="Quitar" aria-label="Quitar a ${esc(p.nombre)}" onclick="app.reuQuitar(${jsq(r.id)}, ${i})">${ico('x')}</button>`}</td>` : ''}</tr>`).join('')}
        </tbody></table></div>
        ${org ? `<div class="reu-add">
          <select id="reu-add-staff" class="input" aria-label="Agregar funcionario"><option value="">Agregar funcionario...</option>${options(this.staffList().filter(u => !(r.participantes || []).some(p => sameId(p.userId, u.id))).map(u => [u.id, `${u.name} (${this.cargoDe(u)})`]))}</select>
          <button class="btn btn--sm" onclick="app.reuAgregar(${jsq(r.id)})">${ico('user-plus')}Agregar</button>
          <input id="reu-ext-nombre" class="input" placeholder="Persona externa: nombre"><input id="reu-ext-cargo" class="input" placeholder="Cargo o institución">
          <button class="btn btn--sm" onclick="app.reuAgregarExterno(${jsq(r.id)})">${ico('user-plus')}Agregar externo</button>
        </div>` : ''}
      </section>

      ${prev ? `<section class="panel">${this.reuResumenAnteriorHtml(prev)}</section>` : ''}

      ${REU_SECCIONES.map(([k, t, quien, icon]) => this.reuSeccionHtml(r, k, t, quien, icon, puede)).join('')}

      <section class="panel"><div class="panel__head"><h2>${ico('check-circle')}Acuerdos de esta reunión <span data-reu-tally="${esc(String(r.id))}">${this.reuTally(r)}</span></h2>
        <button class="btn btn--sm" onclick="app.reuAcuerdosModal(${jsq(r.id)})">${ico('maximize-2')}Ver y marcar en ventana</button></div>
        <div class="stack" data-reu-ags="${esc(String(r.id))}">${(r.agreements || []).map((a, i) => this.reuAcuerdoHtml(r, a, i)).join('') || '<p class="muted small">Aún no hay acuerdos.</p>'}</div>
        ${puede ? `<div class="reu-new-ag">
          <textarea id="reu-ag-text" class="input" rows="2" placeholder="Nuevo acuerdo: qué se hará"></textarea>
          <div class="grid-3">
            <input id="reu-ag-resp" class="input" list="reu-staff-list" placeholder="Responsable (nombre o cargo)">
            <input id="reu-ag-plazo" type="date" class="input" aria-label="Plazo">
            <button class="btn btn--primary" onclick="app.reuAgregarAcuerdo(${jsq(r.id)})">${ico('plus')}Agregar acuerdo</button>
          </div>
          <datalist id="reu-staff-list">${(r.participantes || []).map(p => `<option value="${esc(p.nombre)}">`).join('')}${this.staffList().map(u => `<option value="${esc(u.name)}">`).join('')}</datalist>
        </div>` : ''}
      </section>

      <section class="panel"><div class="panel__head"><h2>${ico('calendar-clock')}Próxima reunión</h2></div>
        <div class="grid-3">
          ${fieldHtml('Fecha', `<input type="date" class="input" value="${esc(r.proxima?.fecha || '')}" ${puede ? '' : 'disabled'} onchange="app.reuProxima(${jsq(r.id)}, 'fecha', this.value)">`)}
          ${fieldHtml('Temas y acuerdos a revisar en la próxima sesión', `<textarea class="input" rows="2" ${puede ? '' : 'readonly'} onchange="app.reuProxima(${jsq(r.id)}, 'temas', this.value)">${esc(r.proxima?.temas || '')}</textarea>`, 'span-2')}
        </div>
      </section>`;
    icons();
  },
  reuRecargar() { const id = State.reunionId; DB.load().then(() => { State.reunionId = id; this.render(); toast('Reunión actualizada'); }).catch(e => toast(e.message, 'error')); },
  reuSeccionHtml(r, k, titulo, quien, icon, puede) {
    const s = r['sec_' + k] || {};
    return `<section class="panel reu-sec">
      <div class="panel__head"><h2>${ico(icon)}${esc(titulo)}</h2><span class="muted small">${esc(quien)}</span></div>
      <details class="reu-datos"><summary class="small">${ico('database')}Datos de la plataforma para monitorear</summary><div class="reu-datos__body">${this.reuDatosHtml(r.course, k)}</div>
        ${puede ? `<button type="button" class="btn btn--sm" onclick="app.reuInsertarDatos(${jsq(r.id)}, '${k}')">${ico('corner-down-right')}Insertar estos datos en el texto</button>` : ''}</details>
      <textarea class="input" id="reu-sec-${k}" rows="6" ${puede ? '' : 'readonly'} placeholder="${puede ? 'Escriba lo tratado...' : 'Sin registro.'}" onchange="app.reuGuardarSeccion(${jsq(r.id)}, '${k}', this.value)">${esc(s.texto || '')}</textarea>
      ${s.por ? `<p class="muted small">Última edición: ${esc(s.por)}, ${esc(s.fecha || '')}</p>` : ''}
    </section>`;
  },

  // ---------------- DATOS DE LA PLATAFORMA POR SECCIÓN ----------------
  reuDatos(course, k) {
    const anio = String(this.anioActual ? this.anioActual() : today().slice(0, 4));
    const a = this.computeTraspaso ? this.computeTraspaso(course, anio) : null;
    const studs = this.getStudents().filter(s => s.curso === course && s.status !== 'blocked');
    const n = s => this.clean ? this.clean(s.name) : s.name;
    const L = [];
    if (k === 'vision') {
      L.push(`Profesor(a) jefe: ${this.profJefeOf(course) || 'sin registrar'}. Matrícula activa: ${studs.length}.`);
      if (a) {
        L.push(`Asistencia promedio: ${a.promAsis} %. Promedio general: ${a.promCurso || 'sin notas'}.`);
        if (a.convivencia?.total) L.push(`Registros de convivencia en el año: ${a.convivencia.total} (${a.convivencia.protocolos} protocolos).`);
      }
      const dia = (State.dia || []).filter(d => d.course === course && String(d.anio) === anio && d.tipo !== 'condiciones');
      dia.forEach(d => { const c = this.diaCalc(d); L.push(`DIA ${d.asignatura} (${d.periodo}): ${c.areas.map(x => `${x.nombre} ${String(x.pct).replace('.', ',')} %`).join('; ')}.`); });
      (this.condOf ? this.condOf(course, anio) : []).forEach(d => L.push(`Cuestionario de Condiciones: ${(d.dims || []).map(x => `${x.nombre} ${this.condNum(x.rf)} %`).join('; ')}.`));
    }
    if (k === 'casos') {
      const anioIni = `${anio}-01-01`;
      const ints = (State.rawInterventions || []).filter(h => studs.some(s => sameId(s.id, h.studentId)) && String(h.date) >= anioIni && !h.restricted);
      const deriv = ints.filter(h => /deriva/i.test(h.type) || /deriva/i.test(h.background || ''));
      if (a?.disciplina?.length) L.push(`Estudiantes con alertas de convivencia: ${a.disciplina.slice(0, 12).map(x => `${n(x.s)} (${[x.prot && `${x.prot} protocolo(s)`, x.graves && `${x.graves} falta(s) grave(s)`, x.anot && `${x.anot} anotación(es) negativa(s)`].filter(Boolean).join(', ')})`).join('; ')}.`);
      if (deriv.length) L.push(`Derivaciones registradas: ${deriv.slice(0, 12).map(h => `${n(studs.find(s => sameId(s.id, h.studentId)) || { name: h.studentName })} (${fmtDate(h.date)}, ${h.type}; acuerdos: ${(h.agreements || []).filter(x => x.text).map(x => this.agreementStatusText(x)).join(', ') || 'sin acuerdos'})`).join('; ')}.`);
      const pend = studs.map(s => ({ s, n: this.studentAgreements ? this.studentAgreements(s.id).filter(x => this.agreementOpen(x.a)).length : 0 })).filter(x => x.n).sort((x, y) => y.n - x.n);
      if (pend.length) L.push(`Seguimiento: estudiantes con acuerdos pendientes: ${pend.slice(0, 12).map(x => `${n(x.s)} (${x.n})`).join('; ')}.`);
      if (a?.socio?.length) L.push(`Con apoyo socioemocional o planes: ${a.socio.slice(0, 12).map(x => n(x.s)).join(', ')}.`);
      if (!L.length) L.push('No hay casos con registros relevantes en el año.');
    }
    if (k === 'asistencia') {
      const bajas = studs.filter(s => s.asistencia.real < 85).sort((x, y) => x.asistencia.real - y.asistencia.real);
      const graves = bajas.filter(s => s.asistencia.real < 70);
      const atr = studs.filter(s => +s.asistencia.atrasos >= 3).sort((x, y) => y.asistencia.atrasos - x.asistencia.atrasos);
      L.push(a ? `Asistencia promedio del curso: ${a.promAsis} %.` : '');
      L.push(bajas.length ? `Bajo 85 % de asistencia (${bajas.length}): ${bajas.slice(0, 15).map(s => `${n(s)} ${s.asistencia.real} %`).join('; ')}.` : 'Ningún estudiante bajo 85 % de asistencia.');
      if (graves.length) L.push(`Casos críticos bajo 70 %: ${graves.map(n).join(', ')}.`);
      L.push(atr.length ? `Con 3 o más atrasos: ${atr.slice(0, 15).map(s => `${n(s)} (${s.asistencia.atrasos})`).join('; ')}.` : 'Sin estudiantes con 3 o más atrasos.');
    }
    if (k === 'academica') {
      if (a) {
        L.push(`Promedio general del curso: ${a.promCurso || 'sin notas'} (${a.conNotas} estudiantes con notas).`);
        const crit = (a.rendimiento || []).filter(r => r.bajo).sort((x, y) => y.bajo - x.bajo);
        if (crit.length) L.push(`Asignaturas con estudiantes bajo 4,0: ${crit.slice(0, 6).map(r => `${r.nombre} (${r.bajo})`).join('; ')}.`);
        L.push(a.riesgo?.length ? `Riesgo de repitencia (${a.riesgo.length}): ${a.riesgo.map(x => `${n(x.s)} (${x.motivos.join(', ')})`).join('; ')}.` : 'Ningún estudiante en riesgo de repitencia con los datos actuales.');
        if (a.pie?.length) L.push(`Estudiantes PIE: ${a.pie.length}.`);
      }
      const planes = (State.studentPlans || []).filter(p => studs.some(s => sameId(s.id, p.studentId)));
      const rep = (State.rawInclusionReports || []).filter(p => studs.some(s => sameId(s.id, p.studentId)) && p.area === 'REPITENCIA');
      if (planes.length) L.push(`Planes de apoyo individuales: ${planes.slice(0, 12).map(p => `${n(studs.find(s => sameId(s.id, p.studentId)) || {})} (${p.type || 'plan'}, ${p.status || 'en desarrollo'}${p.evalQuant ? `, logro ${p.evalQuant} %` : ''})`).join('; ')}.`);
      if (rep.length) L.push(`Planes por riesgo de repitencia: ${rep.length}.`);
    }
    return L.filter(Boolean);
  },
  reuDatosHtml(course, k) { return `<ul class="reu-datos__list">${this.reuDatos(course, k).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`; },
  reuInsertarDatos(id, k) {
    const ta = el('reu-sec-' + k);
    const txt = this.reuDatos(this.reunion(id).course, k).map(x => `- ${x}`).join('\n');
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n\n' : '') + 'Datos de la plataforma:\n' + txt;
    this.reuGuardarSeccion(id, k, ta.value);
  },

  // ---------------- GUARDADO ----------------
  async reuPatch(id, campos, msg) {
    const r = this.reunion(id);
    try { await DB.patch('reuniones', id, campos); if (msg) toast(msg); return true; }
    catch (e) { notice({ type: 'error', title: 'No se guardó', msg: e.message }); if (r) this.render(); return false; }
  },
  reuGuardarSeccion(id, k, texto) {
    return this.reuPatch(id, { ['sec_' + k]: { texto, por: State.currentUser.name, fecha: new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) } }, 'Guardado');
  },
  reuProxima(id, campo, v) { const r = this.reunion(id); this.reuPatch(id, { proxima: { ...(r.proxima || {}), [campo]: v } }, 'Próxima reunión guardada'); },
  async reuPresente(id, i, v) {
    const r = this.reunion(id);
    const participantes = (r.participantes || []).map((p, k) => k === i ? { ...p, presente: v, via: v ? (p.via === 'pin' ? 'pin' : 'manual') : '', hora: v ? (p.hora || new Date().toTimeString().slice(0, 5)) : '' } : p);
    if (await this.reuPatch(id, { participantes })) this.render();
  },
  async reuQuitar(id, i) { const r = this.reunion(id); if (await this.reuPatch(id, { participantes: r.participantes.filter((_, k) => k !== i) })) this.render(); },
  async reuAgregar(id) {
    const uid = el('reu-add-staff').value;
    const u = this.staffList().find(x => sameId(x.id, uid));
    if (!u) return toast('Elija un funcionario', 'error');
    const r = this.reunion(id);
    if (await this.reuPatch(id, { participantes: [...(r.participantes || []), { id: 'u' + u.id, userId: String(u.id), nombre: u.name, cargo: this.cargoDe(u), presente: false, via: '', hora: '' }] }, `${u.name} fue invitado(a)`)) this.render();
  },
  async reuAgregarExterno(id) {
    const nombre = el('reu-ext-nombre').value.trim(), cargo = el('reu-ext-cargo').value.trim();
    if (!nombre) return toast('Escriba el nombre', 'error');
    const r = this.reunion(id);
    if (await this.reuPatch(id, { participantes: [...(r.participantes || []), { id: 'e' + Date.now(), userId: '', nombre, cargo, presente: true, via: 'manual', hora: new Date().toTimeString().slice(0, 5) }] })) this.render();
  },
  async reuPinNuevo(id) { if (await this.reuPatch(id, { pin: this.nuevoPin(), pinActivo: true }, 'Nuevo PIN generado')) this.render(); },
  async reuAgregarAcuerdo(id) {
    const text = el('reu-ag-text').value.trim();
    if (!text) return toast('Escriba el acuerdo', 'error');
    const r = this.reunion(id);
    const resp = el('reu-ag-resp').value.trim();
    const u = this.staffList().find(x => x.name === resp);
    const agreements = [...(r.agreements || []), { text, responsable: resp, responsableId: u ? String(u.id) : '', plazo: el('reu-ag-plazo').value, plazoTipo: 'dia', progress: 'No Iniciado', creadoPor: State.currentUser.name }];
    if (await this.reuPatch(id, { agreements }, 'Acuerdo agregado')) this.render();
  },

  // ---------------- ACUERDOS: TARJETA Y MARCADO ----------------
  reuTally(r) {
    const ag = (r.agreements || []).filter(a => a.text);
    if (!ag.length) return '';
    const h = ag.filter(a => this.agreementState(a) === 'si').length;
    return `<span class="agr-tally${h === ag.length ? ' is-done' : ''}">${h} de ${ag.length} realizados</span>`;
  },
  reuAcuerdoHtml(r, a, i) {
    const st = this.agreementState(a), puede = this.reuPuedeMarcar(r);
    const tm = this.agreementTiming(a);
    const b = (k, label, icon, valor) => `<button type="button" class="agr-mark agr-mark--${k}" aria-pressed="${st === k}" title="${st === k ? 'Quitar la marca' : `Marcar como ${label.toLowerCase()}`}" onclick="app.reuMarcar(${jsq(r.id)}, ${i}, ${jsq(st === k ? 'No Iniciado' : valor)})">${ico(icon)}<span>${label}</span></button>`;
    return `<div class="agreement agr-card" data-reu-ag="${esc(String(r.id))}:${i}" data-estado="${st}">
      <p class="prewrap">${esc(a.text)}</p>
      <p class="agreement__meta">${a.responsable ? `${ico('user')}Responsable: <strong>${esc(a.responsable)}</strong>` : ''}${a.plazo ? `${ico('calendar')}Plazo: <strong>${esc(this.fmtPlazo(a))}</strong>` : ''}</p>
      <div class="agr-foot">${puede ? `<div class="agr-marks">${(a.plazo || st !== 'pendiente') ? `<span class="agr-time agr-time--${tm.k}">${esc(tm.t)}</span>` : ''}${b('si', 'Realizado', 'check', 'Logrado')}${b('proceso', 'En proceso', 'clock', 'En Proceso')}${b('no', 'No realizado', 'x', 'No Logrado')}</div>
        ${a.marcadoFecha && st !== 'pendiente' ? `<div class="agr-dateline"><label class="agr-date">${ico('calendar-check')}<span>Marcado el</span><input type="date" class="input input--sm" value="${esc(a.marcadoFecha)}" max="${today()}" onchange="app.reuMarcarFecha(${jsq(r.id)}, ${i}, this.value)"></label>${a.marcadoPor ? `<span class="agr-who">por ${esc(a.marcadoPor)}</span>` : ''}</div>` : ''}`
        : `<span class="muted small">Estado: ${esc(this.agreementStatusText(a))}</span>`}</div>
    </div>`;
  },
  async reuMarcar(id, i, valor) {
    const r = this.reunion(id);
    const agreements = r.agreements.map((a, k) => k !== i ? a : valor === 'No Iniciado'
      ? (({ marcadoPor, marcadoFecha, ...rest }) => ({ ...rest, progress: valor }))(a)
      : { ...a, progress: valor, marcadoPor: State.currentUser.name, marcadoFecha: today() });
    const antes = r.agreements;
    r.agreements = agreements;
    this.reuRefrescarAcuerdos(r);
    try { await DB.patch('reuniones', id, { agreements }); }
    catch (e) { r.agreements = antes; this.reuRefrescarAcuerdos(r); notice({ type: 'error', title: 'No se guardó la marca', msg: e.message }); }
  },
  async reuMarcarFecha(id, i, fecha) {
    if (!fecha || fecha > today()) return toast('Elija una fecha válida (no posterior a hoy)', 'error');
    const r = this.reunion(id);
    const agreements = r.agreements.map((a, k) => k === i ? { ...a, marcadoFecha: fecha } : a);
    r.agreements = agreements;
    this.reuRefrescarAcuerdos(r);
    try { await DB.patch('reuniones', id, { agreements }); toast(`Fecha guardada: ${fmtDate(fecha)}`); } catch (e) { notice({ type: 'error', title: 'No se guardó la fecha', msg: e.message }); }
  },
  /** Solo se vuelven a dibujar los acuerdos de esa reunión (en la página y en la ventana), sin recargar todo. */
  reuRefrescarAcuerdos(r) {
    document.querySelectorAll(`[data-reu-ags="${CSS.escape(String(r.id))}"]`).forEach(box => { box.innerHTML = (r.agreements || []).map((a, i) => a.text ? this.reuAcuerdoHtml(r, a, i) : '').join(''); });
    document.querySelectorAll(`[data-reu-tally="${CSS.escape(String(r.id))}"]`).forEach(n => { n.innerHTML = this.reuTally(r); });
    icons();
  },
  /** Ventana emergente con los acuerdos de la reunión y los de la anterior, para marcarlos. */
  reuAcuerdosModal(id) {
    const r = this.reunion(id);
    const prev = r.anterior ? this.reunion(r.anterior.reunionId) : null;
    ui.modal({ title: `Acuerdos · ${r.course}`, icon: 'list-checks', tone: 'conv', size: 'lg', hideOk: true, cancelText: 'Cerrar',
      body: `<div class="stack">
        ${prev ? `<h4>${ico('history')}Reunión anterior (${fmtDate(prev.fecha)})</h4><div class="stack" data-reu-ags="${esc(String(prev.id))}">${(prev.agreements || []).map((a, i) => a.text ? this.reuAcuerdoHtml(prev, a, i) : '').join('') || '<p class="muted small">Sin acuerdos.</p>'}</div>` : ''}
        <h4>${ico('check-circle')}Esta reunión (${fmtDate(r.fecha)}) <span data-reu-tally="${esc(String(r.id))}">${this.reuTally(r)}</span></h4>
        <div class="stack" data-reu-ags="${esc(String(r.id))}">${(r.agreements || []).map((a, i) => a.text ? this.reuAcuerdoHtml(r, a, i) : '').join('') || '<p class="muted small">Aún no hay acuerdos.</p>'}</div>
      </div>` });
  },

  // ---------------- CIERRE Y ACTA ----------------
  cerrarReunion(id) {
    const r = this.reunion(id);
    ui.confirm({ title: 'Cerrar la reunión', icon: 'lock', tone: 'warn', okText: 'Cerrar reunión', msg: `Al cerrar, el PIN deja de funcionar y la reunión queda como acta de solo lectura. Los acuerdos se podrán seguir marcando. ${(r.participantes || []).filter(p => p.presente).length} participante(s) presentes.`, action: async () => {
      const prev = r.anterior ? this.reunion(r.anterior.reunionId) : null;
      const ahora = new Date();
      const campos = { estado: 'cerrada', pinActivo: false, fechaCierre: today(), horaCierre: ahora.toTimeString().slice(0, 5), cerradaPor: State.currentUser.name,
        revisionAnterior: prev ? (prev.agreements || []).filter(a => a.text).map(a => ({ text: a.text, responsable: a.responsable || '', plazo: this.fmtPlazo(a), estado: this.agreementStatusText(a) })) : [] };
      if (await this.reuPatch(id, campos)) {
        notice({ type: 'success', title: 'Reunión cerrada', msg: 'Quedó como acta. Puede descargarla en PDF o Word para imprimir y firmar.', actions: [['Descargar acta', () => this.reuActa(id)]] });
        this.render();
      }
    } });
  },
  reuActa(id) {
    State.export.tempReunionId = id;
    this.openExportModal('reunion_nivel');
  }
});

// Acta de la reunión (PDF o Word)
app.REPORTS.reunion_nivel = function () {
  const r = app.reunion(State.export.tempReunionId) || {};
  const prev = r.anterior ? app.reunion(r.anterior.reunionId) : null;
  const revision = r.revisionAnterior && r.revisionAnterior.length ? r.revisionAnterior : (prev ? (prev.agreements || []).filter(a => a.text).map(a => ({ text: a.text, responsable: a.responsable || '', plazo: app.fmtPlazo(a), estado: app.agreementStatusText(a) })) : []);
  const asis = p => p.presente ? `Presente${p.via === 'pin' ? ` (PIN ${p.hora || ''})` : p.hora ? ` (${p.hora})` : ''}` : 'Ausente';
  return {
    filename: `Acta_reunion_nivel_${String(r.course || '').replace(/\s+/g, '_')}_${r.fecha || ''}.pdf`, title: 'ACTA DE REUNIÓN DE NIVEL',
    body: `${docKv([[['Curso', esc(r.course || '')], ['Fecha', `${fmtDate(r.fecha)}${r.hora ? ` · ${esc(r.hora)}` : ''}`]], [['Lugar', esc(r.lugar || '-')], ['Profesor(a) jefe', esc(app.profJefeOf(r.course) || '-')]], [['Organiza', esc(r.creadoPor || '')], ['Estado', r.estado === 'cerrada' ? `Cerrada el ${fmtDate(r.fechaCierre)} a las ${esc(r.horaCierre || '')}` : 'En curso (acta preliminar)']], [['PIN de asistencia', esc(r.pin || 'No disponible')], ['Asistentes', String((r.participantes || []).filter(p => p.presente).length)]]])}
      <div class="doc-avoid">${docH('Participantes')}${docTable(['Nombre', 'Cargo', 'Asistencia', 'Firma'], (r.participantes || []).map(p => [esc(p.nombre), esc(p.cargo || ''), asis(p), '']), '')}</div>
      ${revision.length ? `<div class="doc-avoid">${docH(`Revisión de acuerdos de la reunión anterior${prev ? ` (${fmtDate(prev.fecha)})` : ''}`)}${docTable(['Acuerdo', 'Responsable', 'Plazo', 'Estado'], revision.map(a => [esc(a.text), esc(a.responsable || '-'), esc(a.plazo || '-'), esc(a.estado)]), '')}</div>` : ''}
      ${REU_SECCIONES.map(([k, t, quien]) => `<div class="doc-avoid">${docH(t)}<p class="doc-muted">${esc(quien)}</p><div class="doc-box doc-pre">${esc(r['sec_' + k]?.texto || 'Sin registro.')}</div></div>`).join('')}
      <div class="doc-avoid">${docH('Acuerdos')}${(r.agreements || []).filter(a => a.text).length ? docTable(['N°', 'Acuerdo', 'Responsable', 'Plazo', 'Estado'], r.agreements.filter(a => a.text).map((a, i) => [i + 1, esc(a.text), esc(a.responsable || '-'), esc(app.fmtPlazo(a)), esc(app.agreementStatusText(a))]), '') : '<p class="doc-muted">Sin acuerdos.</p>'}</div>
      ${r.proxima?.fecha || r.proxima?.temas ? `<p><strong>Próxima reunión:</strong> ${r.proxima.fecha ? fmtDate(r.proxima.fecha) + '. ' : ''}${esc(r.proxima.temas || '')}</p>` : ''}
      <p class="doc-muted">Acta generada desde la plataforma. La asistencia con PIN quedó registrada con la hora de ingreso. Información confidencial (Ley N° 21.719).</p>`
  };
};

// Firmas del acta: todos los participantes presentes
(() => {
  const exp = app.openExportModal;
  app.openExportModal = function (ctx) {
    exp.call(this, ctx);
    if (ctx === 'reunion_nivel') {
      const r = this.reunion(State.export.tempReunionId) || {};
      State.export.customSignatures = (r.participantes || []).filter(p => p.presente).map(p => ({ id: newId(), role: String(p.cargo || 'PARTICIPANTE').toUpperCase(), name: String(p.nombre).toUpperCase(), checked: true }));
      this.renderCustomSignatures();
    }
  };
})();
