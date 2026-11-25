'use strict';
// =====================================================================
// MEJORAS: cierre de sesión completo, aviso de cambio de correo,
// inasistencias masivas en registro rápido, foto del estudiante,
// respaldo completo descargable y gráfico de portada por curso (%).
// =====================================================================
Object.assign(app, {
  // ---------------- 1. CIERRE DE SESIÓN COMPLETO ----------------
  /** Cierra la sesión en el servidor, borra todo lo cargado en la página y vuelve a la portada: hay que ingresar de nuevo. */
  async logout() {
    const done = ui.busy('Cerrando sesión', '');
    try { await Promise.race([API.call('logout'), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* igual se cierra */ }
    API.setToken('');
    try { window.google?.accounts?.id?.disableAutoSelect(); } catch (e) { /* sin Google */ }
    try { Object.keys(sessionStorage).filter(k => k.startsWith('cm_')).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* almacenamiento bloqueado */ }
    State.currentUser = null;
    done();
    // Recargar la página garantiza que no quede ningún dato del funcionario en memoria
    location.replace(location.pathname + location.search);
  },

  // ---------------- 3. INASISTENCIAS O ATRASOS DE VARIOS A LA VEZ ----------------
  quickCanImport() { return hasAccess('editar_fichas') || hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema'); },
  openBulkAbsences() {
    const ac = State.currentUser.assignedCourses || [];
    const all = State.rawStudents.filter(s => s.status !== 'blocked').map(s => ({ ...s, curso: this.courseNameOf(s) })).filter(s => hasAccess('acceso_total') || !ac.length || ac.includes(s.curso));
    const cursos = ALL_COURSES.filter(c => all.some(s => s.curso === c));
    State.bulkAbs = { curso: State.quickCourse && cursos.includes(State.quickCourse) ? State.quickCourse : '', kind: 'inasistencia', sel: {}, all };
    ui.modal({
      title: 'Registrar inasistencias o atrasos del curso', icon: 'calendar-x', tone: 'warn', size: 'lg', okText: 'Guardar registros',
      body: `<div class="stack">
        <div class="grid-3">
          ${fieldHtml('Curso', `<select id="ba-curso" class="input" onchange="State.bulkAbs.curso=this.value; State.bulkAbs.sel={}; app.renderBulkAbsences()"><option value="">Elija el curso...</option>${options(cursos.map(c => [c, c]), State.bulkAbs.curso)}</select>`)}
          ${fieldHtml('Fecha', `<input type="date" id="ba-fecha" class="input" value="${today()}" max="${today()}">`)}
          <div><span class="field__label">Registrar</span><div class="segs" role="group" aria-label="Tipo de registro">
            <button type="button" class="seg" id="ba-k-ina" aria-pressed="true" onclick="app.setBulkKind('inasistencia')">Inasistencia</button>
            <button type="button" class="seg" id="ba-k-atr" aria-pressed="false" onclick="app.setBulkKind('atraso')">Atraso</button></div></div>
        </div>
        ${fieldHtml('Observación (opcional, se aplica a todos)', '<input id="ba-obs" class="input" placeholder="Ej: salida pedagógica, aviso del apoderado...">')}
        <div id="ba-list"></div>
        <p class="note">${ico('info')}Marque solo a quienes faltaron (o llegaron atrasados) ese día. Una inasistencia del mismo día no se cuenta dos veces.</p>
      </div>`,
      onOk: () => this.saveBulkAbsences()
    });
    this.renderBulkAbsences();
  },
  setBulkKind(k) { State.bulkAbs.kind = k; el('ba-k-ina').setAttribute('aria-pressed', k === 'inasistencia'); el('ba-k-atr').setAttribute('aria-pressed', k === 'atraso'); this.renderBulkAbsences(); },
  renderBulkAbsences() {
    const b = State.bulkAbs;
    const box = el('ba-list');
    if (!b.curso) { box.innerHTML = empty('school', 'Elija el curso para ver la lista.'); icons(); return; }
    const lista = b.all.filter(s => s.curso === b.curso).sort((x, y) => x.name.localeCompare(y.name, 'es'));
    const n = Object.values(b.sel).filter(Boolean).length;
    box.innerHTML = `<div class="ba-head"><strong>${n} ${b.kind === 'atraso' ? 'atraso(s)' : 'inasistencia(s)'} marcadas</strong> de ${lista.length} estudiantes
        <span class="row-actions"><button type="button" class="btn btn--sm" onclick="${lista.map(s => `State.bulkAbs.sel[${jsq(s.id)}]=true;`).join('')} app.renderBulkAbsences()">Marcar todos</button><button type="button" class="btn btn--sm" onclick="State.bulkAbs.sel={}; app.renderBulkAbsences()">Desmarcar</button></span></div>
      <input type="search" class="input" placeholder="Buscar en el curso..." oninput="document.querySelectorAll('#ba-grid label').forEach(l => l.hidden = !l.textContent.toLowerCase().includes(this.value.toLowerCase()))">
      <div id="ba-grid" class="ba-grid">${lista.map(s => `<label class="check ba-item" data-on="${!!b.sel[s.id]}"><input type="checkbox" ${b.sel[s.id] ? 'checked' : ''} onchange="State.bulkAbs.sel[${jsq(s.id)}]=this.checked; this.closest('label').dataset.on=this.checked; app.bulkCount()"><span>${esc(this.clean(s.name))}</span></label>`).join('')}</div>`;
    icons();
  },
  bulkCount() { const h = document.querySelector('.ba-head strong'); if (h) h.textContent = `${Object.values(State.bulkAbs.sel).filter(Boolean).length} ${State.bulkAbs.kind === 'atraso' ? 'atraso(s)' : 'inasistencia(s)'} marcadas`; },
  async saveBulkAbsences() {
    const b = State.bulkAbs;
    const ids = Object.keys(b.sel).filter(k => b.sel[k]);
    if (!ids.length) { toast('Marque al menos un estudiante', 'error'); return false; }
    const fecha = el('ba-fecha').value || today();
    try {
      const r = await API.call('registrarInasistencias', { kind: b.kind, date: fecha, studentIds: ids, detail: el('ba-obs').value.trim() });
      const reg = new Set((r.registrados || []).map(String));
      b.all.filter(s => reg.has(String(s.id))).forEach(s => this.logQuick(s, b.kind === 'atraso' ? 'Atraso' : 'Inasistencia'));
      notice({ type: 'success', title: `${reg.size} ${b.kind === 'atraso' ? 'atraso(s)' : 'inasistencia(s)'} registradas`, msg: `${b.curso}, ${fmtDate(fecha)}.`, items: r.omitidos ? [`${r.omitidos} no se registraron (ya tenían inasistencia ese día o no pertenecen a sus cursos).`] : [] });
      if (!this.isQuickOnly()) DB.load().then(() => this.render()).catch(() => {});
    } catch (e) { toast(e.message, 'error'); return false; }
  },

  // ---------------- 4. FOTO DEL ESTUDIANTE ----------------
  puedeFoto() { return !this.isQuickOnly() && !State.verAnio && (hasAccess('editar_fichas') || hasAccess('agregar_entrevistas') || hasAccess('gestionar_usuarios')); },
  studentPhotoHtml(s) {
    State.fotos = State.fotos || {};
    const src = State.fotos[s.id];
    if (s.fotoId && src === undefined) this.loadFoto(s);
    const img = src ? `<img src="${src}" alt="Foto de ${esc(s.name)}">` : `<span class="st-photo__ini" aria-hidden="true">${esc(String(s.name || '?').replace(/^[^,]*,\s*/, '').charAt(0) || s.name.charAt(0))}</span>`;
    return `<div class="st-photo" data-foto="${esc(String(s.id))}">
      <button type="button" class="st-photo__img" title="${src ? 'Ver la foto en grande' : s.fotoId ? 'Cargando foto...' : 'Sin foto'}" onclick="app.verFoto(${jsq(s.id)})">${img}</button>
      ${this.puedeFoto() ? `<button type="button" class="st-photo__cam" title="${s.fotoId ? 'Cambiar foto' : 'Agregar foto'}" aria-label="${s.fotoId ? 'Cambiar foto' : 'Agregar foto'} del estudiante" onclick="app.pickFoto(${jsq(s.id)})">${ico('camera')}</button>` : ''}
    </div>`;
  },
  async loadFoto(s) {
    State.fotos[s.id] = null; // en carga
    try {
      const r = await API.call('foto', { studentId: s.id });
      State.fotos[s.id] = r.base64 ? `data:${r.mimeType || 'image/jpeg'};base64,${r.base64}` : '';
    } catch (e) { State.fotos[s.id] = ''; }
    this.refreshFoto(s.id);
  },
  refreshFoto(id) {
    const s = State.rawStudents.find(x => sameId(x.id, id));
    if (!s) return;
    document.querySelectorAll(`[data-foto="${CSS.escape(String(id))}"]`).forEach(n => { const t = document.createElement('div'); t.innerHTML = this.studentPhotoHtml(s).trim(); n.replaceWith(t.firstElementChild); });
    icons();
  },
  verFoto(id) {
    const s = State.rawStudents.find(x => sameId(x.id, id));
    const src = (State.fotos || {})[id];
    if (!src) { if (this.puedeFoto()) this.pickFoto(id); return; }
    ui.modal({ title: this.clean(s.name), icon: 'image', size: 'md', hideOk: true, cancelText: 'Cerrar',
      body: `<div class="st-photo-big"><img src="${src}" alt="Foto de ${esc(s.name)}"></div><p class="muted small">${s.fotoFecha ? `Foto del ${fmtDate(s.fotoFecha)}${s.fotoPor ? `, cargada por ${esc(s.fotoPor)}` : ''}. ` : ''}Uso interno para identificar al estudiante.</p>
        ${this.puedeFoto() ? `<div class="row-actions"><button class="btn btn--sm" onclick="ui.close(); app.pickFoto(${jsq(id)})">${ico('camera')}Cambiar foto</button><button class="btn btn--sm btn--danger" onclick="app.quitarFoto(${jsq(id)})">${ico('trash-2')}Quitar foto</button></div>` : ''}` });
  },
  pickFoto(id) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { if (inp.files[0]) this.prepararFoto(id, inp.files[0]); };
    inp.click();
  },
  /** Reduce la imagen (máximo 480 px, JPEG) antes de subirla. */
  async prepararFoto(id, file) {
    if (!/^image\//.test(file.type)) return toast('Elija una imagen (JPG o PNG)', 'error');
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }).catch(() => null);
    URL.revokeObjectURL(url);
    if (!img) return toast('No se pudo leer la imagen', 'error');
    const max = 480, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', 0.82);
    const mini = this.miniDesde(img);
    const s = State.rawStudents.find(x => sameId(x.id, id));
    ui.modal({ title: 'Foto del estudiante', icon: 'camera', size: 'md', okText: 'Guardar foto',
      body: `<div class="st-photo-big"><img src="${data}" alt="Vista previa"></div>
        <p class="modal__msg"><strong>${esc(this.clean(s.name))}</strong>, ${esc(this.courseNameOf(s))}</p>
        <label class="check"><input type="checkbox" id="foto-ok"><span>Cuento con la autorización del apoderado(a) o del establecimiento para usar esta imagen solo con fines de identificación interna (Ley N° 21.719).</span></label>`,
      onOk: async () => {
        if (!el('foto-ok').checked) { toast('Confirme la autorización para usar la imagen', 'error'); return false; }
        try {
          const r = await API.call('subirFoto', { studentId: id, base64: data.split(',')[1], mini });
          Object.assign(s, { fotoId: r.fotoId, fotoFecha: r.fotoFecha, fotoPor: State.currentUser.name, fotoMini: mini });
          State.fotos[id] = data;
          this.refreshFoto(id);
          toast('Foto guardada');
        } catch (e) { toast(e.message, 'error'); return false; }
      } });
  },
  /** Miniatura cuadrada de 72 px (recorte centrado) para las listas. */
  miniDesde(img) {
    const t = 72, c = document.createElement('canvas');
    c.width = t; c.height = t;
    const lado = Math.min(img.width, img.height);
    c.getContext('2d').drawImage(img, (img.width - lado) / 2, Math.max(0, (img.height - lado) / 3), lado, lado, 0, 0, t, t);
    return c.toDataURL('image/jpeg', 0.72);
  },
  /** Miniatura en el directorio: foto pequeña o la inicial del nombre. */
  miniFotoHtml(s) {
    const ini = esc(String(s.name || '?').replace(/^[^,]*,\s*/, '').charAt(0) || '?');
    if (!s.fotoMini && s.fotoId && this.puedeFoto()) this.colaMini(s);
    return `<button type="button" class="st-mini" data-mini="${esc(String(s.id))}" title="Abrir la ficha de ${esc(s.name)}" aria-label="Abrir la ficha de ${esc(s.name)}" onclick="app.openStudent(${jsq(s.id)})">${s.fotoMini ? `<img src="${s.fotoMini}" alt="" loading="lazy">` : `<span>${ini}</span>`}</button>`;
  },
  /** Fotos subidas antes de existir las miniaturas: se generan de a una, en segundo plano. */
  colaMini(s) {
    State.miniCola = State.miniCola || [];
    State.miniHechas = State.miniHechas || new Set();
    if (State.miniHechas.has(String(s.id)) || State.miniCola.includes(String(s.id))) return;
    State.miniCola.push(String(s.id));
    if (!this._miniCorriendo) this.procesarMinis();
  },
  async procesarMinis() {
    this._miniCorriendo = true;
    while ((State.miniCola || []).length && State.miniHechas.size < 120) {
      const id = State.miniCola.shift();
      State.miniHechas.add(id);
      const s = State.rawStudents.find(x => sameId(x.id, id));
      if (!s || s.fotoMini || !s.fotoId) continue;
      try {
        const r = await API.call('foto', { studentId: id });
        if (!r.base64) continue;
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/jpeg;base64,${r.base64}`; });
        const mini = this.miniDesde(img);
        await DB.patch('students', id, { fotoMini: mini });
        s.fotoMini = mini;
        (State.fotos = State.fotos || {})[id] = `data:image/jpeg;base64,${r.base64}`;
        document.querySelectorAll(`[data-mini="${CSS.escape(id)}"]`).forEach(n => { n.innerHTML = `<img src="${mini}" alt="">`; });
      } catch (e) { /* se intentará en otra sesión */ }
    }
    this._miniCorriendo = false;
  },
  quitarFoto(id) {
    ui.confirm({ title: 'Quitar la foto', msg: '¿Quitar la foto de este estudiante? El archivo se envía a la papelera de Drive.', okText: 'Quitar foto', action: async () => {
      try {
        await API.call('quitarFoto', { studentId: id });
        const s = State.rawStudents.find(x => sameId(x.id, id));
        delete s.fotoId; delete s.fotoFecha; delete s.fotoPor; delete s.fotoMini;
        State.fotos[id] = '';
        this.refreshFoto(id);
        toast('Foto quitada');
      } catch (e) { toast(e.message, 'error'); }
    } });
  },

  // ---------------- 9. RESPALDO COMPLETO ----------------
  admin_respaldo() {
    return `<section class="panel">
      <div class="panel__head"><h2>${ico('hard-drive-download')}Descargar respaldo completo</h2></div>
      <p class="small">Descarga en un solo archivo toda la información registrada: estudiantes, entrevistas, acuerdos, protocolos, planes, certificados, documentos (sus datos y enlaces de Drive), DIA, fichas de traspaso, riesgos, reuniones de nivel, funcionarios (sin claves) y configuración.</p>
      <p class="note">${ico('shield-alert')}El archivo contiene datos personales y confidenciales de estudiantes (Ley N° 21.719). Guárdelo en un lugar seguro (por ejemplo, la unidad de Drive institucional) y no lo envíe por correo ni lo deje en computadores compartidos.</p>
      <button class="btn btn--primary" onclick="app.descargarRespaldo()">${ico('download')}Descargar respaldo (.json)</button>
    </section>
    <section class="panel">
      <div class="panel__head"><h2>${ico('hard-drive-upload')}Restaurar desde un respaldo</h2></div>
      <p class="small">Vuelve a subir un respaldo descargado desde aquí. <strong>No borra nada:</strong> agrega lo que falta y actualiza lo que existe. No modifica los registros de años cerrados y mantiene las claves de los funcionarios actuales.</p>
      <button class="btn" onclick="app.elegirRespaldo()">${ico('upload')}Elegir archivo de respaldo</button>
    </section>`;
  },
  async descargarRespaldo() {
    const done = ui.busy('Preparando el respaldo', 'Leyendo toda la información...');
    try {
      const r = await API.call('exportarTodo');
      const blob = new Blob([JSON.stringify(r)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `respaldo-trayectoria-escolar-${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      const total = Object.values(r.colecciones || {}).reduce((t, x) => t + (x || []).length, 0);
      notice({ type: 'success', title: 'Respaldo descargado', msg: `${total} registros en ${Object.keys(r.colecciones || {}).length} colecciones. Guárdelo en un lugar seguro.` });
    } catch (e) { notice({ type: 'error', title: 'No se pudo descargar el respaldo', msg: e.message }); }
    finally { done(); }
  },
  elegirRespaldo() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      let data;
      try { data = JSON.parse(await f.text()); } catch (e) { return notice({ type: 'error', title: 'Archivo no válido', msg: 'No es un respaldo de la plataforma.' }); }
      if (data.formato !== 'trayectoria-escolar-respaldo' || !data.colecciones) return notice({ type: 'error', title: 'Archivo no válido', msg: 'No es un respaldo descargado desde esta plataforma.' });
      State.respaldo = data;
      const filas = Object.entries(data.colecciones).map(([c, d]) => `<tr><td>${esc(c)}</td><td class="t-num num">${(d || []).length}</td></tr>`).join('');
      ui.modal({ title: 'Restaurar respaldo', icon: 'hard-drive-upload', tone: 'warn', size: 'md', okText: 'Restaurar',
        body: `<p class="modal__msg">Respaldo del <strong>${esc(String(data.fecha || '').replace('T', ' '))}</strong>${data.por ? `, descargado por ${esc(data.por)}` : ''}.</p>
          <div class="table-wrap"><table class="table table--dense"><thead><tr><th>Colección</th><th class="t-num">Registros</th></tr></thead><tbody>${filas}</tbody></table></div>
          <p class="note">${ico('info')}No se borra nada: se agregan los registros que faltan y se actualizan los existentes (salvo los de años cerrados).</p>
          ${fieldHtml('Para confirmar, escriba RESTAURAR', '<input id="resp-ok" class="input" autocomplete="off">')}`,
        onOk: () => this.restaurarRespaldo() });
    };
    inp.click();
  },
  async restaurarRespaldo() {
    if (String(el('resp-ok').value || '').trim().toUpperCase() !== 'RESTAURAR') { toast('Escriba RESTAURAR para confirmar', 'error'); return false; }
    const data = State.respaldo;
    ui.close();
    const done = ui.busy('Restaurando el respaldo', '');
    const res = {}, errores = [];
    try {
      for (const [col, docs] of Object.entries(data.colecciones)) {
        el('busy-msg').textContent = `${col}: ${(docs || []).length} registros`;
        try { Object.assign(res, (await API.call('restaurarTodo', { colecciones: { [col]: docs } })).resultado); }
        catch (e) { errores.push(`${col}: ${e.message}`); }
      }
      await DB.load();
      this.render();
      notice({ type: errores.length ? 'warn' : 'success', title: errores.length ? 'Respaldo restaurado en parte' : 'Respaldo restaurado', items: [...Object.entries(res).map(([c, r]) => `${c}: ${r.nuevos} nuevos, ${r.actualizados} actualizados${r.omitidos ? `, ${r.omitidos} sin cambios (años cerrados u otros)` : ''}`), ...errores] });
    } finally { done(); State.respaldo = null; }
  },

  // ---------------- 10. PORTADA: % DE ESTUDIANTES CON REGISTROS POR CURSO ----------------
  dashCourseData() {
    const studs = this.getStudents().filter(s => s.status !== 'blocked');
    const por = {};
    studs.forEach(s => {
      const c = this.countRecords(s);
      const b = por[s.curso] = por[s.curso] || { curso: s.curso, n: 0, con: 0, total: 0, conv: 0, pie: 0, proto: 0, obs: 0, enf: 0 };
      b.n++;
      if (c.total > 0) b.con++;
      ['total', 'conv', 'pie', 'proto', 'obs', 'enf'].forEach(k => { b[k] += c[k] || 0; });
    });
    const metric = State.dashMetric || 'pct';
    return Object.values(por).filter(b => b.n).map(b => ({ ...b, pct: Math.round(b.con / b.n * 1000) / 10, porEst: Math.round(b.total / b.n * 100) / 100, valor: metric === 'pct' ? Math.round(b.con / b.n * 1000) / 10 : Math.round(b.total / b.n * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor || (ALL_COURSES.indexOf(a.curso) - ALL_COURSES.indexOf(b.curso)));
  },
  setDashMetric(m) { State.dashMetric = m; this.renderDashboard(); },
  drawDashboardCharts() {
    if (!window.Chart) return;
    const canvas = el('chart-courses');
    if (!canvas) return;
    if (this.barC) this.barC.destroy();
    const panel = canvas.closest('.panel');
    panel.classList.add('dash-courses');
    const metric = State.dashMetric || 'pct';
    const head = panel.querySelector('.panel__head');
    head.innerHTML = `<h2>${metric === 'pct' ? 'Porcentaje de estudiantes con registros, por curso' : 'Registros por estudiante, por curso'}</h2>
      <div class="segs" role="group" aria-label="Medida del gráfico"><button type="button" class="seg" aria-pressed="${metric === 'pct'}" onclick="app.setDashMetric('pct')">% de estudiantes</button><button type="button" class="seg" aria-pressed="${metric === 'est'}" onclick="app.setDashMetric('est')">Registros por estudiante</button></div>`;
    const data = this.dashCourseData();
    const box = canvas.parentElement;
    box.style.height = `${Math.max(240, data.length * 30 + 50)}px`;
    let note = panel.querySelector('.dash-note');
    if (!note) { note = document.createElement('p'); note.className = 'dash-note muted small'; panel.appendChild(note); }
    note.textContent = metric === 'pct' ? 'Porcentaje de los estudiantes de cada curso que tienen al menos un registro (convivencia, PIE, protocolos, observaciones o enfermería). Así se comparan cursos con distinta matrícula. Pinche una barra para abrir el curso.' : 'Registros por estudiante, separados en Convivencia (incluye protocolos), PIE, y observaciones y enfermería. Se calcula dividiendo por la matrícula del curso, así se comparan cursos de distinto tamaño. Pinche una barra para abrir el curso.';
    const col = v => metric === 'pct' ? (v >= 50 ? '#b42318' : v >= 25 ? '#d18a14' : '#1f7a4d') : (v >= 2 ? '#b42318' : v >= 1 ? '#d18a14' : '#1f7a4d');
    const etiqueta = { id: 'dashLabels', afterDatasetsDraw(ch) {
      const { ctx } = ch;
      ctx.save();
      ctx.font = `600 11px ${cssVar('--font-body') || 'sans-serif'}`;
      ctx.fillStyle = cssVar('--color-ink') || '#222';
      ctx.textBaseline = 'middle';
      const ultimo = ch.data.datasets.length - 1;
      ch.getDatasetMeta(ultimo).data.forEach((bar, i) => { const d = data[i]; ctx.fillText(metric === 'pct' ? `${String(d.pct).replace('.', ',')} %  (${d.con} de ${d.n})` : `${String(d.porEst).replace('.', ',')}  (${d.total} registros)`, bar.x + 6, bar.y); });
      ctx.restore();
    } };
    // "Registros por estudiante": barras apiladas que separan Convivencia (incluye protocolos), PIE y otros registros
    const r2 = v => Math.round(v * 100) / 100;
    const apiladas = [
      ['Convivencia y protocolos', d => r2((d.conv + d.proto) / d.n), '#c0392b'],
      ['PIE', d => r2(d.pie / d.n), '#2f6fb3'],
      ['Observaciones y enfermería', d => r2((d.obs + d.enf) / d.n), '#8a8f98']
    ];
    const datasets = metric === 'pct'
      ? [{ data: data.map(d => d.valor), backgroundColor: data.map(d => col(d.valor)), borderRadius: 8, borderSkipped: false, barThickness: 18 }]
      : apiladas.map(([label, fn, color], j) => ({ label, data: data.map(fn), backgroundColor: color, stack: 's', barThickness: 18, borderRadius: j === apiladas.length - 1 ? { topRight: 8, bottomRight: 8 } : 0, borderSkipped: false }));
    this.barC = new Chart(canvas, {
      type: 'bar',
      data: { labels: data.map(d => d.curso), datasets },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, layout: { padding: { right: 130 } },
        scales: { x: { stacked: metric !== 'pct', min: 0, max: metric === 'pct' ? 100 : undefined, grid: { color: cssVar('--color-rule') }, ticks: { callback: v => metric === 'pct' ? `${v}%` : v } }, y: { stacked: metric !== 'pct', grid: { display: false }, ticks: { font: { weight: '600' } } } },
        plugins: { legend: { display: metric !== 'pct', position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 10 } },
          tooltip: { callbacks: { label: c => { const d = data[c.dataIndex]; return metric === 'pct' ? [`${d.con} de ${d.n} estudiantes con registros (${String(d.pct).replace('.', ',')} %)`, `${d.total} registros: ${d.conv} convivencia, ${d.pie} PIE, ${d.proto} protocolos, ${d.obs} observaciones, ${d.enf} enfermería`] : `${c.dataset.label}: ${String(c.raw).replace('.', ',')} por estudiante`; }, footer: items => { if (metric === 'pct') return ''; const d = data[items[0].dataIndex]; return `Total: ${String(d.porEst).replace('.', ',')} por estudiante (${d.total} registros, ${d.n} estudiantes)\nConvivencia ${d.conv} · Protocolos ${d.proto} · PIE ${d.pie} · Observaciones ${d.obs} · Enfermería ${d.enf}`; } } } },
        onHover: (e, items) => { e.native.target.style.cursor = items[0] ? 'pointer' : 'default'; },
        onClick: (e, items) => { if (items.length) app.openCourse(data[items[0].index].curso); }
      },
      plugins: [etiqueta]
    });
    // Ciclos: dona con el total al centro
    const pc = el('chart-cycles');
    if (pc && this.pieC) {
      const labels = this.pieC.data.labels.slice(), valores = this.pieC.data.datasets[0].data.slice();
      const total = valores.reduce((a, b) => a + b, 0);
      const colores = ['#7c5cc4', '#d18a14', '#1f7a4d', '#2f6fb3', '#8a8f98'];
      this.pieC.destroy();
      pc.closest('.panel')?.classList.add('dash-cycles');
      const font = cssVar('--font-body') || 'sans-serif';
      this.pieC = new Chart(pc, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: valores, backgroundColor: colores, borderWidth: 0, borderRadius: 6, spacing: 3 }] },
        options: { maintainAspectRatio: false, cutout: '68%',
          plugins: {
            legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 10, padding: 14, generateLabels: ch => labels.map((l, i) => ({ text: `${l}: ${valores[i]} (${total ? Math.round(valores[i] / total * 100) : 0} %)`, fillStyle: colores[i], strokeStyle: 'transparent', pointStyle: 'circle', index: i })) } },
            tooltip: { callbacks: { label: c => `${c.label}: ${c.raw} (${total ? Math.round(c.raw / total * 100) : 0} %)` } }
          } },
        plugins: [{ id: 'centro', afterDraw(ch) { const { ctx, chartArea: a } = ch; const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2; ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = cssVar('--color-heading') || '#222'; ctx.font = `700 26px ${font}`; ctx.fillText(total, x, y - 2); ctx.font = `500 11px ${font}`; ctx.fillStyle = cssVar('--color-muted') || '#666'; ctx.fillText('registros', x, y + 16); ctx.restore(); } }]
      });
    }
  }
});

// ---------------- 5. REVISIÓN DE DATOS PIE ----------------
Object.assign(app, {
  /** Revisa que todo plan o documento PIE quede en la ficha de un estudiante vigente. */
  pieRevision() {
    const ids = new Map(State.rawStudents.map(s => [String(s.id), s]));
    const planes = State.rawInclusionReports.filter(r => this.planArea(r) === 'PIE');
    const docs = State.rawEvidences.filter(e => this.evArea(e) === 'PIE');
    const sinFicha = [...planes.map(r => ({ tipo: 'Plan', nombre: r.type || r.titulo || 'Plan PIE', quien: r.studentName || '', id: r.studentId })), ...docs.map(e => ({ tipo: 'Documento', nombre: e.fileName || e.type || 'Documento', quien: e.studentName || '', id: e.studentId }))].filter(x => !x.id || !ids.has(String(x.id)));
    const retirados = new Set([...planes, ...docs].map(x => String(x.studentId)).filter(id => ids.get(id)?.status === 'blocked'));
    const porDoc = new Set(docs.filter(e => !e.area).map(e => String(e.studentId)));
    const porEquipo = this.getStudents().filter(s => s.status !== 'blocked' && (s.history || []).some(h => this.recordCategory(h) === 'pie') && !(this.pieIndex().get(String(s.id))?.plans || this.pieIndex().get(String(s.id))?.docs));
    return { planes: planes.length, docs: docs.length, sinFicha, retirados: retirados.size, porDoc: porDoc.size, porEquipo };
  },
  pieRevisionHtml() {
    const r = this.pieRevision();
    return `<details class="panel pie-rev" ${r.sinFicha.length ? 'open' : ''}><summary><strong>${ico('shield-check')}Revisión de datos PIE</strong> <span class="muted small">${r.planes} plan(es) y ${r.docs} documento(s) PIE${r.sinFicha.length ? ` · ${r.sinFicha.length} sin ficha` : ' · todos en la ficha de un estudiante'}</span></summary>
      <ul class="pie-rev__list">
        <li data-ok="${!r.sinFicha.length}">${r.sinFicha.length ? `<strong>${r.sinFicha.length} plan(es) o documento(s) PIE no están en la ficha de ningún estudiante de la nómina</strong> (el estudiante no existe, cambió su identificador o no se asignó). Vuelva a vincularlos desde "Cargar planes" o "Vincular carpetas de Drive":<ul>${r.sinFicha.slice(0, 30).map(x => `<li>${esc(x.tipo)}: ${esc(x.nombre)}${x.quien ? ` (${esc(x.quien)})` : ''}</li>`).join('')}</ul>` : 'Todos los planes y documentos PIE están en la ficha de un estudiante.'}</li>
        <li data-ok="true">${r.porDoc} estudiante(s) se reconocen como PIE por documentos subidos sin área (por ejemplo "Informe PIE", "PACI", "evaluación psicopedagógica"); ahora también se cuentan.</li>
        <li data-ok="true">${r.porEquipo.length} estudiante(s) se reconocen como PIE solo por intervenciones de funcionarios del Equipo PIE (perfil o cargo PIE, inclusión, integración, diferencial, fonoaudiología o psicopedagogía), aún sin plan ni documentos cargados${r.porEquipo.length ? `: ${r.porEquipo.slice(0, 20).map(s => esc(this.clean(s.name))).join(', ')}` : ''}.</li>
        ${r.retirados ? `<li data-ok="true">${r.retirados} estudiante(s) con información PIE están retirados o egresados: no aparecen en la lista, pero su información se conserva en la ficha.</li>` : ''}
      </ul></details>`;
  }
});

// ---------------- INTEGRACIÓN ----------------
(() => {
  const pie = app.renderPie;
  if (pie) app.renderPie = function () {
    pie.call(this);
    if ((State.pieView?.area || 'PIE') === 'PIE' && !this.isQuickOnly()) { el('pie-list').insertAdjacentHTML('beforeend', this.pieRevisionHtml()); icons(); }
  };
  // Portada
  const dash = app.renderDashboard;
  app.renderDashboard = function () { dash.call(this); this.drawDashboardCharts(); };
  // Registro rápido: botones de carga masiva
  const quick = app.renderQuick;
  app.renderQuick = function () {
    quick.call(this);
    el('quick-controls').insertAdjacentHTML('beforeend', `<div class="quick-bulk">
      <button type="button" class="btn" onclick="app.openBulkAbsences()">${ico('list-checks')}Inasistencias o atrasos de varios estudiantes</button>
      ${this.quickCanImport() ? `<button type="button" class="btn" onclick="app.openAttendanceImport()">${ico('file-spreadsheet')}Subir Excel de inasistencias del curso</button>` : ''}
    </div>`);
    icons();
  };
  // Aviso al cambiar el correo de un funcionario
  const save = DB.save.bind(DB);
  DB.save = async function (col, doc, merge = false) {
    const antes = col === 'users' && doc && doc.email !== undefined ? (State.users || []).find(u => sameId(u.id, doc.id)) : null;
    const r = await save(col, doc, merge);
    if (antes && antes.email && String(antes.email).toLowerCase() !== String(doc.email || '').toLowerCase()) {
      notice({ type: 'info', title: 'Correo actualizado', msg: `${antes.name} ya no puede ingresar con ${antes.email}. Sus sesiones abiertas se cerraron y debe ingresar con ${doc.email || 'su nuevo correo'}.` });
    }
    return r;
  };
  // Foto también en el resumen lateral de la entrevista
  const ivp = app.renderInterviewPanel;
  if (ivp) app.renderInterviewPanel = function () {
    ivp.call(this);
    const p = el('interview-panel');
    const s = p && !p.hidden ? this.getStudent(p.dataset.student) : null;
    const head = p?.querySelector('.iv-head > div');
    if (s && head && !head.querySelector('.st-photo')) { head.insertAdjacentHTML('afterbegin', this.studentPhotoHtml(s)); head.classList.add('iv-head--foto'); icons(); }
  };
  // Pestaña "Respaldo" en Administración
  const admin = app.renderAdmin;
  app.renderAdmin = function () {
    admin.call(this);
    if (!(hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema'))) return;
    const tabs = el('admin-tabs');
    if (tabs && !tabs.querySelector('[data-resp-tab]')) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.className = 'tab'; b.dataset.respTab = '1';
      b.setAttribute('aria-selected', State.adminTab === 'respaldo');
      b.innerHTML = `${ico('hard-drive-download')}Respaldo`;
      b.onclick = () => this.setAdminTab('respaldo');
      tabs.appendChild(b);
      icons();
    }
  };
  // Modo demostración: mismas acciones que el servidor
  const dh = Demo.handle.bind(Demo);
  Demo.handle = function (action, p) {
    if (!this.db) this.seed();
    const db = this.db, clone = v => JSON.parse(JSON.stringify(v));
    switch (action) {
      case 'registrarInasistencias': {
        const field = p.kind === 'atraso' ? 'atrasos' : 'inasistencias', reg = [];
        db.students.forEach(s => { if (!p.studentIds.map(String).includes(String(s.id))) return; if (p.kind !== 'atraso' && (s.registroAsistencia || []).some(r => r.fecha === p.date && r.tipo === 'inasistencia')) return; s[field] = (parseInt(s[field]) || 0) + 1; s.registroAsistencia = [...(s.registroAsistencia || []), { fecha: p.date, tipo: p.kind, detalle: p.detail, por: State.currentUser?.name, masivo: true }]; reg.push(String(s.id)); });
        return { registrados: reg, omitidos: p.studentIds.length - reg.length };
      }
      case 'subirFoto': { db.fotos = db.fotos || {}; const s = db.students.find(x => sameId(x.id, p.studentId)); const id = 'foto_' + Date.now(); db.fotos[id] = p.base64; Object.assign(s, { fotoId: id, fotoFecha: today(), fotoPor: State.currentUser?.name, fotoMini: p.mini }); return { fotoId: id, fotoFecha: today() }; }
      case 'foto': { const s = db.students.find(x => sameId(x.id, p.studentId)); return { base64: (s && db.fotos && db.fotos[s.fotoId]) || '', mimeType: 'image/jpeg' }; }
      case 'quitarFoto': { const s = db.students.find(x => sameId(x.id, p.studentId)); if (s) { delete s.fotoId; delete s.fotoFecha; delete s.fotoMini; } return { ok: true }; }
      case 'reunionPin': {
        const r = (db.reuniones || []).find(x => x.estado === 'abierta' && x.pinActivo && String(x.pin) === String(p.pin).replace(/\D/g, ''));
        if (!r) throw new Error('PIN no válido, o la reunión ya fue cerrada.');
        const u = State.currentUser, hora = new Date().toTimeString().slice(0, 5);
        const q = (r.participantes || []).find(x => sameId(x.userId, u.id));
        if (q) Object.assign(q, { presente: true, via: 'pin', hora }); else (r.participantes = r.participantes || []).push({ id: 'u' + u.id, userId: String(u.id), nombre: u.name, cargo: u.customRole || u.role, presente: true, via: 'pin', hora });
        return { reunionId: r.id, course: r.course, fecha: r.fecha };
      }
      case 'exportarTodo': return { formato: 'trayectoria-escolar-respaldo', version: 1, fecha: new Date().toISOString().slice(0, 16), por: State.currentUser?.name, colecciones: clone({ ...Object.fromEntries(Object.keys(STORE).map(c => [c, db[c] || []])), variables: [db.variables] }) };
      case 'restaurarTodo': {
        const out = {};
        Object.entries(p.colecciones).forEach(([col, docs]) => {
          if (col === 'variables') { out[col] = { nuevos: 0, actualizados: 1, omitidos: 0 }; return; }
          db[col] = db[col] || []; const r = { nuevos: 0, actualizados: 0, omitidos: 0 };
          docs.forEach(d => { const i = db[col].findIndex(x => sameId(x.id, d.id)); if (i > -1 && db[col][i].anioArchivo) { r.omitidos++; return; } if (i > -1) { db[col][i] = { ...db[col][i], ...d }; r.actualizados++; } else { db[col].push(clone(d)); r.nuevos++; } });
          out[col] = r;
        });
        return { resultado: out };
      }
    }
    return dh(action, p);
  };
})();
