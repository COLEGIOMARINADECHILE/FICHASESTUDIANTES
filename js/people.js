'use strict';
// =====================================================================
// FUNCIONARIOS Y ACCESOS: correos institucionales, aviso de cuenta,
// cursos asignados, registro rápido (paradocentes), solicitudes de
// información confidencial y registro de notas del estudiante.
// =====================================================================
Object.assign(app, {
  domain() { return State.loginOptions?.dominio || 'andaliensur.cl'; },
  pageUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); },
  /** Datos para el diseño del correo: dirección de la página y logos (direcciones completas). */
  mailExtras() {
    const abs = src => !src ? '' : String(src).startsWith('data:') ? src : new URL(src, location.href).href;
    const b = this.brand();
    return { pageUrl: this.pageUrl(), appName: b.name, logoUrl: abs(b.school), slepUrl: abs(b.slep) };
  },

  // ---------------- CORREOS INSTITUCIONALES ----------------
  /** "Juan Andrés Pérez Soto" → juan.perez@andaliensur.cl ; "PÉREZ SOTO, JUAN" → juan.perez@... */
  suggestEmail(fullName) {
    const clean = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s,]/g, ' ').replace(/\s+/g, ' ').trim();
    let txt = clean(fullName).replace(/\(.*?\)/g, '');
    let first, last;
    if (txt.includes(',')) {
      const [ap, no] = txt.split(',').map(s => s.trim().split(' ').filter(Boolean));
      first = (no || [])[0]; last = (ap || [])[0];
    } else {
      const t = txt.split(' ').filter(Boolean);
      first = t[0];
      last = t.length >= 4 ? t[2] : t[1];
    }
    return first && last ? `${first}.${last}@${this.domain()}` : '';
  },
  async saveUserEmail(id, input) {
    const email = input.value.trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { input.setAttribute('aria-invalid', 'true'); return toast('El correo no es válido', 'error'); }
    if (email && State.users.some(u => !sameId(u.id, id) && String(u.email || '').toLowerCase() === email)) { input.setAttribute('aria-invalid', 'true'); return toast('Ese correo ya está asignado a otro funcionario', 'error'); }
    input.removeAttribute('aria-invalid');
    try { await DB.patch('users', id, { email }); toast('Correo guardado'); }
    catch (e) { toast(e.message, 'error'); }
  },
  suggestAllEmails() {
    const list = State.users.filter(u => !u.email && !u.eliminado);
    ui.modal({
      title: 'Sugerir correos institucionales', icon: 'at-sign', size: 'lg', okText: 'Guardar correos',
      body: `<p class="modal__msg">Se propone <span class="num">nombre.apellido@${this.domain()}</span> a partir del nombre. Revise y corrija antes de guardar; deje vacío el que no corresponda.</p>
        <div class="table-wrap"><table class="table table--dense"><thead><tr><th>Funcionario</th><th>Correo propuesto</th></tr></thead><tbody>
        ${list.map(u => `<tr><td>${esc(u.name)}<span class="cell-sub">${esc(u.role)}</span></td><td><input type="email" class="input input--email" data-uid="${esc(u.id)}" value="${esc(this.suggestEmail(u.name))}" aria-label="Correo de ${esc(u.name)}"></td></tr>`).join('')}
        </tbody></table></div>`,
      onOk: async body => {
        const ops = [];
        const seen = new Set(State.users.filter(u => u.email).map(u => u.email.toLowerCase()));
        for (const inp of body.querySelectorAll('[data-uid]')) {
          const email = inp.value.trim().toLowerCase();
          if (!email) continue;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast(`Correo no válido: ${email}`, 'error'); return false; }
          if (seen.has(email)) { toast(`Correo repetido: ${email}`, 'error'); return false; }
          seen.add(email);
          ops.push({ col: 'users', id: inp.dataset.uid, data: { email }, merge: true });
        }
        if (!ops.length) return;
        await DB.batch(ops);
        toast(`${ops.length} correos guardados`);
        this.renderAdmin();
      }
    });
  },

  // ---------------- AVISO DE CUENTA AL FUNCIONARIO ----------------
  accessMessage(u, withPassword) {
    const b = this.brand();
    const google = !!State.loginOptions?.googleClientId;
    const cursos = (u.assignedCourses || []).length ? `Cursos asignados: ${u.assignedCourses.join(', ')}.` : 'Tiene acceso a todos los cursos que su perfil permite.';
    const pasos = [];
    pasos.push(`1. Abra ${this.pageUrl()}`);
    if (google) pasos.push(`2. Presione "Acceder con Google" y use su cuenta ${u.email}.`);
    if (withPassword) pasos.push(`${google ? '3. Si prefiere usar clave: elija' : '2. Elija'} el perfil "${u.role}", su nombre y escriba la clave temporal: **{CLAVE}**`, `${google ? '4' : '3'}. Cambie la clave en "Cambiar mi clave", abajo en el menú.`);
    else if (!google) pasos.push(`2. Elija el perfil "${u.role}", su nombre y escriba su clave.`);
    return `Estimado(a) ${u.name}:

Se habilitó su cuenta en ${b.name}, el sistema de seguimiento de estudiantes del ${b.tagline}.

**Cómo ingresar**
${pasos.join('\n')}

Su perfil: ${u.customRole || u.role}. ${cursos}

${TXT_CONFIDENCIALIDAD}

Ante cualquier duda, escriba a datos@andaliensur.cl.

Saludos cordiales,
Equipo de Gestión
${b.tagline}`.trim();
  },
  openNotifyModal(id) {
    const u = State.users.find(x => sameId(x.id, id));
    if (!u) return;
    if (!u.email) return toast('Primero registre el correo institucional del funcionario', 'error');
    const google = !!State.loginOptions?.googleClientId;
    ui.modal({
      title: `Aviso de acceso a ${u.name}`, icon: 'send', size: 'lg', okText: 'Enviar correo',
      body: `<div class="stack">
        <p class="modal__msg">Se enviará a <strong>${esc(u.email)}</strong> con remitente <strong>Equipo de Gestión</strong>. Las respuestas llegan a <strong>datos@andaliensur.cl</strong>. Puede editar el texto.</p>
        <label class="check"><input type="checkbox" id="notify-pass" ${google ? '' : 'checked'} onchange="el('notify-text').value = app.accessMessage(State.users.find(x => sameId(x.id, ${jsq(u.id)})), this.checked)"><span>Incluir una clave temporal nueva (reemplaza la actual; se genera al enviar)</span></label>
        ${fieldHtml('Asunto', `<input id="notify-subject" class="input" value="Su cuenta en ${esc(this.brand().name)}">`)}
        ${fieldHtml('Mensaje', `<textarea id="notify-text" class="input" rows="16">${esc(this.accessMessage(u, !google))}</textarea>`)}
      </div>`,
      onOk: async () => {
        const mensaje = el('notify-text').value;
        if (el('notify-pass').checked && !mensaje.includes('{CLAVE}')) { toast('El mensaje debe contener {CLAVE} donde irá la clave temporal', 'error'); return false; }
        const out = await API.call('notificarAcceso', { userId: u.id, asunto: el('notify-subject').value, mensaje, tagline: this.brand().tagline, ...this.mailExtras() });
        u.accesoNotificado = out.fecha;
        toast(`Aviso enviado a ${out.enviado}`);
        if (State.currentView === 'admin') this.renderAdmin();
      }
    });
  },
  notifyPending() {
    const list = State.users.filter(u => u.email && !u.accesoNotificado && u.active !== false);
    const google = !!State.loginOptions?.googleClientId;
    ui.confirm({
      title: 'Enviar avisos pendientes', icon: 'send', tone: 'conv', okText: `Enviar ${list.length} correos`,
      msg: `Se enviará el aviso de acceso a ${list.length} funcionario(s) con correo y sin aviso previo${google ? '' : ', cada uno con una clave temporal nueva'}.<br><br>${list.map(u => esc(u.name)).join(', ')}`,
      action: async () => {
        ui.close();
        const done = ui.busy('Enviando avisos', '');
        let ok = 0;
        try {
          for (const u of list) {
            el('busy-msg').textContent = `${ok + 1} de ${list.length}: ${u.name}`;
            const out = await API.call('notificarAcceso', { userId: u.id, asunto: `Su cuenta en ${this.brand().name}`, mensaje: this.accessMessage(u, !google), tagline: this.brand().tagline, ...this.mailExtras() });
            u.accesoNotificado = out.fecha;
            ok++;
          }
          toast(`${ok} avisos enviados`);
        } catch (e) { toast(`Se enviaron ${ok}. Se detuvo: ${e.message}`, 'error'); }
        finally { done(); this.renderAdmin(); }
        return false;
      }
    });
  },

  // ---------------- ACCESO DE DOCENTES A UN CURSO ----------------
  courseAccessHtml(course) {
    const withAccess = State.users.filter(u => !u.eliminado && (u.assignedCourses || []).includes(course));
    const others = State.users.filter(u => !u.eliminado && u.active !== false && !(u.assignedCourses || []).includes(course) && !(u.functions || []).includes('acceso_total')).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="access">
      <span class="field__label">Funcionarios con acceso a este curso</span>
      <div class="chips">${withAccess.map(u => `<span class="chip chip--removable" data-tone="${ROLE_TONE[u.role] || 'neutral'}">${esc(u.name)}<button type="button" aria-label="Quitar acceso a ${esc(u.name)}" onclick="app.setCourseAccess(${jsq(u.id)}, ${jsq(course)}, false)">${ico('x')}</button></span>`).join('') || '<span class="muted small">Nadie asignado específicamente.</span>'}</div>
      <div class="row-field"><select id="course-access-user" class="input" aria-label="Funcionario"><option value="">Elegir funcionario...</option>${options(others.map(u => [u.id, `${u.name} (${u.role})`]))}</select><button type="button" class="btn" onclick="app.setCourseAccess(el('course-access-user').value, ${jsq(course)}, true)">${ico('user-plus')}Dar acceso</button></div>
      <p class="muted small">Un funcionario con cursos asignados solo ve esos cursos. Si no tiene ninguno asignado, ve todos los que su perfil permite.</p>
    </div>`;
  },
  // ---------------- ADMINISTRACIÓN: ACCESO A CURSOS ----------------
  /** ¿El funcionario ve el curso? Acceso total, sin cursos asignados (ve todos) o el curso en su lista. */
  hasCourseAccess(u, course) { const ac = u.assignedCourses || []; return (u.functions || []).includes('acceso_total') || !ac.length || ac.includes(course); },
  accessLabel(u, course) {
    const ac = u.assignedCourses || [];
    if ((u.functions || []).includes('acceso_total')) return chip('Acceso total', 'conv', 'shield-check');
    if (!ac.length) return chip('Ve todos los cursos', 'conv', 'check');
    return ac.includes(course) ? chip('Ya tiene acceso', 'conv', 'check') : chip('Sin acceso', 'warn', 'lock');
  },
  /** Cuántos registros hizo cada funcionario en cada curso: { "userId|curso": n }. */
  contributionsByCourse() {
    const m = {};
    const add = (uid, curso) => { if (!uid || !curso) return; const k = `${uid}|${curso}`; m[k] = (m[k] || 0) + 1; };
    const curso = {}; this.getStudents().forEach(s => { curso[String(s.id)] = s.curso; });
    State.rawInterventions.forEach(h => add(h.professionalId, curso[String(h.studentId)]));
    (State.rawObservations || []).forEach(h => add(h.professionalId, curso[String(h.studentId)]));
    (State.rawNursings || []).forEach(h => add(h.professionalId, curso[String(h.studentId)]));
    State.rawEvidences.forEach(e => add(e.uploaderId, curso[String(e.studentId)]));
    return m;
  },
  admin_access() {
    const a = State.accessAdmin = State.accessAdmin || { course: State.filterCourse || ALL_COURSES[0], verTodos: false, sel: {} };
    const users = State.users.filter(u => !u.eliminado && u.active !== false).sort((x, y) => x.name.localeCompare(y.name));
    const contrib = this.contributionsByCourse();
    // Funcionarios que registraron información en cursos donde (aún) no tienen acceso
    const pares = Object.entries(contrib).map(([k, n]) => { const [uid, curso] = k.split('|'); return { u: users.find(x => sameId(x.id, uid)), curso, n }; })
      .filter(p => p.u).sort((x, y) => x.u.name.localeCompare(y.u.name) || ALL_COURSES.indexOf(x.curso) - ALL_COURSES.indexOf(y.curso));
    const sinAcceso = pares.filter(p => !this.hasCourseAccess(p.u, p.curso));
    const mostrar = a.verTodos ? pares : sinAcceso;
    const key = p => `${p.u.id}|${p.curso}`;
    const n = contrib;
    return `<section class="stack">
      <div class="panel">
        <div class="panel__head"><h2>${ico('history')}Funcionarios que ya registraron información</h2>${chip(`${sinAcceso.length} sin acceso`, sinAcceso.length ? 'warn' : 'conv')}</div>
        <p class="muted">Funcionarios que hicieron registros (intervenciones, observaciones, enfermería o documentos) en estudiantes de un curso. Se indica si ya tienen acceso a ese curso, para no autorizar dos veces.</p>
        <label class="check"><input type="checkbox" ${a.verTodos ? 'checked' : ''} onchange="State.accessAdmin.verTodos=this.checked; app.renderAdmin()"><span>Mostrar también a quienes ya tienen acceso</span></label>
        ${mostrar.length ? `<div class="table-wrap"><table class="table table--dense">
          <thead><tr><th>Dar acceso</th><th>Funcionario</th><th>Curso</th><th class="t-num">Registros</th><th>Estado</th></tr></thead>
          <tbody>${mostrar.map(p => { const ok = this.hasCourseAccess(p.u, p.curso); return `<tr>
            <td>${ok ? '' : `<input type="checkbox" aria-label="Dar acceso a ${esc(p.u.name)} en ${esc(p.curso)}" ${a.sel[key(p)] !== false ? 'checked' : ''} onchange="State.accessAdmin.sel['${key(p)}']=this.checked">`}</td>
            <td><span class="cell-title">${esc(p.u.name)}</span><span class="cell-sub">${esc(p.u.customRole || p.u.role || '')}</span></td>
            <td>${esc(p.curso)}</td><td class="t-num num">${p.n}</td><td>${this.accessLabel(p.u, p.curso)}</td></tr>`; }).join('')}</tbody></table></div>
          ${sinAcceso.length ? `<div class="form-foot"><span class="muted small">Se agrega el curso a los cursos asignados del funcionario. Quien no tiene cursos asignados ya ve todos y no se modifica.</span><button class="btn btn--primary" onclick="app.grantContributors()">${ico('user-check')}Dar acceso a los seleccionados</button></div>` : ''}`
          : empty('check-circle', 'Todos los funcionarios que registraron información ya tienen acceso a sus cursos.', 'conv')}
      </div>

      <div class="panel">
        <div class="panel__head"><h2>${ico('key-round')}Acceso por curso</h2>
          ${fieldHtml('Curso', `<select class="input" onchange="State.accessAdmin.course=this.value; app.renderAdmin()">${options(ALL_COURSES.map(c => [c, c]), a.course)}</select>`, 'field--inline')}</div>
        <p class="muted">Marque o desmarque para dar o quitar acceso a <strong>${esc(a.course)}</strong>. El cambio se guarda al instante.</p>
        <div class="table-wrap"><table class="table table--dense">
          <thead><tr><th>Acceso</th><th>Funcionario</th><th>Perfil</th><th class="t-num">Registros en el curso</th><th>Estado</th></tr></thead>
          <tbody>${users.map(u => { const total = (u.functions || []).includes('acceso_total'), todos = !(u.assignedCourses || []).length; const fijo = total || todos; return `<tr>
            <td><input type="checkbox" aria-label="Acceso de ${esc(u.name)} a ${esc(a.course)}" ${this.hasCourseAccess(u, a.course) ? 'checked' : ''} ${fijo ? `disabled title="${total ? 'Tiene acceso total' : 'Sin cursos asignados: ve todos los cursos'}"` : ''} onchange="app.toggleAccessAdmin(${jsq(u.id)}, this.checked)"></td>
            <td><span class="cell-title">${esc(u.name)}</span><span class="cell-sub">${esc(u.email || '')}</span></td>
            <td class="small">${esc(u.customRole || u.role || '')}</td>
            <td class="t-num num">${n[`${u.id}|${a.course}`] || 0}</td>
            <td>${this.accessLabel(u, a.course)}${!fijo ? `<span class="cell-sub">${(u.assignedCourses || []).length} curso(s) asignado(s)</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="note">${ico('info')}Un funcionario sin cursos asignados ve todos los cursos que su perfil permite. Para limitarlo a algunos cursos, asígnele cursos desde su perfil en "Funcionarios".</p>
      </div>
    </section>`;
  },
  async toggleAccessAdmin(userId, add) {
    const u = State.users.find(x => sameId(x.id, userId));
    const course = State.accessAdmin.course;
    const list = new Set(u.assignedCourses || []);
    if (add) list.add(course); else list.delete(course);
    if (!list.size && !add && !window.confirm(`${u.name} quedará sin cursos asignados y por eso verá TODOS los cursos. ¿Continuar?`)) { this.renderAdmin(); return; }
    try { await DB.patch('users', u.id, { assignedCourses: [...list] }); toast(add ? `${u.name} ahora tiene acceso a ${course}` : `Se quitó el acceso de ${u.name} a ${course}`); }
    catch (e) { toast(e.message, 'error'); }
    this.renderAdmin();
  },
  async grantContributors() {
    const a = State.accessAdmin;
    const contrib = this.contributionsByCourse();
    const porUsuario = {};
    Object.keys(contrib).forEach(k => {
      const [uid, curso] = k.split('|');
      const u = State.users.find(x => sameId(x.id, uid));
      if (!u || u.eliminado || this.hasCourseAccess(u, curso) || a.sel[k] === false) return;
      (porUsuario[uid] = porUsuario[uid] || new Set(u.assignedCourses || [])).add(curso);
    });
    const ops = Object.entries(porUsuario).map(([uid, set]) => ({ col: 'users', id: uid, data: { assignedCourses: [...set] }, merge: true }));
    if (!ops.length) return toast('No hay accesos seleccionados', 'error');
    try { await DB.batch(ops); toast(`Accesos actualizados para ${ops.length} funcionario(s)`); }
    catch (e) { toast(e.message, 'error'); }
    this.renderAdmin();
  },
  async setCourseAccess(userId, course, add) {
    const u = State.users.find(x => sameId(x.id, userId));
    if (!u) return toast('Elija un funcionario', 'error');
    const list = new Set(u.assignedCourses || []);
    if (add) list.add(course); else list.delete(course);
    try {
      await DB.patch('users', u.id, { assignedCourses: [...list] });
      toast(add ? `${u.name} ahora puede ver ${course}` : `Se quitó el acceso de ${u.name} a ${course}`);
      this.renderStudents(); icons();
    } catch (e) { toast(e.message, 'error'); }
  },

  // ---------------- REGISTROS POR CATEGORÍA (contadores clicables) ----------------
  RECORD_CATS: { proto: ['Protocolos', 'alert-octagon'], conv: ['Intervenciones de Convivencia', 'heart-handshake'], pie: ['Trabajo PIE (intervenciones, planes y documentos)', 'puzzle'], obs: ['Observaciones docentes', 'eye'], enf: ['Atenciones de enfermería', 'heart-pulse'] },
  /** Convivencia o PIE según el perfil de quien registró; los protocolos van aparte. */
  recordCategory(h) {
    if (h.type === PROTOCOLO) return 'proto';
    const u = State.users.find(x => sameId(x.id, h.professionalId));
    return u && u.role === 'Equipo PIE' ? 'pie' : 'conv';
  },
  /** Etiquetas con número que abren el detalle. ids: estudiantes; c: conteos de countRecords. */
  recordChips(ids, c) {
    const label = { proto: 'Prot.', conv: 'Conv.', pie: 'PIE', obs: 'Obs.', enf: 'Enf.' };
    return Object.keys(label).filter(k => c[k]).map(k => `<button type="button" class="chip chip--btn" data-tone="${k}" title="Ver ${this.RECORD_CATS[k][0].toLowerCase()}" onclick="app.openRecords(${jsq(k)}, ${jsq(ids.join('|'))})">${label[k]}: ${c[k]}</button>`).join('');
  },
  openCourseRecords(cat, course) {
    const ids = this.getStudents().filter(s => s.curso === course && s.status !== 'blocked').map(s => s.id);
    this.openRecords(cat, ids.join('|'), course);
  },
  openRecords(cat, idList, title = '') {
    const students = String(idList).split('|').map(id => this.getStudent(id)).filter(Boolean);
    const items = [];
    students.forEach(s => {
      if (['proto', 'conv', 'pie'].includes(cat)) s.history.filter(h => !this.isCarta(h) && this.recordCategory(h) === cat).forEach(h => items.push({ s, h, kind: 'int' }));
      if (cat === 'pie') {
        State.rawInclusionReports.filter(r => sameId(r.studentId, s.id) && this.planArea(r) === 'PIE').forEach(h => items.push({ s, h, kind: 'plan' }));
        State.rawEvidences.filter(e => sameId(e.studentId, s.id) && this.evArea(e) === 'PIE').forEach(h => items.push({ s, h, kind: 'doc' }));
      }
      if (cat === 'obs') s.observations.forEach(h => items.push({ s, h, kind: 'obs' }));
      if (cat === 'enf') s.nursing.forEach(h => items.push({ s, h, kind: 'enf' }));
    });
    items.sort((a, b) => new Date(b.h.date) - new Date(a.h.date));
    const [nombre, icon] = this.RECORD_CATS[cat];
    const varios = students.length > 1;
    const body = items.map(({ s, h, kind }) => {
      const quien = varios ? `<span class="cell-sub">${esc(s.name)}</span>` : '';
      if (kind === 'int' && !this.canSeeConfidential(h)) return `
        <article class="record" data-tone="neutral">
          <header class="record__head"><span class="record__icon">${ico('lock')}</span><div><span class="record__date num">${fmtDate(h.date)}</span><h3>${esc(h.type)}</h3>${quien}</div></header>
          <p class="muted">Existe una intervención registrada, pero es confidencial. Puede solicitar la información a quien la registró.</p>
          <footer class="record__foot"><span>${ico('user')}Registrado por ${esc(h.professional)}</span><button class="btn btn--sm" onclick="app.requestRecord(${jsq(h.id)})">${ico('mail')}Solicitar información</button></footer>
        </article>`;
      if (kind === 'plan' || kind === 'doc') return `<article class="record" data-tone="pie">
        <header class="record__head"><span class="record__icon">${ico(kind === 'plan' ? 'clipboard-check' : 'file-text')}</span><div><span class="record__date num">${fmtDate(h.date)}${h.anio ? ` (año ${esc(h.anio)})` : ''}</span><h3>${esc(h.type || (kind === 'plan' ? 'Plan PIE' : 'Documento PIE'))}</h3>${quien}</div>
          ${kind === 'doc' || h.evidenceId ? `<button class="btn btn--sm" onclick="app.openEvidence(${jsq(kind === 'doc' ? h.id : h.evidenceId)})">${ico('external-link')}Abrir</button>` : ''}</header>
        <p class="small">${kind === 'plan' ? `${(h.estrategias || []).length} estrategia(s) en ${new Set((h.estrategias || []).map(e => e.ambito)).size} ámbito(s). Archivo: ${esc(h.fuente || '-')}` : `${esc(h.fileName || '')}${h.description ? `. ${esc(h.description)}` : ''}`}</p>
        <footer class="record__foot"><span>${ico('user')}${esc(h.responsablePlan || h.uploadedBy || 'Equipo PIE')}</span>${varios && hasAccess('ver_fichas') ? `<button class="btn btn--sm btn--ghost" onclick="ui.close(); State.detailTab='pie'; app.openStudent(${jsq(s.id)})">Ver ficha PIE</button>` : ''}</footer>
      </article>`;
      const detalle = kind === 'obs' ? esc(h.content) : kind === 'enf' ? `Motivo: ${esc(h.reason)}\nIntervención: ${esc(h.intervention)}${h.observation ? `\nObservación: ${esc(h.observation)}` : ''}` : esc(h.background || '');
      const prot = h.protocol ? `<p class="small"><strong>Protocolo:</strong> ${esc(h.protocol.type)}. <strong>Estado:</strong> ${esc(h.protocol.status || 'En Proceso')}.</p>` : '';
      return `<article class="record" data-tone="${cat}">
        <header class="record__head"><span class="record__icon">${ico(icon)}</span><div><span class="record__date num">${fmtDate(h.date)}</span><h3>${esc(kind === 'int' ? h.type : nombre.replace(/s$/, ''))}</h3>${quien}</div>
          ${varios && hasAccess('ver_fichas') ? `<button class="btn btn--sm btn--ghost" onclick="ui.close(); app.openStudent(${jsq(s.id)})">Ver ficha</button>` : ''}</header>
        ${prot}<p class="prewrap">${detalle}</p>
        ${(h.agreements || []).length ? `<p class="small"><strong>Acuerdos:</strong> ${h.agreements.map(a => esc(a.text)).join('; ')}</p>` : ''}
        <footer class="record__foot"><span>${ico('user')}${esc(h.professional || '')}</span></footer>
      </article>`;
    }).join('');
    ui.modal({ title: `${nombre}${title ? `: ${title}` : students.length === 1 ? ` de ${students[0].name}` : ''}`, icon, tone: cat, size: 'lg', cancelText: 'Cerrar', hideOk: true, body: `<p class="muted small">${items.length} registro(s), del más reciente al más antiguo.</p><div class="stack">${body || empty(icon, 'No hay registros en esta categoría.')}</div>` });
  },

  // ---------------- SOLICITAR INFORMACIÓN CONFIDENCIAL ----------------
  requestRecord(id) {
    const r = State.rawInterventions.find(x => sameId(x.id, id));
    if (!r) return;
    const author = State.users.find(u => sameId(u.id, r.professionalId));
    const s = this.getStudent(r.studentId) || this.current();
    if (!author?.email) return toast('El autor no tiene correo registrado. Solicite la información a Convivencia Escolar.', 'error');
    const subject = `Solicitud de información confidencial: ${s?.name || ''}`;
    const body = `Estimado(a) ${author.name}:\n\nSolicito acceso o un reporte del registro "${r.type}" del ${fmtDate(r.date)} sobre el estudiante ${s?.name || ''} (${s?.curso || ''}), para fines de acompañamiento en mi rol de ${State.currentUser.customRole || State.currentUser.role}.\n\nMe comprometo a resguardar la confidencialidad de la información conforme a la Ley N° 21.719.\n\nSaludos,\n${State.currentUser.name}`;
    location.href = `mailto:${encodeURIComponent(author.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  },

  // ---------------- REGISTRO RÁPIDO (paradocentes y docentes) ----------------
  renderQuick() {
    const ac = State.currentUser.assignedCourses || [];
    const all = State.rawStudents.map(s => ({ ...s, curso: this.courseNameOf(s), name: this.clean(s.name) })).filter(s => s.status !== 'blocked' && (hasAccess('acceso_total') || !ac.length || ac.includes(s.curso)));
    const courses = ALL_COURSES.filter(c => all.some(s => s.curso === c));
    if (State.quickCourse && !courses.includes(State.quickCourse)) State.quickCourse = '';
    const q = (State.quickSearch || '').toLowerCase();
    const list = all.filter(s => (!State.quickCourse || s.curso === State.quickCourse) && (!q || s.name.toLowerCase().includes(q) || String(s.rut || '').includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    el('quick-controls').innerHTML = `
      ${fieldHtml('Curso', `<select class="input" onchange="State.quickCourse=this.value; app.renderQuick(); icons()"><option value="">Todos mis cursos</option>${options(courses, State.quickCourse)}</select>`)}
      ${fieldHtml('Buscar estudiante', `<input type="search" class="input" id="quick-search" value="${esc(State.quickSearch || '')}" placeholder="Nombre o RUN" oninput="State.quickSearch=this.value; app.renderQuickList()">`)}`;
    State.quickList = list;
    this.renderQuickList();
  },
  renderQuickList() {
    const q = (State.quickSearch || '').toLowerCase();
    const list = (State.quickList || []).filter(s => !q || s.name.toLowerCase().includes(q) || String(s.rut || '').includes(q));
    el('quick-list').innerHTML = !State.quickCourse && !q
      ? empty('school', 'Elija un curso o busque un estudiante para registrar.')
      : list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Estudiante</th><th>Curso</th><th class="t-actions">Registrar</th></tr></thead><tbody>
        ${list.slice(0, 200).map(s => `<tr><td><span class="cell-title">${esc(s.name)}</span><span class="cell-sub num">${esc(s.rut)}</span></td><td>${esc(s.curso)}</td>
          <td class="t-actions"><div class="row-actions">
            <button class="btn btn--sm" onclick="app.quickEvent(${jsq(s.id)}, 'anotacion')">${ico('pen-line')}Anotación</button>
            <button class="btn btn--sm" onclick="app.quickEvent(${jsq(s.id)}, 'atraso')">${ico('clock')}Atraso</button>
            <button class="btn btn--sm" onclick="app.quickEvent(${jsq(s.id)}, 'inasistencia')">${ico('calendar-x')}Inasistencia</button>
          </div></td></tr>`).join('')}</tbody></table></div>` : empty('search-x', 'No se encontraron estudiantes.');
    icons();
  },
  quickEvent(studentId, kind) {
    const s = State.rawStudents.find(x => sameId(x.id, studentId));
    if (!s) return;
    const title = { anotacion: 'Registrar anotación', atraso: 'Registrar atraso', inasistencia: 'Registrar inasistencia' }[kind];
    ui.modal({
      title, icon: { anotacion: 'pen-line', atraso: 'clock', inasistencia: 'calendar-x' }[kind], tone: kind === 'anotacion' ? 'obs' : 'warn', size: 'md', okText: 'Guardar registro',
      body: `<div class="stack">
        <p class="modal__msg"><strong>${esc(this.clean(s.name))}</strong>, ${esc(this.courseNameOf(s))}</p>
        ${fieldHtml('Fecha', `<input type="date" id="qe-date" class="input" value="${today()}">`)}
        ${kind === 'anotacion' ? `<div><span class="field__label">Tipo de anotación</span><div class="segs" role="group" aria-label="Tipo de anotación">
            <button type="button" class="seg" id="qe-neg" aria-pressed="true" onclick="el('qe-neg').setAttribute('aria-pressed','true'); el('qe-pos').setAttribute('aria-pressed','false')">Negativa</button>
            <button type="button" class="seg" id="qe-pos" aria-pressed="false" onclick="el('qe-pos').setAttribute('aria-pressed','true'); el('qe-neg').setAttribute('aria-pressed','false')">Positiva</button></div></div>
          ${fieldHtml('Detalle de la anotación', '<textarea id="qe-detail" class="input" rows="4" placeholder="Describa el hecho de forma objetiva..."></textarea>')}`
          : fieldHtml('Observación (opcional)', `<input id="qe-detail" class="input" placeholder="${kind === 'atraso' ? 'Hora de llegada, motivo informado...' : 'Motivo informado, aviso del apoderado...'}">`)}
      </div>`,
      onOk: async () => {
        const detail = el('qe-detail').value.trim();
        if (kind === 'anotacion' && !detail) { toast('Escriba el detalle de la anotación', 'error'); return false; }
        await API.call('registrarEvento', { studentId: s.id, kind, date: el('qe-date').value, detail, tipo: kind === 'anotacion' && el('qe-pos').getAttribute('aria-pressed') === 'true' ? 'Positiva' : 'Negativa' });
        toast(`${{ anotacion: 'Anotación registrada', atraso: 'Atraso registrado', inasistencia: 'Inasistencia registrada' }[kind]} para ${this.clean(s.name)}`);
        DB.load().catch(() => {});
      }
    });
  },

  // ---------------- REGISTRO DE NOTAS DEL ESTUDIANTE ----------------
  gradesTable(rec) {
    const cols = rec.columnas || [];
    return `<table class="table table--dense grades"><thead><tr><th>Asignatura</th>${cols.map(c => `<th class="t-num">${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${(rec.asignaturas || []).map(a => `<tr><td>${esc(a.nombre)}</td>${a.valores.map((v, i) => `<td class="t-num num" ${i === a.valores.length - 1 ? 'data-final' : ''} data-low="${parseFloat(String(v).replace(',', '.')) < 4}">${esc(v)}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
  },
  openGradesModal() {
    const s = this.current();
    if (!s) return;
    const recs = Object.values(s.calificaciones || {}).sort((a, b) => String(b.anio).localeCompare(String(a.anio)));
    const canDel = hasAccess('editar_fichas');
    ui.modal({
      title: `Registro de notas de ${s.name}`, icon: 'graduation-cap', tone: 'pie', size: 'xl', okText: 'Incluir en un reporte PDF', cancelText: 'Cerrar', hideOk: !recs.length,
      body: recs.length ? recs.map(r => `
        <section class="grades-year">
          <div class="subpanel__head"><h3>Año ${esc(r.anio)}${r.periodo ? ` (${esc(r.periodo)})` : ''}</h3>
            <div class="row-actions">${chip(`Promedio general ${r.promedioGeneral || '-'}`, parseFloat(String(r.promedioGeneral).replace(',', '.')) < 4 ? 'proto' : 'conv')}
            ${r.asistencia?.promedio ? chip(`Asistencia ${r.asistencia.promedio}%`, 'obs') : ''}
            ${canDel ? `<button class="icon-btn icon-btn--danger" aria-label="Eliminar notas ${esc(r.anio)}" title="Eliminar este registro" onclick="app.deleteGrades(${jsq(r.anio)})">${ico('trash-2')}</button>` : ''}</div></div>
          ${this.gradesTable(r)}
          <p class="note">${ico('info')}Curso en el informe: ${esc(r.curso || '-')}. Profesor(a) jefe: ${esc(r.profesorJefe || '-')}. ${r.asistencia ? `Días trabajados ${r.asistencia.trabajados ?? '-'}, inasistencias ${r.asistencia.inasistencias ?? '-'}.` : ''} Cargado el ${fmtDate(r.cargado)} por ${esc(r.cargadoPor || '')}.</p>
        </section>`).join('') : empty('graduation-cap', 'Este estudiante no tiene notas registradas. Cárguelas desde el curso con "Cargar notas (PDF)".', 'pie'),
      onOk: () => { State.export.includeGrades = true; setTimeout(() => this.openExportModal('student_internal'), 50); }
    });
  },
  deleteGrades(anio) {
    const s = State.rawStudents.find(x => sameId(x.id, State.selectedStudentId));
    const cal = { ...(s.calificaciones || {}) };
    delete cal[anio];
    ui.confirm({ title: `Eliminar notas ${anio}`, msg: '¿Eliminar este registro de notas del estudiante?', action: async () => { await DB.patch('students', s.id, { calificaciones: cal }); toast('Registro de notas eliminado'); this.renderStudentDetail(); } });
  }
});
