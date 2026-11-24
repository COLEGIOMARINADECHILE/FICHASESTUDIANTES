'use strict';
// =====================================================================
// CARGAS MASIVAS: inasistencias desde Excel, matrícula desde PDF/Excel
// y migración de los datos antiguos de Firebase a Google Sheets.
// =====================================================================
Object.assign(app, {
  normalizarTexto: t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase(),
  limpiarRut: r => String(r || '').replace(/[^0-9Kk]/g, '').toUpperCase(),

  // "ÁLVAREZ PEÑA, SOFÍA ARACELI ÁLVAREZ" -> "ÁLVAREZ PEÑA SOFÍA ARACELI" (quita el apellido repetido al final)
  nombreDesdeExcel(raw) {
    const txt = String(raw || '').replace(/\s+/g, ' ').trim();
    const i = txt.indexOf(',');
    if (i < 0) return txt;
    const apellidos = txt.slice(0, i).trim();
    let resto = txt.slice(i + 1).trim();
    const palabras = apellidos.split(' ');
    for (let k = palabras.length - 1; k >= 1; k--) {
      const pref = palabras.slice(0, k).join(' ');
      if (this.normalizarTexto(resto).endsWith(' ' + this.normalizarTexto(pref))) { resto = resto.split(' ').slice(0, -pref.split(' ').length).join(' '); break; }
    }
    return `${apellidos} ${resto}`.trim();
  },

  /** Texto de un PDF, línea por línea (agrupa por altura y ordena de izquierda a derecha). */
  async pdfText(file) {
    const pdfLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    if (!pdfLib) throw new Error('La biblioteca PDF.js no está cargada.');
    pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const items = (await (await pdf.getPage(i)).getTextContent()).items.filter(it => String(it.str).trim() !== '');
      const rows = [];
      items.forEach(it => {
        const y = it.transform[5];
        const row = rows.find(r => Math.abs(r.y - y) <= 3);
        if (row) row.items.push(it); else rows.push({ y, items: [it] });
      });
      rows.sort((a, b) => b.y - a.y).forEach(r => { text += r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str.trim()).join(' ') + '\n'; });
      text += '\n';
    }
    return text;
  },

  // ---------------- INASISTENCIAS MENSUALES (EXCEL) ----------------
  openAttendanceImport() {
    const pick = () => { const inp = el('attendance-file-input'); inp.value = ''; inp.click(); };
    const course = State.currentView === 'students' ? State.filterCourse : '';
    if (!course) return pick();
    ui.modal({
      title: 'Cargar inasistencias del curso', icon: 'file-spreadsheet', tone: 'obs', size: 'sm', okText: 'Elegir archivo Excel',
      body: `<p class="modal__msg">Va a cargar las inasistencias del curso</p><p class="course-banner">${esc(course)}</p><p class="modal__msg">Seleccione el informe de inasistencias de <strong>${esc(course)}</strong>. Antes de guardar podrá revisar los datos, y se le avisará si el archivo corresponde a otro curso.</p>`,
      onOk: () => { pick(); }
    });
  },

  async handleAttendanceExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.XLSX) return toast('No se pudo cargar el lector de Excel. Revise su conexión a internet.', 'error');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true });
      const N = t => this.normalizarTexto(t);
      let cursoExcel = '';
      for (const f of filas) {
        const i = f.findIndex(c => /^curso\s*:?$/i.test(String(c).trim()));
        if (i >= 0) { cursoExcel = String(f.slice(i + 1).find(x => String(x).trim() !== '') || '').trim(); break; }
      }
      const hIdx = filas.findIndex(f => f.some(c => N(c).replace(/ /g, '') === 'RUN'));
      if (hIdx < 0) return toast('No se encontró la columna R.U.N. en el Excel', 'error');
      const H = filas[hIdx];
      const colRut = H.findIndex(c => N(c).replace(/ /g, '') === 'RUN');
      const colNombre = H.findIndex(c => N(c).startsWith('ALUMNO'));
      const colMes = {};
      H.forEach((c, i) => {
        const n = N(c);
        const m = MESES.find(x => n === N(x) || n.startsWith(N(x) + ' ') || n === N(MESES_NOMBRE[x]));
        if (m && colMes[m] === undefined) colMes[m] = i;
      });
      const colTotal = H.findIndex(c => !String(c).includes('%') && ['INAS', 'TOTAL', 'INASISTENCIAS'].includes(N(c)));
      if (!Object.keys(colMes).length) return toast('No se encontraron columnas de meses en el Excel', 'error');

      const curso = ALL_COURSES.find(c => N(c) === N(cursoExcel)) || State.filterCourse || el('upload-course-select')?.value || '';
      const registros = [];
      for (let i = hIdx + 1; i < filas.length; i++) {
        const f = filas[i];
        const rut = this.limpiarRut(f[colRut]);
        if (rut.length < 7) continue;
        const meses = {};
        let suma = 0;
        MESES.forEach(m => { const v = colMes[m] !== undefined ? (parseInt(String(f[colMes[m]]).replace(',', '.')) || 0) : 0; meses[m] = v; suma += v; });
        const total = (colTotal >= 0 && String(f[colTotal]).trim() !== '') ? (parseInt(f[colTotal]) || 0) : suma;
        const nombre = this.nombreDesdeExcel(colNombre >= 0 ? f[colNombre] : '');
        let est = State.rawStudents.find(x => this.limpiarRut(x.rut) === rut || String(x.id).toUpperCase() === rut);
        if (!est && nombre) est = State.rawStudents.find(x => N(x.name) === N(nombre));
        registros.push({ rut, rutOriginal: String(f[colRut]).trim(), nombre, meses, total, studentId: est ? String(est.id) : null });
      }
      if (!registros.length) return toast('No se encontraron estudiantes en el Excel', 'error');
      State.attendanceImport = { archivo: file.name, cursoExcel, curso, origen: State.currentView === 'students' ? State.filterCourse : '', registros, opts: { crear: true, mover: true, retirar: false } };
      ui.modal({ title: `Revisar inasistencias: ${curso || 'curso sin identificar'}`, icon: 'file-spreadsheet', tone: 'obs', size: 'xl', okText: 'Guardar inasistencias', body: '<div id="attendance-import-content"></div>', onOk: () => this.confirmAttendanceImport() });
      this.renderAttendanceImport();
    } catch (err) {
      console.error(err);
      toast('No fue posible leer el Excel. Verifique que sea el informe de inasistencias por curso.', 'error');
    }
  },

  renderAttendanceImport() {
    const imp = State.attendanceImport;
    if (!imp) return;
    const N = t => this.normalizarTexto(t);
    const destino = imp.curso || '';
    imp.registros.forEach(r => {
      if (!r.studentId) { r.estado = 'nuevo'; return; }
      const raw = State.rawStudents.find(x => sameId(x.id, r.studentId));
      r.cursoActual = raw ? this.courseNameOf(raw) : '';
      r.estado = destino && N(r.cursoActual) !== N(destino) ? 'otroCurso' : 'ok';
    });
    const nuevos = imp.registros.filter(r => r.estado === 'nuevo').length;
    const otro = imp.registros.filter(r => r.estado === 'otroCurso').length;
    const idsExcel = new Set(imp.registros.filter(r => r.studentId).map(r => r.studentId));
    const ausentes = destino ? State.rawStudents.filter(x => x.status !== 'blocked' && N(this.courseNameOf(x)) === N(destino) && !idsExcel.has(String(x.id))) : [];
    imp.ausentes = ausentes.map(x => String(x.id));
    const tag = r => r.estado === 'nuevo' ? chip('Nuevo: se agregará', 'warn') : r.estado === 'otroCurso' ? chip(`En ${r.cursoActual || 'otro curso'}`, 'plan') : chip('Registrado', 'conv');
    const opt = (id, k, n, tone, text, help) => `<label class="check check--card" data-tone="${tone}"><input type="checkbox" id="${id}" ${n === 0 ? 'disabled' : imp.opts[k] ? 'checked' : ''} onchange="State.attendanceImport.opts.${k}=this.checked"><span><strong>${text}</strong><span class="cell-sub">${help}</span></span></label>`;

    const excelCourse = ALL_COURSES.find(c => N(c) === N(imp.cursoExcel));
    const mismatch = imp.origen && excelCourse && N(excelCourse) !== N(imp.origen);
    el('attendance-import-content').innerHTML = `
      <p class="course-banner">${ico('school')}Curso de destino: ${esc(destino || 'sin elegir')}</p>
      ${mismatch ? `<p class="login__empty">${ico('alert-triangle')}<span><strong>Atención:</strong> usted abrió la carga desde ${esc(imp.origen)}, pero el archivo dice ${esc(excelCourse)}. Revise que sea el archivo correcto o cambie el curso de destino.</span></p>` : ''}`;
    el('attendance-import-content').innerHTML += `
      <div class="stats stats--5">
        <div class="stat"><span class="stat__num num">${imp.registros.length}</span><span class="stat__label">En el Excel</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${imp.registros.length - nuevos}</span><span class="stat__label">Registrados</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${nuevos}</span><span class="stat__label">Nuevos</span></div>
        <div class="stat" data-tone="plan"><span class="stat__num num">${otro}</span><span class="stat__label">En otro curso</span></div>
        <div class="stat" data-tone="obs"><span class="stat__num num">${imp.registros.reduce((a, r) => a + r.total, 0)}</span><span class="stat__label">Total inasistencias</span></div>
      </div>
      ${fieldHtml(`Curso de destino${imp.cursoExcel ? ` (en el Excel: ${esc(imp.cursoExcel)})` : ''}`, `<select id="att-import-course" class="input" onchange="State.attendanceImport.curso=this.value; app.renderAttendanceImport()"><option value="">Seleccione</option>${options(ALL_COURSES, imp.curso)}</select>`)}
      <h4>Actualización de la nómina del curso</h4>
      <div class="grid-3">
        ${opt('att-import-create', 'crear', nuevos, 'warn', `Agregar ${nuevos} estudiante(s) nuevo(s)`, 'Se crean con el RUT y el nombre del Excel.')}
        ${opt('att-import-move', 'mover', otro, 'plan', `Cambiar de curso a ${otro} estudiante(s)`, 'Hoy figuran en otro curso del sistema.')}
        ${opt('att-import-withdraw', 'retirar', ausentes.length, 'proto', `Marcar como retirados a ${ausentes.length} estudiante(s)`, 'Están en el curso, pero no aparecen en el Excel.')}
      </div>
      ${ausentes.length ? `<p class="note">${ico('user-minus')}Registrados en ${esc(destino)} que no aparecen en el Excel: ${ausentes.map(x => esc(x.name || 'Sin nombre')).join(', ')}.</p>` : ''}
      <p class="muted small">Revise los datos antes de guardar. Se reemplazan las inasistencias anteriores de cada estudiante por las de este archivo. El porcentaje del Excel no se utiliza.</p>
      <div class="table-wrap"><table class="table table--dense">
        <thead><tr><th class="t-num">N°</th><th>Estudiante</th>${MESES.map(m => `<th class="t-num">${m}</th>`).join('')}<th class="t-num">Total</th><th>Estado</th></tr></thead>
        <tbody>${imp.registros.map((r, i) => `<tr><td class="t-num num">${i + 1}</td><td><span class="cell-title">${esc(r.nombre)}</span><span class="cell-sub num">${esc(r.rutOriginal)}</span></td>${MESES.map(m => `<td class="t-num num" data-level="${r.meses[m] >= 5 ? 'high' : r.meses[m] > 0 ? 'low' : 'none'}">${r.meses[m]}</td>`).join('')}<td class="t-num num"><strong>${r.total}</strong></td><td>${tag(r)}</td></tr>`).join('')}</tbody>
      </table></div>`;
    icons();
  },

  async confirmAttendanceImport() {
    const imp = State.attendanceImport;
    const curso = el('att-import-course').value;
    if (!curso) { toast('Seleccione el curso de destino', 'error'); return false; }
    const hoy = today();
    const ops = [];
    let actualizados = 0, creados = 0, movidos = 0, retirados = 0, omitidos = 0;
    imp.registros.forEach(r => {
      const datos = { inasistencias: r.total, inasistenciasMensuales: r.meses, inasistenciasActualizadas: hoy, inasistenciasFuente: imp.archivo };
      if (r.studentId) {
        if (imp.opts.mover && r.estado === 'otroCurso') { Object.assign(datos, { curso, courseId: curso, status: 'active' }); movidos++; }
        ops.push({ col: 'students', id: r.studentId, data: datos, merge: true });
        actualizados++;
      } else if (imp.opts.crear) {
        ops.push({ col: 'students', id: r.rut, data: { id: r.rut, rut: r.rutOriginal, name: r.nombre, curso, courseId: curso, status: 'active', fechaIngreso: hoy, ...datos } });
        creados++;
      } else omitidos++;
    });
    if (imp.opts.retirar) (imp.ausentes || []).forEach(id => { ops.push({ col: 'students', id, data: { status: 'blocked', fechaRetiro: hoy }, merge: true }); retirados++; });
    await DB.batch(ops);
    const partes = [`Actualizados: ${actualizados}`];
    if (creados) partes.push(`Agregados: ${creados}`);
    if (movidos) partes.push(`Cambiados de curso: ${movidos}`);
    if (retirados) partes.push(`Retirados: ${retirados}`);
    if (omitidos) partes.push(`Omitidos: ${omitidos}`);
    notice({ type: 'success', title: 'Nómina e inasistencias guardadas', items: partes });
    State.attendanceImport = null;
    State.filterCourse = curso;
    setTimeout(() => this.navigate('students'), 0);
  },

  // ---------------- MATRÍCULA DESDE PDF O TEXTO PEGADO ----------------
  async handlePDFUpload(e) {
    const file = e.target.files[0];
    const course = el('upload-course-select').value;
    if (!course) { toast('Seleccione un curso de destino primero.', 'error'); e.target.value = ''; return; }
    if (!file) return;
    const done = ui.busy('Procesando documento', 'Extrayendo estudiantes del PDF...');
    try {
      await this.processExtractedText(await this.pdfText(file), course);
    } catch (err) { console.error(err); toast('Error al leer el PDF. Asegúrese de que es un archivo válido.', 'error'); }
    finally { done(); e.target.value = ''; }
  },
  async handleExcelPaste() {
    const course = el('upload-course-select').value;
    const text = el('excel-paste-data').value;
    if (!course) return toast('Seleccione un curso', 'error');
    if (!text.trim()) return toast('Pegue los datos primero', 'error');
    const done = ui.busy('Procesando texto', 'Extrayendo estudiantes...');
    try { await this.processExtractedText(text, course); el('excel-paste-data').value = ''; }
    catch (e) { toast(e.message, 'error'); }
    finally { done(); }
  },
  async processExtractedText(text, course) {
    const lines = text.replace(/["\r]/g, '').split('\n');
    const rutRe = /([0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-?[0-9Kk])/i;
    const found = new Map();
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      let m = line.match(rutRe);
      if (!m && i + 1 < lines.length) { const comb = line + ' ' + lines[i + 1].trim(); m = comb.match(rutRe); if (m) line = comb; }
      if (!m) continue;
      const rut = m[1].toUpperCase().trim();
      const after = (line.split(m[0])[1] || '').trim();
      const nm = after.match(/^([A-ZÁÉÍÓÚÑa-záéíóúñ\s]+)/i);
      if (nm && nm[1].trim().length > 3) { const clean = this.limpiarRut(rut); if (!found.has(clean)) found.set(clean, { rut, name: nm[1].trim(), clean }); }
    }
    if (!found.size) return toast('No se encontraron estudiantes en el formato esperado', 'error');
    const ops = [];
    let added = 0, updated = 0;
    found.forEach(st => {
      const ex = State.rawStudents.find(x => x.rut && this.limpiarRut(x.rut) === st.clean);
      if (!ex) { ops.push({ col: 'students', id: st.clean, data: { id: st.clean, rut: st.rut, name: st.name, curso: course, courseId: course, status: 'active' } }); added++; return; }
      const up = {};
      if (ex.curso !== course || ex.courseId !== course) Object.assign(up, { curso: course, courseId: course });
      if (this.clean(ex.name) !== st.name) up.name = st.name;
      if (Object.keys(up).length) { ops.push({ col: 'students', id: String(ex.id), data: up, merge: true }); updated++; }
    });
    await DB.batch(ops);
    notice({ type: 'success', title: 'Carga de estudiantes finalizada', items: [`Estudiantes nuevos: ${added}`, `Estudiantes actualizados: ${updated}`] });
    this.renderAdmin();
  },

  // ---------------- NOTAS DESDE PDF ("Informe de Calificaciones", uno o varios estudiantes) ----------------
  openGradesImport() { const inp = el('grades-file-input'); inp.value = ''; inp.click(); },

  parseGradeReports(text, fileName) {
    const N = t => this.normalizarTexto(t);
    const num = '(?:\\d{1,2}[.,]\\d|--|-)';
    const rowRe = new RegExp(`^(.*?[A-Za-zÁÉÍÓÚÑáéíóúñ)].*?)\\s+((?:${num}\\s+){2,}${num})$`);
    const blocks = text.split(/(?=Informe de Calificaciones)/i).filter(b => /R\.?\s*U\.?\s*N/i.test(b));
    return blocks.map(b => {
      const lines = b.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const get = re => { for (const l of lines) { const m = l.match(re); if (m) return m[1].trim(); } return ''; };
      const nombreRaw = get(/^Estudiante:\s*(.+)$/i);
      const run = get(/R\.?\s*U\.?\s*N\.?:?\s*([0-9.]{6,12}-?[0-9Kk])/i);
      const cursoTxt = get(/^Curso:\s*(?:\[\d+\]\s*)?(.+)$/i);
      const asignaturas = [];
      lines.forEach(l => {
        if (/^(Promedio|D[ií]as|Sector|Prom\.|Anual|Obs)/i.test(l)) return;
        const m = l.match(rowRe);
        if (m) asignaturas.push({ nombre: m[1].trim(), valores: m[2].trim().split(/\s+/).map(v => v === '-' ? '--' : v) });
      });
      const n = asignaturas.reduce((a, x) => Math.max(a, x.valores.length), 0);
      const columnas = n === 6 ? ['1° sem.', '2° sem.', 'Anual', 'Examen', 'Prueba esp.', 'Final'] : n === 7 ? ['1° trim.', '2° trim.', '3° trim.', 'Anual', 'Examen', 'Prueba esp.', 'Final'] : Array.from({ length: n }, (_, i) => (i === n - 1 ? 'Final' : `N${i + 1}`));
      const cleanRun = this.limpiarRut(run);
      const nombre = this.nombreDesdeExcel(nombreRaw);
      let est = State.rawStudents.find(x => this.limpiarRut(x.rut) === cleanRun || String(x.id).toUpperCase() === cleanRun);
      if (!est && nombre) est = State.rawStudents.find(x => N(x.name) === N(nombre));
      return {
        archivo: fileName, nombre, run, cleanRun, cursoTxt,
        curso: ALL_COURSES.find(c => N(c) === N(cursoTxt)) || cursoTxt,
        profesorJefe: get(/^Profesor Jefe:\s*(.+)$/i),
        periodo: get(/^Tipo de Periodo:\s*(.+)$/i),
        columnas, asignaturas,
        promedioGeneral: get(/Promedio General:\s*([\d.,]+)/i),
        asistencia: { trabajados: get(/D[ií]as Trabajados:\s*(\d+)/i), asistidos: get(/D[ií]as Asistencia:\s*(\d+)/i), inasistencias: get(/D[ií]as Inasistencia:\s*(\d+)/i), promedio: get(/Promedio Asistencia:\s*([\d.,]+)/i) },
        studentId: est ? String(est.id) : null,
        crear: true
      };
    }).filter(r => r.run || r.nombre);
  },

  async handleGradesPdf(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const done = ui.busy('Leyendo notas', 'Extrayendo los informes de calificaciones...');
    try {
      let reports = [];
      for (const f of files) reports = reports.concat(this.parseGradeReports(await this.pdfText(f), f.name));
      if (!reports.length) throw new Error('No se encontraron informes de calificaciones en el archivo.');
      State.gradesImport = { reports, anio: today().slice(0, 4) };
      done();
      ui.modal({ title: `Revisar notas: ${reports.length} estudiante(s)`, icon: 'graduation-cap', tone: 'pie', size: 'xl', okText: 'Guardar notas', body: '<div id="grades-import-content"></div>', onOk: () => this.confirmGrades() });
      this.renderGradesReview();
    } catch (err) { console.error(err); done(); toast('No se pudo leer el PDF: ' + err.message, 'error'); }
  },

  renderGradesReview() {
    const g = State.gradesImport;
    const nuevos = g.reports.filter(r => !r.studentId).length;
    el('grades-import-content').innerHTML = `
      <div class="stats stats--4">
        <div class="stat"><span class="stat__num num">${g.reports.length}</span><span class="stat__label">Informes en el PDF</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${g.reports.length - nuevos}</span><span class="stat__label">Estudiantes registrados</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${nuevos}</span><span class="stat__label">No están en el sistema</span></div>
        <div class="stat" data-tone="pie"><span class="stat__num num">${g.reports.reduce((a, r) => a + r.asignaturas.length, 0)}</span><span class="stat__label">Asignaturas leídas</span></div>
      </div>
      ${fieldHtml('Año escolar de estas notas', `<input type="number" class="input input--num num" min="2000" max="2100" value="${esc(g.anio)}" onchange="State.gradesImport.anio=this.value">`, 'field--inline')}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Estudiante</th><th>Curso</th><th class="t-num">Asignaturas</th><th class="t-num">Promedio general</th><th class="t-num">Asistencia</th><th>Estado</th><th class="t-actions">Detalle</th></tr></thead>
        <tbody>${g.reports.map((r, i) => `<tr>
          <td><span class="cell-title">${esc(r.nombre || 'Sin nombre')}</span><span class="cell-sub num">${esc(r.run)}</span></td>
          <td>${esc(r.curso)}</td><td class="t-num num">${r.asignaturas.length}</td>
          <td class="t-num"><strong class="num">${esc(r.promedioGeneral || '-')}</strong></td>
          <td class="t-num num">${r.asistencia.promedio ? esc(r.asistencia.promedio) + '%' : '-'}</td>
          <td>${r.studentId ? chip('Registrado', 'conv') : chip('Nuevo: no está en el sistema', 'warn')}</td>
          <td class="t-actions"><button type="button" class="btn btn--sm btn--ghost" onclick="el('gr-${i}').hidden=!el('gr-${i}').hidden">Ver notas</button></td></tr>
          <tr id="gr-${i}" hidden><td colspan="7">${this.gradesTable(r)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small">Si un estudiante ya tiene notas de ese año, se reemplazan por las de este archivo.</p>`;
    icons();
  },

  confirmGrades() {
    const g = State.gradesImport;
    const nuevos = g.reports.filter(r => !r.studentId);
    if (!/^\d{4}$/.test(String(g.anio))) { toast('Indique el año escolar (4 dígitos)', 'error'); return false; }
    if (!nuevos.length) return this.saveGrades(false);
    // Aviso obligatorio antes de crear estudiantes nuevos
    setTimeout(() => ui.modal({
      title: `Se ${nuevos.length === 1 ? 'creará 1 estudiante nuevo' : `crearán ${nuevos.length} estudiantes nuevos`}`, icon: 'user-plus', tone: 'warn', size: 'md', okText: 'Sí, crear y guardar', cancelText: 'Cancelar todo',
      body: `<p class="modal__msg">Estos estudiantes del PDF no están en el sistema. ¿Desea crearlos con su RUN, nombre y curso, y guardar sus notas?</p>
        <ul class="ruled">${nuevos.map(r => `<li><span><strong>${esc(r.nombre)}</strong> <span class="muted num">${esc(r.run)}</span></span><span>${esc(r.curso)}</span></li>`).join('')}</ul>
        <button type="button" class="btn" onclick="ui.close(); app.saveGrades(false)">No, guardar solo los registrados</button>`,
      onOk: () => this.saveGrades(true)
    }), 60);
  },

  async saveGrades(createNew) {
    const g = State.gradesImport;
    const anio = String(g.anio);
    const done = ui.busy('Guardando notas', '');
    try {
      const ops = [];
      let actualizados = 0, creados = 0, omitidos = 0;
      g.reports.forEach(r => {
        const rec = { anio, periodo: r.periodo, curso: r.cursoTxt, profesorJefe: r.profesorJefe, columnas: r.columnas, asignaturas: r.asignaturas, promedioGeneral: r.promedioGeneral, asistencia: r.asistencia, archivo: r.archivo, cargado: today(), cargadoPor: State.currentUser.name };
        if (r.studentId) {
          const raw = State.rawStudents.find(x => sameId(x.id, r.studentId));
          ops.push({ col: 'students', id: r.studentId, data: { calificaciones: { ...(raw?.calificaciones || {}), [anio]: rec } }, merge: true });
          actualizados++;
        } else if (createNew && r.cleanRun) {
          ops.push({ col: 'students', id: r.cleanRun, data: { id: r.cleanRun, rut: r.run, name: r.nombre, curso: r.curso, courseId: r.curso, status: 'active', fechaIngreso: today(), calificaciones: { [anio]: rec } } });
          creados++;
        } else omitidos++;
      });
      await DB.batch(ops);
      notice({ type: omitidos ? 'warn' : 'success', title: 'Notas guardadas', items: [`Estudiantes actualizados: ${actualizados}`, creados ? `Estudiantes nuevos creados: ${creados}` : '', omitidos ? `Omitidos: ${omitidos}` : ''].filter(Boolean) });
      State.gradesImport = null;
      this.render();
    } catch (e) { notice({ type: 'error', title: 'No se guardaron las notas', msg: e.message }); }
    finally { done(); }
  },

  // ---------------- TRASPASO DE DATOS CON ARCHIVO JSON ----------------
  COL_LABELS: { variables: 'Configuración', users: 'Funcionarios', courses: 'Cursos', students: 'Estudiantes', interventions: 'Intervenciones y protocolos', observations: 'Observaciones docentes', nursings: 'Enfermería', reports: 'Reportes PIE', knowledgeDocs: 'Normativas IA', coursePlans: 'Planes de curso', studentPlans: 'Planes individuales', evidences: 'Respaldos' },
  migrationHtml() {
    const m = State.migration || {};
    const cols = Object.keys(this.COL_LABELS);
    return `<section class="panel panel--narrow">
      <div class="panel__head"><h2>${ico('database')}Traspasar datos</h2></div>
      <ol class="steps">
        <li>En su computador, abra con doble clic el archivo <strong>herramientas/exportar-firebase.html</strong> y presione <strong>Descargar respaldo</strong>. Se descarga un archivo <span class="num">.json</span>.</li>
        <li>Súbalo aquí abajo. Antes de copiar nada verá cuántos registros trae.</li>
        <li>Presione <strong>Copiar al sistema</strong>. Cada funcionario conserva su clave de siempre (se guarda cifrada).</li>
      </ol>
      <label class="dropzone">
        <input type="file" accept=".json,application/json" onchange="app.readJsonBackup(event)">
        ${ico('file-up')}<span><strong>${m.fileName ? esc(m.fileName) : 'Elegir archivo de respaldo'}</strong><span class="cell-sub">${m.fileName ? 'Puede elegir otro si se equivocó' : 'respaldo-firebase-....json'}</span></span>
      </label>
      ${m.data ? `<div class="table-wrap"><table class="table"><thead><tr><th>Datos</th><th class="t-num">En el archivo</th><th class="t-num">Copiados</th></tr></thead><tbody>
        ${cols.map(c => `<tr><td>${this.COL_LABELS[c]}</td><td class="t-num num">${(m.data[c] || []).length}</td><td class="t-num num">${(m.done || {})[c] ?? '-'}</td></tr>`).join('')}</tbody></table></div>
        <div class="form-foot"><span class="muted small">Se puede repetir sin duplicar: los registros con el mismo identificador se reemplazan.</span><button class="btn btn--primary btn--lg" onclick="app.copyToSheets()">${ico('upload-cloud')}Copiar al sistema</button></div>` : ''}
      <div class="option-block">
        <h3>${ico('download')}Respaldo del sistema nuevo</h3>
        <p class="muted small">Descarga en un archivo todos los datos que usted puede ver. Guárdelo en un lugar seguro: contiene información de estudiantes.</p>
        <button class="btn" onclick="app.downloadBackup()">${ico('download')}Descargar respaldo JSON</button>
      </div>
      <p class="note">${ico('shield-alert')}Cuando termine el traspaso, en la consola de Firebase cierre las reglas de Firestore o elimine el proyecto, porque la página antigua dejaba la base abierta.</p>
    </section>`;
  },
  async readJsonBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      // Acepta el archivo de la herramienta ({colecciones}), un respaldo de este sistema ({collections}) o un objeto simple por colección
      let src = raw.colecciones || raw.collections || raw;
      const data = {};
      Object.keys(this.COL_LABELS).forEach(c => {
        let v = src[c];
        if (v && !Array.isArray(v)) v = c === 'variables' ? [v] : Object.entries(v).map(([id, d]) => ({ ...d, id: d.id ?? id }));
        data[c] = Array.isArray(v) ? v : [];
      });
      const total = Object.values(data).reduce((a, v) => a + v.length, 0);
      if (!total) throw new Error('El archivo no tiene datos reconocibles.');
      State.migration = { fileName: file.name, data, done: {} };
      toast(`Archivo leído: ${total} registros. Revise las cantidades y presione Copiar al sistema.`);
    } catch (err) { console.error(err); toast('No se pudo leer el archivo: ' + err.message, 'error'); }
    finally { this.renderAdmin(); }
  },
  downloadBackup() {
    const colecciones = { variables: [State.variables] };
    Object.entries(STORE).forEach(([c, k]) => { colecciones[c] = State[k]; });
    const blob = new Blob([JSON.stringify({ origen: 'trayectoria-escolar', exportado: new Date().toISOString(), colecciones })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `respaldo-trayectoria-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Respaldo descargado');
  },
  async copyToSheets() {
    const m = State.migration;
    if (!m?.data) return;
    const done = ui.busy('Copiando a Google Sheets', 'Esto puede tardar unos minutos. No cierre la página.');
    try {
      const order = ['variables', 'users', 'courses', 'students', 'interventions', 'observations', 'nursings', 'reports', 'knowledgeDocs', 'coursePlans', 'studentPlans', 'evidences'];
      for (const col of order) {
        const docs = col === 'variables' ? (m.data.variables || []).slice(0, 1) : (m.data[col] || []);
        if (!docs.length) { m.done[col] = 0; continue; }
        const size = col === 'evidences' || col === 'reports' ? 10 : 100;
        let n = 0;
        for (let i = 0; i < docs.length; i += size) {
          el('busy-msg').textContent = `${col}: ${Math.min(i + size, docs.length)} de ${docs.length}`;
          const out = await API.call('import', { col, docs: docs.slice(i, i + size) });
          n += out.saved || 0;
        }
        m.done[col] = n;
      }
      await DB.load();
      State.loginOptions = await API.call('bootstrap');
      notice({ type: 'success', title: 'Traspaso de datos completado', msg: 'Los funcionarios ya pueden ingresar con su clave de siempre.' });
    } catch (e) { console.error(e); notice({ type: 'error', title: 'El traspaso de datos se detuvo', msg: e.message }); }
    finally { done(); this.renderAdmin(); }
  }
});
