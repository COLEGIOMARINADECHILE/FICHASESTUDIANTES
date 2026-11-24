'use strict';
// =====================================================================
// ACTAS FIRMADAS DE CARTAS DE COMPROMISO
// Se suben en PDF de a una o varias juntas en un mismo archivo: el sistema
// lee cada página, reconoce al estudiante (RUN o nombre), separa el PDF
// por estudiante y guarda cada acta en su ficha, vinculada a su carta.
// =====================================================================
const ACTA_TIPO = 'Acta o Compromiso Firmado';

Object.assign(app, {
  canUploadActas() { return hasAccess('agregar_entrevistas') || hasAccess('editar_fichas') || hasAccess('gestionar_usuarios'); },
  actaOf(cartaId) { return State.rawEvidences.find(e => e.cartaId && sameId(e.cartaId, cartaId)); },
  cartasOf(studentId) {
    const s = this.getStudent(studentId);
    return s ? s.history.filter(h => this.isCarta(h)).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
  },
  async loadPdfLib() {
    if (window.PDFLib) return;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el separador de PDF. Revise su conexión.')); document.head.appendChild(s); });
  },
  pdfjs() {
    const lib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    if (!lib) throw new Error('La biblioteca PDF.js no está cargada.');
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    return lib;
  },
  /** Estudiante mencionado en el texto de una página: primero por RUN, luego por nombre y primer apellido. */
  studentInText(text, pool) {
    const byRun = this.findStudentByRun(text).student;
    if (byRun) return byRun;
    const N = s => this.normalizarTexto(s);
    const t = ` ${N(text)} `;
    let best = null, bestHits = 0;
    pool.forEach(s => {
      const w = N(s.name).split(' ').filter(x => x.length > 2);
      if (w.length < 2) return;
      const hits = w.filter(x => t.includes(` ${x} `)).length;
      // Nombre + apellido como mínimo, y más de la mitad de las palabras del nombre
      if (hits >= 2 && hits / w.length > 0.5 && hits > bestHits) { best = s; bestHits = hits; }
    });
    return best;
  },

  /** Botones de la tarjeta de una carta: ver el acta firmada o subirla. */
  actaButtonHtml(s, c) {
    const acta = this.actaOf(c.id);
    if (acta) return `<button class="btn btn--sm" title="Ver acta firmada" onclick="app.openEvidence(${jsq(acta.id)})">${ico('file-check')}Acta firmada</button>`;
    return this.canUploadActas() ? `<button class="btn btn--sm" title="Subir el acta firmada en PDF" onclick="app.openActasImport({ studentId: ${jsq(s.id)}, cartaId: ${jsq(c.id)} })">${ico('upload')}Subir acta</button>` : '';
  },
  openActasImport(preset = {}) {
    this.pickFiles({ accept: '.pdf,application/pdf', onPick: files => this.handleActas(files, preset) });
  },
  /** Acceso directo desde el menú: cartas masivas (se separan solas) o la de un estudiante. */
  openCartasHub() {
    ui.modal({
      title: 'Cartas de compromiso firmadas', icon: 'file-check', tone: 'warn', size: 'md', hideOk: true, cancelText: 'Cerrar',
      body: `<div class="stack">
        <h4 class="hub-h">${ico('files')}Varias cartas juntas</h4>
        <p class="modal__msg">Suba uno o varios PDF con todas las cartas firmadas (por ejemplo, el escaneo completo de un curso). El sistema lee cada página, reconoce al estudiante por su RUN o nombre, <strong>separa el PDF por estudiante</strong> y le muestra el resultado para revisarlo antes de guardar.</p>
        <div id="cartas-drop" class="drop-zone" tabindex="0" role="button" aria-label="Arrastre aquí los PDF de cartas o presione para elegirlos">${ico('file-up')}<strong>Arrastre aquí los PDF de las cartas</strong><span class="muted small">o presione para elegir los archivos</span></div>
        <p class="note">${ico('scan')}Si el PDF es escaneado (foto o imagen), se usa el reconocimiento de texto de Google para leer el nombre. Si no se reconoce, usted elige al estudiante en la revisión.</p>
        <hr class="hub-sep">
        <h4 class="hub-h">${ico('user')}La carta de un estudiante</h4>
        ${this.studentDatalist('cartas-students')}
        <div class="row-field">
          <input id="cartas-student" class="input input--grow" list="cartas-students" placeholder="Escriba el nombre o RUN del estudiante" autocomplete="off">
          <button type="button" class="btn btn--primary" onclick="app.cartaIndividual()">${ico('upload')}Elegir PDF</button>
        </div>
      </div>`
    });
    const z = el('cartas-drop'), pick = () => { ui.close(); this.openActasImport(); };
    z.onclick = pick;
    z.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    z.ondragover = e => { e.preventDefault(); z.classList.add('is-over'); };
    z.ondragleave = () => z.classList.remove('is-over');
    z.ondrop = e => { e.preventDefault(); const f = [...(e.dataTransfer.files || [])]; ui.close(); this.handleActas(f); };
  },
  cartaIndividual() {
    const s = this.studentByLabel(el('cartas-student').value);
    if (!s) { toast('Elija un estudiante de la lista', 'error'); return el('cartas-student').focus(); }
    ui.close();
    this.openActasImport({ studentId: String(s.id) });
  },
  /** Fecha escrita en la carta (dd/mm/aaaa o "12 de marzo de 2026"). */
  fechaEnTexto(text) {
    const t = String(text || '');
    let m = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    m = this.normalizarTexto(t).toLowerCase().match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) (?:de |del )?(20\d{2})\b/);
    if (m) { const mi = m[2] === 'setiembre' ? 8 : meses.indexOf(m[2]); return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    return '';
  },
  /** Carta por defecto para un acta: la primera sin acta; si no hay, se registra una nueva. */
  cartaPorDefecto(studentId, preset) {
    if (preset && preset.cartaId) return String(preset.cartaId);
    const libre = this.cartasOf(studentId).find(c => !this.actaOf(c.id));
    return libre ? String(libre.id) : '__new';
  },
  async handleActas(files, preset = {}) {
    files = files.filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (!files.length) return toast('Seleccione archivos PDF', 'error');
    const done = ui.busy('Leyendo las actas', '');
    try {
      const lib = this.pdfjs();
      const pool = this.getStudents();
      const pages = [];
      const sources = [];
      for (const [fi, f] of files.entries()) {
        const buf = await f.arrayBuffer();
        sources.push({ name: f.name, bytes: new Uint8Array(buf.slice(0)) });
        const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
        for (let p = 1; p <= pdf.numPages; p++) {
          el('busy-msg').textContent = `${f.name}: página ${p} de ${pdf.numPages}`;
          const page = await pdf.getPage(p);
          const text = (await page.getTextContent()).items.map(i => i.str).join(' ');
          const vp = page.getViewport({ scale: 1 });
          const scale = 150 / vp.width;
          const canvas = document.createElement('canvas');
          const v2 = page.getViewport({ scale });
          canvas.width = v2.width; canvas.height = v2.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: v2 }).promise;
          pages.push({ fi, p: p - 1, page, text, thumb: canvas.toDataURL('image/jpeg', 0.7), hasText: text.replace(/\s/g, '').length > 30 });
        }
      }
      // Páginas escaneadas: se leen con el reconocimiento de texto de Google (en el servidor)
      const escaneadas = pages.filter(pg => !pg.hasText);
      if (escaneadas.length && !preset.studentId && window.APP_CONFIG?.API_URL) {
        let leidas = 0;
        for (const [k, pg] of escaneadas.entries()) {
          el('busy-title').textContent = 'Reconociendo texto en páginas escaneadas';
          el('busy-msg').textContent = `Página ${k + 1} de ${escaneadas.length}. Puede tardar unos segundos por página.`;
          try {
            const vp = pg.page.getViewport({ scale: 1 });
            const v2 = pg.page.getViewport({ scale: Math.min(2.5, 1600 / vp.width) });
            const c = document.createElement('canvas');
            c.width = v2.width; c.height = v2.height;
            await pg.page.render({ canvasContext: c.getContext('2d'), viewport: v2 }).promise;
            const r = await API.call('ocrPagina', { base64: c.toDataURL('image/jpeg', 0.8).split(',')[1] });
            if (r && r.texto && r.texto.replace(/\s/g, '').length > 30) { pg.text = r.texto; pg.hasText = true; pg.ocr = true; leidas++; }
          } catch (e) { console.warn('OCR', e); }
        }
        State.actasOcr = { total: escaneadas.length, leidas };
      } else State.actasOcr = null;
      pages.forEach(pg => {
        const det = preset.studentId ? null : (pg.text.trim() ? this.studentInText(pg.text, pool) : null);
        pg.detected = det ? String(det.id) : '';
        pg.fechaDoc = this.fechaEnTexto(pg.text);
        delete pg.page; delete pg.text;
      });
      State.actas = { files: sources, pages, preset, porCarta: 1 };
      State.actasDocs = {};
      this.groupActas(true);
      done();
      ui.modal({ title: preset.studentId ? 'Subir acta firmada' : `Separar y subir actas firmadas (${pages.length} página${pages.length === 1 ? '' : 's'})`, icon: 'file-check', tone: 'warn', size: 'xl', okText: 'Guardar actas en las fichas', body: '<div id="actas-content"></div>', onOk: () => this.saveActas() });
      this.renderActas();
    } catch (e) { done(); console.error(e); toast('No se pudo leer el PDF: ' + e.message, 'error'); }
  },
  /** Marca dónde empieza cada acta. Con texto: cambia el estudiante. Escaneadas: cada N páginas. */
  groupActas(inicial = false) {
    const a = State.actas;
    const porArchivo = {};
    a.pages.forEach(pg => (porArchivo[pg.fi] = porArchivo[pg.fi] || []).push(pg));
    Object.values(porArchivo).forEach(list => {
      const conTexto = list.some(pg => pg.hasText);
      let actual = '';
      list.forEach((pg, i) => {
        if (!inicial && pg.manual) return;
        if (a.preset.studentId) { pg.start = i === 0; return; }
        if (i === 0) { pg.start = true; actual = pg.detected; return; }
        if (conTexto) { pg.start = !!pg.detected && pg.detected !== actual; if (pg.detected) actual = pg.detected; }
        else pg.start = list.length > 2 && i % Math.max(1, a.porCarta) === 0;
      });
    });
  },
  actaGroups() {
    const a = State.actas, groups = [];
    a.pages.forEach((pg, i) => {
      if (pg.start || !groups.length || a.pages[i - 1].fi !== pg.fi) groups.push({ first: pg, pages: [] });
      groups[groups.length - 1].pages.push(pg);
    });
    groups.forEach(g => {
      const f = g.first;
      if (f.studentId === undefined) f.studentId = a.preset.studentId ? String(a.preset.studentId) : (g.pages.find(p => p.detected)?.detected || '');
      if (f.cartaId === undefined && f.studentId) f.cartaId = this.cartaPorDefecto(f.studentId, a.preset);
      if (f.fechaCarta === undefined) f.fechaCarta = (g.pages.find(p => p.fechaDoc && p.fechaDoc <= today()) || {}).fechaDoc || today();
      if (f.tipoCarta === undefined) f.tipoCarta = 'Carta Compromiso';
      if (f.incluir === undefined) f.incluir = true;
    });
    return groups;
  },
  setActaStudent(i, id) {
    const g = this.actaGroups()[i];
    g.first.studentId = id;
    g.first.cartaId = id ? this.cartaPorDefecto(id, State.actas.preset) : '';
    g.first.incluir = !!id;
    this.renderActas();
  },
  /** Estudiante a partir de lo escrito: etiqueta de la lista, RUN o palabras del nombre (en cualquier orden). */
  resolveStudentText(v) {
    const t = String(v || '').trim();
    if (!t) return { s: null };
    const exacto = this.studentByLabel(t);
    if (exacto) return { s: exacto };
    const run = this.findStudentByRun(t).student;
    if (run) return { s: run };
    const N = x => this.normalizarTexto(x).toLowerCase();
    const palabras = N(t).split(/\s+/).filter(w => w.length > 1);
    if (!palabras.length) return { s: null };
    const pool = this.getStudents().filter(s => s.status !== 'blocked');
    const hits = pool.filter(s => { const n = ` ${N(s.name)} `; return palabras.every(w => n.includes(` ${w}`)); });
    return hits.length === 1 ? { s: hits[0] } : { s: null, varios: hits.length };
  },
  setActaStudentText(gi, v) {
    const r = this.resolveStudentText(v);
    if (!String(v || '').trim()) { this.setActaStudent(gi, ''); return true; }
    if (!r.s) { toast(r.varios ? `Hay ${r.varios} estudiantes que coinciden. Escriba también el apellido o elija de la lista.` : 'No se encontró ese estudiante. Escriba nombre y apellido, o el RUN.', 'error'); this.renderActas(); return false; }
    this.setActaStudent(gi, String(r.s.id));
    return true;
  },

  // ---------------- VISTA GRANDE DE UNA ACTA ----------------
  async actaPdf(fi) {
    State.actasDocs = State.actasDocs || {};
    if (!State.actasDocs[fi]) State.actasDocs[fi] = await this.pdfjs().getDocument({ data: new Uint8Array(State.actas.files[fi].bytes) }).promise;
    return State.actasDocs[fi];
  },
  viewActa(gi, pagina = 0) {
    const groups = this.actaGroups();
    if (gi < 0 || gi >= groups.length) return;
    State.actaView = { gi, pagina };
    let v = el('acta-viewer');
    if (!v) {
      v = document.createElement('div');
      v.id = 'acta-viewer';
      v.className = 'acta-viewer';
      v.setAttribute('role', 'dialog');
      v.setAttribute('aria-modal', 'true');
      v.setAttribute('aria-label', 'Acta en grande');
      v.onkeydown = e => {
        if (e.key === 'Escape') { e.stopPropagation(); this.closeActaViewer(); }
        else if (e.target.tagName !== 'INPUT' && e.key === 'ArrowRight') this.actaViewerGo(1);
        else if (e.target.tagName !== 'INPUT' && e.key === 'ArrowLeft') this.actaViewerGo(-1);
      };
      document.body.appendChild(v);
    }
    v.hidden = false;
    this.renderActaViewer();
  },
  closeActaViewer() {
    const v = el('acta-viewer');
    if (v) v.hidden = true;
    State.actaView = null;
    if (el('actas-content')) this.renderActas();
  },
  actaViewerGo(paso) {
    const n = this.actaGroups().length, gi = State.actaView.gi + paso;
    if (gi >= 0 && gi < n) this.viewActa(gi);
  },
  actaViewerNextPending() {
    const groups = this.actaGroups(), from = State.actaView.gi;
    const orden = [...groups.keys()].slice(from + 1).concat([...groups.keys()].slice(0, from + 1));
    const gi = orden.find(i => groups[i].first.incluir && !groups[i].first.studentId);
    if (gi === undefined) { this.closeActaViewer(); notice({ type: 'success', title: 'Todas las actas tienen estudiante', msg: 'Revise el resumen y presione "Guardar actas en las fichas".' }); return; }
    this.viewActa(gi);
  },
  /** Asigna lo escrito y pasa a la siguiente acta sin estudiante. */
  actaViewerAssign() {
    const inp = el('av-student');
    if (!String(inp.value || '').trim()) { inp.focus(); return; }
    if (this.setActaStudentText(State.actaView.gi, inp.value)) this.actaViewerNextPending();
    else { this.renderActaViewer(); }
  },
  actaViewerSkip(incluir) {
    const g = this.actaGroups()[State.actaView.gi];
    g.first.incluir = incluir;
    this.renderActas();
    incluir ? this.renderActaViewer() : this.actaViewerNextPending();
  },
  async renderActaViewer() {
    const v = el('acta-viewer'), st = State.actaView;
    if (!v || !st) return;
    const groups = this.actaGroups(), g = groups[st.gi], f = g.first, a = State.actas;
    const s = f.studentId ? State.rawStudents.find(x => sameId(x.id, f.studentId)) : null;
    const pend = groups.filter(x => x.first.incluir && !x.first.studentId).length;
    v.innerHTML = `
      <div class="av-pages" id="av-pages">${g.pages.map((pg, k) => `<figure class="av-page" id="av-p${k}"><div class="av-loading">${ico('loader')}Cargando página ${pg.p + 1}…</div><figcaption>${esc(a.files[pg.fi].name)} · página ${pg.p + 1}</figcaption></figure>`).join('')}</div>
      <aside class="av-side">
        <div class="av-head"><strong>Acta ${st.gi + 1} de ${groups.length}</strong><button type="button" class="icon-btn" aria-label="Cerrar la vista grande" title="Cerrar (Esc)" onclick="app.closeActaViewer()">${ico('x')}</button></div>
        <p class="small muted">${g.pages.length} página(s) · ${pend ? `${pend} acta(s) sin estudiante` : 'todas tienen estudiante'}</p>
        ${s ? `<p class="av-who" data-ok="true">${ico('user-check')}<span><strong>${esc(s.name)}</strong><br>${esc(s.curso || '')}${f.detected && sameId(f.detected, f.studentId) ? ' · reconocido en el documento' : ''}</span></p>` : `<p class="av-who">${ico('user-x')}<span>Sin estudiante asignado</span></p>`}
        ${!f.incluir ? `<p class="note">${ico('ban')}Esta acta no se guardará.</p>` : ''}
        <label class="field"><span class="field__label">¿De quién es esta carta?</span>
          <input id="av-student" class="input" list="actas-students" value="${esc(s ? this.studentLabel(s) : '')}" placeholder="Escriba nombre, apellido o RUN" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault(); app.actaViewerAssign();}">
        </label>
        <button type="button" class="btn btn--primary" onclick="app.actaViewerAssign()">${ico('check')}Asignar y pasar a la siguiente</button>
        <p class="small muted">Presione Enter para asignar. Flechas ← → para moverse entre actas (fuera del campo).</p>
        <div class="av-nav">
          <button type="button" class="btn btn--sm" ${st.gi === 0 ? 'disabled' : ''} onclick="app.actaViewerGo(-1)">${ico('chevron-left')}Anterior</button>
          <button type="button" class="btn btn--sm" ${st.gi === groups.length - 1 ? 'disabled' : ''} onclick="app.actaViewerGo(1)">Siguiente${ico('chevron-right')}</button>
        </div>
        ${pend ? `<button type="button" class="btn btn--sm btn--ghost" onclick="app.actaViewerNextPending()">${ico('skip-forward')}Ir a la siguiente sin estudiante</button>` : ''}
        ${f.incluir ? `<button type="button" class="btn btn--sm btn--ghost" onclick="app.actaViewerSkip(false)">${ico('ban')}No guardar esta acta</button>` : `<button type="button" class="btn btn--sm" onclick="app.actaViewerSkip(true)">${ico('rotate-ccw')}Volver a incluirla</button>`}
      </aside>`;
    icons();
    const inp = el('av-student');
    if (inp && !s) inp.focus();
    // Páginas en alta resolución
    const ancho = Math.min(1100, el('av-pages').clientWidth - 24) * Math.min(2, window.devicePixelRatio || 1);
    for (const [k, pg] of g.pages.entries()) {
      if (State.actaView !== st) return;
      try {
        const doc = await this.actaPdf(pg.fi);
        const page = await doc.getPage(pg.p + 1);
        const vp = page.getViewport({ scale: 1 });
        const view = page.getViewport({ scale: ancho / vp.width });
        const c = document.createElement('canvas');
        c.width = view.width; c.height = view.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: view }).promise;
        const fig = el(`av-p${k}`);
        if (!fig || State.actaView !== st) return;
        fig.querySelector('.av-loading').replaceWith(c);
        if (k === st.pagina && k > 0) fig.scrollIntoView({ block: 'start' });
      } catch (e) {
        const fig = el(`av-p${k}`);
        if (fig) fig.querySelector('.av-loading').innerHTML = `<img src="${pg.thumb}" alt="Página ${pg.p + 1}">`;
      }
    }
  },
  toggleActaSplit(pi) {
    const pg = State.actas.pages[pi];
    pg.start = !pg.start; pg.manual = true;
    this.renderActas();
  },
  renderActas() {
    const a = State.actas;
    const groups = this.actaGroups();
    const listos = groups.filter(g => g.first.incluir && g.first.studentId).length;
    const escaneadas = a.pages.some(p => !p.hasText);
    const students = this.getStudents().filter(s => s.status !== 'blocked').sort((x, y) => (ALL_COURSES.indexOf(x.curso) - ALL_COURSES.indexOf(y.curso)) || x.name.localeCompare(y.name));
    const etiqueta = id => { const s = id ? State.rawStudents.find(x => sameId(x.id, id)) : null; return s ? this.studentLabel(s) : ''; };
    const sinAsignar = groups.filter(g => g.first.incluir && !g.first.studentId).length;
    el('actas-content').innerHTML = `
      <div class="stats stats--4">
        <div class="stat"><span class="stat__num num">${a.pages.length}</span><span class="stat__label">Páginas leídas</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${groups.length}</span><span class="stat__label">Actas separadas</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${listos}</span><span class="stat__label">Con estudiante asignado</span></div>
        <div class="stat"><span class="stat__num num">${groups.length - listos}</span><span class="stat__label">Por revisar</span></div>
      </div>
      ${State.actasOcr ? `<p class="note">${ico('scan')}Se leyeron con reconocimiento de texto ${State.actasOcr.leidas} de ${State.actasOcr.total} página(s) escaneadas.${State.actasOcr.leidas < State.actasOcr.total ? ' En las demás, elija al estudiante.' : ''}</p>` : ''}
      ${escaneadas && !a.preset.studentId ? `<div class="subpanel"><p class="small">${ico('scan')}Algunas páginas son escaneadas (imagen sin texto), así que el estudiante no se puede leer: elíjalo en cada acta. ${fieldHtml('Páginas por acta en los PDF escaneados', `<select class="input" onchange="State.actas.porCarta=+this.value; app.groupActas(); app.renderActas()">${options([[1, '1 página'], [2, '2 páginas'], [3, '3 páginas'], [4, '4 páginas']], a.porCarta)}</select>`, 'field--inline')}</p></div>` : ''}
      <datalist id="actas-students">${students.map(s => `<option value="${esc(this.studentLabel(s))}">`).join('')}</datalist>
      <div class="actas-bar">
        <p class="muted small">Pinche una página para verla en grande. Escriba el nombre o RUN del estudiante en cada acta (aparecen sugerencias). "Separar aquí" comienza una acta nueva; "Unir" la junta con la anterior.</p>
        ${sinAsignar ? `<button type="button" class="btn btn--primary btn--sm" onclick="app.viewActa(app.actaGroups().findIndex(g => g.first.incluir && !g.first.studentId))">${ico('maximize-2')}Asignar las ${sinAsignar} sin estudiante, en grande</button>` : `<span class="chip" data-tone="conv">${ico('check')}Todas las actas tienen estudiante</span>`}
      </div>
      <div class="stack">${groups.map((g, gi) => {
        const f = g.first;
        const cartas = f.studentId ? this.cartasOf(f.studentId) : [];
        return `<article class="acta-group" data-ok="${!!(f.incluir && f.studentId)}">
          <div class="acta-group__pages">${g.pages.map(pg => { const pi = a.pages.indexOf(pg); const primeraDelArchivo = pi === 0 || a.pages[pi - 1].fi !== pg.fi; return `
            <figure class="acta-page"><button type="button" class="acta-thumb" title="Ver en grande" onclick="app.viewActa(${gi}, ${g.pages.indexOf(pg)})"><img src="${pg.thumb}" alt="Página ${pg.p + 1} de ${esc(a.files[pg.fi].name)}. Ver en grande"><span class="acta-zoom">${ico('zoom-in')}</span></button><figcaption>${esc(a.files[pg.fi].name.length > 18 ? a.files[pg.fi].name.slice(0, 16) + '…' : a.files[pg.fi].name)} · p. ${pg.p + 1}</figcaption>
              ${primeraDelArchivo ? '' : `<button type="button" class="btn btn--sm" onclick="app.toggleActaSplit(${pi})">${pg.start ? `${ico('merge')}Unir con la anterior` : `${ico('scissors')}Separar aquí`}</button>`}</figure>`; }).join('')}</div>
          <div class="acta-group__form">
            <label class="check"><input type="checkbox" ${f.incluir ? 'checked' : ''} onchange="app.actaGroups()[${gi}].first.incluir=this.checked; app.renderActas()"><span><strong>Acta ${gi + 1}</strong> · ${g.pages.length} página(s)${f.detected && sameId(f.detected, f.studentId) ? ' · estudiante reconocido en el documento' : ''}</span></label>
            ${fieldHtml('Estudiante', `<input class="input" list="actas-students" value="${esc(etiqueta(f.studentId))}" placeholder="Escriba nombre o RUN..." autocomplete="off" onchange="app.setActaStudentText(${gi}, this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();}">`)}
            ${fieldHtml('Carta de compromiso a la que corresponde', `<select class="input" ${f.studentId ? '' : 'disabled'} onchange="app.actaGroups()[${gi}].first.cartaId=this.value; app.renderActas()">${options([['__new', 'Registrar como carta nueva en la ficha'], ...cartas.map(c => [String(c.id), `${fmtDate(c.date)} · ${c.type}${this.actaOf(c.id) ? ' (ya tiene acta)' : ''}`]), ['', 'Solo guardar el PDF, sin carta']], f.cartaId)}</select>`)}
            ${f.cartaId === '__new' && f.studentId ? `<div class="grid-2">
              ${fieldHtml('Fecha de la carta', `<input type="date" class="input" value="${esc(f.fechaCarta)}" max="${today()}" onchange="app.actaGroups()[${gi}].first.fechaCarta=this.value">`)}
              ${fieldHtml('Tipo', `<select class="input" onchange="app.actaGroups()[${gi}].first.tipoCarta=this.value">${options(['Carta Compromiso', 'Carta Compromiso Familiar', 'Carta Compromiso Estudiante', 'Carta de Condicionalidad'], f.tipoCarta)}</select>`)}
            </div>` : ''}
          </div>
        </article>`;
      }).join('')}</div>`;
    icons();
  },
  u8ToBase64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); },
  async saveActas() {
    const a = State.actas;
    const groups = this.actaGroups().filter(g => g.first.incluir && g.first.studentId);
    if (!groups.length) { toast('Asigne un estudiante al menos a un acta', 'error'); return false; }
    ui.close();
    const done = ui.busy('Guardando actas firmadas', '');
    let ok = 0;
    try {
      await this.loadPdfLib();
      const { PDFDocument } = PDFLib;
      const src = {};
      for (const [n, g] of groups.entries()) {
        const s = this.getStudent(g.first.studentId);
        el('busy-msg').textContent = `${n + 1} de ${groups.length}: ${s.name}`;
        const fi = g.pages[0].fi;
        src[fi] = src[fi] || await PDFDocument.load(a.files[fi].bytes, { ignoreEncryption: true });
        const out = await PDFDocument.create();
        (await out.copyPages(src[fi], g.pages.map(p => p.p))).forEach(p => out.addPage(p));
        const bytes = await out.save();
        let carta = g.first.cartaId && g.first.cartaId !== '__new' ? s.history.find(h => sameId(h.id, g.first.cartaId)) : null;
        if (g.first.cartaId === '__new') {
          // La carta no estaba en la plataforma: se registra en la ficha con la fecha indicada
          carta = { id: Date.now() + n, studentId: String(s.id), studentName: s.name, date: g.first.fechaCarta || today(), type: g.first.tipoCarta || 'Carta Compromiso', professional: State.currentUser.name, professionalId: State.currentUser.id, background: `**DOCUMENTO OFICIAL:**\n\n${g.first.tipoCarta || 'Carta Compromiso'} firmada en papel. El documento escaneado está guardado como acta firmada.`, isPrivate: false, sharedWith: [], agreements: [], cartaEscaneada: true };
          await DB.save('interventions', carta);
        }
        const fecha = today();
        const nombre = `${fecha}_Acta_firmada_${this.clean(s.name).replace(/\s+/g, '_')}.pdf`;
        const up = await API.call('upload', { folderName: `${s.curso} - ${s.name}`, fileName: nombre, mimeType: 'application/pdf', base64: this.u8ToBase64(bytes) });
        await DB.save('evidences', { id: newId(), studentId: String(s.id), studentName: s.name, course: s.curso, date: fecha, type: ACTA_TIPO, cartaId: carta ? String(carta.id) : '', description: carta ? `Acta firmada de ${carta.type} del ${fmtDate(carta.date)}` : 'Acta firmada de carta de compromiso', fileName: nombre, mimeType: 'application/pdf', uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive', driveId: up.fileId, url: up.url, archivado: true, paginas: g.pages.length });
        ok++;
      }
      notice({ type: 'success', title: 'Actas firmadas guardadas', msg: `${ok} acta(s) quedaron en la ficha de cada estudiante, vinculadas a su carta.` });
    } catch (e) { console.error(e); notice({ type: ok ? 'warn' : 'error', title: ok ? 'Se guardó solo una parte de las actas' : 'No se guardaron las actas', msg: e.message, items: [`Guardadas: ${ok} de ${groups.length}.`, 'Puede volver a subir el PDF: las actas ya guardadas no se pierden.'] }); }
    finally { done(); State.actas = null; State.actasDocs = null; const v = el('acta-viewer'); if (v) v.hidden = true; State.actaView = null; this.render(); }
  }
});
