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
        <div class="row-actions"><button class="btn btn--sm" onclick="app.openReunion(${jsq(r.id)})">${ico('folder-open')}${r.estado === 'abierta' && this.reuPuedeEscribir(r) ? 'Continuar' : 'Ver'}</button><button class="btn btn--sm" onclick="app.reuActa(${jsq(r.id)})">${ico('file-down')}Acta</button>${this.reuOrganiza(r) && !State.verAnio && !r.anioArchivo ? `${r.estado === 'abierta' ? `<button class="icon-btn" title="Editar datos" aria-label="Editar datos de la reunión" onclick="app.reuEditar(${jsq(r.id)})">${ico('edit-2')}</button>` : ''}<button class="icon-btn icon-btn--danger" title="Eliminar reunión" aria-label="Eliminar reunión" onclick="app.reuEliminar(${jsq(r.id)})">${ico('trash-2')}</button>` : ''}</div>
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
        ${org ? `<button class="btn" onclick="app.reuEditar(${jsq(r.id)})">${ico('edit-2')}Editar datos</button><button class="btn btn--danger" onclick="app.cerrarReunion(${jsq(r.id)})">${ico('lock')}Cerrar reunión</button>` : ''}
        ${r.estado === 'cerrada' && this.reuOrganiza(r) && !State.verAnio && !r.anioArchivo ? `<button class="btn" onclick="app.reuReabrir(${jsq(r.id)})">${ico('unlock')}Reabrir para corregir</button>` : ''}
        ${this.reuOrganiza(r) && !State.verAnio && !r.anioArchivo ? `<button class="icon-btn icon-btn--danger" title="Eliminar reunión" aria-label="Eliminar reunión" onclick="app.reuEliminar(${jsq(r.id)})">${ico('trash-2')}</button>` : ''}
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
      <details class="reu-datos" ${s.texto ? '' : 'open'}><summary class="small">${ico('database')}Datos de la plataforma para monitorear</summary><div class="reu-datos__body">${this.reuDatosHtml(r.course, k)}</div>
        ${puede ? `<button type="button" class="btn btn--sm" onclick="app.reuInsertarDatos(${jsq(r.id)}, '${k}')">${ico('corner-down-right')}Insertar estos datos en el texto</button>` : ''}</details>
      <textarea class="input" id="reu-sec-${k}" rows="6" ${puede ? '' : 'readonly'} placeholder="${puede ? 'Escriba lo tratado...' : 'Sin registro.'}" onchange="app.reuGuardarSeccion(${jsq(r.id)}, '${k}', this.value)">${esc(s.texto || '')}</textarea>
      ${s.por ? `<p class="muted small">Última edición: ${esc(s.por)}, ${esc(s.fecha || '')}</p>` : ''}
    </section>`;
  },

  // ---------------- DATOS DE LA PLATAFORMA POR SECCIÓN ----------------
  /** Datos estructurados: indicadores (kpis), grupos de estudiantes con detalle y notas. */
  reuDatosObj(course, k) {
    const anio = String(this.anioActual ? this.anioActual() : today().slice(0, 4));
    const a = this.computeTraspaso ? this.computeTraspaso(course, anio) : null;
    const studs = this.getStudents().filter(s => s.curso === course && s.status !== 'blocked');
    const n = s => this.clean ? this.clean(s.name) : s.name;
    const pct = v => `${String(v).replace('.', ',')} %`;
    const nivel = (v, a1, a2, inverso) => inverso ? (v >= a1 ? 'proto' : v >= a2 ? 'warn' : 'conv') : (v < a1 ? 'proto' : v < a2 ? 'warn' : 'conv');
    const O = { kpis: [], grupos: [], notas: [] };
    const grupo = (t, tone, icon, items, vacio) => O.grupos.push({ t, tone, icon, items, vacio });
    if (k === 'vision') {
      O.kpis.push({ v: studs.length, l: 'Matrícula activa', tone: 'obs' });
      if (a) {
        O.kpis.push({ v: pct(a.promAsis), l: 'Asistencia promedio', tone: nivel(+a.promAsis, 85, 90) });
        O.kpis.push({ v: a.promCurso && a.promCurso !== '-' ? String(a.promCurso).replace('.', ',') : 'Sin notas', l: 'Promedio general', tone: a.promCurso && a.promCurso !== '-' ? nivel(+String(a.promCurso).replace(',', '.'), 5, 5.5) : 'neutral' });
        O.kpis.push({ v: a.convivencia?.total || 0, l: `Registros de convivencia (${a.convivencia?.protocolos || 0} protocolos)`, tone: 'conv' });
      }
      O.notas.push(`Profesor(a) jefe: ${this.profJefeOf(course) || 'sin registrar'}`);
      const dia = (State.dia || []).filter(d => d.course === course && String(d.anio) === anio && d.tipo !== 'condiciones');
      dia.forEach(d => { const c = this.diaCalc(d); grupo(`DIA ${d.asignatura} · ${d.periodo}`, 'obs', 'bar-chart-3', c.areas.map(x => ({ n: x.nombre, d: pct(x.pct), tone: nivel(x.pct, 50, 75) })), ''); });
      (this.condOf ? this.condOf(course, anio) : []).forEach(d => grupo('Cuestionario de Condiciones (bienestar)', 'conv', 'heart-handshake', (d.dims || []).map(x => ({ n: x.nombre, d: pct(this.condNum(x.rf)), tone: nivel(x.rf, 50, 70) })), ''));
    }
    if (k === 'casos') {
      const anioIni = `${anio}-01-01`;
      const ints = (State.rawInterventions || []).filter(h => studs.some(s => sameId(s.id, h.studentId)) && String(h.date) >= anioIni && !h.restricted);
      const deriv = ints.filter(h => /deriva/i.test(h.type) || /deriva/i.test(h.background || ''));
      const pend = studs.map(s => ({ s, c: this.studentAgreements ? this.studentAgreements(s.id).filter(x => this.agreementOpen(x.a)).length : 0 })).filter(x => x.c).sort((x, y) => y.c - x.c);
      O.kpis.push({ v: a?.disciplina?.length || 0, l: 'Con alertas de convivencia', tone: a?.disciplina?.length ? 'proto' : 'conv' });
      O.kpis.push({ v: deriv.length, l: 'Derivaciones en el año', tone: deriv.length ? 'warn' : 'conv' });
      O.kpis.push({ v: pend.length, l: 'Con acuerdos pendientes', tone: pend.length ? 'warn' : 'conv' });
      O.kpis.push({ v: a?.socio?.length || 0, l: 'Con apoyo socioemocional', tone: 'pie' });
      grupo('Alertas de convivencia', 'proto', 'shield-alert', (a?.disciplina || []).slice(0, 15).map(x => ({ n: n(x.s), id: x.s.id, d: [x.prot && `${x.prot} protocolo(s)`, x.graves && `${x.graves} falta(s) grave(s)`, x.anot && `${x.anot} anotación(es) negativa(s)`].filter(Boolean).join(' · '), tone: x.prot || x.graves ? 'proto' : 'warn' })), 'Sin estudiantes con alertas de convivencia.');
      grupo('Derivaciones y su estado', 'warn', 'send', deriv.slice(0, 15).map(h => { const s = studs.find(x => sameId(x.id, h.studentId)); const ags = (h.agreements || []).filter(x => x.text); const ab = ags.filter(x => this.agreementOpen(x)).length; return { n: s ? n(s) : h.studentName, id: s?.id, d: `${fmtDate(h.date)} · ${h.type}${ags.length ? ` · ${ags.length - ab} de ${ags.length} acuerdos realizados` : ''}`, tone: ab ? 'warn' : 'conv' }; }), 'Sin derivaciones registradas este año.');
      grupo('Seguimiento: acuerdos pendientes', 'warn', 'list-checks', pend.slice(0, 15).map(x => ({ n: n(x.s), id: x.s.id, d: `${x.c} pendiente(s)`, tone: 'warn' })), 'No hay acuerdos pendientes.');
    }
    if (k === 'asistencia') {
      const bajas = studs.filter(s => s.asistencia.real < 85).sort((x, y) => x.asistencia.real - y.asistencia.real);
      const atr = studs.filter(s => +s.asistencia.atrasos >= 3).sort((x, y) => y.asistencia.atrasos - x.asistencia.atrasos);
      if (a) O.kpis.push({ v: pct(a.promAsis), l: 'Asistencia promedio', tone: nivel(+a.promAsis, 85, 90) });
      O.kpis.push({ v: bajas.length, l: 'Bajo 85 % de asistencia', tone: bajas.length ? 'warn' : 'conv' });
      O.kpis.push({ v: bajas.filter(s => s.asistencia.real < 70).length, l: 'Críticos (bajo 70 %)', tone: bajas.some(s => s.asistencia.real < 70) ? 'proto' : 'conv' });
      O.kpis.push({ v: atr.length, l: 'Con 3 o más atrasos', tone: atr.length ? 'warn' : 'conv' });
      grupo('Asistencia bajo 85 %', 'proto', 'calendar-x', bajas.slice(0, 20).map(s => ({ n: n(s), id: s.id, d: `${pct(s.asistencia.real)} · ${s.asistencia.inasistencias} inasistencias`, tone: s.asistencia.real < 70 ? 'proto' : 'warn' })), 'Ningún estudiante bajo 85 %.');
      grupo('Atrasos reiterados', 'warn', 'clock', atr.slice(0, 20).map(s => ({ n: n(s), id: s.id, d: `${s.asistencia.atrasos} atrasos`, tone: s.asistencia.atrasos >= 6 ? 'proto' : 'warn' })), 'Sin estudiantes con 3 o más atrasos.');
    }
    if (k === 'academica') {
      const planes = (State.studentPlans || []).filter(p => studs.some(s => sameId(s.id, p.studentId)));
      const rep = (State.rawInclusionReports || []).filter(p => studs.some(s => sameId(s.id, p.studentId)) && this.planArea && this.planArea(p) === 'Repitencia');
      if (a) {
        O.kpis.push({ v: a.promCurso && a.promCurso !== '-' ? String(a.promCurso).replace('.', ',') : 'Sin notas', l: `Promedio general (${a.conNotas} con notas)`, tone: a.promCurso && a.promCurso !== '-' ? nivel(+String(a.promCurso).replace(',', '.'), 5, 5.5) : 'neutral' });
        O.kpis.push({ v: a.riesgo?.length || 0, l: 'Riesgo de repitencia', tone: a.riesgo?.length ? 'proto' : 'conv' });
        O.kpis.push({ v: a.pie?.length || 0, l: 'Estudiantes PIE', tone: 'pie' });
      }
      O.kpis.push({ v: planes.length + rep.length, l: 'Planes de apoyo', tone: 'obs' });
      if (a) grupo('Asignaturas con estudiantes bajo 4,0', 'proto', 'book-x', (a.rendimiento || []).filter(r => r.bajo).sort((x, y) => y.bajo - x.bajo).slice(0, 8).map(r => ({ n: r.nombre, d: `${r.bajo} estudiante(s) bajo 4,0`, tone: r.bajo >= 5 ? 'proto' : 'warn' })), 'Sin asignaturas con estudiantes bajo 4,0 (o sin notas cargadas).');
      if (a) grupo('Riesgo de repitencia', 'proto', 'alert-triangle', (a.riesgo || []).map(x => ({ n: n(x.s), id: x.s.id, d: x.motivos.join(' · '), tone: 'proto' })), 'Ningún estudiante en riesgo de repitencia con los datos actuales.');
      grupo('Planes de apoyo y su avance', 'obs', 'clipboard-list', [...planes.map(p => { const s = studs.find(x => sameId(x.id, p.studentId)); return { n: s ? n(s) : '', id: s?.id, d: `${p.type || 'Plan'} · ${p.status || 'en desarrollo'}${p.evalQuant ? ` · logro ${p.evalQuant} %` : ''}`, tone: +p.evalQuant >= 70 ? 'conv' : 'warn' }; }), ...rep.map(p => { const s = studs.find(x => sameId(x.id, p.studentId)); return { n: s ? n(s) : '', id: s?.id, d: `Plan por riesgo de repitencia${p.date ? ` · ${fmtDate(p.date)}` : ''}`, tone: 'warn' }; })].slice(0, 20), 'Sin planes de apoyo registrados.');
    }
    return O;
  },
  /** Versión en texto (para insertar en el acta). */
  reuDatos(course, k) {
    const O = this.reuDatosObj(course, k);
    return [
      O.kpis.length ? O.kpis.map(x => `${x.l}: ${x.v}`).join(' · ') + '.' : '',
      ...O.notas.map(x => `${x}.`),
      ...O.grupos.map(g => g.items.length ? `${g.t}: ${g.items.map(i => `${i.n}${i.d ? ` (${i.d})` : ''}`).join('; ')}.` : (g.vacio ? `${g.vacio}` : ''))
    ].filter(Boolean);
  },
  reuDatosHtml(course, k) {
    const O = this.reuDatosObj(course, k);
    const link = !this.isQuickOnly();
    return `${O.kpis.length ? `<div class="reu-kpis">${O.kpis.map(x => `<div class="reu-kpi" data-tone="${x.tone}"><span class="reu-kpi__v ${/\d/.test(String(x.v)) ? 'num' : 'reu-kpi__v--txt'}">${esc(String(x.v))}</span><span class="reu-kpi__l">${esc(x.l)}</span></div>`).join('')}</div>` : ''}
      ${O.notas.length ? `<p class="reu-nota">${O.notas.map(esc).join(' · ')}</p>` : ''}
      ${O.grupos.length ? `<div class="reu-grupos">${O.grupos.map(g => `<div class="reu-grupo" data-tone="${g.tone}"><h4>${ico(g.icon)}${esc(g.t)} ${g.items.length ? `<span class="reu-grupo__n">${g.items.length}</span>` : ''}</h4>
        ${g.items.length ? `<ul>${g.items.map(i => `<li data-tone="${i.tone || g.tone}"><span class="reu-li__n">${i.id && link ? `<button type="button" class="link-btn" onclick="app.openStudent(${jsq(i.id)})">${esc(i.n)}</button>` : esc(i.n)}</span>${i.d ? `<span class="reu-li__d">${esc(i.d)}</span>` : ''}</li>`).join('')}</ul>` : `<p class="muted small">${esc(g.vacio || 'Sin datos.')}</p>`}</div>`).join('')}</div>` : ''}`;
  },
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

  // ---------------- EDITAR, REABRIR Y ELIMINAR ----------------
  reuEditar(id) {
    const r = this.reunion(id);
    ui.modal({ title: `Editar reunión · ${r.course}`, icon: 'edit-2', size: 'md', okText: 'Guardar cambios',
      body: `<div class="grid-3">
        ${fieldHtml('Fecha', `<input type="date" id="reu-e-fecha" class="input" value="${esc(r.fecha)}">`)}
        ${fieldHtml('Hora', `<input type="time" id="reu-e-hora" class="input" value="${esc(r.hora || '')}">`)}
        ${fieldHtml('Lugar', `<input id="reu-e-lugar" class="input" value="${esc(r.lugar || '')}">`)}
      </div>`,
      onOk: async () => {
        if (!el('reu-e-fecha').value) { toast('Indique la fecha', 'error'); return false; }
        if (await this.reuPatch(id, { fecha: el('reu-e-fecha').value, hora: el('reu-e-hora').value, lugar: el('reu-e-lugar').value.trim() }, 'Reunión actualizada')) this.render();
      } });
  },
  reuReabrir(id) {
    ui.confirm({ title: 'Reabrir la reunión', icon: 'unlock', tone: 'warn', okText: 'Reabrir', msg: 'La reunión vuelve a quedar abierta para corregirla. El PIN anterior no se reactiva: si necesita registrar asistencia, genere uno nuevo. Recuerde cerrarla de nuevo al terminar.', action: async () => {
      if (await this.reuPatch(id, { estado: 'abierta', pinActivo: false, reabiertaPor: State.currentUser.name, reabiertaEl: today() }, 'Reunión reabierta')) this.render();
    } });
  },
  reuEliminar(id) {
    const r = this.reunion(id);
    ui.confirm({ title: 'Eliminar reunión', msg: `¿Eliminar la reunión de nivel de <strong>${esc(r.course)}</strong> del ${fmtDate(r.fecha)}? Se eliminan sus puntos, participantes y acuerdos. No se puede deshacer.`, okText: 'Sí, eliminar', action: async () => {
      try {
        await DB.remove('reuniones', id);
        State.reunionId = null;
        notice({ type: 'success', title: 'Reunión eliminada', msg: `${r.course}, ${fmtDate(r.fecha)}.` });
        this.navigate('reuniones');
      } catch (e) { notice({ type: 'error', title: 'No se pudo eliminar', msg: e.message }); }
    } });
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
