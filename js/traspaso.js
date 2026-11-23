'use strict';
// =====================================================================
// FICHA DE TRASPASO DE CURSO
// Se autocompleta con los datos de la plataforma; lo que falta se
// asigna a un funcionario, que recibe un aviso para completarlo.
// La IA entrega un análisis para los docentes del año siguiente.
// =====================================================================
const TRASPASO_SECCIONES = [
  ['matricula', 'Matrícula', 'users', 'Incorporaciones, retiros y su contexto.'],
  ['rendimiento', 'Rendimiento por asignatura', 'bar-chart-3', 'Observaciones sobre el rendimiento del curso.'],
  ['riesgo', 'Riesgo de repitencia y repitentes', 'alert-triangle', 'Estudiantes que repiten o están en riesgo, y antecedentes.'],
  ['asistencia', 'Asistencia (bajo 85 %)', 'calendar-x', 'Causas de las inasistencias y apoyos realizados.'],
  ['disciplina', 'Disciplina', 'shield-alert', 'Estudiantes que requieren advertencia y monitoreo permanente.'],
  ['socioemocional', 'Situación socioemocional y económica', 'heart-handshake', 'Dificultades emocionales, sociales o económicas que requieren apoyo.'],
  ['pie', 'Estudiantes PIE', 'puzzle', 'Fecha de última evaluación, PACI, apoyo familiar, avances pedagógicos y estado socioemocional.'],
  ['aprendizaje', 'Dificultades de aprendizaje que requieren evaluación', 'search', 'Estudiantes sin diagnóstico que deberían ser evaluados.'],
  ['ritmo', 'Ritmo de trabajo del curso', 'gauge', 'Si se lograron los objetivos y la priorización curricular.'],
  ['talleres', 'Talleres desarrollados y solicitados', 'presentation', 'Talleres realizados este año y los que se solicitan para el próximo.'],
  ['otros', 'Otros antecedentes relevantes', 'file-plus', 'Cualquier otro antecedente útil para el próximo equipo.']
];
const RITMO_OPCIONES = [['', 'Sin definir'], ['muy_bueno', 'Muy bueno: ritmo ágil, sigue bien las instrucciones, requiere actividades extra'], ['bueno', 'Bueno: el programa se cumple según lo planeado'], ['apoyo', 'Requiere apoyo: le cuesta seguir el programa y mantener la atención']];

Object.assign(app, {
  canManageTraspaso() { return hasAccess('editar_fichas') || hasAccess('gestionar_usuarios'); },
  traspasoId(course, anio) { return `tr_${this.normalizarTexto(course).replace(/ /g, '_')}_${anio}`; },

  openTraspaso(course) {
    State.traspasoCourse = course;
    State.traspasoAnio = State.traspasoAnio || today().slice(0, 4);
    this.navigate('traspaso');
  },
  getTraspasoDoc() {
    const id = this.traspasoId(State.traspasoCourse, State.traspasoAnio);
    let d = State.traspasos.find(t => t.id === id);
    if (!d) d = { id, course: State.traspasoCourse, anio: State.traspasoAnio, secciones: {}, asignaciones: {} };
    if (!State.trDraft || State.trDraft.id !== id) State.trDraft = JSON.parse(JSON.stringify(d));
    State.trDraft.secciones = State.trDraft.secciones || {};
    State.trDraft.asignaciones = State.trDraft.asignaciones || {};
    return State.trDraft;
  },

  // ---------------- DATOS AUTOMÁTICOS ----------------
  computeTraspaso(course, anio) {
    const enAnio = f => String(f || '').startsWith(String(anio));
    const all = this.getStudents().filter(s => s.curso === course);
    const activos = all.filter(s => s.status !== 'blocked');
    const retirados = all.filter(s => s.status === 'blocked' && enAnio(s.fechaRetiro));
    const incorporados = all.filter(s => enAnio(s.fechaIngreso));
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

    // Rendimiento por asignatura (nota final del informe de calificaciones)
    const asig = {};
    const promedios = [];
    activos.forEach(s => {
      const rec = (s.calificaciones || {})[anio];
      if (!rec) return;
      const pg = num(rec.promedioGeneral); if (pg !== null) promedios.push({ s, pg, bajo: 0 });
      (rec.asignaturas || []).forEach(a => {
        const f = num(a.valores[a.valores.length - 1]);
        if (f === null) return;
        const k = a.nombre.trim();
        const x = asig[k] = asig[k] || { nombre: k, bajo: 0, medio: 0, alto: 0, suma: 0, n: 0 };
        if (f < 4) x.bajo++; else if (f < 6) x.medio++; else x.alto++;
        x.suma += f; x.n++;
        if (f < 4) { const p = promedios.find(p => p.s === s); if (p) p.bajo++; }
      });
    });
    const rendimiento = Object.values(asig).map(x => ({ ...x, promedio: x.n ? (x.suma / x.n).toFixed(1) : '-' }));

    // Riesgo de repitencia: promedio bajo 4, dos o más asignaturas bajo 4 o asistencia bajo 85 %
    const riesgo = [];
    activos.forEach(s => {
      const p = promedios.find(x => x.s === s);
      const motivos = [];
      if (p && p.pg < 4) motivos.push(`promedio ${p.pg.toFixed(1)}`);
      if (p && p.bajo >= 2) motivos.push(`${p.bajo} asignaturas bajo 4,0`);
      else if (p && p.bajo === 1 && p.pg < 4.5) motivos.push('1 asignatura bajo 4,0 y promedio bajo 4,5');
      if (s.asistencia.real < 85) motivos.push(`asistencia ${s.asistencia.real} %`);
      if (s.riesgoRepitencia?.activo) motivos.push('marcado en riesgo de repitencia en su ficha');
      else if (this.isRep(s)) motivos.push('tiene plan por riesgo de repitencia');
      if (motivos.length) riesgo.push({ s, motivos });
    });

    const asistencia = activos.filter(s => s.asistencia.real < 85).sort((a, b) => a.asistencia.real - b.asistencia.real);
    const disciplina = activos.map(s => {
      const prot = s.history.filter(h => h.type === PROTOCOLO).length;
      const graves = s.history.reduce((a, h) => a + (h.agreements || []).filter(x => ['GRAVE', 'GRAVÍSIMA'].includes(x.falta)).length, 0);
      const anot = s.history.filter(h => h.anotacion?.tipo === 'Negativa' || /anotaci[oó]n negativa/i.test(h.background || '')).length;
      return { s, prot, graves, anot, total: prot * 3 + graves * 2 + anot };
    }).filter(x => x.prot || x.graves || x.anot >= 2).sort((a, b) => b.total - a.total);
    const socio = activos.map(s => {
      const planes = State.studentPlans.filter(p => sameId(p.studentId, s.id)).map(p => p.type || 'Plan');
      const apoyos = s.history.filter(h => /socioemocional|derivaci|psicosocial/i.test(h.type || '')).length;
      return { s, planes, apoyos };
    }).filter(x => x.planes.length || x.apoyos);
    const pie = activos.map(s => {
      const reps = State.rawInclusionReports.filter(r => sameId(r.studentId, s.id) && this.planArea(r) === 'PIE');
      const docs = State.rawEvidences.filter(e => sameId(e.studentId, s.id) && this.evArea(e) === 'PIE');
      return { s, tipos: [...new Set(reps.map(r => r.type))], ambitos: reps.reduce((a, r) => a + (r.estrategias || []).length, 0), docs: docs.length, ultima: [...reps.map(r => r.date), ...docs.map(d => d.date)].sort().pop() || '' };
    }).filter(x => x.tipos.length || x.docs);
    const talleres = State.coursePlans.filter(p => p.course === course && (!p.date || enAnio(p.date))).flatMap(p => (p.actions || []).map(a => a.name).filter(Boolean));
    const registros = activos.reduce((t, s) => { const c = this.countRecords(s); ['proto', 'conv', 'pie', 'obs', 'enf'].forEach(k => { t[k] += c[k]; }); return t; }, { proto: 0, conv: 0, pie: 0, obs: 0, enf: 0 });
    const asisDist = { bajo85: 0, entre: 0, sobre: 0 };
    activos.forEach(s => { const r = s.asistencia.real; if (r < 85) asisDist.bajo85++; else if (r < 90) asisDist.entre++; else asisDist.sobre++; });
    const promAsis = activos.length ? Math.round(activos.reduce((a, s) => a + s.asistencia.real, 0) / activos.length) : 0;
    const promCurso = promedios.length ? (promedios.reduce((a, p) => a + p.pg, 0) / promedios.length).toFixed(1) : '-';
    return { activos, retirados, incorporados, matriculaInicial: activos.length + retirados.length - incorporados.length, rendimiento, riesgo, asistencia, disciplina, socio, pie, talleres, registros, asisDist, promAsis, promCurso, conNotas: promedios.length };
  },

  // ---------------- PANTALLA ----------------
  renderTraspaso() {
    const course = State.traspasoCourse;
    if (!course) return this.navigate('courses');
    const d = this.getTraspasoDoc();
    const a = this.computeTraspaso(course, State.traspasoAnio);
    State.trData = a;
    const manage = this.canManageTraspaso();
    const pj = this.profJefeOf(course);
    const pendientes = TRASPASO_SECCIONES.filter(([k]) => d.secciones[k]?.estado !== 'completo').length;
    const nombre = s => esc(this.formatStudentName(s.name));
    const lista = (items, fn, vacio) => items.length ? `<ul class="tr-list">${items.map(fn).join('')}</ul>` : `<p class="muted small">${vacio}</p>`;

    const auto = {
      matricula: `<div class="stats stats--4">
          <div class="stat"><span class="stat__num num">${a.matriculaInicial}</span><span class="stat__label">Matrícula inicial</span></div>
          <div class="stat" data-tone="conv"><span class="stat__num num">${a.activos.length}</span><span class="stat__label">Matrícula actual</span></div>
          <div class="stat" data-tone="obs"><span class="stat__num num">${a.incorporados.length}</span><span class="stat__label">Se incorporaron</span></div>
          <div class="stat" data-tone="warn"><span class="stat__num num">${a.retirados.length}</span><span class="stat__label">Se retiraron</span></div></div>
        <div class="grid-2"><div><h4>Incorporados durante el año</h4>${lista(a.incorporados, s => `<li>${nombre(s)} <span class="muted small">${fmtDate(s.fechaIngreso)}</span></li>`, 'Sin incorporaciones registradas.')}</div>
        <div><h4>Retirados durante el año</h4>${lista(a.retirados, s => `<li>${nombre(s)} <span class="muted small">${fmtDate(s.fechaRetiro)}${s.motivoRetiro ? `: ${esc(s.motivoRetiro)}` : ''}</span></li>`, 'Sin retiros registrados.')}</div></div>`,
      rendimiento: a.rendimiento.length ? `<p class="muted small">Basado en la nota final de ${a.conNotas} estudiante(s) con informe de calificaciones ${esc(State.traspasoAnio)}. Promedio general del curso: <strong>${a.promCurso}</strong>.</p>
        <div class="table-wrap"><table class="table table--dense"><thead><tr><th>Asignatura</th><th class="t-num">Bajo 4,0</th><th class="t-num">%</th><th class="t-num">4,0 a 5,9</th><th class="t-num">%</th><th class="t-num">6,0 o más</th><th class="t-num">%</th><th class="t-num">Promedio</th></tr></thead><tbody>
        ${a.rendimiento.map(r => { const p = v => r.n ? Math.round(v / r.n * 100) : 0; return `<tr><td>${esc(r.nombre)}</td><td class="t-num num" ${r.bajo ? 'data-level="high"' : ''}>${r.bajo}</td><td class="t-num num">${p(r.bajo)}</td><td class="t-num num">${r.medio}</td><td class="t-num num">${p(r.medio)}</td><td class="t-num num">${r.alto}</td><td class="t-num num">${p(r.alto)}</td><td class="t-num"><strong class="num">${String(r.promedio).replace('.', ',')}</strong></td></tr>`; }).join('')}</tbody></table></div>`
        : `<p class="muted small">Aún no hay notas ${esc(State.traspasoAnio)} cargadas para este curso. Use "Cargar notas (PDF)" en el curso.</p>`,
      riesgo: lista(a.riesgo, x => `<li>${nombre(x.s)} <span class="muted small">${esc(x.motivos.join(', '))}</span></li>`, 'Ningún estudiante cumple los criterios de riesgo con los datos actuales.'),
      asistencia: lista(a.asistencia, s => `<li>${nombre(s)} <span class="muted small">${s.asistencia.real} % (${s.asistencia.inasistencias} inasistencias)</span></li>`, 'Ningún estudiante bajo 85 % de asistencia.'),
      disciplina: lista(a.disciplina, x => `<li>${nombre(x.s)} <span class="muted small">${[x.prot && `${x.prot} protocolo(s)`, x.graves && `${x.graves} falta(s) grave(s) o gravísima(s)`, x.anot && `${x.anot} anotación(es) negativa(s)`].filter(Boolean).join(', ')}</span></li>`, 'Sin protocolos, faltas graves ni anotaciones negativas reiteradas.'),
      socioemocional: lista(a.socio, x => `<li>${nombre(x.s)} <span class="muted small">${[x.planes.length && x.planes.join(', '), x.apoyos && `${x.apoyos} intervención(es) de apoyo o derivación`].filter(Boolean).join('. ')}</span></li>`, 'Sin planes ni apoyos socioemocionales registrados.'),
      pie: lista(a.pie, x => `<li>${nombre(x.s)} <span class="muted small">${esc(x.tipos.join(', ') || 'Documentos PIE')}. ${x.ambitos} estrategia(s), ${x.docs} documento(s). Último registro: ${fmtDate(x.ultima) || '-'}</span></li>`, 'Sin estudiantes PIE con planes o documentos cargados.'),
      aprendizaje: '',
      ritmo: `${fieldHtml('Evaluación del ritmo de trabajo', `<select class="input" ${this.canEditTrSection('ritmo') ? '' : 'disabled'} onchange="State.trDraft.ritmo=this.value">${options(RITMO_OPCIONES, d.ritmo || '')}</select>`)}`,
      talleres: lista(a.talleres, t => `<li>${esc(t)}</li>`, 'No hay acciones de planes de curso registradas este año.'),
      otros: ''
    };

    el('traspaso-toolbar').innerHTML = `
      <button class="btn" onclick="app.navigate('students')">${ico('arrow-left')}Volver al curso</button>
      <div class="row-actions">
        <label class="field field--inline"><span class="field__label">Año</span><input type="number" class="input input--num num" value="${esc(State.traspasoAnio)}" onchange="State.traspasoAnio=this.value; State.trDraft=null; app.renderTraspaso(); icons()"></label>
        <button class="btn" onclick="app.analyzeTraspasoAI()">${ico('sparkles')}${d.analisis ? 'Volver a interpretar con IA' : 'Interpretar con IA'}</button>
        <button class="btn" onclick="app.openExportModal('traspaso')">${ico('file-output')}PDF de la ficha</button>
        <button class="btn btn--primary" onclick="app.saveTraspaso()">${ico('save')}Guardar ficha</button>
      </div>`;

    el('traspaso-body').innerHTML = `
      <article class="entry">
        <div class="entry__head"><div class="entry__id"><h1 class="entry__name">Ficha de caracterización y traspaso</h1>
          <div class="chips">${chip(course, 'conv')}${chip(`Año ${State.traspasoAnio}`, 'neutral')}${chip(pendientes ? `${pendientes} sección(es) pendiente(s)` : 'Completa', pendientes ? 'warn' : 'conv')}</div></div></div>
        <div class="entry__cells">
          <div class="cell"><span class="cell__label">Profesor(a) jefe</span><span class="cell__text">${esc(pj || 'Sin registrar')}</span></div>
          <div class="cell"><span class="cell__label">Profesor(a) especialista PIE</span><input class="input" value="${esc(d.profesorEspecialista || '')}" ${manage ? '' : 'readonly'} oninput="State.trDraft.profesorEspecialista=this.value" aria-label="Profesor especialista PIE"></div>
          <div class="cell"><span class="cell__label">Estudiantes</span><span class="cell__num num">${a.activos.length}</span></div>
          <div class="cell"><span class="cell__label">Asistencia promedio</span><span class="cell__num num">${a.promAsis}%</span></div>
        </div>
      </article>

      <section class="panel">
        <div class="panel__head"><h2>${ico('pie-chart')}Panorama del curso</h2><span class="muted small">Datos de la plataforma</span></div>
        <div class="grid-3">
          <div class="chart chart--sm"><canvas id="tr-chart-rend" role="img" aria-label="Rendimiento por asignatura"></canvas></div>
          <div class="chart chart--sm"><canvas id="tr-chart-asis" role="img" aria-label="Distribución de asistencia"></canvas></div>
          <div class="chart chart--sm"><canvas id="tr-chart-reg" role="img" aria-label="Registros por tipo"></canvas></div>
        </div>
      </section>

      ${d.analisis ? this.traspasoAnalysisHtml(d.analisis, d.analisisFecha) : ''}

      ${TRASPASO_SECCIONES.map(([k, titulo, icon, ayuda]) => this.traspasoSectionHtml(k, titulo, icon, ayuda, auto[k], d)).join('')}`;
    icons();
    this.drawTraspasoCharts(a);
  },

  canEditTrSection(k) {
    const as = State.trDraft?.asignaciones?.[k];
    return this.canManageTraspaso() || (as && sameId(as.userId, State.currentUser.id));
  },
  traspasoSectionHtml(k, titulo, icon, ayuda, autoHtml, d) {
    const sec = d.secciones[k] || {};
    const as = d.asignaciones[k];
    const can = this.canEditTrSection(k);
    const manage = this.canManageTraspaso();
    const users = State.users.filter(u => !u.eliminado && u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    return `<section class="panel tr-section" data-done="${sec.estado === 'completo'}">
      <div class="panel__head"><h2>${ico(icon)}${titulo}</h2>
        <div class="row-actions">${as ? chip(`Asignado a ${as.userName}`, 'obs', 'user-check') : ''}${sec.estado === 'completo' ? chip('Completo', 'conv', 'check') : chip('Pendiente', 'warn')}</div></div>
      ${autoHtml ? `<div class="tr-auto">${autoHtml}</div>` : ''}
      ${d.analisis?.interpretaciones?.[k] ? `<div class="tr-interp"><h4>${ico('sparkles')}Interpretación con IA</h4><p>${esc(d.analisis.interpretaciones[k])}</p></div>` : ''}
      ${fieldHtml(ayuda, `<textarea class="input" rows="3" ${can ? '' : 'readonly'} placeholder="${can ? 'Escriba aquí los antecedentes...' : 'Solo lectura'}" oninput="(State.trDraft.secciones['${k}'] = State.trDraft.secciones['${k}'] || {}).texto=this.value">${esc(sec.texto || '')}</textarea>`)}
      ${sec.actualizado ? `<p class="note">Actualizado el ${fmtDate(sec.actualizado)} por ${esc(sec.por || '')}.</p>` : ''}
      <div class="form-foot">
        ${manage ? `<div class="row-field tr-assign"><select class="input" id="tr-asg-${k}" aria-label="Asignar ${titulo}"><option value="">Asignar a un funcionario...</option>${options(users.map(u => [u.id, `${u.name} (${u.role})`]), as?.userId)}</select><button type="button" class="btn btn--sm" onclick="app.assignTrSection('${k}')">${ico('send')}Asignar y avisar</button></div>` : '<span></span>'}
        ${can ? `<button type="button" class="btn btn--sm ${sec.estado === 'completo' ? '' : 'btn--primary'}" onclick="app.toggleTrDone('${k}')">${ico(sec.estado === 'completo' ? 'rotate-ccw' : 'check')}${sec.estado === 'completo' ? 'Reabrir sección' : 'Marcar como completa'}</button>` : ''}
      </div>
    </section>`;
  },

  drawTraspasoCharts(a) {
    if (!window.Chart) return;
    (this._trCharts || []).forEach(c => c.destroy());
    const tone = n => cssVar(`--tone-${n}-ink`);
    const opts = title => ({ maintainAspectRatio: false, animation: false, plugins: { title: { display: true, text: title, color: cssVar('--color-heading'), font: { weight: '600' } }, legend: { position: 'bottom', labels: { boxWidth: 10 } } } });
    const r = a.rendimiento;
    this._trCharts = [
      new Chart(el('tr-chart-rend'), { type: 'bar', data: { labels: r.map(x => x.nombre.length > 14 ? x.nombre.slice(0, 13) + '…' : x.nombre), datasets: [
        { label: 'Bajo 4,0', data: r.map(x => x.bajo), backgroundColor: tone('proto'), stack: 's' },
        { label: '4,0 a 5,9', data: r.map(x => x.medio), backgroundColor: tone('warn'), stack: 's' },
        { label: '6,0 o más', data: r.map(x => x.alto), backgroundColor: tone('conv'), stack: 's' }] },
        options: { ...opts('Rendimiento por asignatura'), scales: { x: { stacked: true, ticks: { font: { size: 9 } } }, y: { stacked: true, ticks: { precision: 0 } } } } }),
      new Chart(el('tr-chart-asis'), { type: 'doughnut', data: { labels: ['Bajo 85 %', '85 % a 89 %', '90 % o más'], datasets: [{ data: [a.asisDist.bajo85, a.asisDist.entre, a.asisDist.sobre], backgroundColor: [tone('proto'), tone('warn'), tone('conv')] }] }, options: { ...opts('Asistencia de los estudiantes'), cutout: '58%' } }),
      new Chart(el('tr-chart-reg'), { type: 'bar', data: { labels: ['Protocolos', 'Convivencia', 'PIE', 'Obs. docentes', 'Enfermería'], datasets: [{ label: 'Registros', data: ['proto', 'conv', 'pie', 'obs', 'enf'].map(k => a.registros[k]), backgroundColor: ['proto', 'conv', 'pie', 'obs', 'enf'].map(tone) }] }, options: { ...opts('Registros del año'), plugins: { ...opts('Registros del año').plugins, legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } } } })
    ];
  },

  // ---------------- GUARDAR, ASIGNAR Y COMPLETAR ----------------
  async saveTraspaso(silent = false) {
    const d = State.trDraft;
    Object.assign(d, { course: State.traspasoCourse, anio: State.traspasoAnio, actualizado: today(), actualizadoPor: State.currentUser.name });
    Object.values(d.secciones).forEach(s => { if (s.texto !== undefined && !s.por) { s.por = State.currentUser.name; s.actualizado = today(); } });
    try {
      await DB.save('traspasos', JSON.parse(JSON.stringify(d)));
      if (!silent) toast('Ficha de traspaso guardada');
    } catch (e) { toast(e.message, 'error'); throw e; }
  },
  async toggleTrDone(k) {
    const s = State.trDraft.secciones[k] = State.trDraft.secciones[k] || {};
    s.estado = s.estado === 'completo' ? 'pendiente' : 'completo';
    s.actualizado = today(); s.por = State.currentUser.name;
    await this.saveTraspaso(true).catch(() => {});
    toast(s.estado === 'completo' ? 'Sección marcada como completa' : 'Sección reabierta');
    this.renderTraspaso(); icons();
  },
  async assignTrSection(k) {
    const userId = el(`tr-asg-${k}`).value;
    const u = State.users.find(x => sameId(x.id, userId));
    if (!u) return toast('Elija a quién asignar la sección', 'error');
    const titulo = TRASPASO_SECCIONES.find(s => s[0] === k)[1];
    State.trDraft.asignaciones[k] = { userId: String(u.id), userName: u.name, fecha: today(), por: State.currentUser.name };
    (State.trDraft.secciones[k] = State.trDraft.secciones[k] || {}).estado = 'pendiente';
    try { await this.saveTraspaso(true); } catch (e) { return; }
    const b = this.brand();
    const mensaje = `Estimado(a) ${u.name}:

Se le asignó completar la sección **${titulo}** de la ficha de traspaso de **${State.traspasoCourse}** (${State.traspasoAnio}).

**Cómo completarla**
1. Ingrese a ${this.pageUrl()}
2. Vaya a Directorio escolar, abra el curso ${State.traspasoCourse} y presione "Ficha de traspaso".
3. Complete la sección "${titulo}", guarde y presione "Marcar como completa".

La información de la ficha es confidencial y se rige por la Ley N° 21.719.

Saludos cordiales,
Equipo de Gestión
${b.tagline}`;
    try {
      await API.call('notificarAsignacion', { userId: u.id, traspasoId: State.trDraft.id, seccion: titulo, asunto: `Tarea pendiente: ficha de traspaso ${State.traspasoCourse}`, mensaje, tagline: b.tagline, ...this.mailExtras() });
      toast(`Sección asignada a ${u.name}. Se le envió un aviso.`);
    } catch (e) { toast(e.message, 'error'); }
    this.renderTraspaso(); icons();
  },
  /** Tareas de fichas de traspaso asignadas al funcionario que ingresó. */
  myTraspasoTasks() {
    const me = String(State.currentUser?.id || '');
    const tareas = [];
    (State.traspasos || []).forEach(t => Object.entries(t.asignaciones || {}).forEach(([k, a]) => {
      if (String(a.userId) === me && t.secciones?.[k]?.estado !== 'completo') tareas.push({ t, k, titulo: TRASPASO_SECCIONES.find(s => s[0] === k)?.[1] || k });
    }));
    return tareas;
  },
  tasksHtml() {
    const tareas = this.myTraspasoTasks();
    if (!tareas.length) return '';
    return `<section class="panel tasks"><div class="panel__head"><h2>${ico('list-todo')}Tareas pendientes (${tareas.length})</h2></div>
      <ul class="ruled">${tareas.map(x => `<li><span><strong>${esc(x.titulo)}</strong> <span class="muted small">Ficha de traspaso ${esc(x.t.course)} ${esc(x.t.anio)}</span></span><button class="btn btn--sm btn--primary" onclick="State.traspasoAnio=${jsq(x.t.anio)}; app.openTraspaso(${jsq(x.t.course)})">Completar</button></li>`).join('')}</ul></section>`;
  },

  // ---------------- INTERPRETACIÓN CON IA ----------------
  traspasoAnalysisHtml(an, fecha) {
    const ul = arr => (arr || []).length ? `<ul class="tr-list">${arr.map(x => `<li>${esc(typeof x === 'string' ? x : `${x.asignatura || x.area || ''}: ${x.sugerencia || x.texto || ''}`)}</li>`).join('')}</ul>` : '<p class="muted small">Sin elementos.</p>';
    const nivel = { bajo: ['Nivel de alerta bajo', 'conv'], medio: ['Nivel de alerta medio', 'warn'], alto: ['Nivel de alerta alto', 'proto'] }[String(an.nivel_alerta || '').toLowerCase()];
    return `<section class="panel tr-ai">
      <div class="panel__head"><h2>${ico('sparkles')}Conclusión general e interpretación</h2><div class="row-actions">${nivel ? chip(nivel[0], nivel[1], 'gauge') : ''}<span class="muted small">Generado con IA${fecha ? ` el ${fmtDate(fecha)}` : ''}. Revíselo antes de compartirlo.</span></div></div>
      ${an.conclusion_general ? `<div class="tr-conclusion"><h3>Conclusión general</h3><p>${esc(an.conclusion_general)}</p></div>` : ''}
      ${an.resumen ? `<p class="tr-ai__summary">${esc(an.resumen)}</p>` : ''}
      <div class="grid-2">
        <div class="subpanel" data-tone="conv"><h4>${ico('thumbs-up')}Fortalezas del curso</h4>${ul(an.fortalezas)}</div>
        <div class="subpanel" data-tone="proto"><h4>${ico('alert-triangle')}Desafíos y alertas</h4>${ul(an.desafios)}</div>
      </div>
      <div class="subpanel"><h4>${ico('calendar-check')}Recomendaciones para planificar</h4>${ul(an.recomendaciones)}</div>
      ${(an.focos_por_asignatura || []).length ? `<div class="subpanel"><h4>${ico('book-open')}Focos por asignatura</h4>${ul(an.focos_por_asignatura)}</div>` : ''}
      ${(an.apoyos_sugeridos || []).length ? `<div class="subpanel"><h4>${ico('life-buoy')}Apoyos y coordinación sugeridos</h4>${ul(an.apoyos_sugeridos)}</div>` : ''}
      <p class="note">${ico('shield-check')}Cada sección de la ficha muestra su propia interpretación. A la IA solo se enviaron datos agregados y textos sin nombres, RUN ni datos de salud (Ley 19.628 y Ley 21.719).</p>
    </section>`;
  },
  /** Datos del curso para la IA: agregados, sin nombres ni RUN, sin diagnósticos. */
  traspasoDatosIA() {
    const a = State.trData, d = State.trDraft;
    const cuenta = arr => arr.reduce((m, x) => { m[x] = (m[x] || 0) + 1; return m; }, {});
    const anon = t => this.anonimizar(String(t || '').slice(0, 900), a.activos.concat(a.retirados));
    return {
      curso: State.traspasoCourse, anio: State.traspasoAnio,
      matricula: { inicial: a.matriculaInicial, actual: a.activos.length, incorporados: a.incorporados.length, retirados: a.retirados.length, motivos_retiro: a.retirados.map(s => anon(s.motivoRetiro)).filter(Boolean) },
      rendimiento: { promedio_curso: a.promCurso, estudiantes_con_notas: a.conNotas, por_asignatura: a.rendimiento.map(r => ({ asignatura: r.nombre, bajo_4: r.bajo, de_4_a_5_9: r.medio, sobre_6: r.alto, promedio: r.promedio })) },
      riesgo: { estudiantes: a.riesgo.length, motivos: cuenta(a.riesgo.flatMap(x => x.motivos.map(m => m.replace(/[\d.,]+/g, '#').trim()))) },
      asistencia: { promedio: a.promAsis, bajo_85: a.asisDist.bajo85, entre_85_y_89: a.asisDist.entre, sobre_90: a.asisDist.sobre, porcentajes_bajo_85: a.asistencia.map(s => s.asistencia.real) },
      disciplina: { estudiantes_con_alertas: a.disciplina.length, protocolos: a.disciplina.reduce((t, x) => t + x.prot, 0), faltas_graves: a.disciplina.reduce((t, x) => t + x.graves, 0), anotaciones_negativas: a.disciplina.reduce((t, x) => t + x.anot, 0) },
      socioemocional: { estudiantes_con_apoyo: a.socio.length, planes: cuenta(a.socio.flatMap(x => x.planes)), intervenciones_apoyo: a.socio.reduce((t, x) => t + x.apoyos, 0) },
      pie: { estudiantes: a.pie.length, tipos_de_plan: cuenta(a.pie.flatMap(x => x.tipos)), documentos: a.pie.reduce((t, x) => t + x.docs, 0) },
      registros_del_anio: a.registros,
      ritmo: (RITMO_OPCIONES.find(o => o[0] === d.ritmo) || [, 'Sin definir'])[1],
      talleres: a.talleres.slice(0, 15),
      observaciones_del_equipo: Object.fromEntries(TRASPASO_SECCIONES.map(([k]) => [k, anon(d.secciones[k]?.texto)]).filter(([, v]) => v))
    };
  },
  async analyzeTraspasoAI() {
    if (!AI.ready()) return;
    const ok = await this.iaConsent(`Curso ${esc(State.traspasoCourse)} ${esc(State.traspasoAnio)}: cantidades de matrícula, notas por asignatura, asistencia, registros de convivencia, apoyos PIE (solo cantidades y tipos de plan), ritmo, talleres y los textos escritos por el equipo, a los que se les quitan nombres, RUN, correos y teléfonos.`);
    if (!ok) return;
    const d = State.trDraft;
    AI.run('Interpretando la ficha de traspaso', 'La IA interpreta cada sección y redacta una conclusión general...', async () => {
      const datos = this.traspasoDatosIA();
      const claves = TRASPASO_SECCIONES.map(([k, t]) => `"${k}": "${t}"`).join(', ');
      const r = await API.call('ai', { motivo: `Interpretación de la ficha de traspaso ${State.traspasoCourse} ${State.traspasoAnio}`, json: true, prompt: `Actúa como jefe de UTP y orientador de un colegio público en Chile. Interpreta la ficha de caracterización y traspaso del curso para que el equipo que lo recibirá el próximo año planifique. Reglas:
- Usa SOLO los datos entregados. No inventes cifras, estudiantes ni situaciones.
- No identifiques a ninguna persona: no hay nombres y no debes intentar deducirlos. "[estudiante]" reemplaza a un nombre.
- No hagas diagnósticos clínicos ni etiquetes a estudiantes; habla del curso y de patrones.
- Interpreta: explica qué significan los datos, compara entre asignaturas o grupos, y señala implicancias pedagógicas.
- Si una sección no tiene datos suficientes, dilo en una frase y sugiere qué información falta.
- Lenguaje claro, profesional y respetuoso, en español de Chile.

SECCIONES DE LA FICHA: {${claves}}

DATOS DEL CURSO (JSON):
${JSON.stringify(datos).slice(0, 14000)}

Devuelve SOLO un JSON con esta estructura:
{"interpretaciones": {"matricula": "2 a 4 oraciones", "rendimiento": "...", "riesgo": "...", "asistencia": "...", "disciplina": "...", "socioemocional": "...", "pie": "...", "aprendizaje": "...", "ritmo": "...", "talleres": "...", "otros": "..."},
"conclusion_general": "Conclusión integrada de 6 a 10 líneas que relacione rendimiento, asistencia, convivencia y apoyos, con prioridades para el próximo año",
"nivel_alerta": "bajo | medio | alto",
"resumen": "Diagnóstico breve en 2 o 3 líneas",
"fortalezas": ["..."], "desafios": ["..."],
"recomendaciones": ["Acciones concretas para el primer mes y el año"],
"focos_por_asignatura": [{"asignatura": "...", "sugerencia": "..."}],
"apoyos_sugeridos": ["Coordinación con PIE, convivencia, familias o redes"]}` });
      d.analisis = r.json;
      d.analisisFecha = today();
      d.analisisPor = State.currentUser.name;
      await this.saveTraspaso(true);
      toast('Interpretación generada y guardada en la ficha');
      this.renderTraspaso(); icons();
    });
  }
});