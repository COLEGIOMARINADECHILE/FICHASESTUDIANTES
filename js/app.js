'use strict';
// =====================================================================
// APLICACIÓN: sesión, navegación, panel, cursos, estudiantes y ficha
// (planes en plans.js, informes PDF en export.js, cargas masivas en imports.js)
// =====================================================================
window.app = {

  // ---------------- ARRANQUE Y SESIÓN ----------------
  async init() {
    State.demo = API.demo;
    el('demo-banner').hidden = !State.demo;
    try {
      State.loginOptions = await API.call('bootstrap');
      this.applyPhoto(State.loginOptions.bgImage);
      if (API.token && !State.demo) await DB.load();
    } catch (e) {
      API.setToken('');
      State.currentUser = null;
      if (!/sesi/i.test(e.message)) toast(e.message, 'error');
    }
    State.loading = false;
    this.render();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
    setInterval(() => this.refresh(), 120000);
  },

  /** Vuelve a leer los datos del servidor cuando no hay nada a medio editar. */
  async refresh(force = false) {
    if (!State.currentUser || State.syncing) return;
    if (!force && Date.now() - State.lastSync < 60000) return;
    const quiet = ['dashboard', 'courses', 'students', 'alerts', 'course_summary'].includes(State.currentView) && el('modal').hidden;
    if (!quiet && !force) return;
    State.syncing = true;
    try { await DB.load(); this.render(); } catch (e) { /* se reintenta luego */ } finally { State.syncing = false; }
  },

  sessionExpired(msg) {
    if (!State.currentUser) return;
    API.setToken('');
    State.currentUser = null;
    ui.close();
    toast(msg || 'La sesión expiró. Vuelva a ingresar.', 'error');
    this.render();
  },

  /** Nombre del sistema: Administración > config.js > valor por defecto. */
  brand() {
    const v = State.variables, o = State.loginOptions || {}, c = window.APP_CONFIG || {};
    return {
      name: v.appName || o.appName || c.APP_NAME || 'Trayectoria Escolar',
      tagline: v.appTagline || o.appTagline || c.APP_TAGLINE || 'Colegio Marina de Chile',
      school: (State.currentUser && v.schoolLogo) || o.schoolLogo || v.schoolLogo || 'img/logo-colegio.png',
      slep: (State.currentUser && v.slepLogo) || o.slepLogo || v.slepLogo || 'img/logo-slep.png'
    };
  },
  applyBranding() {
    const b = this.brand();
    document.querySelectorAll('[data-brand="name"]').forEach(n => { n.textContent = b.name; });
    document.querySelectorAll('[data-brand="tagline"]').forEach(n => { n.textContent = b.tagline; });
    document.title = b.name;
    // Logos: si la imagen no carga, se muestra el ícono de reemplazo
    document.querySelectorAll('img[data-logo]').forEach(img => {
      const src = b[img.dataset.logo];
      const fallback = img.parentElement.querySelector('[data-logo-fallback]');
      img.onload = () => { img.hidden = false; if (fallback) fallback.hidden = true; };
      img.onerror = () => { img.hidden = true; if (fallback) fallback.hidden = false; };
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  },

  applyPhoto(src) {
    document.documentElement.style.setProperty('--login-photo', src ? `url("${String(src).replace(/"/g, '%22')}")` : 'none');
  },

  renderLogin() {
    const { roles = [], users = [] } = State.loginOptions || {};
    const sel = State.loginRole || '';
    const roleIcon = { 'Docente': 'book-open', 'Asistente de la Educación': 'hand-helping', 'Directivo': 'landmark', 'Convivencia': 'heart-handshake', 'UTP': 'graduation-cap', 'Administrador': 'shield-check', 'Equipo PIE': 'puzzle' };
    el('login-roles').innerHTML = roles.map(r => {
      const n = users.filter(u => u.role === r).length;
      return `<button type="button" class="role" data-tone="${ROLE_TONE[r] || 'neutral'}" aria-pressed="${sel === r}" onclick="app.selectRole(${jsq(r)})">${ico(roleIcon[r] || 'user')}<span class="role__name">${esc(r)}</span><span class="role__count num">${n}</span></button>`;
    }).join('');
    const vacio = !users.length && !State.demo;
    el('login-empty').hidden = !vacio;
    if (vacio) el('login-empty').innerHTML = `${ico('alert-triangle')}<span><strong>Aún no hay funcionarios registrados.</strong> En el editor de Apps Script ejecute la función <span class="num">restablecerAdmin</span> y lea la clave en el registro de ejecución.</span>`;
    const list = users.filter(u => u.role === sel);
    el('login-user').innerHTML = `<option value="">${sel ? 'Seleccione a la persona...' : 'Primero elija un perfil'}</option>` + list.map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
    el('login-user').disabled = !sel;
    this.checkLogin();
  },
  selectRole(r) {
    State.loginRole = r;
    this.renderLogin();
    icons();
    const list = (State.loginOptions.users || []).filter(u => u.role === r);
    if (list.length === 1) { el('login-user').value = list[0].id; this.checkLogin(); el('login-password').focus(); }
    else el('login-user').focus();
  },
  checkLogin() {
    const hasUser = !!el('login-user').value;
    el('login-password').disabled = !hasUser;
    el('login-btn').disabled = !(hasUser && el('login-password').value);
  },
  togglePassword(btn) {
    const p = el('login-password');
    p.type = p.type === 'password' ? 'text' : 'password';
    btn.setAttribute('aria-label', p.type === 'password' ? 'Mostrar clave' : 'Ocultar clave');
    btn.innerHTML = ico(p.type === 'password' ? 'eye' : 'eye-off');
    icons();
  },
  async handleLogin(e) {
    e.preventDefault();
    const btn = el('login-btn');
    btn.disabled = true; btn.classList.add('is-loading');
    try {
      const r = await API.call('login', { userId: el('login-user').value, password: el('login-password').value });
      API.setToken(r.token);
      State.currentUser = r.user;
      await DB.load();
      State.currentView = 'dashboard';
      el('login-password').value = '';
      if (r.master) toast('Ingreso con clave maestra');
      this.render();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.classList.remove('is-loading'); this.checkLogin(); }
  },
  logout() {
    API.call('logout').catch(() => {});
    API.setToken('');
    State.currentUser = null;
    this.render();
  },
  changeMyPassword() { this.askPassword(State.currentUser.id, 'Cambiar mi clave', 'Ingrese su nueva contraseña de acceso:'); },
  resetUserPassword(id) {
    const u = State.users.find(x => sameId(x.id, id));
    if (u) this.askPassword(id, 'Cambiar clave', `Ingrese la nueva clave para <strong>${esc(u.name)}</strong>:`);
  },
  askPassword(userId, title, msg) {
    ui.prompt({ title, msg, icon: 'key', type: 'password', placeholder: 'Nueva clave...', okText: 'Guardar clave', action: async np => {
      if (np.length < 4) { toast('La clave debe tener al menos 4 caracteres', 'error'); return false; }
      await API.call('changePassword', { userId, password: np });
      toast('Clave actualizada');
    } });
  },

  // ---------------- RENDER GENERAL ----------------
  RENDERERS: { dashboard: 'renderDashboard', courses: 'renderCourses', students: 'renderStudents', student_detail: 'renderStudentDetail', course_plans: 'renderCoursePlans', plan_detail: 'renderPlanEditor', alerts: 'renderAlerts', course_summary: 'renderCourseSummary', admin: 'renderAdmin' },

  render() {
    el('loading-view').hidden = !State.loading;
    if (State.loading) return;
    this.applyBranding();
    const logged = !!State.currentUser;
    el('login-view').hidden = logged;
    el('app-shell').hidden = !logged;
    if (!logged) { this.renderLogin(); icons(); return; }
    const view = ['course_plan_detail', 'student_plan_detail'].includes(State.currentView) ? 'plan_detail' : State.currentView;
    document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
    const u = State.currentUser;
    el('user-name').textContent = u.name;
    el('user-role').textContent = u.customRole || u.role;
    el('user-avatar').textContent = (u.name || '?').charAt(0);
    this.renderNav();
    this[this.RENDERERS[view]]();
    icons();
  },
  navigate(v) {
    State.currentView = v;
    document.body.classList.remove('nav-open');
    this.render();
    window.scrollTo(0, 0);
  },
  toggleNav() { document.body.classList.toggle('nav-open'); },

  renderNav() {
    const v = State.currentView;
    const items = [
      ['dashboard', 'layout-dashboard', 'Panel principal', true, ['dashboard']],
      ['courses', 'users', 'Directorio escolar', hasAccess('ver_fichas'), ['courses', 'students', 'student_detail', 'course_plans', 'course_plan_detail', 'student_plan_detail']],
      ['alerts', 'bell-ring', 'Alertas preventivas', hasAccess('ver_top_intervenciones'), ['alerts']],
      ['course_summary', 'bar-chart-2', 'Resumen por cursos', hasAccess('ver_resumen_cursos'), ['course_summary']],
      ['report', 'calendar-days', 'Reportes funcionario', hasAccess('ver_reportes') || hasAccess('ver_todos_reportes'), []],
      ['admin', 'settings', 'Administración', hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema'), ['admin']]
    ];
    el('nav-menu').innerHTML = items.filter(i => i[3]).map(([id, icon, label, , views]) =>
      `<button type="button" class="nav__item" ${views.includes(v) ? 'aria-current="page"' : ''} onclick="${id === 'report' ? 'app.openStaffReportModal()' : `app.navigate('${id}')`}">${ico(icon)}<span>${label}</span></button>`).join('');
  },

  // ---------------- DATOS DE ESTUDIANTES ----------------
  clean: v => String(v ?? '').replace(/["\r\n]/g, '').trim(),
  courseNameOf(s) {
    const c = State.rawCoursesDB.find(x => sameId(x.id, s.courseId));
    return this.clean(c ? c.name : (s.curso || 'Sin Curso Asignado'));
  },
  groupByStudent(arr) { const m = {}; arr.forEach(x => { (m[String(x.studentId)] = m[String(x.studentId)] || []).push(x); }); return m; },
  enrich(s, maps) {
    const total = State.variables.diasTotalesClases || 180;
    const inas = parseInt(s.inasistencias) || 0;
    const atrasos = parseInt(s.atrasos) || 0;
    const dj = (s.justificativos || []).reduce((a, j) => a + (parseInt(j.dias) || 0), 0);
    const asistidos = Math.max(0, total - inas);
    const real = Math.max(0, Math.round((asistidos / total) * 100)) || 0;
    const byDate = (a, b) => new Date(b.date) - new Date(a.date);
    const key = String(s.id);
    const rawName = s.name || (s.nombres ? `${s.nombres} ${s.apellidoPaterno} ${s.apellidoMaterno}` : 'Sin Nombre');
    return {
      ...s,
      name: this.clean(rawName), rut: this.clean(s.rut), curso: this.courseNameOf(s),
      status: s.status === 'blocked' ? 'blocked' : 'active',
      asistencia: { inasistencias: inas, atrasos, diasJustificados: dj, real, conJustificativo: Math.min(100, Math.round(((asistidos + dj) / total) * 100)) || 0, alerta: real < 85 },
      history: (maps.int[key] || []).slice().sort(byDate),
      nursing: (maps.nur[key] || []).slice().sort(byDate),
      observations: (maps.obs[key] || []).slice().sort(byDate)
    };
  },
  getStudents() {
    const maps = { int: this.groupByStudent(State.rawInterventions), nur: this.groupByStudent(State.rawNursings), obs: this.groupByStudent(State.rawObservations) };
    let base = State.rawStudents.map(s => this.enrich(s, maps));
    const ac = State.currentUser?.assignedCourses;
    if (!hasAccess('acceso_total') && ac && ac.length) base = base.filter(s => ac.includes(s.curso));
    return base;
  },
  getStudent(id) {
    const s = State.rawStudents.find(x => sameId(x.id, id));
    if (!s) return null;
    const only = arr => ({ [String(s.id)]: arr.filter(x => sameId(x.studentId, s.id)) });
    return this.enrich(s, { int: only(State.rawInterventions), nur: only(State.rawNursings), obs: only(State.rawObservations) });
  },
  current() { return this.getStudent(State.selectedStudentId); },
  /** Conteo único de registros por estudiante (antes se repetía en 6 lugares). */
  countRecords(s) {
    let proto = 0, convPie = 0;
    s.history.forEach(h => { if (h.type === PROTOCOLO) proto++; else convPie++; });
    const obs = s.observations.length, enf = s.nursing.length;
    return { proto, convPie, obs, enf, total: proto + convPie + obs + enf };
  },
  formatStudentName(fullName) {
    if (!fullName || fullName.includes(',')) return fullName;
    const parts = fullName.trim().split(/\s+/);
    if (parts.length < 3) return fullName;
    return `${parts.slice(2).join(' ')} ${parts[0]} ${parts[1]}`;
  },
  profJefeOf(course) { return State.rawCoursesDB.find(c => c.name === course)?.profesorJefe || ''; },
  isCoordinator() { return hasAccess('gestionar_usuarios') || hasAccess('acceso_total'); },

  // ---------------- PANEL PRINCIPAL ----------------
  renderDashboard() {
    el('dash-school-days').value = State.variables.diasTotalesClases || 180;
    const studs = this.getStudents().filter(s => State.showWithdrawn || s.status !== 'blocked');
    const tot = { convPie: 0, proto: 0, obs: 0, enf: 0 };
    const cy = Object.fromEntries(Object.keys(CYCLES).map(k => [k, 0]));
    cy['Otros / Sin Ciclo'] = 0;
    const byCourse = {};
    studs.forEach(s => {
      const c = this.countRecords(s);
      ['convPie', 'proto', 'obs', 'enf'].forEach(k => { tot[k] += c[k]; });
      const cycle = Object.keys(CYCLES).find(k => CYCLES[k].courses.includes(s.curso));
      if (cycle) cy[cycle] += c.total; else cy['Otros / Sin Ciclo'] += c.total;
      if (c.total > 0) {
        const b = byCourse[s.curso] = byCourse[s.curso] || { convPie: 0, proto: 0, obs: 0, enf: 0, total: 0 };
        ['convPie', 'proto', 'obs', 'enf', 'total'].forEach(k => { b[k] += c[k]; });
      }
    });
    if (!cy['Otros / Sin Ciclo']) delete cy['Otros / Sin Ciclo'];

    const stats = [['Estudiantes', studs.length], ['Conv. / PIE', tot.convPie, 'pie'], ['Protocolos', tot.proto, 'proto'], ['Obs. docentes', tot.obs, 'obs'], ['Planes', State.coursePlans.length + State.studentPlans.length, 'plan'], ['Enfermería', tot.enf, 'enf']];
    el('dashboard-stats').innerHTML = stats.map(([l, n, t]) => `<div class="stat" ${t ? `data-tone="${t}"` : ''}><span class="stat__num num">${n}</span><span class="stat__label">${l}</span></div>`).join('');

    if (this.pieC) this.pieC.destroy();
    if (this.barC) this.barC.destroy();
    if (!window.Chart) return;
    const tone = n => cssVar(`--tone-${n}-ink`);
    Chart.defaults.font.family = cssVar('--font-body');
    Chart.defaults.color = cssVar('--color-muted');
    this.pieC = new Chart(el('chart-cycles'), {
      type: 'doughnut',
      data: { labels: Object.keys(cy), datasets: [{ data: Object.values(cy), backgroundColor: ['proto', 'warn', 'conv', 'pie', 'neutral'].map(tone), borderColor: cssVar('--color-paper-2'), borderWidth: 2 }] },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }
    });
    const top = Object.entries(byCourse).sort((a, b) => b[1].total - a[1].total).slice(0, 8);
    const ds = (label, key, t) => ({ label, data: top.map(c => c[1][key]), backgroundColor: tone(t), stack: 's', borderRadius: 3 });
    this.barC = new Chart(el('chart-courses'), {
      type: 'bar',
      data: { labels: top.map(c => c[0]), datasets: [ds('Protocolos', 'proto', 'proto'), ds('Conv. / PIE', 'convPie', 'pie'), ds('Observaciones', 'obs', 'obs'), ds('Enfermería', 'enf', 'enf')] },
      options: {
        maintainAspectRatio: false,
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 }, grid: { color: cssVar('--color-rule') } } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } },
        onHover: (e, items) => { e.native.target.style.cursor = items[0] ? 'pointer' : 'default'; },
        onClick: (e, items) => { if (items.length) app.openCourse(top[items[0].index][0]); }
      }
    });
  },
  async saveDays(v) {
    const n = parseInt(v);
    if (!n || n < 1) return toast('Ingrese un número de días válido', 'error');
    try { await DB.saveVars({ diasTotalesClases: n }); toast('Días de clases guardados'); this.render(); }
    catch (e) { toast(e.message, 'error'); }
  },

  // ---------------- CURSOS ----------------
  renderCourses() {
    const all = this.getStudents();
    const ac = State.currentUser.assignedCourses || [];
    const open = hasAccess('acceso_total') || ac.length === 0;
    const html = Object.entries(CYCLES).map(([cycle, data]) => {
      const cards = data.courses.filter(c => open || ac.includes(c)).map(c => {
        const n = all.filter(s => s.curso === c && s.status !== 'blocked').length;
        return `<button type="button" class="course" data-tone="${data.tone}" onclick="app.openCourse(${jsq(c)})"><span class="course__name">${esc(c)}</span><span class="course__count"><span class="num">${n}</span> estudiantes</span></button>`;
      }).join('');
      return cards ? `<section class="cycle"><h2 class="cycle__title">${ico(data.icon)}${esc(cycle)}</h2><div class="course-grid">${cards}</div></section>` : '';
    }).join('');
    el('cycles-container').innerHTML = html || empty('folder-x', 'No tiene cursos asignados.');
  },
  openCourse(name) { State.filterCourse = name; this.navigate('students'); },
  setFilter(c) { State.filterCourse = c; this.renderStudents(); icons(); },
  toggleShowWithdrawn(v) { State.showWithdrawn = v; this.renderStudents(); icons(); },
  async updateProfJefe(course, name) {
    try {
      const dbc = State.rawCoursesDB.find(c => sameId(c.id, course) || c.name === course);
      await DB.save('courses', { id: dbc ? dbc.id : course.replace(/\s+/g, '_'), name: dbc ? dbc.name : course, profesorJefe: name.trim() }, true);
      toast('Profesor jefe actualizado');
    } catch (e) { toast(e.message, 'error'); }
  },

  renderStudents() {
    const course = State.filterCourse;
    const all = this.getStudents();
    let f = all.filter(s => (!course || s.curso === course) && (State.showWithdrawn || s.status !== 'blocked'));
    const q = (el('student-search').value || '').toLowerCase();
    if (q) f = f.filter(s => s.name.toLowerCase().includes(q) || s.rut.includes(q));
    f.sort((a, b) => a.name.localeCompare(b.name));
    const admin = this.isCoordinator();
    const canImport = hasAccess('editar_fichas') || hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema');

    el('students-title').textContent = course || 'Todos los estudiantes';
    el('students-actions').innerHTML = [
      course && canImport ? `<button class="btn" onclick="app.openAttendanceImport()">${ico('file-spreadsheet')}Cargar inasistencias</button>` : '',
      course ? `<button class="btn" onclick="app.openExportModal('course_full_report')">${ico('file-text')}Reporte del curso</button>` : '',
      course ? `<button class="btn" onclick="app.exportActivePlansPDF()">${ico('file-output')}Reporte planes</button>` : '',
      course ? `<button class="btn" onclick="app.openCoursePlans()">${ico('clipboard-list')}Planes del curso</button>` : '',
      admin ? `<button class="btn btn--primary" onclick="app.openNewStudentModal()">${ico('user-plus')}Añadir estudiante</button>` : ''
    ].join('');

    const courses = Array.from(new Set(all.map(s => s.curso))).sort();
    el('student-course-filters').innerHTML = `
      ${course ? `<label class="field field--inline"><span class="field__label">Profesor jefe</span><input class="input" value="${esc(this.profJefeOf(course))}" placeholder="Escriba el nombre y presione Enter" onchange="app.updateProfJefe(${jsq(course)}, this.value)"></label>` : ''}
      <div class="filters">
        <div class="segs" role="group" aria-label="Filtrar por curso">
          <button type="button" class="seg" aria-pressed="${!course}" onclick="app.setFilter('')">Todos</button>
          ${courses.map(c => `<button type="button" class="seg" aria-pressed="${course === c}" onclick="app.setFilter(${jsq(c)})">${esc(c)}</button>`).join('')}
        </div>
        <label class="check"><input type="checkbox" ${State.showWithdrawn ? 'checked' : ''} onchange="app.toggleShowWithdrawn(this.checked)"><span>Ver retirados</span></label>
      </div>`;

    // Panorama del curso
    if (course && f.length) {
      let pie = 0, conv = 0, obs = 0, proto = 0;
      f.forEach(st => {
        st.history.forEach(h => {
          if (h.type === PROTOCOLO) proto++;
          else if (State.users.find(u => sameId(u.id, h.professionalId))?.role === 'Equipo PIE') pie++;
          else conv++;
        });
        obs += st.observations.length;
      });
      el('course-panorama').innerHTML = `
        <section class="panel panorama">
          <div class="panel__head"><h2>Panorama de ${esc(course)}</h2><button class="btn btn--primary" onclick="app.createNewCoursePlan()">${ico('sparkles')}Nuevo plan de curso</button></div>
          <div class="stats stats--4">
            <div class="stat" data-tone="proto"><span class="stat__num num">${proto}</span><span class="stat__label">Protocolos</span></div>
            <div class="stat" data-tone="pie"><span class="stat__num num">${pie}</span><span class="stat__label">Intervenciones PIE</span></div>
            <div class="stat" data-tone="conv"><span class="stat__num num">${conv}</span><span class="stat__label">Convivencia</span></div>
            <div class="stat" data-tone="obs"><span class="stat__num num">${obs}</span><span class="stat__label">Obs. docentes</span></div>
          </div>
          <p class="note">${ico('info')}Las observaciones docentes y los registros de los estudiantes se analizan en conjunto al crear un plan de curso con IA.</p>
        </section>`;
    } else el('course-panorama').innerHTML = '';

    if (!f.length) { el('students-grid').innerHTML = empty('users', 'No se encontraron estudiantes.'); return; }
    el('students-grid').innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th>Estudiante</th><th class="t-num">Asistencia</th><th class="t-num">Inasistencias</th><th class="t-num">Atrasos</th><th class="t-num">Días justificados</th><th class="t-actions">Acciones</th></tr></thead>
      <tbody>${f.map(s => {
        const plans = State.studentPlans.filter(p => sameId(p.studentId, s.id)).map(p => chip(p.type || 'Plan activo', 'plan', 'bookmark')).join('');
        return `<tr class="${s.status === 'blocked' ? 'is-muted' : ''}">
          <td><span class="cell-title">${esc(s.name)}</span><span class="cell-sub num">${esc(s.rut)}</span>
            <span class="chips">${s.status === 'blocked' ? chip(`Retirado${s.fechaRetiro ? ' el ' + fmtDate(s.fechaRetiro) : ''}`, 'neutral', 'user-minus') : ''}${plans}${s.asistencia.alerta ? chip('Riesgo de promoción', 'proto', 'alert-triangle') : ''}</span></td>
          <td class="t-num"><span class="figure num" data-alert="${s.asistencia.alerta}">${s.asistencia.real}%</span></td>
          <td class="t-num"><input type="number" min="0" class="input input--num num" aria-label="Inasistencias de ${esc(s.name)}" value="${s.asistencia.inasistencias}" onchange="app.quickSaveMetric(${jsq(s.id)}, 'inasistencias', this.value)"></td>
          <td class="t-num"><input type="number" min="0" class="input input--num num" aria-label="Atrasos de ${esc(s.name)}" value="${s.asistencia.atrasos}" onchange="app.quickSaveMetric(${jsq(s.id)}, 'atrasos', this.value)"></td>
          <td class="t-num"><span class="num">${s.asistencia.diasJustificados}</span><span class="cell-sub">Se agregan en la ficha</span></td>
          <td class="t-actions"><div class="row-actions">
            <button class="btn btn--sm" onclick="app.openStudent(${jsq(s.id)})">Ver ficha</button>
            ${admin ? `
            <button class="icon-btn" title="Editar nombre" aria-label="Editar nombre" onclick="app.editStudentName(${jsq(s.id)})">${ico('edit-2')}</button>
            <button class="icon-btn" title="${s.status === 'blocked' ? 'Reincorporar estudiante' : 'Marcar como retirado'}" aria-label="${s.status === 'blocked' ? 'Reincorporar estudiante' : 'Marcar como retirado'}" onclick="app.toggleRetiro(${jsq(s.id)})">${ico(s.status === 'blocked' ? 'user-check' : 'user-minus')}</button>
            <button class="icon-btn icon-btn--danger" title="Eliminar alumno" aria-label="Eliminar alumno" onclick="app.deleteStudent(${jsq(s.id)})">${ico('trash-2')}</button>` : ''}
          </div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  },

  async quickSaveMetric(id, field, value) {
    const v = parseInt(value);
    try { await DB.patch('students', id, { [field]: isNaN(v) ? 0 : v }); toast('Dato guardado'); this.renderStudents(); icons(); }
    catch (e) { toast(e.message, 'error'); }
  },

  // ---------------- ALTA, EDICIÓN, RETIRO Y ELIMINACIÓN DE ESTUDIANTES ----------------
  openNewStudentModal() {
    ui.modal({
      title: 'Nuevo estudiante', icon: 'user-plus', size: 'sm', okText: 'Guardar alumno',
      body: `<div class="stack">
        ${fieldHtml('RUN (opcional)', '<input id="new-st-rut" class="input num" placeholder="12345678-9">')}
        ${fieldHtml('Nombre completo', '<input id="new-st-name" class="input" placeholder="Juan Pérez">')}
        ${fieldHtml('Curso de destino', `<select id="new-st-course" class="input"><option value="">Seleccione un curso</option>${options(ALL_COURSES, State.filterCourse)}</select>`)}
      </div>`,
      onOk: async () => {
        const rut = el('new-st-rut').value.trim().toUpperCase();
        const name = el('new-st-name').value.trim();
        const course = el('new-st-course').value;
        if (!name || !course) { toast('El nombre y el curso son obligatorios', 'error'); return false; }
        const finalRut = rut || `S/R-${Date.now().toString().slice(-6)}`;
        const id = finalRut.replace(/[^0-9KkS/R-]/g, '');
        if (State.rawStudents.find(x => x.rut === finalRut || sameId(x.id, id))) { toast('Ya existe un estudiante con ese RUN o ID interno', 'error'); return false; }
        await DB.save('students', { id, rut: finalRut, name, curso: course, courseId: course, status: 'active' });
        toast('Estudiante añadido correctamente');
        this.renderStudents(); icons();
      }
    });
  },
  editStudentName(id) {
    const s = State.rawStudents.find(x => sameId(x.id, id));
    if (!s) return;
    ui.prompt({ title: 'Editar estudiante', msg: 'Modifique el nombre del estudiante:', value: s.name || s.nombres || '', action: async name => {
      if (!name) return false;
      await DB.patch('students', id, { name });
      toast('Nombre actualizado');
      this.renderStudents(); icons();
    } });
  },
  deleteStudent(id) {
    ui.confirm({ title: 'Eliminar estudiante', icon: 'user-x', msg: '¿Está seguro de eliminar a este estudiante permanentemente? Sus registros quedan guardados, pero sin ficha visible. Si solo dejó el colegio, use "Marcar como retirado".', action: async () => {
      await DB.remove('students', id);
      toast('Estudiante eliminado');
      this.renderStudents(); icons();
    } });
  },
  toggleRetiro(id) {
    const s = State.rawStudents.find(x => sameId(x.id, id));
    if (!s) return;
    const out = s.status === 'blocked';
    ui.modal({
      title: out ? 'Reincorporar estudiante' : 'Marcar como retirado', icon: out ? 'user-check' : 'user-minus', tone: out ? 'conv' : 'warn',
      okText: out ? 'Sí, reincorporar' : 'Sí, marcar retirado',
      body: `<p class="modal__msg">${out ? `<strong>${esc(s.name)}</strong> volverá a aparecer en la nómina activa del curso.` : `<strong>${esc(s.name)}</strong> dejará de aparecer en la nómina activa. Toda su información queda guardada y puede verla con la casilla "Ver retirados".`}</p>
        ${out ? '' : `<div class="stack">${fieldHtml('Fecha de retiro', `<input type="date" id="retiro-fecha" class="input" value="${today()}">`)}${fieldHtml('Motivo (opcional)', '<input id="retiro-motivo" class="input" placeholder="Cambio de domicilio, traslado de colegio...">')}</div>`}`,
      onOk: async () => {
        const cambios = out ? { status: 'active', fechaReincorporacion: today() } : { status: 'blocked', fechaRetiro: el('retiro-fecha').value || today(), motivoRetiro: el('retiro-motivo').value.trim() };
        await DB.patch('students', id, cambios);
        toast(out ? 'Estudiante reincorporado' : 'Estudiante marcado como retirado. Active "Ver retirados" para verlo.');
        this.render();
      }
    });
  },

  // ---------------- FICHA DEL ESTUDIANTE ----------------
  openStudent(id) { State.selectedStudentId = id; State.editing = { intervention: null, observations: null, nursings: null }; this.navigate('student_detail'); },

  renderStudentDetail() {
    const s = this.current();
    if (!s) return this.navigate('students');
    el('plan-type-select').innerHTML = options(PLAN_TYPES);
    el('lbl-dias-totales').textContent = State.variables.diasTotalesClases || 180;
    el('input-inasistencias').value = s.asistencia.inasistencias;
    el('input-atrasos').value = s.asistencia.atrasos;
    el('input-just-tipo').innerHTML = `<option value="">Ninguno</option>${options(JUSTIFICATIVO_TYPES)}`;

    const counts = {};
    s.history.forEach(h => {
      const u = State.users.find(x => sameId(x.id, h.professionalId));
      let r = u ? (u.role === 'Equipo PIE' ? 'PIE' : (u.role === 'Convivencia' ? 'Conv' : 'Docente')) : 'Docente';
      if (h.type === PROTOCOLO) r = 'Prot';
      counts[r] = (counts[r] || 0) + 1;
    });
    if (s.nursing.length) counts.Enf = s.nursing.length;
    if (s.observations.length) counts.Obs = s.observations.length;
    const roleTone = { PIE: 'pie', Conv: 'conv', Prot: 'proto', Enf: 'enf', Obs: 'obs', Docente: 'neutral' };

    const just = (s.justificativos || []).map((j, i) => `<li class="just">${chip(`${fmtDate(j.fecha)}: ${j.tipo} (${j.dias} días)`, 'conv')}<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" aria-label="Eliminar justificativo" title="Eliminar justificativo" onclick="app.deleteJustificativo(${jsq(s.id)}, ${i})">${ico('x')}</button></li>`).join('');

    el('detail-header').innerHTML = `
      <div class="entry__head">
        <span class="avatar avatar--lg" aria-hidden="true">${esc(s.name.charAt(0))}</span>
        <div class="entry__id">
          <h1 class="entry__name">${esc(s.name)}</h1>
          <div class="chips">${chip(s.rut || 'Sin RUN', 'neutral')}${chip(s.curso, 'conv')}${s.asistencia.alerta ? chip('Alerta de asistencia', 'proto', 'alert-triangle') : ''}${s.status === 'blocked' ? chip(`Retirado${s.fechaRetiro ? ' el ' + fmtDate(s.fechaRetiro) : ''}${s.motivoRetiro ? ': ' + s.motivoRetiro : ''}`, 'ink') : ''}</div>
        </div>
        <div class="chips chips--end">${Object.entries(counts).map(([r, n]) => chip(`${r}: ${n}`, roleTone[r])).join('')}</div>
      </div>
      <div class="entry__cells">
        <div class="cell"><span class="cell__label">Asistencia real</span><span class="cell__num num" data-alert="${s.asistencia.alerta}">${s.asistencia.real}%</span></div>
        <div class="cell"><span class="cell__label">Inasistencia base</span><span class="cell__num num">${Math.max(0, 100 - s.asistencia.real)}%</span></div>
        <div class="cell"><span class="cell__label">Asistencia con justificativos</span><span class="cell__num num">${s.asistencia.conJustificativo}%</span></div>
        <div class="cell"><span class="cell__label">Atrasos</span><span class="cell__num num">${s.asistencia.atrasos}</span></div>
      </div>
      ${just ? `<div class="entry__foot"><span class="cell__label">Justificativos registrados</span><ul class="just-list">${just}</ul></div>` : ''}`;

    this.renderContactCard(s);
    this.renderMonthlyAbsences(s);
    this.changeDetailTab(State.detailTab);
  },

  TABS: [['entrevistas', 'Intervenciones', 'conv'], ['observaciones', 'Observaciones docentes', 'obs'], ['enfermeria', 'Enfermería', 'enf'], ['pie', 'Planes multi-sector (PIE / Aula)', 'pie'], ['cartas', 'Cartas y documentos', 'warn'], ['respaldos', 'Respaldos y archivos', 'conv']],

  changeDetailTab(tab) {
    State.detailTab = tab;
    el('detail-tabs').innerHTML = this.TABS.map(([id, label, tone]) => `<button type="button" role="tab" class="tab" data-tone="${tone}" aria-selected="${id === tab}" onclick="app.changeDetailTab('${id}')">${label}</button>`).join('');
    ({ entrevistas: () => this.renderInterventions(), observaciones: () => this.renderSimple('observations'), enfermeria: () => this.renderSimple('nursings'), pie: () => this.renderPiePlans(), cartas: () => this.renderCartas(), respaldos: () => this.renderEvidences() })[tab]();
    icons();
  },
  panel(html) { el('detail-panel').innerHTML = html; icons(); },
  panelHead(title, icon, action = '') { return `<div class="panel__head"><h2>${ico(icon)}${esc(title)}</h2>${action}</div>`; },

  // Contacto del apoderado
  renderContactCard(s) {
    const c = s.contacto || {};
    const can = hasAccess('editar_fichas') || hasAccess('agregar_entrevistas');
    const f = (id, label, val, type, ph, extra = '') => fieldHtml(label, `<input type="${type}" id="${id}" class="input" value="${esc(val)}" placeholder="${ph}" ${can ? '' : 'readonly'} ${extra}>`);
    const links = [c.email ? `<a class="btn btn--sm" href="mailto:${esc(c.email)}">${ico('mail')}Escribir correo</a>` : '', c.telefono ? `<a class="btn btn--sm" href="tel:${esc(String(c.telefono).replace(/\s+/g, ''))}">${ico('phone')}Llamar</a>` : ''].join('');
    el('contact-card').innerHTML = `
      <div class="panel__head"><h2>${ico('contact')}Contacto del apoderado</h2><div class="row-actions">${links}</div></div>
      <div class="grid-3">
        ${f('contact-apoderado', 'Nombre del apoderado/a', c.apoderado, 'text', 'MARÍA PÉREZ SOTO', 'oninput="this.value=this.value.toUpperCase()"')}
        ${f('contact-parentesco', 'Parentesco', c.parentesco, 'text', 'Madre, padre, abuela...')}
        ${f('contact-email', 'Correo electrónico', c.email, 'email', 'correo@ejemplo.cl')}
        ${f('contact-phone', 'Teléfono de contacto', c.telefono, 'tel', '+56 9 1234 5678')}
        ${f('contact-phone2', 'Teléfono alternativo o de emergencia', c.telefono2, 'tel', '+56 9 8765 4321')}
        <div class="field-end">${can ? `<button class="btn btn--primary" onclick="app.saveContacto()">${ico('save')}Guardar contacto</button>` : ''}</div>
      </div>
      ${c.actualizado ? `<p class="note">Última actualización el ${fmtDate(c.actualizado)}, por ${esc(c.actualizadoPor || 'Sistema')}.</p>` : ''}`;
  },
  async saveContacto() {
    const email = el('contact-email').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('El correo electrónico no es válido', 'error');
    const contacto = { apoderado: el('contact-apoderado').value.trim().toUpperCase(), parentesco: el('contact-parentesco').value.trim(), email, telefono: el('contact-phone').value.trim(), telefono2: el('contact-phone2').value.trim(), actualizado: today(), actualizadoPor: State.currentUser.name };
    try { await DB.patch('students', State.selectedStudentId, { contacto }); toast('Datos de contacto guardados'); this.renderStudentDetail(); }
    catch (e) { toast(e.message, 'error'); }
  },

  // Inasistencias por mes y registro anual
  renderMonthlyAbsences(s) {
    const m = s.inasistenciasMensuales;
    if (!m || !Object.keys(m).length) { el('monthly-absences').hidden = true; return; }
    el('monthly-absences').hidden = false;
    const total = MESES.reduce((a, k) => a + (parseInt(m[k]) || 0), 0);
    el('monthly-absences').innerHTML = `
      <div class="panel__head"><h2>${ico('calendar-range')}Inasistencias por mes</h2>${chip(`Total del año: ${total} días`, 'obs')}</div>
      <div class="months">${MESES.map(k => { const v = parseInt(m[k]) || 0; return `<div class="month" data-level="${v >= 5 ? 'high' : v >= 3 ? 'mid' : v > 0 ? 'low' : 'none'}"><span class="month__label">${k}</span><span class="month__num num">${v}</span></div>`; }).join('')}</div>
      ${s.inasistenciasActualizadas ? `<p class="note">Datos cargados desde Excel el ${fmtDate(s.inasistenciasActualizadas)}.</p>` : ''}`;
  },
  async saveAsistencia() {
    const raw = State.rawStudents.find(x => sameId(x.id, State.selectedStudentId));
    if (!raw) return;
    const num = id => { const v = parseInt(el(id).value); return isNaN(v) ? 0 : v; };
    const updates = { inasistencias: num('input-inasistencias'), atrasos: num('input-atrasos') };
    const tipo = el('input-just-tipo').value, dias = num('input-just-dias');
    if (tipo && dias > 0) updates.justificativos = [...(raw.justificativos || []), { tipo, dias, fecha: today() }];
    try {
      await DB.patch('students', raw.id, updates);
      toast('Asistencia actualizada correctamente');
      el('input-just-dias').value = '';
      this.renderStudentDetail();
    } catch (e) { toast(e.message, 'error'); }
  },
  deleteJustificativo(studentId, idx) {
    ui.confirm({ title: 'Eliminar justificativo', msg: '¿Está seguro de eliminar este justificativo permanentemente?', action: async () => {
      const raw = State.rawStudents.find(x => sameId(x.id, studentId));
      const list = [...(raw?.justificativos || [])];
      list.splice(idx, 1);
      await DB.patch('students', studentId, { justificativos: list });
      toast('Justificativo eliminado');
      this.renderStudentDetail();
    } });
  },

  // ---------------- INTERVENCIONES Y PROTOCOLOS ----------------
  isCarta: h => String(h.type || '').toLowerCase().includes('carta') || String(h.background || '').includes('CARTA COMPROMISO') || String(h.background || '').includes('DOCUMENTO OFICIAL'),
  canSeeConfidential(r) {
    if (r.restricted) return false;
    if (!(r.isPrivate || r.type === PROTOCOLO)) return true;
    const me = String(State.currentUser.id);
    return hasAccess('gestionar_protocolos') || sameId(r.professionalId, me) || (r.sharedWith || []).map(String).includes(me);
  },

  renderInterventions() {
    const s = this.current();
    const canProt = hasAccess('gestionar_protocolos');
    const canEdit = hasAccess('editar_fichas');
    const canAdd = hasAccess('agregar_entrevistas');
    const formOpen = State.editing.intervention !== null;
    const list = s.history.filter(h => !this.isCarta(h)).map(r => {
      if (!this.canSeeConfidential(r)) return `
        <article class="record" data-tone="neutral">
          <header class="record__head"><span class="record__icon">${ico('lock')}</span><div><span class="record__date num">${fmtDate(r.date)}</span><h3>${esc(r.type)}</h3></div></header>
          <p class="muted">El detalle de este registro es confidencial. Solo el equipo de Convivencia, UTP o Dirección puede ver su contenido y antecedentes.</p>
          <footer class="record__foot">${ico('user')}Registrado por ${esc(r.professional)}</footer>
        </article>`;
      const isProt = r.type === PROTOCOLO;
      const p = r.protocol;
      const prot = isProt && p ? `
        <div class="subpanel" data-tone="proto">
          <div class="subpanel__head"><h4>${ico('alert-octagon')}Detalles normativos</h4>${chip(p.status || 'En Proceso', p.status === 'Finalizado' ? 'conv' : 'warn')}</div>
          <dl class="facts">
            <div><dt>Protocolo</dt><dd>${esc(p.type)}</dd></div><div><dt>Afectado</dt><dd>${esc(p.afectado)}</dd></div>
            <div><dt>Denunciado</dt><dd>${esc(p.denunciado)}</dd></div><div><dt>Redes externas</dt><dd>${p.denuncia ? '<strong>Sí aplica</strong>' : 'No aplica'}</dd></div>
          </dl>
          <div class="quote"><span class="cell__label">Medidas (debido proceso)</span><p class="prewrap">${esc(p.medidas)}</p></div>
          ${p.mediacion && (p.mediacion.motivo || p.mediacion.acuerdos) ? `<div class="quote"><span class="cell__label">Proceso de mediación</span><p><strong>Participantes:</strong> ${esc(p.mediacion.participantes)}</p><p><strong>Motivo:</strong> ${esc(p.mediacion.motivo)}</p><p><strong>Acuerdos:</strong> ${esc(p.mediacion.acuerdos)}</p></div>` : ''}
          ${canProt ? `<div class="row-actions row-actions--end">${p.status !== 'Finalizado'
            ? `<button class="btn btn--sm btn--danger" onclick="app.finalizeProtocol(${jsq(r.id)})">${ico('check-circle')}Finalizar caso</button>`
            : `<button class="btn btn--sm" onclick="State.export.tempIntId=${jsq(r.id)}; app.openExportModal('protocolo_informe')">${ico('file-output')}Generar informe PDF</button>`}</div>` : ''}
        </div>` : '';
      const agreements = (r.agreements || []).length ? `
        <div class="agreements"><h4>${ico('check-circle')}Medidas y acuerdos</h4>${r.agreements.map(a => `
          <div class="agreement" data-falta="${esc(a.falta || '')}">
            <div class="agreement__head">${a.falta ? chip(`Falta ${a.falta.toLowerCase()}`, { LEVE: 'warn', GRAVE: 'warn', 'GRAVÍSIMA': 'proto' }[a.falta] || 'neutral') : '<span></span>'}<span class="muted small">Estado: ${esc(a.progress)}</span></div>
            <p class="prewrap">${esc(a.text)}</p></div>`).join('')}</div>` : '';
      return `
        <article class="record" data-tone="${isProt ? 'proto' : r.isPrivate ? 'pie' : 'neutral'}">
          <header class="record__head">
            <span class="record__icon">${ico(isProt ? 'alert-triangle' : r.isPrivate ? 'lock' : 'clipboard-list')}</span>
            <div><span class="record__date num">${fmtDate(r.date)}</span><h3>${esc(r.type)} ${r.isPrivate && !isProt ? chip('Confidencial', 'neutral') : ''}</h3></div>
            ${canEdit ? `<div class="row-actions"><button class="icon-btn" aria-label="Editar" title="Editar" onclick="app.editIntervention(${jsq(r.id)})">${ico('edit-2')}</button><button class="icon-btn icon-btn--danger" aria-label="Eliminar" title="Eliminar" onclick="app.deleteIntervention(${jsq(r.id)})">${ico('trash-2')}</button></div>` : ''}
          </header>
          <p class="prewrap">${esc(r.background)}</p>
          ${prot}${agreements}
          <footer class="record__foot">${ico('user')}Registrado por ${esc(r.professional)}</footer>
        </article>`;
    }).join('');

    this.panel(`
      ${this.panelHead('Intervenciones y protocolos', 'clipboard-list', canAdd && !formOpen ? `<button class="btn btn--primary" onclick="app.openInterventionForm()">${ico('plus')}Nueva intervención</button>` : '')}
      ${formOpen ? this.interventionFormHtml() : ''}
      <div class="stack">${list || empty('clipboard-list', 'No hay intervenciones registradas.')}</div>`);
    if (formOpen) { this.renderAgreementsForm(); this.handleIntTypeChange(); }
  },

  openInterventionForm(r = null) {
    State.editing.intervention = r ? r.id : 'new';
    State.intDraft = r;
    State.forms.newAgreements = r && r.agreements && r.agreements.length ? r.agreements.map(a => ({ ...a })) : [{ text: '', progress: 'No Iniciado' }];
    this.renderInterventions();
    el('form-intervention').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  closeInterventionForm() { State.editing.intervention = null; State.intDraft = null; this.renderInterventions(); },
  editIntervention(id) { const r = this.current().history.find(x => sameId(x.id, id)); if (r) this.openInterventionForm(r); },

  interventionFormHtml() {
    const r = State.intDraft || {};
    const p = r.protocol || {};
    const types = State.variables.interviewTypes.filter(t => t !== PROTOCOLO || hasAccess('gestionar_protocolos'));
    let prof = State.variables.professionals.find(x => (r.professional || '').includes(x));
    if (!r.id && State.currentUser.customRole) prof = State.variables.professionals.find(x => x.toLowerCase().includes(State.currentUser.customRole.toLowerCase().split(' ')[0]));
    const others = State.users.filter(u => !sameId(u.id, State.currentUser.id)).map(u => [u.id, `${u.name} (${u.role})`]);
    const med = p.medidas || '';
    const form = (med.match(/Formativas:\s*(.*?)(?=\nDisciplinarias:|$)/s) || [])[1] || '';
    const disc = (med.match(/Disciplinarias:\s*(.*)/s) || [])[1] || '';
    const m = p.mediacion || {};
    return `
    <form id="form-intervention" class="panel panel--form" onsubmit="event.preventDefault(); app.saveIntervention()">
      <h3>${r.id ? 'Editar intervención' : 'Registrar nueva intervención o protocolo'}</h3>
      <div class="grid-3">
        ${fieldHtml('Fecha', `<input type="date" id="int-date" class="input" value="${esc(r.date || today())}">`)}
        ${fieldHtml('Tipo de acción', `<select id="int-type" class="input" onchange="app.handleIntTypeChange()">${options(types, r.type)}</select>`)}
        ${fieldHtml('Profesional a cargo (titular)', `<select id="int-prof" class="input">${options(State.variables.professionals, prof)}</select>`)}
        ${fieldHtml('Profesional 2: dupla de atención (opcional)', `<select id="int-user-2" class="input"><option value="">Ninguno</option>${options(others, (r.sharedWith || [])[0])}</select>`, 'span-3')}
      </div>
      <fieldset id="protocol-fields" class="subpanel" data-tone="proto" hidden>
        <legend>${ico('alert-octagon')}Activación de protocolo normativo</legend>
        <p class="small"><strong>Este registro es confidencial:</strong> solo lo ven usted y quienes tienen permiso de gestión de convivencia.</p>
        <div class="grid-2">
          ${fieldHtml('Tipo de protocolo *', `<select id="prot-type" class="input"><option value="">Seleccione...</option>${options(PROTOCOL_TYPES, p.type)}</select>`)}
          ${fieldHtml('¿Quién activa?', `<input id="prot-activator" class="input" value="${esc(p.activator)}" placeholder="Inspector, docente, apoderado...">`)}
          ${fieldHtml('Estudiante o funcionario afectado *', `<input id="prot-afectado" class="input" value="${esc(p.afectado)}">`)}
          ${fieldHtml('Estudiante o funcionario denunciado *', `<input id="prot-denunciado" class="input" value="${esc(p.denunciado)}">`)}
        </div>
        <label class="check"><input type="checkbox" id="prot-denuncia" ${p.denuncia ? 'checked' : ''}><span>¿Corresponde derivación o denuncia a redes externas? (Carabineros, PDI, Fiscalía, OPD)</span></label>
        <div class="subpanel__head"><h4>Medidas formativas y disciplinarias (debido proceso)</h4><button type="button" class="btn btn--sm" onclick="app.suggestMeasuresAI()">${ico('sparkles')}Sugerir medidas (IA)</button></div>
        <div class="grid-2">
          ${fieldHtml('Formativas y de apoyo', `<textarea id="prot-medidas-form" class="input" rows="3">${esc(form.trim())}</textarea>`)}
          ${fieldHtml('Disciplinarias según Reglamento Interno', `<textarea id="prot-medidas-disc" class="input" rows="3">${esc(disc.trim())}</textarea>`)}
        </div>
        <h4>${ico('users')}Proceso de mediación (si aplica)</h4>
        <div class="grid-2">
          ${fieldHtml('Participantes', `<input id="prot-med-part" class="input" value="${esc(m.participantes)}">`)}
          ${fieldHtml('Motivo de mediación', `<input id="prot-med-mot" class="input" value="${esc(m.motivo)}">`)}
          ${fieldHtml('Acuerdos', `<textarea id="prot-med-acu" class="input" rows="2">${esc(m.acuerdos)}</textarea>`)}
          ${fieldHtml('Solución al conflicto', `<textarea id="prot-med-sol" class="input" rows="2">${esc(m.solucion)}</textarea>`)}
        </div>
      </fieldset>
      ${fieldHtml('Antecedentes relevantes o descripción del hecho', `<textarea id="int-bg" class="input" rows="4">${esc(r.background)}</textarea>`)}
      <label class="check" id="int-privacy-wrapper"><input type="checkbox" id="int-private" ${r.isPrivate ? 'checked' : ''}><span>${ico('lock')}Entrevista confidencial (oculta para docentes regulares)</span></label>
      <div class="subpanel" data-tone="conv">
        <div class="subpanel__head"><h4>${ico('check-circle')}Medidas, compromisos y acuerdos</h4><button type="button" class="btn btn--sm" onclick="app.suggestMeasureActionAI()">${ico('sparkles')}Sugerir medida RIE (IA)</button></div>
        <div id="int-agreements-container" class="stack"></div>
        <button type="button" class="btn btn--ghost btn--sm" onclick="app.addAgreementField()">${ico('plus')}Añadir otro compromiso</button>
      </div>
      <div class="form-foot"><button type="button" class="btn" onclick="app.closeInterventionForm()">Cancelar</button><button type="submit" class="btn btn--primary">${ico('save')}Guardar documento</button></div>
    </form>`;
  },

  handleIntTypeChange() {
    const isProt = el('int-type').value === PROTOCOLO;
    el('protocol-fields').hidden = !isProt;
    el('int-privacy-wrapper').hidden = isProt;
    if (isProt) el('int-private').checked = true;
  },
  addAgreementField() { State.forms.newAgreements.push({ text: '', progress: 'No Iniciado' }); this.renderAgreementsForm(); },
  removeAgreementField(i) { State.forms.newAgreements.splice(i, 1); this.renderAgreementsForm(); },
  renderAgreementsForm() {
    el('int-agreements-container').innerHTML = State.forms.newAgreements.map((a, i) => `
      <div class="agreement-edit" data-falta="${esc(a.falta || '')}">
        ${a.falta ? `<span class="small strong">Falta ${esc(a.falta.toLowerCase())}</span>` : ''}
        <div class="row-field"><textarea class="input input--grow" aria-label="Compromiso ${i + 1}" placeholder="Descripción de la medida, acuerdo o compromiso..." oninput="State.forms.newAgreements[${i}].text=this.value">${esc(a.text)}</textarea>
        <button type="button" class="icon-btn icon-btn--danger" aria-label="Quitar compromiso" title="Quitar compromiso" onclick="app.removeAgreementField(${i})">${ico('trash')}</button></div>
      </div>`).join('');
    icons();
  },

  async saveIntervention() {
    const s = this.current();
    const type = el('int-type').value;
    const isProt = type === PROTOCOLO;
    const u2 = State.users.find(u => sameId(u.id, el('int-user-2').value));
    const editingId = State.editing.intervention !== 'new' ? State.editing.intervention : null;
    const prev = editingId ? State.rawInterventions.find(x => sameId(x.id, editingId)) : null;
    const data = {
      ...(prev || {}),
      id: editingId || Date.now(), studentId: s.id, studentName: s.name, date: el('int-date').value, type,
      professional: el('int-prof').value + (u2 ? ` / Dupla: ${u2.name}` : ''),
      professionalId: prev ? prev.professionalId : State.currentUser.id,
      background: el('int-bg').value,
      isPrivate: isProt ? true : el('int-private').checked,
      sharedWith: u2 ? [String(u2.id)] : [],
      agreements: State.forms.newAgreements.filter(a => a.text.trim() !== '')
    };
    if (!data.background && !isProt) return toast('Debe ingresar antecedentes', 'error');
    if (isProt) {
      const v = id => el(id).value;
      if (!v('prot-type') || !v('prot-afectado') || !v('prot-denunciado')) return toast('Debe completar los campos obligatorios del protocolo', 'error');
      data.protocol = {
        type: v('prot-type'), activator: v('prot-activator'), afectado: v('prot-afectado'), denunciado: v('prot-denunciado'), denuncia: el('prot-denuncia').checked,
        medidas: `Formativas: ${v('prot-medidas-form')}\nDisciplinarias: ${v('prot-medidas-disc')}`,
        mediacion: { participantes: v('prot-med-part'), motivo: v('prot-med-mot'), acuerdos: v('prot-med-acu'), solucion: v('prot-med-sol') },
        status: prev?.protocol?.status || 'En Proceso'
      };
    } else delete data.protocol;
    try {
      await DB.save('interventions', data);
      toast(editingId ? 'Registro actualizado' : 'Registro guardado');
      this.closeInterventionForm();
    } catch (e) { toast(e.message, 'error'); }
  },
  deleteIntervention(id) {
    ui.confirm({ title: 'Eliminar registro', msg: '¿Está seguro de eliminar este registro?', action: async () => {
      await DB.remove('interventions', id);
      toast('Registro eliminado');
      this.changeDetailTab(State.detailTab);
    } });
  },
  finalizeProtocol(id) {
    ui.confirm({ title: 'Finalizar caso', icon: 'check-circle', tone: 'conv', okText: 'Sí, finalizar', msg: 'El protocolo quedará como finalizado y podrá generar su informe en PDF.', action: async () => {
      const r = State.rawInterventions.find(x => sameId(x.id, id));
      await DB.patch('interventions', id, { protocol: { ...r.protocol, status: 'Finalizado', fechaCierre: today() } });
      toast('Protocolo finalizado');
      this.renderInterventions();
    } });
  },

  // ---------------- OBSERVACIONES Y ENFERMERÍA (un solo formulario genérico) ----------------
  SIMPLE: {
    observations: {
      title: 'Observaciones docentes', icon: 'eye', tone: 'obs', add: 'Nueva observación', formTitle: 'Registrar observación docente',
      empty: 'No hay observaciones docentes registradas.', list: s => s.observations, by: 'Docente',
      fields: [['date', 'Fecha', 'date'], ['content', 'Observación o contexto', 'textarea', 'Describa el comportamiento, situación, avance académico o de convivencia...']],
      required: ['content'], requiredMsg: 'Debe ingresar el contenido de la observación', saved: ['Observación registrada', 'Observación actualizada'],
      view: o => `<p class="prewrap">${esc(o.content)}</p>`
    },
    nursings: {
      title: 'Atención de enfermería y salud', icon: 'heart-pulse', tone: 'enf', add: 'Nuevo registro de salud', formTitle: 'Registrar atención',
      empty: 'No hay atenciones de enfermería registradas.', list: s => s.nursing, by: 'Atendido por',
      fields: [['date', 'Fecha', 'date'], ['reason', 'Motivo', 'text'], ['intervention', 'Intervención', 'textarea'], ['observation', 'Observación', 'textarea']],
      required: ['reason', 'intervention'], requiredMsg: 'Debe ingresar motivo e intervención', saved: ['Atención registrada', 'Atención actualizada'],
      view: n => `<h4>Motivo: ${esc(n.reason)}</h4><p><strong>Intervención:</strong> ${esc(n.intervention)}</p><p class="muted"><strong>Observación:</strong> ${esc(n.observation || 'Ninguna')}</p>`
    }
  },
  renderSimple(col) {
    const cfg = this.SIMPLE[col];
    const s = this.current();
    const editing = State.editing[col];
    const draft = editing && editing !== 'new' ? cfg.list(s).find(x => sameId(x.id, editing)) : {};
    const canAdd = hasAccess('agregar_entrevistas');
    const form = editing ? `
      <form id="form-${col}" class="panel panel--form" onsubmit="event.preventDefault(); app.saveSimple('${col}')">
        <h3>${cfg.formTitle}</h3>
        <div class="grid-2">${cfg.fields.map(([k, label, type, ph = '']) => fieldHtml(label, type === 'textarea'
          ? `<textarea id="sf-${k}" class="input" rows="3" placeholder="${esc(ph)}">${esc(draft[k])}</textarea>`
          : `<input id="sf-${k}" type="${type}" class="input" value="${esc(draft[k] || (type === 'date' ? today() : ''))}">`, type === 'textarea' ? 'span-2' : '')).join('')}</div>
        <div class="form-foot"><button type="button" class="btn" onclick="app.toggleSimpleForm('${col}')">Cancelar</button><button type="submit" class="btn btn--primary">${ico('save')}Guardar</button></div>
      </form>` : '';
    const items = cfg.list(s).map(x => {
      const own = hasAccess('editar_fichas') || sameId(x.professionalId, State.currentUser.id);
      return `<article class="record" data-tone="${cfg.tone}">
        <header class="record__head"><span class="record__date num">${fmtDate(x.date)}</span>
          ${own ? `<div class="row-actions"><button class="icon-btn" aria-label="Editar" title="Editar" onclick="app.toggleSimpleForm('${col}', ${jsq(x.id)})">${ico('edit-2')}</button><button class="icon-btn icon-btn--danger" aria-label="Eliminar" title="Eliminar" onclick="app.deleteSimple('${col}', ${jsq(x.id)})">${ico('trash-2')}</button></div>` : ''}</header>
        ${cfg.view(x)}
        <footer class="record__foot">${ico('user')}${cfg.by}: ${esc(x.professional)}</footer>
      </article>`;
    }).join('');
    this.panel(`${this.panelHead(cfg.title, cfg.icon, canAdd && !editing ? `<button class="btn btn--primary" onclick="app.toggleSimpleForm('${col}')">${ico('plus')}${cfg.add}</button>` : '')}${form}<div class="stack">${items || empty(cfg.icon, cfg.empty, cfg.tone)}</div>`);
    if (editing) el(`form-${col}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  toggleSimpleForm(col, id = null) {
    State.editing[col] = id ? id : (State.editing[col] ? null : 'new');
    this.renderSimple(col);
  },
  async saveSimple(col) {
    const cfg = this.SIMPLE[col];
    const s = this.current();
    const editing = State.editing[col];
    const prev = editing !== 'new' ? State[STORE[col]].find(x => sameId(x.id, editing)) : null;
    const data = { id: prev ? prev.id : Date.now(), studentId: s.id, professionalId: prev ? prev.professionalId : State.currentUser.id, professional: prev ? prev.professional : State.currentUser.name };
    cfg.fields.forEach(([k]) => { data[k] = el(`sf-${k}`).value.trim(); });
    if (cfg.required.some(k => !data[k])) return toast(cfg.requiredMsg, 'error');
    try {
      await DB.save(col, data);
      toast(cfg.saved[prev ? 1 : 0]);
      State.editing[col] = null;
      this.renderSimple(col);
    } catch (e) { toast(e.message, 'error'); }
  },
  deleteSimple(col, id) {
    ui.confirm({ title: 'Eliminar registro', msg: '¿Está seguro de eliminar este registro?', action: async () => {
      await DB.remove(col, id);
      toast('Registro eliminado');
      this.renderSimple(col);
    } });
  },

  // ---------------- PIE, CARTAS Y RESPALDOS ----------------
  renderPiePlans() {
    const reports = State.rawInclusionReports.filter(r => sameId(r.studentId, State.selectedStudentId));
    const html = reports.map(r => `
      <article class="record" data-tone="pie">
        <header class="record__head"><span class="record__icon">${ico('file-text')}</span><div><span class="record__date num">${fmtDate(r.date) || 'Sin fecha'}</span><h3>${esc(r.type || 'Plan de apoyo PIE')}</h3></div>${chip('Documento PIE', 'pie', 'network')}</header>
        <p class="muted small">Registrado por ${esc(r.responsablePlan || 'Equipo PIE')}</p>
        ${(r.estrategias || []).length ? `<div class="stack">${r.estrategias.map(e => `
          <div class="strategy"><span class="cell__label">${esc(e.ambito || 'Estrategia PIE')}</span><p class="prewrap">${esc(e.descripcion)}</p>
          ${(e.acciones || []).length ? `<ul class="bullets">${e.acciones.map(a => `<li>${esc(a.descripcion)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>`
          : '<p class="muted">No se encontraron acciones o estrategias explícitas en este reporte.</p>'}
      </article>`).join('');
    this.panel(`${this.panelHead('Estrategias de inclusión (PIE)', 'network', '<span class="muted small">Datos sincronizados desde el módulo de inclusión</span>')}<div class="stack">${html || empty('network', 'No hay planes ni estrategias PIE sincronizadas para este estudiante.', 'pie')}</div>`);
  },

  renderCartas() {
    const s = this.current();
    const conv = s.history.filter(h => this.isCarta(h)).map(c => ({ ...c, kind: 'conv', body: c.background }));
    const pie = [];
    State.rawInclusionReports.filter(r => sameId(r.studentId, s.id)).forEach(plan => (plan.reportesFamilia || []).forEach(rf => pie.push({ id: rf.id, kind: 'pie', date: rf.fecha, professional: rf.emisorNombre || 'Equipo Inclusión', type: rf.tipoDocumento || 'Documento PIE', body: rf.contenido || '' })));
    const plans = State.studentPlans.filter(p => sameId(p.studentId, s.id)).map(p => ({ id: p.id, kind: 'plan', date: p.date, professional: 'Equipo de intervención', type: p.type || 'Plan de Trabajo Individual', body: `Objetivo general:\n${p.objective}\n\nIntervenciones y apoyos:\n${p.convivenciaActions || p.pieStrategies || ''}` }));
    const all = [...conv, ...pie, ...plans].sort((a, b) => new Date(b.date) - new Date(a.date));
    const origin = { conv: ['Convivencia', 'conv'], pie: ['Módulo inclusión', 'pie'], plan: ['Plan de trabajo', 'plan'] };
    const html = all.map(c => `
      <article class="doc-card" data-tone="${c.kind === 'plan' ? 'plan' : 'warn'}">
        <header class="record__head">${chip(c.type, c.kind === 'plan' ? 'plan' : 'warn')}<span class="record__date num">${fmtDate(c.date)}</span></header>
        <p class="doc-card__body prewrap">${esc(String(c.body).replace(/\*\*/g, ''))}</p>
        <footer class="record__foot"><span>${ico('user')}Emitido por ${esc(c.professional)}</span>
          <span class="row-actions">${chip(...origin[c.kind])}
            ${c.kind === 'plan' ? `<button class="icon-btn" aria-label="Abrir plan" title="Abrir plan" onclick="app.editStudentPlan(${jsq(s.id)}, ${jsq(c.id)})">${ico('pencil')}</button><button class="icon-btn" aria-label="Imprimir PDF" title="Imprimir PDF" onclick="app.printStudentPlan(${jsq(c.id)})">${ico('printer')}</button>`
              : `<button class="icon-btn" aria-label="Imprimir PDF oficial" title="Imprimir PDF oficial" onclick="app.printSingleCarta(${jsq(c.id)}, ${c.kind === 'pie'})">${ico('printer')}</button>`}
            ${c.kind === 'conv' ? `<button class="icon-btn icon-btn--danger" aria-label="Eliminar carta" title="Eliminar carta" onclick="app.deleteIntervention(${jsq(c.id)})">${ico('trash-2')}</button>` : ''}
          </span></footer>
      </article>`).join('');
    this.panel(`${this.panelHead('Documentos y cartas formales', 'folder-open')}${html ? `<div class="grid-2">${html}</div>` : empty('file-warning', 'No hay cartas, reportes ni planes registrados.', 'warn')}`);
  },

  getStudentEvidences(id) { return State.rawEvidences.filter(e => sameId(e.studentId, id)).sort((a, b) => new Date(b.date) - new Date(a.date)); },

  renderEvidences() {
    const s = this.current();
    const canAdd = hasAccess('agregar_entrevistas') || hasAccess('editar_fichas');
    const evs = this.getStudentEvidences(s.id);
    const form = canAdd ? `
      <div class="panel panel--form">
        <h3>${ico('upload-cloud')}Cargar nuevo respaldo</h3>
        <div class="grid-3">
          ${fieldHtml('Tipo de documento', `<select id="ev-type" class="input">${options(EVIDENCE_TYPES)}</select>`)}
          ${fieldHtml('Descripción breve', '<input id="ev-desc" class="input" placeholder="Acta firmada de entrevista con apoderado del 12/09">', 'span-2')}
        </div>
        <input type="file" id="ev-file" class="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" aria-label="Archivo de respaldo">
        <div class="form-foot"><p class="note">${ico('shield-check')}El archivo queda en la carpeta privada del colegio en Google Drive. Solo se abre con sesión iniciada. Máximo 10 MB.</p>
          <button class="btn btn--primary" onclick="app.handleEvidenceUpload()">${ico('upload')}Subir respaldo</button></div>
      </div>` : '';
    const list = evs.map(e => `
      <article class="doc-card" data-tone="conv">
        <header class="record__head">${chip(e.type || 'Respaldo', 'conv')}<span class="record__date num">${fmtDate(e.date)}</span></header>
        <h4>${esc(e.description || 'Sin descripción')}</h4>
        <p class="muted small">${ico('paperclip')}${esc(e.fileName)}</p>
        <footer class="record__foot"><span>Cargado por ${esc(e.uploadedBy || 'Sistema')}</span>
          <span class="row-actions"><button class="icon-btn" aria-label="Abrir o descargar" title="Abrir o descargar" onclick="app.openEvidence(${jsq(e.id)})">${ico('external-link')}</button>
          ${(String(e.uploaderId) === String(State.currentUser.id) || hasAccess('editar_fichas')) ? `<button class="icon-btn icon-btn--danger" aria-label="Eliminar respaldo" title="Eliminar respaldo" onclick="app.deleteEvidence(${jsq(e.id)})">${ico('trash-2')}</button>` : ''}</span></footer>
      </article>`).join('');
    this.panel(`${this.panelHead('Respaldos y archivos del estudiante', 'archive', chip(`${evs.length} documento(s)`, 'conv'))}${form}${list ? `<div class="grid-2">${list}</div>` : empty('folder-open', 'No hay documentos de respaldo cargados para este estudiante.', 'conv')}`);
  },

  async handleEvidenceUpload() {
    const s = this.current();
    const file = el('ev-file').files[0];
    if (!file) return toast('Debe seleccionar un archivo', 'error');
    if (file.size > 10 * 1024 * 1024) return toast('El archivo supera los 10 MB permitidos', 'error');
    const done = ui.busy('Subiendo respaldo', 'Enviando el archivo a Google Drive...');
    try {
      const dataUrl = await readFileAsDataURL(file);
      const data = { id: newId(), studentId: String(s.id), studentName: s.name, course: s.curso, date: today(), type: el('ev-type').value, description: el('ev-desc').value.trim(), fileName: file.name, mimeType: file.type || 'application/octet-stream', uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive' };
      const out = await API.call('upload', { folderName: `${s.curso} - ${s.name}`, fileName: `${data.date}_${data.type}_${file.name}`, mimeType: data.mimeType, base64: String(dataUrl).split(',')[1] });
      data.driveId = out.fileId;
      data.url = out.url;
      await DB.save('evidences', data);
      toast('Respaldo cargado correctamente');
      this.renderEvidences();
    } catch (e) { toast('Error al subir el respaldo: ' + e.message, 'error'); }
    finally { done(); }
  },
  async openEvidence(id) {
    const done = ui.busy('Abriendo respaldo', 'Descargando el archivo de forma segura...');
    try {
      const f = await API.call('file', { id });
      const bytes = Uint8Array.from(atob(f.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType || 'application/octet-stream' }));
      const a = document.createElement('a');
      a.href = url;
      if (/^(application\/pdf|image\/)/.test(f.mimeType || '')) a.target = '_blank'; else a.download = f.fileName || 'respaldo';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e.message, 'error'); }
    finally { done(); }
  },
  deleteEvidence(id) {
    const ev = State.rawEvidences.find(x => sameId(x.id, id));
    ui.confirm({ title: 'Eliminar respaldo', msg: `¿Está seguro de eliminar el archivo <strong>${esc(ev?.fileName)}</strong>? Se envía a la papelera de Drive.`, action: async () => {
      await DB.remove('evidences', id);
      toast('Respaldo eliminado');
      this.renderEvidences();
    } });
  },

  // ---------------- ALERTAS Y RESUMEN ----------------
  rankedAlerts(course) {
    return this.getStudents().filter(s => s.status !== 'blocked' && (!course || s.curso === course))
      .map(s => ({ ...s, ...this.countRecords(s) })).filter(s => s.total > 0).sort((a, b) => b.total - a.total);
  },
  renderAlerts() {
    const sel = el('alerts-course-filter');
    if (sel.options.length <= 1) sel.innerHTML = `<option value="">Todos los cursos</option>${options(ALL_COURSES)}`;
    const course = sel.value;
    const rows = this.rankedAlerts(course);
    const canOpen = hasAccess('ver_fichas');
    el('alerts-table-body').innerHTML = rows.length ? rows.map((s, i) => `
      <tr class="${i < 3 && !course ? 'is-flag' : ''}">
        <td><span class="cell-title">${esc(s.name)}</span><span class="cell-sub num">${esc(s.rut)}</span></td>
        <td>${esc(s.curso)}</td>
        <td class="t-num"><span class="figure num" data-level="${s.total > 5 ? 'high' : s.total > 2 ? 'mid' : 'low'}">${s.total}</span></td>
        <td><span class="chips">${s.proto ? chip(`Prot.: ${s.proto}`, 'proto') : ''}${s.convPie ? chip(`Conv.: ${s.convPie}`, 'pie') : ''}${s.obs ? chip(`Obs.: ${s.obs}`, 'obs') : ''}${s.enf ? chip(`Enf.: ${s.enf}`, 'enf') : ''}</span></td>
        <td class="t-actions">${canOpen ? `<button class="btn btn--sm" onclick="app.openStudent(${jsq(s.id)})">Ver ficha</button>` : chip('Restringido', 'neutral', 'lock')}</td>
      </tr>`).join('') : `<tr><td colspan="5">${empty('shield-check', 'No hay registros ni alertas con este criterio.')}</td></tr>`;
  },
  exportAlertsPDF() { this.openExportModal('alerts_report'); },
  courseSummaryRows() {
    const studs = this.getStudents().filter(s => s.status !== 'blocked');
    return ALL_COURSES.map(c => {
      const t = { curso: c, matricula: 0, proto: 0, convPie: 0, obs: 0, enf: 0, total: 0 };
      studs.filter(s => s.curso === c).forEach(s => { t.matricula++; const r = this.countRecords(s); ['proto', 'convPie', 'obs', 'enf', 'total'].forEach(k => { t[k] += r[k]; }); });
      t.planesCurso = State.coursePlans.filter(p => p.course === c).length;
      t.planesIndiv = State.studentPlans.filter(p => p.course === c).length;
      return t;
    }).filter(r => r.matricula || r.total || r.planesCurso || r.planesIndiv);
  },
  renderCourseSummary() {
    const rows = this.courseSummaryRows();
    const n = (v, tone) => `<span class="figure num" ${v ? `data-tone="${tone}"` : 'data-zero'}>${v}</span>`;
    el('course-summary-table-body').innerHTML = rows.length ? rows.map(r => `
      <tr><td class="cell-title">${esc(r.curso)}</td><td class="t-num num">${r.matricula}</td><td class="t-num">${n(r.proto, 'proto')}</td><td class="t-num">${n(r.convPie, 'pie')}</td><td class="t-num">${n(r.obs, 'obs')}</td><td class="t-num">${n(r.enf, 'enf')}</td><td class="t-num">${n(r.planesIndiv, 'plan')}</td><td class="t-num">${n(r.planesCurso, 'pie')}</td><td class="t-num"><strong class="num">${r.total}</strong></td></tr>`).join('')
      : `<tr><td colspan="9">${empty('bar-chart-2', 'No hay datos disponibles para mostrar.')}</td></tr>`;
  },
  exportCourseSummaryPDF() { this.openExportModal('course_summary_report'); },

  // ---------------- ADMINISTRACIÓN ----------------
  setAdminTab(t) { State.adminTab = t; this.renderAdmin(); icons(); },
  renderAdmin() {
    const tabs = [['users', 'users', 'Funcionarios'], ['students', 'file-check', 'Carga masiva'], ['variables', 'list', 'Variables'], ['logo', 'image', 'Nombre, logos e IA'], ['knowledge', 'library-big', 'Normativas IA']];
    if (hasAccess('gestionar_usuarios')) tabs.push(['migration', 'database', 'Migración de datos']);
    const t = State.adminTab;
    el('admin-tabs').innerHTML = tabs.map(([id, icon, label]) => `<button type="button" role="tab" class="tab" aria-selected="${t === id}" onclick="app.setAdminTab('${id}')">${ico(icon)}${label}</button>`).join('');
    el('admin-content').innerHTML = this['admin_' + t]();
    icons();
  },
  admin_users() {
    return `<section class="panel"><div class="panel__head"><h2>Directorio de personal</h2><button class="btn btn--primary" onclick="app.openUserModal()">${ico('user-plus')}Nuevo funcionario</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Funcionario</th><th>Perfil</th><th>Estado</th><th class="t-actions">Acciones</th></tr></thead><tbody>
      ${State.users.map(u => `<tr><td><span class="cell-title">${esc(u.name)}</span><span class="cell-sub">${esc(u.customRole || '')}</span></td><td>${chip(u.role, ROLE_TONE[u.role] || 'neutral')}</td><td>${u.active === false ? chip('Inactivo', 'neutral') : chip('Activo', 'conv')}</td>
        <td class="t-actions"><div class="row-actions"><button class="icon-btn" aria-label="Cambiar clave" title="Cambiar clave" onclick="app.resetUserPassword(${jsq(u.id)})">${ico('key')}</button><button class="icon-btn" aria-label="Editar" title="Editar" onclick="app.openUserModal(${jsq(u.id)})">${ico('edit')}</button><button class="icon-btn icon-btn--danger" aria-label="Eliminar" title="Eliminar" onclick="app.deleteUser(${jsq(u.id)})">${ico('trash-2')}</button></div></td></tr>`).join('')}
      </tbody></table></div></section>`;
  },
  admin_students() {
    return `<section class="panel panel--narrow">
      <div class="panel__head"><h2>Carga masiva de estudiantes</h2></div>
      <p class="muted">Seleccione un curso y use una de las opciones para cargar la matrícula. Estructura esperada: N/L, RUN, nombre, edad, fecha, comuna.</p>
      ${fieldHtml('1. Curso de destino', `<select id="upload-course-select" class="input"><option value="">Elija un curso</option>${options(ALL_COURSES)}</select>`)}
      <div class="option-block"><h3>${ico('file-text')}Opción 1: subir PDF (sistema SIGE)</h3><p class="muted small">El sistema extrae automáticamente el RUN y el nombre.</p><input type="file" id="pdf-upload" class="file" accept="application/pdf" onchange="app.handlePDFUpload(event)"></div>
      <div class="option-block"><h3>${ico('clipboard-paste')}Opción 2: pegar desde Excel</h3><textarea id="excel-paste-data" class="input num" rows="4" placeholder="Pegue aquí los datos copiados desde Excel..."></textarea><button class="btn" onclick="app.handleExcelPaste()">${ico('check')}Procesar texto pegado</button></div>
      <div class="option-block"><h3>${ico('file-spreadsheet')}Opción 3: inasistencias por mes (Excel del curso)</h3><p class="muted small">Suba el informe de inasistencias por curso. Se detecta el curso, se leen marzo a diciembre y el total, y se muestra el resultado antes de guardar. El porcentaje no se utiliza.</p><button class="btn" onclick="app.openAttendanceImport()">${ico('upload')}Seleccionar Excel de inasistencias</button></div>
    </section>`;
  },
  admin_variables() {
    const list = (title, type, arr, ph) => `<section class="panel"><div class="panel__head"><h2>${title}</h2></div>
      <ul class="ruled">${arr.map(x => `<li><span>${esc(x)}</span><button class="icon-btn icon-btn--danger" aria-label="Quitar ${esc(x)}" onclick="app.removeVar('${type}', ${jsq(x)})">${ico('trash-2')}</button></li>`).join('')}</ul>
      <div class="row-field"><input id="nv-${type}" class="input" placeholder="${ph}" aria-label="${ph}"><button class="btn" onclick="app.addVar('${type}')">Añadir</button></div></section>`;
    return `<section class="panel"><div class="panel__head"><h2>${ico('calendar-clock')}Días totales de clases (anual)</h2></div>
      <p class="muted">Número de días hábiles del año escolar. Se usa para calcular el porcentaje de asistencia.</p>
      <div class="row-field"><input type="number" id="cfg-school-days" class="input input--num num" value="${State.variables.diasTotalesClases || 180}" aria-label="Días de clases"><button class="btn btn--primary" onclick="app.saveDays(el('cfg-school-days').value)">Guardar días</button></div></section>
      <div class="grid-2">${list('Tipos de entrevista o documento', 'int', State.variables.interviewTypes, 'Nueva opción...')}${list('Profesionales y cargos', 'prof', State.variables.professionals, 'Nuevo profesional...')}</div>`;
  },
  admin_logo() {
    const v = State.variables;
    const img = (key, label, inputId, prev) => `<div class="panel"><h3>${label}</h3><div class="preview"><img id="${prev}" src="${esc(v[key])}" alt="${label}" onerror="this.style.visibility='hidden'"></div>
      <input type="file" class="file" accept="image/*" onchange="app.handleImg(event, '${inputId}', '${prev}')" aria-label="Subir ${label}">
      ${fieldHtml('O pegue la dirección de la imagen', `<input id="${inputId}" class="input" value="${esc(v[key])}">`)}</div>`;
    const b = this.brand();
    return `<section class="stack">
      <div class="panel"><div class="panel__head"><h2>${ico('type')}Nombre del sistema</h2></div>
        <p class="muted">Aparece en el ingreso, en el menú y en la pestaña del navegador. Ideas: Trayectoria Escolar, Huella Estudiantil, Bitácora Estudiantil, Ruta del Estudiante, Seguimiento Integral.</p>
        <div class="grid-2">${fieldHtml('Nombre', `<input id="cfg-app-name" class="input" value="${esc(v.appName || b.name)}">`)}${fieldHtml('Subtítulo', `<input id="cfg-app-tagline" class="input" value="${esc(v.appTagline || b.tagline)}">`)}</div></div>
      <div class="panel"><div class="panel__head"><h2>${ico('key')}API Key de inteligencia artificial (Groq)</h2>${chip(v.aiConfigured ? 'Configurada' : 'Sin configurar', v.aiConfigured ? 'conv' : 'warn')}</div>
        <p class="muted">La clave se guarda en el servidor de Apps Script y nunca se envía al navegador. Deje el campo vacío para conservar la actual.</p>
        <div class="row-field"><input type="password" id="cfg-apikey" class="input" placeholder="gsk_..." autocomplete="off" aria-label="API Key"><button class="btn" onclick="app.saveApiKey()">Guardar clave</button></div></div>
      <div class="grid-3">${img('schoolLogo', 'Logo del colegio', 'logo-sch', 'preview-logo-izq')}${img('slepLogo', 'Logo SLEP', 'logo-slep', 'preview-logo-der')}${img('bgImage', 'Fotografía de ingreso', 'bg-img-input', 'preview-bg-img')}</div>
      <div class="form-foot"><span></span><button class="btn btn--primary" onclick="app.saveLogos()">Guardar y aplicar cambios</button></div></section>`;
  },
  admin_knowledge() {
    const k = State.tempKbForm;
    return `<section class="panel panel--narrow">
      <div class="panel__head"><h2>${ico('library-big')}Repositorio normativo (IA)</h2></div>
      <p class="muted">Añada extractos de leyes o enlaces (Decreto 67, RIE, Ley TEA, protocolos). La IA usa esta información para ajustar planes y protocolos a la normativa.</p>
      ${fieldHtml('Título del documento o enlace', `<input id="kb-title" class="input" value="${esc(k.title)}" placeholder="Política de Reactivación MINEDUC (enlace)">`)}
      ${fieldHtml('Enlace (URL) o contenido de la normativa', `<textarea id="kb-content" class="input" rows="5" placeholder="Pegue el enlace o el texto completo del reglamento...">${esc(k.content)}</textarea>`)}
      <div class="form-foot"><span></span><button class="btn btn--primary" onclick="app.saveKnowledge()">${ico('save')}Guardar recurso</button></div>
      <h3>Documentos actuales (${State.knowledgeDocs.length})</h3>
      <ul class="ruled ruled--docs">${State.knowledgeDocs.map(d => `<li><div><strong>${esc(d.title)}</strong><p class="muted small clamp">${esc(d.content)}</p></div><button class="icon-btn icon-btn--danger" aria-label="Eliminar normativa" onclick="app.deleteKnowledge(${jsq(d.id)})">${ico('trash-2')}</button></li>`).join('')}</ul>
      ${State.knowledgeDocs.length ? '' : '<p class="muted">No hay normativas guardadas. La IA usará respuestas genéricas.</p>'}
    </section>`;
  },
  admin_migration() { return this.migrationHtml(); },

  async addVar(type) {
    const v = el(`nv-${type}`).value.trim();
    const key = type === 'int' ? 'interviewTypes' : 'professionals';
    if (!v || State.variables[key].includes(v)) return;
    try { await DB.saveVars({ [key]: [...State.variables[key], v] }); this.renderAdmin(); } catch (e) { toast(e.message, 'error'); }
  },
  async removeVar(type, val) {
    const key = type === 'int' ? 'interviewTypes' : 'professionals';
    try { await DB.saveVars({ [key]: State.variables[key].filter(x => x !== val) }); this.renderAdmin(); } catch (e) { toast(e.message, 'error'); }
  },
  async handleImg(e, inputId, previewId) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 600 * 1024) return toast('La imagen es muy pesada (máximo 600 KB). Use una más liviana o pegue su dirección.', 'error');
    const b64 = await readFileAsDataURL(file);
    el(inputId).value = b64;
    el(previewId).src = b64;
    el(previewId).style.visibility = '';
  },
  async saveLogos() {
    const patch = { appName: el('cfg-app-name').value.trim(), appTagline: el('cfg-app-tagline').value.trim(), schoolLogo: el('logo-sch').value.trim(), slepLogo: el('logo-slep').value.trim(), bgImage: el('bg-img-input').value.trim() };
    try { await DB.saveVars(patch); this.applyPhoto(patch.bgImage); this.applyBranding(); toast('Configuración guardada'); } catch (e) { toast(e.message, 'error'); }
  },
  async saveApiKey() {
    const value = el('cfg-apikey').value.trim();
    if (!value) return toast('Escriba la nueva API Key', 'error');
    try { await API.call('setSecret', { key: 'GROQ_API_KEY', value }); State.variables.aiConfigured = true; toast('API Key guardada en el servidor'); this.renderAdmin(); }
    catch (e) { toast(e.message, 'error'); }
  },
  async saveKnowledge() {
    const title = el('kb-title').value.trim(), content = el('kb-content').value.trim();
    State.tempKbForm = { title, content };
    if (!title || !content) return toast('Debe ingresar título y contenido', 'error');
    try { await DB.save('knowledgeDocs', { id: newId(), title, content }); State.tempKbForm = { title: '', content: '' }; toast('Normativa guardada'); this.renderAdmin(); }
    catch (e) { toast(e.message, 'error'); }
  },
  deleteKnowledge(id) {
    ui.confirm({ title: 'Eliminar normativa', msg: '¿Eliminar esta normativa del repositorio?', action: async () => { await DB.remove('knowledgeDocs', id); toast('Normativa eliminada'); this.renderAdmin(); } });
  },

  // Funcionarios
  openUserModal(id) {
    const u = id ? State.users.find(x => sameId(x.id, id)) : { name: '', role: 'Docente', customRole: '', active: true, functions: ['ver_fichas'], assignedCourses: [] };
    State.tempUserForm = { ...u, functions: [...(u.functions || [])], assignedCourses: [...(u.assignedCourses || [])], password: '' };
    State.editingUserId = id || null;
    ui.modal({ title: id ? 'Editar funcionario' : 'Nuevo funcionario', icon: 'user', size: 'lg', okText: 'Guardar funcionario', body: '<div id="user-modal-content"></div>', onOk: () => this.saveUser() });
    this.renderUserModalContent();
  },
  renderUserModalContent() {
    const f = State.tempUserForm;
    const total = f.functions.includes('acceso_total');
    el('user-modal-content').innerHTML = `
      <div class="grid-2">
        ${fieldHtml('Nombre completo', `<input class="input" value="${esc(f.name)}" oninput="State.tempUserForm.name=this.value">`)}
        ${fieldHtml('Cargo específico (opcional)', `<input class="input" placeholder="Encargada de Convivencia Escolar" value="${esc(f.customRole)}" oninput="State.tempUserForm.customRole=this.value">`)}
        ${fieldHtml('Perfil de permisos', `<select class="input" onchange="State.tempUserForm.role=this.value">${options(State.variables.roles, f.role)}</select>`)}
        ${fieldHtml(State.editingUserId ? 'Nueva clave (vacío = sin cambios)' : 'Clave inicial', `<input class="input" type="text" autocomplete="off" value="${esc(f.password)}" oninput="State.tempUserForm.password=this.value">`)}
      </div>
      <label class="check"><input type="checkbox" ${f.active ? 'checked' : ''} onchange="State.tempUserForm.active=this.checked"><span>Cuenta activa (permitir ingreso)</span></label>
      <h3>Permisos de sistema</h3>
      <label class="check check--strong"><input type="checkbox" ${total ? 'checked' : ''} onchange="app.toggleFunc('acceso_total')"><span>Administrador total (acceso sin restricciones)</span></label>
      ${total ? '' : `<div class="grid-2 checks">${State.variables.functionsList.map(fn => `<label class="check"><input type="checkbox" ${f.functions.includes(fn) ? 'checked' : ''} onchange="app.toggleFunc('${fn}')"><span>${esc(FUNCTION_LABELS[fn] || fn.replace(/_/g, ' '))}</span></label>`).join('')}</div>`}
      <h3>Cursos asignados</h3>
      <p class="muted small">Si no selecciona ninguno, el funcionario tendrá acceso a todos los estudiantes.</p>
      <div class="segs segs--wrap">${ALL_COURSES.map(c => `<button type="button" class="seg" aria-pressed="${f.assignedCourses.includes(c)}" onclick="app.toggleCourse(${jsq(c)})">${esc(c)}</button>`).join('')}</div>`;
  },
  toggleFunc(fn) {
    const f = State.tempUserForm;
    if (fn === 'acceso_total') f.functions = f.functions.includes('acceso_total') ? [] : ['acceso_total'];
    else f.functions = f.functions.includes(fn) ? f.functions.filter(x => x !== fn) : [...f.functions, fn];
    this.renderUserModalContent();
  },
  toggleCourse(c) {
    const f = State.tempUserForm;
    f.assignedCourses = f.assignedCourses.includes(c) ? f.assignedCourses.filter(x => x !== c) : [...f.assignedCourses, c];
    this.renderUserModalContent();
  },
  async saveUser() {
    const f = State.tempUserForm;
    if (!f.name.trim()) { toast('El nombre es obligatorio', 'error'); return false; }
    if (!State.editingUserId && String(f.password).trim().length < 4) { toast('Asigne una clave de al menos 4 caracteres', 'error'); return false; }
    const data = { id: State.editingUserId || String(Date.now()), name: f.name.trim(), role: f.role, customRole: f.customRole || '', active: f.active !== false, functions: f.functions, assignedCourses: f.assignedCourses };
    if (String(f.password).trim()) data.password = String(f.password).trim();
    await DB.save('users', data);
    if (sameId(data.id, State.currentUser.id)) Object.assign(State.currentUser, data, { password: undefined });
    toast('Funcionario guardado correctamente');
    this.renderAdmin();
  },
  deleteUser(id) {
    if (sameId(id, State.currentUser.id)) return toast('No puede eliminar su propia cuenta', 'error');
    ui.confirm({ title: 'Eliminar funcionario', icon: 'user-x', msg: '¿Está seguro de eliminar a este funcionario del sistema?', action: async () => { await DB.remove('users', id); toast('Funcionario eliminado'); this.renderAdmin(); } });
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
