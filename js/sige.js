'use strict';
// =====================================================================
// LISTAS DE CURSO DEL SIGE
// Se suben uno o varios PDF "Lista de Curso" del SIGE. El sistema detecta
// el curso, compara con la nómina de la plataforma y propone: estudiantes
// nuevos, cambios de curso, datos actualizados y RETIROS (que el
// funcionario confirma uno a uno). Todo se puede deshacer.
// =====================================================================
Object.assign(app, {
  canSige() { return hasAccess('editar_fichas') || hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema'); },
  isoDeFecha(d) { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; },

  openSigeImport() {
    ui.modal({
      title: 'Actualizar nómina con listas del SIGE', icon: 'list-checks', tone: 'conv', size: 'md', hideOk: true, cancelText: 'Cerrar',
      body: `<div class="stack">
        <p class="modal__msg">Suba las <strong>Listas de Curso</strong> descargadas del SIGE (PDF). Puede subir varias a la vez, de distintos cursos. El sistema compara cada lista con la nómina de la plataforma y le mostrará los estudiantes nuevos, los cambios de curso y <strong>los retirados, para que usted confirme</strong> antes de guardar.</p>
        <div id="sige-drop" class="drop-zone" tabindex="0" role="button" aria-label="Arrastre aquí las listas del SIGE o presione para elegirlas">${ico('file-up')}<strong>Arrastre aquí las listas del SIGE</strong><span class="muted small">o presione para elegir los archivos</span></div>
        <p class="note">${ico('info')}En el SIGE: Matrícula → Lista de curso → Imprimir/Descargar en PDF.</p>
      </div>`
    });
    const z = el('sige-drop'), pick = () => { ui.close(); this.pickFiles({ accept: '.pdf,application/pdf', onPick: f => this.handleSigeFiles(f) }); };
    z.onclick = pick;
    z.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    z.ondragover = e => { e.preventDefault(); z.classList.add('is-over'); };
    z.ondragleave = () => z.classList.remove('is-over');
    z.ondrop = e => { e.preventDefault(); const f = [...(e.dataTransfer.files || [])]; ui.close(); this.handleSigeFiles(f); };
  },
  /** Lee una "Lista de Curso" del SIGE. */
  parseSige(lines, fileName) {
    const t = lines.join('\n');
    const cursoLinea = (t.match(/Curso\s*:\s*([^\n]+)/i) || [])[1] || '';
    let course = '';
    const m = cursoLinea.match(/(\d{1,2})\s*°?\s*(b[aá]sico|medio)\s*([A-Z])\b/i);
    if (m) course = this.courseFromText(`${m[1]} ${/medio/i.test(m[2]) ? 'MEDIO' : 'BASICO'} ${m[3]}`);
    if (!course && /kinder|kínder|transici/i.test(cursoLinea)) course = this.courseFromText(/pre|primer nivel|nt1/i.test(cursoLinea) ? 'PRE KINDER' : 'KINDER');
    if (!course) { const f = String(fileName).match(/-(\d{3})-(\d{1,2})-([A-Z])/i); if (f) course = this.courseFromText(`${f[2]} ${+f[1] >= 300 ? 'MEDIO' : 'BASICO'} ${f[3]}`); }
    const profJefe = ((t.match(/Profesor\s+Jefe\s*:\s*([^\n]+)/i) || [])[1] || '').trim();
    const filas = [];
    lines.forEach(l => {
      const r = l.match(/^(\d{1,3})\s+(\d{6,9}-[\dkK])\s+(.+?)\s+(\d{1,2})\s+(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
      if (!r) return;
      const resto = r[6] || '';
      const ret = resto.match(/RET\.?\s*(\d{2}\/\d{2}\/\d{4})/i);
      filas.push({ nl: +r[1], rut: r[2].toUpperCase(), clean: this.limpiarRut(r[2]), name: r[3].trim().replace(/\s+/g, ' '), edad: +r[4], fechaIngreso: this.isoDeFecha(r[5]), comuna: resto.replace(/RET\.?\s*\d{2}\/\d{2}\/\d{4}/i, '').trim(), retiro: ret ? this.isoDeFecha(ret[1]) : '' });
    });
    return { course, cursoLinea: cursoLinea.trim(), profJefe, filas };
  },
  async handleSigeFiles(files) {
    files = files.filter(f => /\.pdf$/i.test(f.name));
    if (!files.length) return notice({ type: 'error', title: 'No se cargó ninguna lista', msg: 'Elija las listas de curso del SIGE en PDF.' });
    const done = ui.busy('Leyendo listas del SIGE', '');
    const listas = [], errores = [];
    for (const [i, f] of files.entries()) {
      el('busy-msg').textContent = `${i + 1} de ${files.length}: ${f.name}`;
      try {
        const p = this.parseSige((await this.pdfPages(f)).lines, f.name);
        if (!p.filas.length) throw new Error('no parece una Lista de Curso del SIGE');
        listas.push({ file: f.name, ...p });
      } catch (e) { errores.push(`${f.name}: ${e.message}`); }
    }
    done();
    if (errores.length) notice({ type: listas.length ? 'warn' : 'error', title: 'Algunas listas no se pudieron leer', items: errores });
    if (!listas.length) return;
    State.sige = listas.map(l => this.sigeDiff(l));
    ui.modal({ title: `Revisar listas del SIGE (${listas.length})`, icon: 'list-checks', tone: 'conv', size: 'xl', okText: 'Guardar cambios confirmados', body: '<div id="sige-review"></div>', onOk: () => this.saveSige() });
    this.renderSige();
  },
  /** Compara la lista del SIGE con la nómina del curso en la plataforma. */
  sigeDiff(l) {
    const porRut = new Map(State.rawStudents.filter(s => s.rut).map(s => [this.limpiarRut(s.rut), s]));
    const enCurso = State.rawStudents.filter(s => this.courseNameOf(s) === l.course);
    const nuevos = [], cambioCurso = [], retiros = [], reincorporar = [], actualizar = [];
    l.filas.forEach(f => {
      const s = porRut.get(f.clean);
      if (!s) { if (!f.retiro) nuevos.push({ ...f, ok: true }); return; }
      const activo = s.status !== 'blocked';
      if (f.retiro && activo) { retiros.push({ s, f, ok: true }); return; }
      if (!f.retiro && !activo && this.courseNameOf(s) === l.course) { reincorporar.push({ s, f, ok: true }); return; }
      if (!f.retiro && this.courseNameOf(s) !== l.course) { cambioCurso.push({ s, f, desde: this.courseNameOf(s), ok: true }); return; }
      const cambios = {};
      if (this.clean(s.name).toUpperCase() !== f.name.toUpperCase()) cambios.name = f.name;
      if (f.fechaIngreso && s.fechaIngreso !== f.fechaIngreso) cambios.fechaIngreso = f.fechaIngreso;
      if (f.comuna && s.comuna !== f.comuna) cambios.comuna = f.comuna;
      if (Object.keys(cambios).length) actualizar.push({ s, cambios, ok: true });
    });
    const enLista = new Set(l.filas.map(f => f.clean));
    // Activos en la plataforma que no aparecen en la lista: no se retiran solos, se preguntan
    const ausentes = enCurso.filter(s => s.status !== 'blocked' && !(s.rut && enLista.has(this.limpiarRut(s.rut)))).map(s => ({ s, ok: false }));
    return { ...l, nuevos, cambioCurso, retiros, reincorporar, actualizar, ausentes, actualizarProf: !!(l.profJefe && l.course && l.profJefe !== this.profJefeOf(l.course)) };
  },
  renderSige() {
    const fila = (li, grupo, k, x, texto, extra = '') => `<label class="check sige-item ${grupo === 'retiros' || grupo === 'ausentes' ? 'sige-item--retiro' : ''}"><input type="checkbox" ${x.ok ? 'checked' : ''} onchange="State.sige[${li}].${grupo}[${k}].ok=this.checked"><span>${texto}${extra ? ` <span class="muted small">${extra}</span>` : ''}</span></label>`;
    const sec = (titulo, icon, tone, items, cuerpo, nota = '') => items.length ? `<div class="sige-sec" data-tone="${tone}"><h4>${ico(icon)}${titulo} (${items.length})</h4>${nota ? `<p class="muted small">${nota}</p>` : ''}${cuerpo}</div>` : '';
    el('sige-review').innerHTML = `<div class="stack">${State.sige.map((l, li) => `<article class="iv-block">
      <div class="iv-form__top"><strong>${esc(l.file)}</strong>
        ${fieldHtml('Curso', `<select class="input" onchange="State.sige[${li}]=app.sigeDiff({ ...State.sige[${li}], course: this.value }); app.renderSige()"><option value="">Elija el curso (SIGE: ${esc(l.cursoLinea)})</option>${options(ALL_COURSES.map(c => [c, c]), l.course)}</select>`, 'field--inline')}</div>
      <div class="chips">${chip(`${l.filas.length} en la lista del SIGE`, 'neutral')}${chip(`${l.filas.filter(f => f.retiro).length} con retiro en el SIGE`, 'warn')}</div>
      ${!l.course ? `<p class="note">${ico('alert-triangle')}Elija el curso para comparar.</p>` : `
      ${sec('Retirados según el SIGE: confirme cada uno', 'user-minus', 'proto', l.retiros, l.retiros.map((x, k) => fila(li, 'retiros', k, x, esc(x.s.name), `retiro el ${fmtDate(x.f.retiro)}`)).join(''), 'Quedarán como retirados (su información se conserva y se puede revertir). Desmarque los que no correspondan.')}
      ${sec('No aparecen en la lista del SIGE', 'user-x', 'warn', l.ausentes, l.ausentes.map((x, k) => fila(li, 'ausentes', k, x, esc(x.s.name), x.s.rut ? `RUN ${esc(x.s.rut)}` : 'sin RUN en la plataforma')).join(''), 'Pueden haberse retirado, cambiado de curso o tener el RUN mal registrado. Marque solo los que quiera dejar como retirados.')}
      ${sec('Estudiantes nuevos', 'user-plus', 'conv', l.nuevos, l.nuevos.map((x, k) => fila(li, 'nuevos', k, x, esc(x.name), `${esc(x.rut)} · incorporación ${fmtDate(x.fechaIngreso)}`)).join(''))}
      ${sec('Cambian a este curso', 'arrow-right-left', 'obs', l.cambioCurso, l.cambioCurso.map((x, k) => fila(li, 'cambioCurso', k, x, esc(x.s.name), `desde ${esc(x.desde)}`)).join(''))}
      ${sec('Vuelven a estar activos (reincorporados)', 'user-check', 'conv', l.reincorporar, l.reincorporar.map((x, k) => fila(li, 'reincorporar', k, x, esc(x.s.name), 'figura sin retiro en el SIGE')).join(''))}
      ${sec('Datos actualizados', 'refresh-cw', 'neutral', l.actualizar, l.actualizar.map((x, k) => fila(li, 'actualizar', k, x, esc(x.s.name), Object.keys(x.cambios).map(c => ({ name: 'nombre', fechaIngreso: 'fecha de incorporación', comuna: 'comuna' })[c]).join(', '))).join(''))}
      ${l.actualizarProf ? `<label class="check"><input type="checkbox" checked onchange="State.sige[${li}].actualizarProf=this.checked"><span>Actualizar profesor(a) jefe a <strong>${esc(l.profJefe)}</strong></span></label>` : ''}
      ${!l.retiros.length && !l.ausentes.length && !l.nuevos.length && !l.cambioCurso.length && !l.reincorporar.length && !l.actualizar.length ? `<p class="note">${ico('check-circle')}La nómina de la plataforma ya coincide con el SIGE.</p>` : ''}`}
    </article>`).join('')}</div>`;
    icons();
  },
  async saveSige() {
    const ops = [], deshacer = [], resumen = { retirados: [], nuevos: 0, cambios: 0, reinc: 0, act: 0 };
    const hoy = today(), por = State.currentUser.name;
    const prev = s => ({ col: 'students', id: String(s.id), data: { status: s.status || 'active', curso: s.curso || '', courseId: s.courseId || '', fechaRetiro: s.fechaRetiro || '', motivoRetiro: s.motivoRetiro || '', name: s.name, fechaIngreso: s.fechaIngreso || '', comuna: s.comuna || '' }, merge: true });
    const hist = (s, accion) => [...(s.historialMatricula || []), { fecha: hoy, accion, por, fuente: 'SIGE' }];
    State.sige.filter(l => l.course).forEach(l => {
      l.retiros.filter(x => x.ok).forEach(({ s, f }) => { deshacer.push(prev(s)); ops.push({ col: 'students', id: String(s.id), data: { status: 'blocked', fechaRetiro: f.retiro || hoy, motivoRetiro: 'Retiro registrado en el SIGE', historialMatricula: hist(s, 'Retiro (SIGE)') }, merge: true }); resumen.retirados.push(this.clean(s.name)); });
      l.ausentes.filter(x => x.ok).forEach(({ s }) => { deshacer.push(prev(s)); ops.push({ col: 'students', id: String(s.id), data: { status: 'blocked', fechaRetiro: hoy, motivoRetiro: 'No figura en la lista del SIGE', historialMatricula: hist(s, 'Retiro: no figura en la lista del SIGE') }, merge: true }); resumen.retirados.push(this.clean(s.name)); });
      l.nuevos.filter(x => x.ok).forEach(x => { ops.push({ col: 'students', id: x.clean, data: { id: x.clean, rut: x.rut, name: x.name, curso: l.course, courseId: l.course, status: 'active', fechaIngreso: x.fechaIngreso, comuna: x.comuna, historialMatricula: [{ fecha: hoy, accion: 'Ingreso (SIGE)', por, fuente: 'SIGE' }] } }); deshacer.push({ crear: x.clean }); resumen.nuevos++; });
      l.cambioCurso.filter(x => x.ok).forEach(({ s, f, desde }) => { deshacer.push(prev(s)); ops.push({ col: 'students', id: String(s.id), data: { curso: l.course, courseId: l.course, status: 'active', fechaIngreso: f.fechaIngreso || s.fechaIngreso || '', historialMatricula: hist(s, `Cambio de curso desde ${desde} (SIGE)`) }, merge: true }); resumen.cambios++; });
      l.reincorporar.filter(x => x.ok).forEach(({ s }) => { deshacer.push(prev(s)); ops.push({ col: 'students', id: String(s.id), data: { status: 'active', fechaReincorporacion: hoy, historialMatricula: hist(s, 'Reincorporación (SIGE)') }, merge: true }); resumen.reinc++; });
      l.actualizar.filter(x => x.ok).forEach(({ s, cambios }) => { deshacer.push(prev(s)); ops.push({ col: 'students', id: String(s.id), data: cambios, merge: true }); resumen.act++; });
    });
    const profes = State.sige.filter(l => l.course && l.actualizarProf);
    if (!ops.length && !profes.length) { notice({ type: 'success', title: 'Sin cambios', msg: 'No había cambios confirmados para guardar.' }); return true; }
    const done = ui.busy('Actualizando nómina', `${ops.length} cambio(s)...`);
    try {
      if (ops.length) await DB.batch(ops);
      for (const l of profes) await this.updateProfJefe(l.course, l.profJefe);
    } catch (e) { done(); notice({ type: 'error', title: 'No se actualizó la nómina', msg: e.message }); return false; }
    done();
    State.sigeUndo = deshacer;
    notice({
      type: 'success', title: 'Nómina actualizada con el SIGE',
      msg: resumen.retirados.length ? 'Los retirados siguen visibles con la casilla "Ver retirados" y quedan marcados con otro color.' : '',
      items: [resumen.retirados.length ? `Retirados (${resumen.retirados.length}): ${resumen.retirados.join(', ')}` : '', resumen.nuevos ? `Estudiantes nuevos: ${resumen.nuevos}` : '', resumen.cambios ? `Cambios de curso: ${resumen.cambios}` : '', resumen.reinc ? `Reincorporados: ${resumen.reinc}` : '', resumen.act ? `Datos actualizados: ${resumen.act}` : '', profes.length ? `Profesor(a) jefe actualizado en ${profes.length} curso(s)` : ''].filter(Boolean),
      actions: [['Deshacer esta actualización', () => this.undoSige()]]
    });
    this.render();
    return true;
  },
  /** Revierte la última actualización con el SIGE (estado, curso y datos anteriores; quita los nuevos). */
  undoSige() {
    const u = State.sigeUndo || [];
    if (!u.length) return notice({ type: 'warn', title: 'No hay nada que deshacer' });
    ui.confirm({ title: 'Deshacer actualización del SIGE', icon: 'undo-2', tone: 'warn', okText: 'Sí, deshacer', msg: `Se devolverán ${u.filter(x => !x.crear).length} estudiante(s) a su estado anterior y se quitarán ${u.filter(x => x.crear).length} estudiante(s) agregados.`, action: async () => {
      const ops = u.filter(x => !x.crear);
      if (ops.length) await DB.batch(ops);
      for (const x of u.filter(x => x.crear)) { try { await DB.remove('students', x.crear); } catch (e) { /* ya no existe */ } }
      State.sigeUndo = null;
      notice({ type: 'success', title: 'Actualización deshecha', msg: 'La nómina volvió a como estaba antes de cargar las listas del SIGE.' });
      this.render();
    } });
  }
});
