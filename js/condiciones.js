'use strict';
// =====================================================================
// DIA · CUESTIONARIO "CONDICIONES PARA LA FORMACIÓN INTEGRAL"
// (bienestar, ansiedad ante las evaluaciones, convivencia digital)
// En vez de mostrar decenas de porcentajes se resume en:
//  1. Un semáforo por dimensión (% de respuestas favorables).
//  2. Las 3 preguntas más bajas (a trabajar) y las 2 más altas (a mantener).
//  3. Cuidados al interpretar (cursos pequeños, respuestas nulas).
//  4. Vista de todos los cursos (cursos × dimensiones) y conclusiones con IA.
// Se guarda en la colección "dia" con tipo "condiciones".
// =====================================================================
const COND_ASIG = 'Cuestionario Condiciones';
const COND_CORTES = { alto: 70, medio: 50 };

Object.assign(app, {
  esCondiciones(d) { return d && d.tipo === 'condiciones'; },
  condOf(course, anio = '') {
    return (State.dia || []).filter(d => this.esCondiciones(d) && d.course === course && (!anio || String(d.anio) === String(anio)))
      .sort((a, b) => String(b.anio).localeCompare(String(a.anio)) || DIA_PERIODOS.indexOf(b.periodo) - DIA_PERIODOS.indexOf(a.periodo));
  },
  condNivel(rf) { return rf >= COND_CORTES.alto ? 'alto' : rf >= COND_CORTES.medio ? 'medio' : 'bajo'; },
  condNivelTxt(rf) { return { alto: 'Fortaleza', medio: 'Atención', bajo: 'Prioridad' }[this.condNivel(rf)]; },
  condNum(v) { return String(Math.round(v * 10) / 10).replace('.', ','); },

  // ---------------- LECTURA DEL PDF ----------------
  esPdfCondiciones(doc) { return /Cuestionario\s+Condiciones|Condiciones para la formaci[oó]n integral/i.test((doc.lines || []).slice(0, 40).join(' ')); },
  parseCondiciones(doc, fileName) {
    const lines = doc.lines;
    const t = lines.join('\n');
    const base = this.parseDiaBase(doc, fileName);
    const N = s => this.normalizarTexto(s).toLowerCase();
    const limpia = s => String(s).replace(/^%\s*RF\s*/i, '').replace(/\s+/g, ' ').trim();
    // Dimensiones (Tabla x.y.1) agrupadas por condición (x.y Título)
    const dims = [];
    let grupo = '';
    for (let i = 0; i < lines.length; i++) {
      const g = lines[i].match(/^2\.\d\s+(.+)$/);
      if (g) grupo = g[1].trim();
      if (/^Tabla\s+\d+\.\d+\.1\b.*Respuestas Favorables/i.test(lines[i])) {
        for (let j = i + 1; j < lines.length && j < i + 8; j++) {
          if (/^Resultado/i.test(lines[j])) break;
          const m = limpia(lines[j]).match(/^(.+?)\s+(\d{1,3}(?:[.,]\d+)?)$/);
          if (m && !/^%/.test(m[1])) dims.push({ nombre: m[1].trim(), grupo, rf: parseFloat(m[2].replace(',', '.')) });
        }
      }
    }
    // Preguntas, por posición: número a la izquierda, texto al centro y % RF, % RNF, % Nulo a la derecha
    const preguntas = [];
    let dimActual = '';
    const dimDeTitulo = s => {
      const m = s.match(/Resultados en preguntas sobre (?:la |las |el |los )?(.+)$/i);
      if (!m) return '';
      const n = N(m[1]);
      return (dims.find(d => N(d.nombre) === n) || dims.find(d => n.startsWith(N(d.nombre)) || N(d.nombre).startsWith(n)) || { nombre: m[1].trim() }).nombre;
    };
    doc.pages.forEach(pg => {
      const titulos = pg.items.filter(i => /Resultados en preguntas sobre/i.test(i.s)).map(i => {
        const fila = pg.filas.find(f => Math.abs(f.y - i.y) < 3);
        return { y: i.y, dim: dimDeTitulo(fila ? fila.items.map(x => x.s).join(' ') : i.s) };
      });
      const esPct = s => /^\d{1,3}\.\d{2}$/.test(s);
      const trios = pg.filas.map(f => ({ y: f.y, v: f.items.filter(i => esPct(i.s) && i.x > 400).sort((a, b) => a.x - b.x) })).filter(f => f.v.length === 3);
      const nums = pg.items.filter(i => /^\d{1,2}$/.test(i.s) && i.x < 60 && i.y > 40).sort((a, b) => b.y - a.y);
      const usados = new Set();
      const qs = nums.map(q => {
        let best = null;
        trios.forEach((tr, k) => { if (!usados.has(k) && Math.abs(tr.y - q.y) < 14 && (!best || Math.abs(tr.y - q.y) < Math.abs(trios[best].y - q.y))) best = k; });
        if (best === null) return null;
        usados.add(best);
        const tr = trios[best];
        const tit = titulos.filter(x => x.y > q.y).sort((a, b) => a.y - b.y)[0];
        if (tit) dimActual = tit.dim;
        return { n: +q.s, y: q.y, dim: dimActual, rf: parseFloat(tr.v[0].s), rnf: parseFloat(tr.v[1].s), nulo: parseFloat(tr.v[2].s), partes: [] };
      }).filter(Boolean);
      // Texto: cada línea se asigna a la pregunta más cercana en altura
      pg.items.filter(i => i.x >= 60 && i.x < 440 && !esPct(i.s) && !/^(%|N°|NC$|Preguntas gu|•|Tabla|¿|Nota:)/i.test(i.s)).forEach(i => {
        let best = null;
        qs.forEach(q => { if (Math.abs(q.y - i.y) < 20 && (!best || Math.abs(q.y - i.y) < Math.abs(best.y - i.y))) best = q; });
        if (best) best.partes.push(i);
      });
      qs.forEach(q => { q.texto = q.partes.sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim(); delete q.partes; delete q.y; preguntas.push(q); });
    });
    const nResp = +((t.match(/contestaron el cuestionario:\s*(\d+)/i) || [])[1] || 0);
    return { ...base, tipo: 'condiciones', asignatura: COND_ASIG, dims, preguntas: preguntas.sort((a, b) => a.n - b.n), nInforme: nResp, filas: [], columnas: [], ejeDe: [], conocido: dims.length > 0 };
  },

  // ---------------- CÁLCULOS ----------------
  condCalc(d) {
    const ps = (d.preguntas || []).filter(p => p.texto);
    const orden = ps.slice().sort((a, b) => a.rf - b.rf);
    const n = +d.nInforme || 0;
    return {
      dims: d.dims || [],
      bajas: orden.slice(0, 3),
      altas: orden.slice(-2).reverse(),
      nulos: ps.filter(p => p.nulo > 10),
      peso: n ? 100 / n : 0
    };
  },

  // ---------------- REVISIÓN AL CARGAR ----------------
  condImportHtml(it, i) {
    const ya = (State.dia || []).find(d => d.id === this.diaId(it.course, it.anio, it.asignatura, it.periodo));
    return `<article class="iv-block">
      <div class="iv-form__top"><label class="check"><input type="checkbox" ${it.incluir ? 'checked' : ''} onchange="State.diaImport[${i}].incluir=this.checked"><span><strong>${esc(it.file.name)}</strong></span></label>
        <span class="row-actions">${chip('Cuestionario de Condiciones', 'conv', 'heart-handshake')}${chip(`${it.dims.length} dimensiones · ${it.preguntas.length} preguntas`, it.dims.length ? 'obs' : 'warn')}${chip(`${it.nInforme || 0} estudiantes contestaron`, 'neutral')}${ya ? chip('Ya existe: se reemplaza', 'warn', 'refresh-cw') : ''}</span></div>
      <div class="grid-3">
        ${fieldHtml('Curso', `<select class="input" onchange="State.diaImport[${i}].course=this.value; app.renderDiaImport()"><option value="">Elija el curso${it.cursoTxt ? ` (informe: ${esc(it.cursoTxt)})` : ''}</option>${options(ALL_COURSES.map(c => [c, c]), it.course)}</select>`)}
        ${fieldHtml('Periodo', `<select class="input" onchange="State.diaImport[${i}].periodo=this.value">${options(DIA_PERIODOS.map(p => [p, p]), it.periodo)}</select>`)}
        ${fieldHtml('Año', `<input type="number" class="input input--num num" value="${esc(it.anio)}" onchange="State.diaImport[${i}].anio=this.value">`)}
      </div>
      ${it.dims.length ? `<div class="cond-mini">${it.dims.map(x => `<span class="dia-pct" data-level="${this.condNivel(x.rf)}">${esc(x.nombre)}: ${this.condNum(x.rf)} %</span>`).join(' ')}</div>` : `<p class="note">${ico('alert-triangle')}No se encontraron las dimensiones en el informe. Se guardará el PDF.</p>`}
    </article>`;
  },
  condDoc(it, up, prev) {
    return {
      id: this.diaId(it.course, it.anio, it.asignatura, it.periodo), tipo: 'condiciones', course: it.course, anio: String(it.anio), asignatura: COND_ASIG, periodo: it.periodo,
      nInforme: it.nInforme, fechaInforme: it.fechaInforme, dims: it.dims, preguntas: it.preguntas, estudiantes: [], columnas: [],
      conclusiones: prev?.conclusiones || {}, conclusionesPor: prev?.conclusionesPor || '', conclusionesFecha: prev?.conclusionesFecha || '', conclusionesIA: !!prev?.conclusionesIA,
      fileName: it.file.name, driveId: up.fileId, url: up.url, cargadoPor: State.currentUser.name, fecha: today()
    };
  },

  // ---------------- TARJETA DEL CURSO ----------------
  condCardHtml(d) {
    const c = this.condCalc(d);
    const k = d.id.replace(/\W/g, '');
    const con = d.conclusiones || {};
    const bor = (State.diaBorrador || {})[d.id];
    const area = (txt, campo, ph) => fieldHtml(txt, `<textarea class="input" rows="${bor ? 5 : 3}" id="dia-c-${k}-${campo}" placeholder="${ph}" ${this.canDia() ? '' : 'readonly'} oninput="app.diaDraftSet(${jsq(d.id)}, '${campo}', this.value)">${esc(bor && bor[campo] !== undefined ? bor[campo] : (con[campo] || ''))}</textarea>`);
    const grupos = [...new Set(c.dims.map(x => x.grupo || ''))];
    const fila = p => `<li><span class="cond-q"><strong>${p.n}.</strong> ${esc(p.texto)}</span><span class="dia-pct" data-level="${this.condNivel(p.rf)}">${this.condNum(p.rf)} %</span></li>`;
    const porDim = [...new Set((d.preguntas || []).map(p => p.dim || 'Otras'))];
    return `<section class="panel dia-card cond-card">
      <div class="panel__head"><h2>${ico('heart-handshake')}Condiciones para la formación integral · ${esc(d.periodo)} ${esc(d.anio)}</h2>
        <div class="row-actions"><button class="btn btn--sm" onclick="app.openDiaPdf(${jsq(d.id)})">${ico('file-text')}Informe original</button>${this.canDia() ? `<button class="icon-btn icon-btn--danger" title="Eliminar" aria-label="Eliminar cuestionario" onclick="app.deleteDia(${jsq(d.id)})">${ico('trash-2')}</button>` : ''}</div></div>
      <p class="muted small">${d.nInforme || 0} estudiantes contestaron · Informe generado el ${esc(d.fechaInforme || '-')} · Cargado por ${esc(d.cargadoPor || '')} el ${fmtDate(d.fecha)}</p>

      <h3 class="cond-h">${ico('traffic-cone')}Semáforo por dimensión <span class="muted small">(% de respuestas favorables)</span></h3>
      <div class="cond-dims">${grupos.map(g => `${g ? `<p class="cond-grupo">${esc(g)}</p>` : ''}${c.dims.filter(x => (x.grupo || '') === g).map(x => `
        <div class="cond-dim" data-level="${this.condNivel(x.rf)}">
          <span class="cond-dim__name">${esc(x.nombre)}</span>
          <span class="cond-bar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, x.rf))}%"></span></span>
          <span class="cond-dim__pct num">${this.condNum(x.rf)} %</span>
          <span class="cond-tag">${this.condNivelTxt(x.rf)}</span>
        </div>`).join('')}`).join('') || '<p class="muted small">Sin dimensiones leídas.</p>'}</div>
      <p class="cond-legend small"><span class="dia-pct" data-level="alto">70 % o más: fortaleza</span> <span class="dia-pct" data-level="medio">50 % a 69 %: atención</span> <span class="dia-pct" data-level="bajo">menos de 50 %: prioridad</span></p>

      <div class="grid-2 cond-focos">
        <div class="cond-foco cond-foco--bajo"><h4>${ico('target')}A trabajar (3 más bajas)</h4><ul class="cond-list">${c.bajas.map(fila).join('') || '<li class="muted small">Sin preguntas leídas.</li>'}</ul></div>
        <div class="cond-foco cond-foco--alto"><h4>${ico('star')}A mantener (2 más altas)</h4><ul class="cond-list">${c.altas.map(fila).join('') || '<li class="muted small">Sin preguntas leídas.</li>'}</ul></div>
      </div>

      <div class="note cond-care">${ico('info')}<span><strong>Al interpretar:</strong> ${c.peso ? `con ${d.nInforme} estudiantes, cada uno equivale a unos ${this.condNum(c.peso)} puntos; diferencias menores a eso no son relevantes. ` : ''}Es la percepción del curso, no una evaluación psicológica, y no se compara con años anteriores (Agencia de Calidad).${c.nulos.length ? ` <strong>${c.nulos.length} pregunta(s) con más de 10 % de respuestas nulas</strong> (${c.nulos.map(p => p.n).join(', ')}): léalas con cautela.` : ''}</span></div>

      <details><summary class="small">${ico('table')}Ver todas las preguntas (${(d.preguntas || []).length})</summary>
        ${porDim.map(dim => `<h4 class="cond-dimtitle">${esc(dim)}</h4><div class="table-wrap"><table class="table table--dense"><thead><tr><th>N°</th><th>Pregunta</th><th class="t-num">% favorables</th><th class="t-num">% no favorables</th><th class="t-num">% nulas</th></tr></thead><tbody>
          ${(d.preguntas || []).filter(p => (p.dim || 'Otras') === dim).map(p => `<tr><td class="num">${p.n}</td><td>${esc(p.texto)}</td><td class="t-num"><span class="dia-pct" data-level="${this.condNivel(p.rf)}">${this.condNum(p.rf)} %</span></td><td class="t-num num">${this.condNum(p.rnf)} %</td><td class="t-num num">${this.condNum(p.nulo)} %</td></tr>`).join('')}
        </tbody></table></div>`).join('')}
      </details>

      <details ${Object.values(con).some(Boolean) || bor ? 'open' : ''}><summary class="small">${ico('clipboard-check')}Conclusiones del equipo (máximo 3 focos)</summary>
        ${this.canDia() ? `<div class="row-actions dia-ia"><button type="button" class="btn btn--sm" onclick="app.completeCondAI(${jsq(d.id)})">${ico('sparkles')}${Object.values(con).some(Boolean) ? 'Proponer de nuevo con IA' : 'Completar con IA'}</button><span class="muted small">La IA propone a partir del semáforo y las preguntas más bajas. Puede editarlo antes de guardar.</span></div>` : ''}
        ${bor?.ia ? `<p class="tr-review">${ico('alert-triangle')}<span><strong>Propuesta de la IA sin guardar.</strong> Ajústela según lo que conoce del curso y presione "Guardar conclusiones".</span></p>` : ''}
        <div class="grid-2">
          ${area('Acciones realizadas este año que favorecen estas condiciones', 'acciones', 'Talleres, orientación, acompañamiento...')}
          ${area('Desafíos identificados', 'desafios', 'Dimensiones y preguntas más bajas...')}
          ${area('Focos de trabajo (máximo 3)', 'focos', '1. ...\n2. ...\n3. ...')}
          ${area('Acuerdos, responsables y plazos', 'acuerdos', 'Qué se hará, quién y cuándo...')}
        </div>
        ${this.canDia() ? `<div class="form-foot"><span class="muted small">${d.conclusionesPor ? `Guardadas por ${esc(d.conclusionesPor)} el ${fmtDate(d.conclusionesFecha)}${d.conclusionesIA ? ' (con apoyo de IA)' : ''}` : ''}</span><div class="row-actions">${bor ? `<button type="button" class="btn btn--sm" onclick="app.discardDiaDraft(${jsq(d.id)})">Descartar cambios</button>` : ''}<button type="button" class="btn btn--sm btn--primary" onclick="app.saveCondConclusiones(${jsq(d.id)}, '${k}')">${ico('save')}Guardar conclusiones</button></div></div>` : ''}
      </details>
    </section>`;
  },
  async saveCondConclusiones(id, k) {
    const d = State.dia.find(x => x.id === id);
    const con = Object.fromEntries(['acciones', 'desafios', 'focos', 'acuerdos'].map(c => [c, (el(`dia-c-${k}-${c}`)?.value || '').trim()]));
    const usoIA = !!(State.diaBorrador?.[id]?.ia || d.conclusionesIA);
    try {
      await DB.save('dia', { id, conclusiones: con, conclusionesPor: State.currentUser.name, conclusionesFecha: today(), conclusionesIA: usoIA }, true);
      if (State.diaBorrador) delete State.diaBorrador[id];
      notice({ type: 'success', title: 'Conclusiones guardadas', msg: `Cuestionario de Condiciones · ${d.periodo} de ${d.course}. Se incluyen en el reporte del curso y en la ficha de traspaso.` });
      this.renderDia();
    } catch (e) { notice({ type: 'error', title: 'No se guardaron las conclusiones', msg: e.message }); }
  },
  /** Datos agregados para la IA (no hay datos individuales en este informe). */
  condDatosIA(d) {
    const c = this.condCalc(d);
    return {
      periodo: d.periodo, anio: d.anio, estudiantes_que_contestaron: d.nInforme,
      dimensiones: c.dims.map(x => ({ condicion: x.grupo, dimension: x.nombre, porcentaje_favorable: x.rf, nivel: this.condNivelTxt(x.rf) })),
      preguntas_mas_bajas: c.bajas.map(p => ({ dimension: p.dim, pregunta: p.texto, favorable: p.rf, no_favorable: p.rnf })),
      preguntas_mas_altas: c.altas.map(p => ({ dimension: p.dim, pregunta: p.texto, favorable: p.rf })),
      puntos_por_estudiante: Math.round(c.peso * 10) / 10
    };
  },
  async completeCondAI(id) {
    if (!AI.ready()) return;
    const d = State.dia.find(x => x.id === id);
    const ok = await this.iaConsent(`Cuestionario de Condiciones para la formación integral (DIA ${esc(d.periodo)} ${esc(d.anio)}) del curso ${esc(d.course)}: porcentajes del curso por dimensión y por pregunta. Son datos agregados del curso; no hay datos de estudiantes individuales.`);
    if (!ok) return;
    const datos = { curso: d.course, ...this.condDatosIA(d), conclusiones_actuales: d.conclusiones || {} };
    AI.run('Redactando conclusiones', 'La IA analiza el semáforo y las preguntas más bajas...', async () => {
      const r = await API.call('ai', { motivo: `Conclusiones Cuestionario Condiciones ${d.course}`, json: true, prompt: `Actúa como equipo de convivencia escolar y orientación de un colegio público en Chile (Política Nacional de Convivencia Escolar). Analiza el Cuestionario "Condiciones para la formación integral" del DIA (Agencia de Calidad) del curso ${d.course} y redacta conclusiones breves y accionables.
Reglas:
- Usa solo los datos. Cita las dimensiones o preguntas con su porcentaje favorable.
- 70 % o más es fortaleza; de 50 % a 69 % requiere atención; bajo 50 % es prioridad.
- Considera que cada estudiante equivale a unos ${this.condNum(this.condCalc(d).peso)} puntos: no saques conclusiones de diferencias menores.
- Es percepción del curso: no hagas evaluaciones psicológicas, no etiquetes estudiantes ni compares con años anteriores.
- Como máximo 3 focos, concretos y realistas para el aula y el colegio (por ejemplo, manejo de la ansiedad ante evaluaciones, vínculo con adultos, convivencia digital).
- Español de Chile, tono profesional, 2 a 5 líneas por campo.

DATOS (JSON): ${JSON.stringify(datos).slice(0, 9000)}

Devuelve SOLO un JSON: {"acciones": "Acciones que probablemente ya favorecen las fortalezas (formula como sugerencia a confirmar por el equipo)", "desafios": "Principales desafíos según los datos", "focos": "1. ...\\n2. ...\\n3. ... (máximo 3)", "acuerdos": "Acuerdos con responsable por cargo (profesor jefe, convivencia, orientación, UTP) y plazo"}` });
      const j = r.json || {};
      State.diaBorrador = State.diaBorrador || {};
      State.diaBorrador[id] = { ia: true, ...Object.fromEntries(['acciones', 'desafios', 'focos', 'acuerdos'].map(k => [k, String(j[k] || '')])) };
      this.renderDia();
      toast('Propuesta lista: revísela y presione "Guardar conclusiones"');
    });
  },

  // ---------------- TODOS LOS CURSOS (cursos × dimensiones) ----------------
  condOverviewHtml() {
    const f = State.diaFiltro || {};
    const cursos = this.myCourses();
    const lista = (State.dia || []).filter(d => this.esCondiciones(d) && cursos.includes(d.course) && (!f.anio || String(d.anio) === f.anio) && (!f.periodo || d.periodo === f.periodo));
    if (!lista.length) return '';
    // El más reciente por curso
    const porCurso = {};
    lista.forEach(d => { const p = porCurso[d.course]; if (!p || String(d.anio) > String(p.anio) || (d.anio === p.anio && DIA_PERIODOS.indexOf(d.periodo) > DIA_PERIODOS.indexOf(p.periodo))) porCurso[d.course] = d; });
    const filas = ALL_COURSES.filter(c => porCurso[c]).map(c => porCurso[c]);
    const dims = [];
    filas.forEach(d => (d.dims || []).forEach(x => { if (!dims.includes(x.nombre)) dims.push(x.nombre); }));
    const prom = dims.map(n => { const v = filas.map(d => (d.dims || []).find(x => x.nombre === n)).filter(Boolean).map(x => x.rf); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
    const minI = prom.reduce((b, v, i) => v !== null && (b < 0 || v < prom[b]) ? i : b, -1);
    return `<section class="panel cond-over">
      <div class="panel__head"><h2>${ico('heart-handshake')}Cuestionario de Condiciones · todos los cursos</h2></div>
      <p class="muted small">% de respuestas favorables por dimensión (informe más reciente de cada curso). ${minI >= 0 ? `Dimensión más baja en el colegio: <strong>${esc(dims[minI])}</strong> (${this.condNum(prom[minI])} % en promedio): conviene abordarla a nivel institucional.` : ''}</p>
      <div class="table-wrap"><table class="table table--dense cond-heat"><thead><tr><th>Curso</th>${dims.map(n => `<th class="t-num">${esc(n)}</th>`).join('')}<th class="t-actions"></th></tr></thead><tbody>
        ${filas.map(d => `<tr><td><span class="cell-title">${esc(d.course)}</span><span class="cell-sub">${esc(d.periodo)} ${esc(d.anio)} · ${d.nInforme || 0} est.</span></td>${dims.map(n => { const x = (d.dims || []).find(y => y.nombre === n); return x ? `<td class="t-num cond-cell" data-level="${this.condNivel(x.rf)}" title="${esc(n)}: ${this.condNivelTxt(x.rf)}">${this.condNum(x.rf)}</td>` : '<td class="t-num muted">–</td>'; }).join('')}<td class="t-actions"><button class="btn btn--sm" onclick="app.openDia(${jsq(d.course)})">${ico('folder-open')}Ver</button></td></tr>`).join('')}
        <tr class="cond-prom"><td><strong>Promedio</strong></td>${prom.map(v => v === null ? '<td></td>' : `<td class="t-num cond-cell" data-level="${this.condNivel(v)}"><strong>${this.condNum(v)}</strong></td>`).join('')}<td></td></tr>
      </tbody></table></div>
      <p class="cond-legend small"><span class="dia-pct" data-level="alto">70 % o más</span> <span class="dia-pct" data-level="medio">50 % a 69 %</span> <span class="dia-pct" data-level="bajo">menos de 50 %</span> · No se usa para comparar ni calificar cursos: sirve para decidir dónde poner apoyos.</p>
    </section>`;
  },

  // ---------------- TEXTOS PARA TRASPASO, RIESGOS Y REPORTES ----------------
  condTexto(lista) {
    return (lista || []).map(d => {
      const c = this.condCalc(d);
      return `Cuestionario de Condiciones (${d.periodo} ${d.anio}, ${d.nInforme || 0} estudiantes): ${c.dims.map(x => `${x.nombre} ${this.condNum(x.rf)} % (${this.condNivelTxt(x.rf).toLowerCase()})`).join('; ')}.` +
        (c.bajas.length ? `\nPreguntas más bajas: ${c.bajas.map(p => `"${p.texto}" ${this.condNum(p.rf)} %`).join('; ')}.` : '') +
        (d.conclusiones?.focos ? `\nFocos del equipo: ${d.conclusiones.focos}` : '');
    }).join('\n\n');
  },
  condChipsHtml(lista) {
    return (lista || []).map(d => `<div class="tr-dia"><h4>${ico('heart-handshake')}Condiciones para la formación integral · ${esc(d.periodo)}</h4><div class="chips">${(d.dims || []).map(x => `<span class="dia-pct" data-level="${this.condNivel(x.rf)}">${esc(x.nombre)}: ${this.condNum(x.rf)} %</span>`).join(' ')}</div></div>`).join('');
  },
  condReportHtml(course, anio = '') {
    const lista = this.condOf(course, anio);
    if (!lista.length) return '';
    return `<div class="doc-avoid">${docH('Cuestionario Condiciones para la formación integral (DIA)')}
      ${lista.map(d => { const c = this.condCalc(d); const con = d.conclusiones || {}; return `<p><strong>${esc(d.periodo)} ${esc(d.anio)}</strong> · ${d.nInforme || 0} estudiantes contestaron</p>
        ${docTable(['Dimensión', '% favorable', 'Lectura'], c.dims.map(x => [esc(x.nombre), `<strong>${this.condNum(x.rf)} %</strong>`, this.condNivelTxt(x.rf)]), 'Sin dimensiones', '')}
        ${c.bajas.length ? `<p><strong>A trabajar:</strong> ${c.bajas.map(p => `${esc(p.texto)} (${this.condNum(p.rf)} %)`).join('; ')}.</p>` : ''}
        ${c.altas.length ? `<p><strong>A mantener:</strong> ${c.altas.map(p => `${esc(p.texto)} (${this.condNum(p.rf)} %)`).join('; ')}.</p>` : ''}
        ${[['Acciones realizadas', con.acciones], ['Desafíos', con.desafios], ['Focos', con.focos], ['Acuerdos', con.acuerdos]].filter(([, v]) => v).map(([t, v]) => `<p><strong>${t}:</strong> <span class="doc-pre">${esc(v)}</span></p>`).join('')}`; }).join('')}
      <p class="doc-muted">Percepción de los estudiantes; no es una evaluación psicológica ni se compara con años anteriores (Agencia de Calidad de la Educación).</p></div>`;
  }
});

// ---------------- INTEGRACIÓN CON EL MÓDULO DIA ----------------
(() => {
  // El parser académico queda como base; el cuestionario se detecta por su título
  app.parseDiaBase = app.parseDia;
  app.parseDia = function (doc, fileName) { return this.esPdfCondiciones(doc) ? this.parseCondiciones(doc, fileName) : this.parseDiaBase(doc, fileName); };
  // Los informes académicos no incluyen el cuestionario (tiene otra estructura)
  const diaOf = app.diaOf;
  app.diaOf = function (course) { return diaOf.call(this, course).filter(d => !this.esCondiciones(d)); };
  // Reporte del curso y ficha de traspaso (documento): se agrega el resumen del cuestionario
  const rep = app.diaReportHtml;
  app.diaReportHtml = function (course, anio = '', sinTitulo = false) { return (rep.call(this, course, anio, sinTitulo) || '') + this.condReportHtml(course, anio); };
  // Ficha de traspaso: datos del curso
  if (app.computeTraspaso) {
    const ct = app.computeTraspaso;
    app.computeTraspaso = function (...args) { const a = ct.apply(this, args); const [course, anio] = args; a.condiciones = this.condOf(course || State.traspasoCourse, anio || State.traspasoAnio); return a; };
  }
})();
