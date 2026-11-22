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

  // ---------------- INASISTENCIAS MENSUALES (EXCEL) ----------------
  openAttendanceImport() { const inp = el('attendance-file-input'); inp.value = ''; inp.click(); },

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
      State.attendanceImport = { archivo: file.name, cursoExcel, curso, registros, opts: { crear: true, mover: true, retirar: false } };
      ui.modal({ title: 'Revisar inasistencias del Excel', icon: 'file-spreadsheet', tone: 'obs', size: 'xl', okText: 'Guardar inasistencias', body: '<div id="attendance-import-content"></div>', onOk: () => this.confirmAttendanceImport() });
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

    el('attendance-import-content').innerHTML = `
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
    toast(`Nómina e inasistencias guardadas. ${partes.join(', ')}`);
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
      const pdfLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
      if (!pdfLib) throw new Error('La biblioteca PDF.js no está cargada.');
      pdfLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const items = (await (await pdf.getPage(i)).getTextContent()).items;
        items.sort((a, b) => Math.abs(b.transform[5] - a.transform[5]) > 5 ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4]);
        let y = -1, line = '';
        items.forEach(it => {
          if (y === -1 || Math.abs(y - it.transform[5]) > 5) { if (line) text += line + '\n'; line = it.str; y = it.transform[5]; }
          else line += ' ' + it.str;
        });
        if (line) text += line + '\n';
      }
      await this.processExtractedText(text, course);
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
    toast(`Operación finalizada. Creados: ${added}, actualizados: ${updated}`);
    this.renderAdmin();
  },

  // ---------------- MIGRACIÓN DESDE FIREBASE ----------------
  migrationHtml() {
    const m = State.migration || {};
    return `<section class="panel panel--narrow">
      <div class="panel__head"><h2>${ico('database')}Traspasar datos desde Firebase</h2></div>
      <ol class="steps">
        <li>Abra el archivo antiguo de la página y copie el bloque <span class="num">fbConf = { ... }</span> (apiKey, projectId, etc.).</li>
        <li>Péguelo abajo y presione <strong>Leer datos de Firebase</strong>. Nada se modifica en Firebase.</li>
        <li>Revise las cantidades y presione <strong>Copiar a Google Sheets</strong>. Las claves antiguas se cifran al copiarlas y la API Key de IA pasa al servidor.</li>
        <li>Se puede repetir sin duplicar: los registros con el mismo identificador se reemplazan.</li>
      </ol>
      ${fieldHtml('Configuración de Firebase', `<textarea id="fb-config" class="input num" rows="7" placeholder='apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..."'>${esc(m.config || '')}</textarea>`)}
      <div class="form-foot"><span></span><div class="row-actions">
        <button class="btn" onclick="app.readFirebase()">${ico('download-cloud')}Leer datos de Firebase</button>
        <button class="btn btn--primary" ${m.data ? '' : 'disabled'} onclick="app.copyToSheets()">${ico('upload-cloud')}Copiar a Google Sheets</button></div></div>
      ${m.data ? `<div class="table-wrap"><table class="table"><thead><tr><th>Colección</th><th class="t-num">Registros leídos</th><th class="t-num">Copiados</th></tr></thead><tbody>
        ${Object.keys(STORE).concat('variables').map(c => `<tr><td>${c}</td><td class="t-num num">${(m.data[c] || []).length}</td><td class="t-num num">${(m.done || {})[c] ?? '-'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p class="note">${ico('shield-alert')}Cuando termine, en la consola de Firebase cierre las reglas de Firestore (deny all) o elimine el proyecto, porque la página antigua dejaba la base abierta.</p>
    </section>`;
  },
  parseFirebaseConfig(txt) {
    const conf = {};
    ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].forEach(k => {
      const m = String(txt).match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
      if (m) conf[k] = m[1];
    });
    if (!conf.apiKey || !conf.projectId) throw new Error('No se encontraron apiKey y projectId en la configuración pegada.');
    return conf;
  },
  async readFirebase() {
    const config = el('fb-config').value;
    const done = ui.busy('Leyendo Firebase', 'Descargando todas las colecciones...');
    try {
      const conf = this.parseFirebaseConfig(config);
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
      const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
      const db = getFirestore(initializeApp(conf, 'migracion-' + Date.now()));
      const data = {};
      for (const c of Object.keys(STORE).concat('variables')) {
        const snap = await getDocs(collection(db, c));
        data[c] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      }
      State.migration = { config, data, done: {} };
      toast('Datos leídos. Revise las cantidades y copie a Google Sheets.');
    } catch (e) { console.error(e); toast('No se pudo leer Firebase: ' + e.message, 'error'); }
    finally { done(); this.renderAdmin(); }
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
      toast('Migración completada');
    } catch (e) { console.error(e); toast('La migración se detuvo: ' + e.message, 'error'); }
    finally { done(); this.renderAdmin(); }
  }
});
