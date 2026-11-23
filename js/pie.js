'use strict';
// =====================================================================
// PIE: carga masiva de planes (Word) y vinculación de carpetas de Drive
// con informes, derivaciones y documentos de cada estudiante.
// =====================================================================
const PIE_DOC_TYPES = [
  [/paci/i, 'PACI (Plan de Adecuación Curricular Individual)'], [/\bpai\b|plan de apoyo individual/i, 'PAI (Plan de Apoyo Individual)'],
  [/psicopedag/i, 'Informe psicopedagógico'], [/fono/i, 'Evaluación fonoaudiológica'], [/psicol/i, 'Informe psicológico'],
  [/familia/i, 'Informe a la familia'], [/deriva/i, 'Derivación'], [/certificado.*nac|nacimiento/i, 'Certificado de nacimiento'],
  [/neurol|m[eé]dic|pediatr|psiquiatr/i, 'Informe médico'], [/anamnesis/i, 'Anamnesis'], [/avance/i, 'Informe de avance'],
  [/fudei|formulario/i, 'Formulario FUDEI'], [/evaluaci[oó]n|evalua|wisc|tabula/i, 'Evaluación'], [/plan/i, 'Plan PIE']
];

Object.assign(app, {
  canImportPie() { return hasAccess('editar_fichas') || hasAccess('gestionar_usuarios') || hasAccess('configurar_sistema') || State.currentUser?.role === 'Equipo PIE'; },

  /** Curso a partir de un texto: "4º BÁSICO A", "IV° Medio A", "NT1 A"... */
  courseFromText(t) {
    const N = s => this.normalizarTexto(s);
    let s = N(t).replace(/\bNT1\b/, 'PRE KINDER').replace(/\bNT2\b/, 'KINDER')
      .replace(/^IV\b/, '4').replace(/^III\b/, '3').replace(/^II\b/, '2').replace(/^I\b/, '1');
    return ALL_COURSES.find(c => N(c) === s) || ALL_COURSES.find(c => s.length > 3 && (s.startsWith(N(c)) || N(c) === s.replace(/ (A|B|C)$/, ' $1'))) || '';
  },
  /** Busca un estudiante por RUN o por las palabras de su nombre (de preferencia dentro del curso). */
  findStudentByName(text, course = '') {
    const N = s => this.normalizarTexto(s);
    const ruido = new Set(['PACI', 'PAI', 'UCI', 'UI', 'I', 'OK', 'PIE', 'INFORME', 'PLAN', 'EXCEDENTE', 'DE', 'DEL', 'LA', 'Y', 'NT', 'A', 'B', 'C']);
    const tokens = N(String(text).replace(/\(.*?\)/g, ' ')).split(' ').filter(w => w.length > 1 && !/^\d+$/.test(w) && !ruido.has(w));
    if (tokens.length < 2) return null;
    const pool = State.rawStudents.filter(s => !course || this.courseNameOf(s) === course);
    let best = null, bestScore = 0;
    const scan = list => list.forEach(s => {
      const nm = new Set(N(s.name).split(' '));
      const hit = tokens.filter(t => nm.has(t)).length;
      const score = hit / Math.min(tokens.length, nm.size || 1);
      if (hit >= 2 && score > bestScore) { best = s; bestScore = score; }
    });
    scan(pool);
    if (!best && course) scan(State.rawStudents);
    return bestScore >= 0.6 ? best : null;
  },
  findStudentByRun(text) {
    const runs = String(text).match(/(?<![\dkK])\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK](?![\dkK])/g) || [];
    for (const r of runs) {
      const clean = this.limpiarRut(r);
      const s = State.rawStudents.find(x => this.limpiarRut(x.rut) === clean || String(x.id).toUpperCase() === clean);
      if (s) return { student: s, run: r.replace(/\s/g, '') };
    }
    return { student: null, run: runs[0] ? runs[0].replace(/\s/g, '') : '' };
  },
  docType(text) { const hit = PIE_DOC_TYPES.find(([re]) => re.test(text)); return hit ? hit[1] : 'Documento PIE'; },
  yearOf(text) { const ys = String(text).match(/20[12]\d/g); return ys ? String(Math.max(...ys.map(Number))) : ''; },

  // ---------------- PLANES PIE EN WORD ----------------
  async loadMammoth() {
    if (window.mammoth) return;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el lector de Word. Revise su conexión.')); document.head.appendChild(s); });
  },
  pickFiles({ folder = false, accept = '.docx', onPick }) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.accept = accept;
    if (folder) inp.webkitdirectory = true;
    inp.onchange = () => onPick(Array.from(inp.files || []));
    inp.click();
  },
  openPiePlansImport() {
    ui.modal({
      title: 'Cargar planes PIE (Word)', icon: 'puzzle', tone: 'pie', size: 'md', hideOk: true, cancelText: 'Cerrar',
      body: `<div class="stack">
        <p class="modal__msg">Puede elegir varios planes a la vez o una carpeta completa (por ejemplo "Planes Acomp.", con una subcarpeta por curso). El sistema lee cada plan, identifica al estudiante por RUN o por nombre, guarda el documento original en Drive y agrega el plan con sus ámbitos de intervención a la ficha.</p>
        <div class="grid-2">
          <button type="button" class="btn btn--primary btn--lg" onclick="ui.close(); app.pickFiles({ onPick: f => app.handlePiePlans(f) })">${ico('files')}Elegir archivos</button>
          <button type="button" class="btn btn--lg" onclick="ui.close(); app.pickFiles({ folder: true, onPick: f => app.handlePiePlans(f) })">${ico('folder-open')}Elegir una carpeta</button>
        </div>
        <p class="note">${ico('info')}Formatos: .docx (PAI y PACI). Los planes que solo tienen la plantilla se marcan como "sin completar" para que decida si cargarlos.</p>
      </div>`
    });
  },
  parsePlanHtml(html) {
    // Se agrega un espacio al cerrar cada celda o párrafo para que las palabras no queden pegadas
    const doc = new DOMParser().parseFromString(`<div>${String(html).replace(/<\/(p|td|th|li|h\d)>/g, ' </$1>')}</div>`, 'text/html');
    const cell = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
    const ambitos = [];
    let actual = null, nombre = '', curso = '';
    doc.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.children].map(cell);
      const first = cells[0] || '';
      const iNombre = cells.findIndex(c => /^NOMBRE COMPLETO/i.test(c));
      if (iNombre >= 0 && cells[iNombre + 1]) nombre = cells[iNombre + 1];
      const iCurso = cells.findIndex(c => /^CURSO$/i.test(c));
      if (iCurso >= 0 && cells[iCurso + 1]) curso = cells[iCurso + 1];
      if (/^ÁMBITO|^AMBITO/i.test(first)) { actual = { ambito: first.replace(/[.\-–\s]+$/, ''), filas: [] }; ambitos.push(actual); return; }
      if (!actual || /^INDICADOR/i.test(first) || cells.every(c => !c)) return;
      if (cells.length >= 2 && cells.slice(0, 2).some(c => c.length > 2)) actual.filas.push({ indicador: cells[0] || '', acciones: cells[1] || '', responsable: cells[2] || '', seguimiento: cells[3] || '' });
    });
    return { nombre, curso, ambitos: ambitos.filter(a => a.filas.length), text: cell(doc.body) };
  },
  async handlePiePlans(files) {
    files = files.filter(f => /\.docx$/i.test(f.name) && !f.name.startsWith('~$'));
    if (!files.length) return toast('No se encontraron archivos Word (.docx)', 'error');
    const done = ui.busy('Leyendo planes PIE', '');
    try {
      await this.loadMammoth();
      const items = [];
      for (const [i, f] of files.entries()) {
        el('busy-msg').textContent = `${i + 1} de ${files.length}: ${f.name}`;
        const path = f.webkitRelativePath || f.name;
        try {
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
          const p = this.parsePlanHtml(html);
          const course = this.courseFromText(p.curso) || this.courseFromText(path.split('/').slice(-2, -1)[0] || '');
          const byRun = this.findStudentByRun(p.text);
          const student = byRun.student || this.findStudentByName(p.nombre, course) || this.findStudentByName(f.name.replace(/\.docx$/i, ''), course);
          items.push({ file: f, path, course, run: byRun.run, nombrePlan: p.nombre, studentId: student ? String(student.id) : '', tipo: this.docType(`${f.name} ${p.text.slice(0, 400)}`), ambitos: p.ambitos, vacio: p.text.length < 1500 && !p.ambitos.some(a => a.filas.some(r => r.acciones.length > 5)), incluir: true });
        } catch (e) { items.push({ file: f, path, error: 'No se pudo leer el archivo', incluir: false }); }
      }
      items.forEach(it => { if (it.vacio || !it.studentId) it.incluir = !!it.studentId && !it.vacio; });
      State.pieImport = { items, anio: today().slice(0, 4) };
      done();
      ui.modal({ title: `Revisar planes PIE: ${items.length} archivo(s)`, icon: 'puzzle', tone: 'pie', size: 'xl', okText: 'Cargar planes seleccionados', body: '<div id="pie-import-content"></div>', onOk: () => this.savePiePlans() });
      this.renderPieImport();
    } catch (e) { done(); toast(e.message, 'error'); }
  },
  studentOptions(course, selected) {
    const list = State.rawStudents.filter(s => !course || this.courseNameOf(s) === course).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const sel = selected && !list.some(s => sameId(s.id, selected)) ? State.rawStudents.filter(s => sameId(s.id, selected)) : [];
    return `<option value="">Sin asignar (no cargar)</option>${options([...sel, ...list].map(s => [s.id, `${this.clean(s.name)} (${this.courseNameOf(s)})`]), selected)}`;
  },
  renderPieImport() {
    const g = State.pieImport;
    const ok = g.items.filter(i => i.studentId).length;
    el('pie-import-content').innerHTML = `
      <div class="stats stats--4">
        <div class="stat"><span class="stat__num num">${g.items.length}</span><span class="stat__label">Archivos</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${ok}</span><span class="stat__label">Estudiante identificado</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${g.items.filter(i => i.vacio).length}</span><span class="stat__label">Sin completar (solo plantilla)</span></div>
        <div class="stat" data-tone="pie"><span class="stat__num num">${g.items.filter(i => i.incluir).length}</span><span class="stat__label">Se cargarán</span></div>
      </div>
      ${fieldHtml('Año de los planes', `<input type="number" class="input input--num num" value="${esc(g.anio)}" onchange="State.pieImport.anio=this.value">`, 'field--inline')}
      <div class="table-wrap"><table class="table table--dense">
        <thead><tr><th>Cargar</th><th>Archivo</th><th>Estudiante</th><th>Tipo</th><th class="t-num">Ámbitos</th><th>Estado</th></tr></thead>
        <tbody>${g.items.map((it, i) => `<tr>
          <td><input type="checkbox" aria-label="Cargar ${esc(it.file.name)}" ${it.incluir ? 'checked' : ''} ${it.error ? 'disabled' : ''} onchange="State.pieImport.items[${i}].incluir=this.checked; app.renderPieImport()"></td>
          <td><span class="cell-title">${esc(it.file.name)}</span><span class="cell-sub">${esc(it.path.split('/').slice(-2, -1)[0] || '')}</span></td>
          <td>${it.error ? '-' : `<select class="input" aria-label="Estudiante" onchange="State.pieImport.items[${i}].studentId=this.value; State.pieImport.items[${i}].incluir=!!this.value; app.renderPieImport()">${this.studentOptions(it.course, it.studentId)}</select>`}</td>
          <td class="small">${esc(it.tipo || '')}</td>
          <td class="t-num num">${(it.ambitos || []).length}</td>
          <td>${it.error ? chip(it.error, 'proto') : it.vacio ? chip('Solo plantilla', 'warn') : it.studentId ? chip('Listo', 'conv') : chip('Elija estudiante', 'warn')}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small">Cada plan se guarda como documento en Drive y como plan PIE en la ficha del estudiante (pestaña Planes multi-sector PIE / Aula).</p>`;
  },
  async savePiePlans() {
    const g = State.pieImport;
    const list = g.items.filter(i => i.incluir && i.studentId);
    if (!list.length) { toast('No hay planes seleccionados con estudiante asignado', 'error'); return false; }
    ui.close();
    const done = ui.busy('Cargando planes PIE', '');
    let ok = 0;
    try {
      for (const [n, it] of list.entries()) {
        el('busy-msg').textContent = `${n + 1} de ${list.length}: ${it.file.name}`;
        const s = State.rawStudents.find(x => sameId(x.id, it.studentId));
        const curso = this.courseNameOf(s);
        const dataUrl = await readFileAsDataURL(it.file);
        const up = await API.call('upload', { folderName: `${curso} - ${this.clean(s.name)}`, fileName: `${g.anio}_${it.file.name}`, mimeType: it.file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: String(dataUrl).split(',')[1] });
        const evId = 'drv_' + up.fileId;
        await DB.save('evidences', { id: evId, studentId: String(s.id), studentName: this.clean(s.name), course: curso, date: today(), anio: String(g.anio), area: 'PIE', type: it.tipo, description: `Plan PIE ${g.anio}`, fileName: it.file.name, mimeType: it.file.type, uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive', driveId: up.fileId, url: up.url });
        await DB.save('reports', {
          id: 'plan_' + up.fileId, studentId: String(s.id), type: it.tipo, date: today(), anio: String(g.anio), responsablePlan: State.currentUser.name, fuente: it.file.name, evidenceId: evId,
          estrategias: (it.ambitos || []).flatMap(a => a.filas.map(f => ({ ambito: a.ambito, descripcion: f.indicador || f.acciones, acciones: f.acciones && f.indicador ? [{ descripcion: f.acciones }] : [], responsable: f.responsable, seguimiento: f.seguimiento })))
        });
        ok++;
      }
      toast(`${ok} plan(es) PIE cargados en las fichas`);
    } catch (e) { toast(`Se cargaron ${ok}. Se detuvo: ${e.message}`, 'error'); }
    finally { done(); this.render(); }
  },

  // ---------------- VINCULAR CARPETA DE DRIVE ----------------
  openDriveLink() {
    ui.modal({
      title: 'Vincular documentos desde Google Drive', icon: 'folder-sync', tone: 'pie', size: 'md', okText: 'Leer carpeta',
      body: `<div class="stack">
        <ol class="steps">
          <li>Descomprima "CARPETAS POR ESTUDIANTE" y suba la carpeta completa a Google Drive (arrastrándola a drive.google.com), en la cuenta dueña del sistema o compartida con ella.</li>
          <li>Abra la carpeta en Drive y copie el enlace de la barra de direcciones.</li>
          <li>Péguelo aquí. El sistema no mueve ni copia archivos: solo los asocia a la ficha de cada estudiante según el nombre de su carpeta.</li>
        </ol>
        ${fieldHtml('Enlace de la carpeta de Drive', '<input id="drive-folder" class="input" placeholder="https://drive.google.com/drive/folders/...">')}
        ${fieldHtml('Qué documentos vincular', `<select id="drive-year" class="input">${options([['2026', 'Solo los que indican 2026'], ['2026+', '2026 y los que no indican año'], ['todos', 'Todos los años']], '2026')}</select>`)}
      </div>`,
      onOk: async () => {
        const carpeta = el('drive-folder').value.trim();
        if (!carpeta) { toast('Pegue el enlace de la carpeta', 'error'); return false; }
        const filtro = el('drive-year').value;
        ui.close();
        const done = ui.busy('Leyendo la carpeta de Drive', 'Puede tardar uno o dos minutos con muchas carpetas...');
        try {
          const out = await API.call('indexarCarpeta', { carpeta });
          done();
          this.reviewDriveFiles(out, filtro);
        } catch (e) { done(); toast(e.message, 'error'); }
        return false;
      }
    });
  },
  reviewDriveFiles(out, filtro) {
    const groups = {};
    let fuera = 0;
    out.files.forEach(f => {
      const segs = f.path.split('/');
      const ci = segs.findIndex(s => this.courseFromText(s));
      const course = ci >= 0 ? this.courseFromText(segs[ci]) : '';
      const carpeta = ci >= 0 ? (segs[ci + 1] || '') : (segs[segs.length - 1] || '');
      const anio = this.yearOf(`${f.path} ${f.name}`);
      const pasa = filtro === 'todos' || (filtro === '2026' ? anio === '2026' : (anio === '2026' || !anio));
      if (!pasa || !carpeta) { fuera++; return; }
      const key = `${course}|${carpeta}`;
      (groups[key] = groups[key] || { course, carpeta, files: [] }).files.push({ ...f, anio: anio || '2026' });
    });
    const list = Object.values(groups).map(g => { const s = this.findStudentByRun(g.carpeta).student || this.findStudentByName(g.carpeta, g.course); return { ...g, studentId: s ? String(s.id) : '' }; })
      .sort((a, b) => (ALL_COURSES.indexOf(a.course) - ALL_COURSES.indexOf(b.course)) || a.carpeta.localeCompare(b.carpeta));
    State.driveImport = { carpeta: out.carpeta, groups: list, fuera };
    ui.modal({ title: `Vincular documentos: ${out.carpeta}`, icon: 'folder-sync', tone: 'pie', size: 'xl', okText: 'Vincular a las fichas', body: '<div id="drive-import-content"></div>', onOk: () => this.saveDriveLinks() });
    this.renderDriveImport();
  },
  renderDriveImport() {
    const d = State.driveImport;
    const total = d.groups.reduce((a, g) => a + g.files.length, 0);
    const ok = d.groups.filter(g => g.studentId);
    const yaVinculados = new Set(State.rawEvidences.map(e => String(e.driveId || '')));
    el('drive-import-content').innerHTML = `
      <div class="stats stats--4">
        <div class="stat"><span class="stat__num num">${total}</span><span class="stat__label">Documentos a vincular</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${ok.length}</span><span class="stat__label">Estudiantes identificados</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${d.groups.length - ok.length}</span><span class="stat__label">Carpetas sin identificar</span></div>
        <div class="stat"><span class="stat__num num">${d.fuera}</span><span class="stat__label">Omitidos por año o ubicación</span></div>
      </div>
      <div class="table-wrap"><table class="table table--dense">
        <thead><tr><th>Curso</th><th>Carpeta del estudiante</th><th>Ficha a la que se vincula</th><th class="t-num">Documentos</th><th>Tipos</th></tr></thead>
        <tbody>${d.groups.map((g, i) => {
          const nuevos = g.files.filter(f => !yaVinculados.has(f.id)).length;
          const tipos = [...new Set(g.files.map(f => this.docType(f.name)))].slice(0, 4).join(', ');
          return `<tr><td class="small">${esc(g.course || '-')}</td><td><span class="cell-title">${esc(g.carpeta)}</span></td>
            <td><select class="input" aria-label="Estudiante de ${esc(g.carpeta)}" onchange="State.driveImport.groups[${i}].studentId=this.value; app.renderDriveImport()">${this.studentOptions(g.course, g.studentId)}</select></td>
            <td class="t-num num">${nuevos}${nuevos < g.files.length ? `<span class="cell-sub">${g.files.length - nuevos} ya vinculados</span>` : ''}</td><td class="small">${esc(tipos)}</td></tr>`;
        }).join('')}</tbody></table></div>
      <p class="muted small">Las carpetas sin ficha asignada no se vinculan. Puede repetir la vinculación más adelante sin duplicar documentos.</p>`;
  },
  async saveDriveLinks() {
    const d = State.driveImport;
    const ya = new Set(State.rawEvidences.map(e => String(e.driveId || '')));
    const ops = [];
    d.groups.filter(g => g.studentId).forEach(g => {
      const s = State.rawStudents.find(x => sameId(x.id, g.studentId));
      g.files.filter(f => !ya.has(f.id)).forEach(f => ops.push({ col: 'evidences', id: 'drv_' + f.id, data: {
        id: 'drv_' + f.id, studentId: String(s.id), studentName: this.clean(s.name), course: this.courseNameOf(s), date: f.updated || today(), anio: f.anio, area: 'PIE',
        type: this.docType(f.name), description: f.path.split('/').slice(-1)[0] || f.name, fileName: f.name, mimeType: f.mimeType,
        uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive', driveId: f.id, url: f.url
      } }));
    });
    if (!ops.length) { toast('No hay documentos nuevos para vincular', 'error'); return false; }
    const done = ui.busy('Vinculando documentos', `${ops.length} documentos...`);
    try { await DB.batch(ops); toast(`${ops.length} documentos vinculados a las fichas`); }
    catch (e) { toast(e.message, 'error'); return false; }
    finally { done(); }
    ui.close();
    this.navigate('pie');
  },

  // ---------------- PROGRAMA PIE ----------------
  /** Estudiantes que reciben apoyo PIE, con todo su trabajo PIE (planes, documentos e intervenciones). */
  pieStudents() {
    const idx = this.pieIndex();
    return this.getStudents().filter(s => s.status !== 'blocked' && this.isPie(s)).map(s => {
      const p = idx.get(String(s.id)) || { plans: 0, docs: 0, ultima: '' };
      const inter = (s.history || []).filter(h => this.recordCategory(h) === 'pie');
      const ultima = [p.ultima, ...inter.map(h => h.date || '')].sort().pop() || '';
      return { s, plans: p.plans, docs: p.docs, inter: inter.length, ultima: String(ultima).slice(0, 10) };
    });
  },
  renderPie() {
    State.pieView = State.pieView || { course: '', q: '' };
    const v = State.pieView;
    const all = this.pieStudents();
    let rows = all.filter(r => (!v.course || r.s.curso === v.course) && (!v.q || r.s.name.toLowerCase().includes(v.q.toLowerCase()) || String(r.s.rut).includes(v.q)));
    rows.sort((a, b) => (ALL_COURSES.indexOf(a.s.curso) - ALL_COURSES.indexOf(b.s.curso)) || a.s.name.localeCompare(b.s.name));
    const sum = k => all.reduce((a, r) => a + r[k], 0);
    const cursos = [...new Set(all.map(r => r.s.curso))].sort((a, b) => ALL_COURSES.indexOf(a) - ALL_COURSES.indexOf(b));
    const acciones = this.canImportPie() ? `<button class="btn" onclick="app.openPiePlansImport()">${ico('file-up')}Cargar planes (Word)</button><button class="btn btn--primary" onclick="app.openDriveLink()">${ico('folder-sync')}Vincular carpeta de Drive</button>` : '';
    el('pie-actions').innerHTML = acciones;
    el('pie-stats').innerHTML = `
      <div class="stat" data-tone="pie"><span class="stat__num num">${all.length}</span><span class="stat__label">Estudiantes con apoyo PIE</span></div>
      <div class="stat" data-tone="pie"><span class="stat__num num">${sum('plans')}</span><span class="stat__label">Planes PIE</span></div>
      <div class="stat" data-tone="pie"><span class="stat__num num">${sum('docs')}</span><span class="stat__label">Documentos vinculados</span></div>
      <div class="stat" data-tone="pie"><span class="stat__num num">${sum('inter')}</span><span class="stat__label">Intervenciones PIE</span></div>`;
    el('pie-filters').innerHTML = `<div class="filters">
      ${fieldHtml('Curso', `<select class="input" onchange="State.pieView.course=this.value; app.renderPie(); icons()"><option value="">Todos los cursos (${all.length})</option>${cursos.map(c => `<option value="${esc(c)}" ${c === v.course ? 'selected' : ''}>${esc(c)} (${all.filter(r => r.s.curso === c).length})</option>`).join('')}</select>`)}
      ${fieldHtml('Buscar', `<input type="search" class="input" value="${esc(v.q)}" placeholder="Nombre o RUN" oninput="State.pieView.q=this.value; clearTimeout(app._pieT); app._pieT=setTimeout(() => { app.renderPie(); icons(); const i = document.querySelector('#pie-filters input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250)">`)}
    </div>`;
    el('pie-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Estudiante</th><th>Curso</th><th class="t-num">Planes</th><th class="t-num">Documentos</th><th class="t-num">Intervenciones</th><th>Última actividad</th><th class="t-actions">Acciones</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><span class="cell-title">${esc(r.s.name)} ${this.pieBadge(r.s)}</span><span class="cell-sub num">${esc(r.s.rut)}</span></td>
        <td class="small">${esc(r.s.curso)}</td>
        <td class="t-num num">${r.plans}</td><td class="t-num num">${r.docs}</td><td class="t-num num">${r.inter}</td>
        <td class="small num">${r.ultima ? fmtDate(r.ultima) : '-'}</td>
        <td class="t-actions"><button class="btn btn--sm" onclick="app.openPieFicha(${jsq(r.s.id)})">${ico('folder-open')}Ver trabajo PIE</button></td>
      </tr>`).join('')}</tbody></table></div>`
      : empty('puzzle', all.length ? 'Ningún estudiante PIE coincide con el filtro.' : 'Aún no hay estudiantes con planes, documentos o intervenciones PIE. Cargue los planes en Word o vincule la carpeta de Drive.', 'pie');
  },
  openPieFicha(id) {
    State.selectedStudentId = id;
    this.openStudent(id);
    State.detailTab = 'pie';
    this.render();
    setTimeout(() => { const t = document.querySelector('[data-view="student_detail"] [role="tablist"]'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
});
