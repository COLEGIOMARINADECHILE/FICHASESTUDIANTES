'use strict';
// =====================================================================
// RESULTADOS DIA (Diagnóstico Integral de Aprendizajes, Agencia de Calidad)
// Cualquier funcionario sube los informes por curso (uno o varios PDF).
// Se leen el curso, la asignatura, el periodo y la tabla de resultados por
// estudiante (L / NL); con ella se calculan los porcentajes del curso por
// área. Se guarda el PDF original y todo se incluye en el reporte del curso.
// =====================================================================
const DIA_PERIODOS = ['Diagnóstico', 'Monitoreo Intermedio', 'Evaluación de Cierre'];
// Columnas conocidas del informe de Lectura de 1° básico (Tabla 2)
const DIA_LECTURA_1B = {
  columnas: ['Sílaba inicial', 'Sílaba final', 'Sonido inicial', 'Sonido final', 'Vocales A, E, U', 'Cons. M, L, P, S', 'Cons. D, T, N, R', 'Sílaba directa', 'Sílaba indirecta', 'Sílaba compleja'],
  grupos: [['Conciencia fonológica', 0, 4], ['Principio alfabético', 4, 7], ['Lectura de palabras', 7, 10]]
};
const DIA_NIVELES = /^(insuficiente|elemental|intermedio|adecuado|satisfactorio|logrado|no logrado|en desarrollo)$/i;

Object.assign(app, {
  canDia() { return hasAccess('ver_fichas') || hasAccess('editar_fichas') || hasAccess('agregar_entrevistas'); },
  diaId(course, anio, asignatura, periodo) { const N = t => this.normalizarTexto(t).replace(/ /g, '_'); return `dia_${N(course)}_${anio}_${N(asignatura)}_${N(periodo)}`; },
  diaOf(course) { return (State.dia || []).filter(d => d.course === course).sort((a, b) => String(b.anio).localeCompare(String(a.anio)) || DIA_PERIODOS.indexOf(b.periodo) - DIA_PERIODOS.indexOf(a.periodo) || String(a.asignatura).localeCompare(String(b.asignatura))); },

  // ---------------- LECTURA DEL PDF ----------------
  /** Líneas del PDF reconstruidas por posición (cada fila de una tabla queda en una línea). */
  async pdfLines(file) {
    const pdf = await this.pdfjs().getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const items = (await (await pdf.getPage(p)).getTextContent()).items.filter(i => i.str.trim());
      const filas = [];
      items.forEach(i => {
        const y = i.transform[5], x = i.transform[4];
        let f = filas.find(r => Math.abs(r.y - y) < 3);
        if (!f) filas.push(f = { y, items: [] });
        f.items.push({ x, s: i.str });
      });
      filas.sort((a, b) => b.y - a.y).forEach(f => lines.push(f.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return lines;
  },
  parseDia(lines, fileName) {
    const t = lines.join('\n');
    const val = re => ((t.match(re) || [])[1] || '').trim();
    const titulo = t.match(/Informe de Resultados\s*(\d{4})\s*\|?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ ]{3,40})/);
    const anio = titulo ? titulo[1] : (String(fileName).match(/20\d\d/) || [today().slice(0, 4)])[0];
    let asignatura = titulo ? titulo[2].replace(/\s*·.*$/, '').replace(/Diagn.*$/i, '').trim() : '';
    if (!asignatura) asignatura = (String(fileName).match(/DIA_([A-ZÁÉÍÓÚ]+)/i) || [, 'Sin asignatura'])[1];
    asignatura = asignatura.charAt(0).toUpperCase() + asignatura.slice(1).toLowerCase();
    const periodo = /monitoreo/i.test(t) ? 'Monitoreo Intermedio' : /cierre/i.test(t) ? 'Evaluación de Cierre' : /diagn[oó]stico\s+(?!integral)/i.test(t) ? 'Diagnóstico' : (/MONITOREO/i.test(fileName) ? 'Monitoreo Intermedio' : /CIERRE/i.test(fileName) ? 'Evaluación de Cierre' : 'Diagnóstico');
    // Curso: "Curso: 1 A" + el nivel que menciona el informe ("en 1° básico")
    const cursoTxt = val(/Curso:\s*([^\n]+)/i);
    const nivel = (t.match(/(\d{1,2}|I{1,3}V?|IV)\s*°?\s*(b[aá]sico|medio)/i) || [])[2] || (/medio/i.test(cursoTxt) ? 'medio' : 'básico');
    const mc = cursoTxt.match(/^(\d{1,2}|I{1,3}V?|IV)\s*°?\s*(?:b[aá]sico|medio|B|M)?\s*([A-Z])\b/i);
    const course = mc ? this.courseFromText(`${mc[1]} ${/medio/i.test(nivel) ? 'MEDIO' : 'BASICO'} ${mc[2]}`) : '';
    // Tabla de resultados por estudiante: "1 APELLIDO APELLIDO NOMBRE L NL ..."
    const filas = [];
    lines.forEach(l => {
      const m = l.match(/^(\d{1,3})\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ' .-]+?)\s+((?:(?:NL|L|[\d.,]+\s*%?|Insuficiente|Elemental|Intermedio|Adecuado|Satisfactorio)\s*){2,})$/i);
      if (m && !/\b(pregunta|OA|habilidad)\b/i.test(m[2])) filas.push({ n: +m[1], nombre: m[2].trim(), valores: m[3].trim().split(/\s+/).map(v => v.toUpperCase() === 'NL' || v.toUpperCase() === 'L' ? v.toUpperCase() : v) });
    });
    const nCol = filas.length ? Math.max(...filas.map(f => f.valores.length)) : 0;
    const conocido = /lectura/i.test(asignatura) && nCol === DIA_LECTURA_1B.columnas.length;
    const columnas = conocido ? DIA_LECTURA_1B.columnas : Array.from({ length: nCol }, (_, i) => `Indicador ${i + 1}`);
    const grupos = conocido ? DIA_LECTURA_1B.grupos : (nCol ? [['Resultado general', 0, nCol]] : []);
    // Preguntas: bloques "A: 12.50%  B: 56.25%  C: ..  N: .." (la respuesta correcta se estima como la más elegida)
    const opciones = [...t.matchAll(/\b([A-D]|N)\s*:\s*([\d.,]+)\s*%/g)].map(m => [m[1], parseFloat(m[2].replace(',', '.'))]);
    const preguntas = [];
    let actual = null;
    opciones.forEach(([o, v]) => { if (o === 'A' || !actual) { actual = {}; preguntas.push(actual); } actual[o] = v; });
    const nums = lines.map(l => l.match(/^(\d{1,2})\s+(\d{1,2})\s+(Narraci[oó]n|Texto no literario|Texto|Poema|Noticia|Instructivo|[A-ZÁÉÍÓÚ][a-záéíóú]+)\b/)).filter(Boolean);
    const pregs = preguntas.filter(p => Object.keys(p).length >= 3).map((p, i) => {
      const alts = Object.entries(p).filter(([k]) => k !== 'N');
      const [correcta, pct] = alts.sort((a, b) => b[1] - a[1])[0] || ['', 0];
      return { n: nums[i] ? +nums[i][1] : i + 1, oa: nums[i] ? nums[i][2] : '', tipo: nums[i] ? nums[i][3] : '', opciones: p, correcta, pct };
    });
    return { anio, asignatura, periodo, course, cursoTxt, docente: val(/docente de la asignatura:\s*([^\n]+)/i), director: val(/director[a]?:\s*([^\n]+)/i), nInforme: +val(/considera este informe:\s*(\d+)/i) || filas.length, fechaInforme: val(/generaci[oó]n de este informe:\s*([\d\/]+)/i), filas, columnas, grupos, preguntas: pregs, conocido };
  },
  /** Porcentajes del curso: logro por indicador (estudiantes con L), promedio por área y comprensión oral desde las preguntas. */
  diaCalc(d) {
    const n = d.estudiantes.length || 1;
    const esLogro = v => v === 'L' || /adecuado|satisfactorio|logrado/i.test(v) && !/no logrado/i.test(v);
    const ind = d.columnas.map((c, i) => ({ nombre: c, pct: Math.round(d.estudiantes.filter(e => esLogro(e.valores[i] || '')).length / n * 10000) / 100 }));
    const areas = d.grupos.map(([nombre, a, b]) => { const sub = ind.slice(a, b); return { nombre, pct: sub.length ? Math.round(sub.reduce((t, x) => t + x.pct, 0) / sub.length * 100) / 100 : 0, sub }; });
    if ((d.preguntas || []).length) areas.push({ nombre: /lectura/i.test(d.asignatura) ? 'Comprensión oral' : 'Preguntas del instrumento', pct: Math.round(d.preguntas.reduce((t, p) => t + p.pct, 0) / d.preguntas.length * 100) / 100, sub: [], estimado: true });
    (d.areasManual || []).forEach(a => { if (a.nombre && !areas.some(x => x.nombre === a.nombre)) areas.push({ nombre: a.nombre, pct: +a.pct || 0, sub: [], manual: true }); });
    const apoyo = d.estudiantes.filter(e => e.valores.filter(v => !esLogro(v)).length >= Math.ceil(d.columnas.length / 2));
    return { ind, areas, apoyo, esLogro };
  },

  // ---------------- CARGA (UNO O VARIOS) ----------------
  openDiaUpload() {
    this.pickFiles({ accept: '.pdf,application/pdf', onPick: files => this.handleDiaFiles(files) });
  },
  async handleDiaFiles(files) {
    files = files.filter(f => /\.pdf$/i.test(f.name));
    if (!files.length) return notice({ type: 'error', title: 'No se cargó ningún informe', msg: 'Elija los informes DIA en PDF.' });
    const done = ui.busy('Leyendo informes DIA', '');
    const items = [], errores = [];
    for (const [i, f] of files.entries()) {
      el('busy-msg').textContent = `${i + 1} de ${files.length}: ${f.name}`;
      try {
        const p = this.parseDia(await this.pdfLines(f), f.name);
        items.push({ file: f, ...p, incluir: true });
      } catch (e) { errores.push(`${f.name}: ${e.message}`); }
    }
    done();
    if (errores.length) notice({ type: items.length ? 'warn' : 'error', title: 'Algunos informes no se pudieron leer', items: errores });
    if (!items.length) return;
    State.diaImport = items;
    ui.modal({ title: `Revisar informes DIA (${items.length})`, icon: 'bar-chart-3', tone: 'obs', size: 'xl', okText: 'Guardar resultados', body: '<div id="dia-import"></div>', onOk: () => this.saveDiaImport() });
    this.renderDiaImport();
  },
  diaMatch(it) {
    return it.filas.map(f => { const s = this.findStudentByName(f.nombre, it.course); return { ...f, studentId: s ? String(s.id) : '', ficha: s ? this.clean(s.name) : '' }; });
  },
  renderDiaImport() {
    el('dia-import').innerHTML = `<div class="stack">${State.diaImport.map((it, i) => {
      const est = this.diaMatch(it);
      const ya = (State.dia || []).find(d => d.id === this.diaId(it.course, it.anio, it.asignatura, it.periodo));
      return `<article class="iv-block">
        <div class="iv-form__top"><label class="check"><input type="checkbox" ${it.incluir ? 'checked' : ''} onchange="State.diaImport[${i}].incluir=this.checked"><span><strong>${esc(it.file.name)}</strong></span></label>
          <span class="row-actions">${chip(`${it.filas.length} estudiantes en la tabla`, it.filas.length ? 'conv' : 'warn')}${chip(`${est.filter(e => e.studentId).length} reconocidos en las fichas`, 'obs')}${ya ? chip('Ya existe: se reemplaza', 'warn', 'refresh-cw') : ''}</span></div>
        <div class="grid-4">
          ${fieldHtml('Curso', `<select class="input" onchange="State.diaImport[${i}].course=this.value; app.renderDiaImport()"><option value="">Elija el curso${it.cursoTxt ? ` (informe: ${esc(it.cursoTxt)})` : ''}</option>${options(ALL_COURSES.map(c => [c, c]), it.course)}</select>`)}
          ${fieldHtml('Asignatura', `<input class="input" value="${esc(it.asignatura)}" onchange="State.diaImport[${i}].asignatura=this.value">`)}
          ${fieldHtml('Periodo', `<select class="input" onchange="State.diaImport[${i}].periodo=this.value">${options(DIA_PERIODOS.map(p => [p, p]), it.periodo)}</select>`)}
          ${fieldHtml('Año', `<input type="number" class="input input--num num" value="${esc(it.anio)}" onchange="State.diaImport[${i}].anio=this.value">`)}
        </div>
        ${it.filas.length ? '' : `<p class="note">${ico('info')}No se encontró una tabla de resultados por estudiante con L / NL. Se guardará el PDF y podrá escribir los porcentajes por área en la página de Resultados DIA.</p>`}
        ${it.filas.length && !it.conocido ? `<p class="note">${ico('info')}Formato de informe no reconocido del todo: las columnas quedan como "Indicador 1, 2...". Puede renombrarlas después.</p>` : ''}
        ${est.length ? `<details><summary class="small">Ver estudiantes del informe y su ficha</summary><ul class="iv-list iv-list--tight">${est.map(e => `<li><span>${esc(e.nombre)}</span><span class="small">${e.studentId ? `→ ${esc(e.ficha)}` : '<em>sin ficha encontrada</em>'}</span></li>`).join('')}</ul></details>` : ''}
      </article>`;
    }).join('')}
    <p class="note">${ico('shield-check')}Según la Agencia de Calidad, estos resultados no deben usarse para calificar a los estudiantes ni para comparar cursos.</p></div>`;
    icons();
  },
  async saveDiaImport() {
    const sel = State.diaImport.filter(it => it.incluir);
    if (!sel.length) { toast('Elija al menos un informe', 'error'); return false; }
    const sinCurso = sel.find(it => !it.course);
    if (sinCurso) { toast(`Elija el curso de ${sinCurso.file.name}`, 'error'); return false; }
    ui.close();
    const done = ui.busy('Guardando resultados DIA', '');
    const ok = [], errores = [];
    for (const [n, it] of sel.entries()) {
      el('busy-msg').textContent = `${n + 1} de ${sel.length}: ${it.asignatura} ${it.course}`;
      try {
        const id = this.diaId(it.course, it.anio, it.asignatura, it.periodo);
        const prev = (State.dia || []).find(d => d.id === id);
        const up = await API.call('upload', { folderName: `${it.course} - Resultados DIA`, fileName: it.file.name, mimeType: 'application/pdf', base64: String(await readFileAsDataURL(it.file)).split(',')[1] });
        await DB.save('dia', {
          id, course: it.course, anio: String(it.anio), asignatura: it.asignatura, periodo: it.periodo, docente: it.docente, nInforme: it.nInforme, fechaInforme: it.fechaInforme,
          columnas: it.columnas, grupos: it.grupos, preguntas: it.preguntas, estudiantes: this.diaMatch(it), areasManual: prev?.areasManual || [],
          conclusiones: prev?.conclusiones || {}, fileName: it.file.name, driveId: up.fileId, url: up.url, cargadoPor: State.currentUser.name, fecha: today()
        });
        ok.push(`${it.asignatura} · ${it.periodo} · ${it.course}`);
      } catch (e) { errores.push(`${it.file.name}: ${e.message}`); }
    }
    done();
    notice({ type: errores.length ? (ok.length ? 'warn' : 'error') : 'success', title: ok.length ? 'Resultados DIA guardados' : 'No se guardaron los resultados', msg: ok.length ? 'Quedan en "Resultados DIA" de cada curso y en el reporte del curso.' : '', items: [...ok, ...errores] });
    if (ok.length) { State.diaCourse = sel[0].course; this.navigate('dia'); }
  },

  // ---------------- PÁGINA DEL CURSO ----------------
  openDia(course) { State.diaCourse = course; this.navigate('dia'); },
  renderDia() {
    const course = State.diaCourse;
    if (!course) return this.openCoursePicker('dia');
    const lista = this.diaOf(course);
    el('dia-toolbar').innerHTML = `<button class="btn" onclick="app.openCourse(${jsq(course)})">${ico('arrow-left')}Volver al curso</button>
      <div class="row-actions">
        <select class="input" aria-label="Curso" onchange="app.openDia(this.value)">${options(ALL_COURSES.map(c => [c, `${c}${(State.dia || []).some(d => d.course === c) ? ' ●' : ''}`]), course)}</select>
        ${this.canDia() ? `<button class="btn btn--primary" onclick="app.openDiaUpload()">${ico('upload')}Subir informes DIA</button>` : ''}
      </div>`;
    (this._diaCharts || []).forEach(c => c.destroy());
    this._diaCharts = [];
    el('dia-body').innerHTML = `<article class="entry"><div class="entry__head"><div class="entry__id"><h1 class="entry__name">Resultados DIA · ${esc(course)}</h1>
        <div class="chips">${chip(`${lista.length} informe(s)`, 'obs', 'bar-chart-3')}${chip('Diagnóstico Integral de Aprendizajes', 'neutral')}</div></div></div>
        <p class="entry__note entry__note--info">${ico('info')}Los resultados del DIA orientan la planificación. Según la Agencia de Calidad, no deben usarse para calificar a los estudiantes ni para comparar cursos.</p></article>
      ${lista.length ? lista.map(d => this.diaCardHtml(d)).join('') : empty('bar-chart-3', 'Aún no hay informes DIA para este curso. Súbalos con "Subir informes DIA" (puede elegir varios a la vez).', 'obs')}`;
    icons();
    lista.forEach(d => this.drawDiaChart(d));
  },
  diaCardHtml(d) {
    const c = this.diaCalc(d);
    const k = d.id.replace(/\W/g, '');
    const celda = v => `<td class="dia-cell" data-v="${c.esLogro(v) ? 'L' : v ? 'NL' : ''}">${esc(v || '')}</td>`;
    const con = d.conclusiones || {};
    const area = (txt, campo, ph) => fieldHtml(txt, `<textarea class="input" rows="2" placeholder="${ph}" onchange="app.saveDiaField(${jsq(d.id)}, '${campo}', this.value)">${esc(con[campo] || '')}</textarea>`);
    return `<section class="panel dia-card">
      <div class="panel__head"><h2>${ico('bar-chart-3')}${esc(d.asignatura)} · ${esc(d.periodo)} ${esc(d.anio)}</h2>
        <div class="row-actions"><button class="btn btn--sm" onclick="app.openDiaPdf(${jsq(d.id)})">${ico('file-text')}Informe original</button>${this.canDia() ? `<button class="icon-btn icon-btn--danger" title="Eliminar" aria-label="Eliminar resultados" onclick="app.deleteDia(${jsq(d.id)})">${ico('trash-2')}</button>` : ''}</div></div>
      <p class="muted small">Docente: ${esc(d.docente || '-')} · ${d.estudiantes.length || d.nInforme || 0} estudiante(s) · Informe generado el ${esc(d.fechaInforme || '-')} · Cargado por ${esc(d.cargadoPor || '')} el ${fmtDate(d.fecha)}</p>
      <div class="grid-2">
        <div class="chart chart--sm"><canvas id="dia-ch-${k}" role="img" aria-label="Porcentaje de logro del curso por área"></canvas></div>
        <div><table class="table table--dense"><thead><tr><th>Área</th><th class="t-num">% del curso</th></tr></thead><tbody>
          ${c.areas.map(a => `<tr><td><strong>${esc(a.nombre)}</strong>${a.estimado ? '<span class="cell-sub">Estimado con la alternativa más elegida en cada pregunta</span>' : ''}${a.sub.length ? `<span class="cell-sub">${a.sub.map(s => `${esc(s.nombre)}: ${String(s.pct).replace('.', ',')} %`).join(' · ')}</span>` : ''}</td><td class="t-num"><span class="dia-pct" data-level="${a.pct < 50 ? 'bajo' : a.pct < 75 ? 'medio' : 'alto'}">${String(a.pct).replace('.', ',')} %</span></td></tr>`).join('') || '<tr><td colspan="2">Sin áreas calculadas.</td></tr>'}
        </tbody></table>
        ${this.canDia() ? `<details class="small"><summary>Agregar o corregir un área manualmente</summary><div class="row-field"><input class="input" id="dia-an-${k}" placeholder="Área (ej: Números y operaciones)"><input type="number" class="input input--num num" id="dia-ap-${k}" placeholder="%"><button class="btn btn--sm" onclick="app.addDiaArea(${jsq(d.id)}, '${k}')">Agregar</button></div></details>` : ''}</div>
      </div>
      ${c.apoyo.length ? `<div class="tr-review">${ico('life-buoy')}<span><strong>${c.apoyo.length} estudiante(s) requieren apoyo</strong> (no logran la mitad o más de los indicadores): ${c.apoyo.map(e => e.studentId ? `<button type="button" class="link-btn" onclick="app.openStudent(${jsq(e.studentId)})">${esc(e.ficha || e.nombre)}</button>` : esc(e.nombre)).join(', ')}.</span></div>` : ''}
      ${d.estudiantes.length ? `<details ${d.estudiantes.length <= 20 ? '' : ''}><summary class="small">${ico('table')}Resultados por estudiante (${d.estudiantes.length})</summary><div class="table-wrap"><table class="table table--dense dia-table">
        <thead><tr><th>Estudiante</th>${d.columnas.map(col => `<th class="t-num">${esc(col)}</th>`).join('')}</tr></thead>
        <tbody>${d.estudiantes.map(e => `<tr><td>${e.studentId ? `<button type="button" class="link-btn" onclick="app.openStudent(${jsq(e.studentId)})">${esc(e.ficha || e.nombre)}</button>` : esc(e.nombre)}</td>${d.columnas.map((_, i) => celda(e.valores[i])).join('')}</tr>`).join('')}</tbody></table></div></details>` : ''}
      <details ${Object.values(con).some(Boolean) ? 'open' : ''}><summary class="small">${ico('clipboard-check')}Conclusiones del equipo</summary><div class="grid-2">
        ${area('Aprendizajes a enfatizar el resto del año', 'enfatizar', 'Según lo trabajado y los resultados...')}
        ${area('Habilidades no logradas por la mayoría y cómo reforzarlas', 'reforzar', 'Habilidades y ajustes a las estrategias...')}
        ${area('Diversidad del curso y estrategias focalizadas', 'diversidad', 'Grupos de estudiantes y apoyos...')}
        ${area('Acuerdos y responsables', 'acuerdos', 'Qué se hará, quién y cuándo...')}
      </div></details>
    </section>`;
  },
  drawDiaChart(d) {
    if (!window.Chart) return;
    const cv = el(`dia-ch-${d.id.replace(/\W/g, '')}`);
    if (!cv) return;
    const c = this.diaCalc(d);
    const color = p => cssVar(p < 50 ? '--tone-proto-ink' : p < 75 ? '--tone-warn-ink' : '--tone-conv-ink');
    this._diaCharts.push(new Chart(cv, { type: 'bar', data: { labels: c.areas.map(a => a.nombre), datasets: [{ label: '% del curso', data: c.areas.map(a => a.pct), backgroundColor: c.areas.map(a => color(a.pct)) }] },
      options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, title: { display: true, text: 'Porcentaje del curso por área', color: cssVar('--color-heading') } }, scales: { y: { min: 0, max: 100, ticks: { callback: v => `${v}%` } } } } }));
  },
  async saveDiaField(id, campo, valor) {
    const d = State.dia.find(x => x.id === id);
    try { await DB.save('dia', { id, conclusiones: { ...(d.conclusiones || {}), [campo]: valor } }, true); toast('Conclusión guardada'); }
    catch (e) { toast(e.message, 'error'); }
  },
  async addDiaArea(id, k) {
    const nombre = el(`dia-an-${k}`).value.trim(), pct = parseFloat(String(el(`dia-ap-${k}`).value).replace(',', '.'));
    if (!nombre || isNaN(pct)) return toast('Escriba el área y su porcentaje', 'error');
    const d = State.dia.find(x => x.id === id);
    const areas = (d.areasManual || []).filter(a => a.nombre !== nombre).concat([{ nombre, pct }]);
    try { await DB.save('dia', { id, areasManual: areas }, true); this.renderDia(); } catch (e) { toast(e.message, 'error'); }
  },
  deleteDia(id) {
    const d = State.dia.find(x => x.id === id);
    ui.confirm({ title: 'Eliminar resultados DIA', msg: `¿Eliminar <strong>${esc(d.asignatura)} · ${esc(d.periodo)} ${esc(d.anio)}</strong> de ${esc(d.course)}? Las conclusiones escritas también se eliminan.`, action: async () => {
      await DB.remove('dia', id);
      notice({ type: 'success', title: 'Resultados DIA eliminados', msg: `${d.asignatura} · ${d.periodo} de ${d.course}.` });
      this.renderDia();
    } });
  },
  async openDiaPdf(id) {
    const done = ui.busy('Abriendo informe', '');
    try {
      const f = await API.call('file', { diaId: id });
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(f.base64), c => c.charCodeAt(0))], { type: 'application/pdf' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) { notice({ type: 'error', title: 'No se pudo abrir el informe', msg: e.message }); }
    finally { done(); }
  },

  // ---------------- EN EL REPORTE DEL CURSO ----------------
  diaReportHtml(course, anio = '', sinTitulo = false) {
    const lista = this.diaOf(course).filter(d => !anio || String(d.anio) === String(anio));
    if (!lista.length) return '';
    return `<div class="doc-avoid">${sinTitulo ? '' : docH('Resultados DIA (Diagnóstico Integral de Aprendizajes)')}
      ${lista.map(d => { const c = this.diaCalc(d); const con = d.conclusiones || {}; return `<p><strong>${esc(d.asignatura)} · ${esc(d.periodo)} ${esc(d.anio)}</strong> · ${d.estudiantes.length || d.nInforme || 0} estudiantes · Docente: ${esc(d.docente || '-')}</p>
        ${docTable(['Área', '% del curso', 'Detalle'], c.areas.map(a => [esc(a.nombre), `<strong>${String(a.pct).replace('.', ',')} %</strong>`, esc(a.sub.map(s => `${s.nombre}: ${String(s.pct).replace('.', ',')} %`).join('; ') || (a.estimado ? 'Estimado desde las respuestas por pregunta' : ''))]), 'Sin áreas', '')}
        ${c.apoyo.length ? `<p class="doc-muted"><strong>Requieren apoyo (${c.apoyo.length}):</strong> ${esc(c.apoyo.map(e => e.ficha || e.nombre).join(', '))}.</p>` : ''}
        ${[['Aprendizajes a enfatizar', con.enfatizar], ['Habilidades a reforzar', con.reforzar], ['Diversidad y estrategias', con.diversidad], ['Acuerdos', con.acuerdos]].filter(([, v]) => v).map(([t, v]) => `<p><strong>${t}:</strong> ${esc(v)}</p>`).join('')}`; }).join('')}
      <p class="doc-muted">Fuente: informes DIA de la Agencia de Calidad de la Educación. No se usan para calificar ni para comparar cursos.</p></div>`;
  }
});

// Se agrega al "Reporte del curso"
(() => {
  const base = app.REPORTS.course_full_report;
  app.REPORTS.course_full_report = function (...args) {
    const r = base.apply(this, args);
    if (State.filterCourse) r.body += app.diaReportHtml(State.filterCourse);
    return r;
  };
})();
