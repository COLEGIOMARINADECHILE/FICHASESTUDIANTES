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
          const det = preset.studentId ? null : (text.trim() ? this.studentInText(text, pool) : null);
          pages.push({ fi, p: p - 1, thumb: canvas.toDataURL('image/jpeg', 0.7), hasText: text.replace(/\s/g, '').length > 30, detected: det ? String(det.id) : '' });
        }
      }
      State.actas = { files: sources, pages, preset, porCarta: 1 };
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
      if (f.cartaId === undefined && f.studentId) {
        const cartas = this.cartasOf(f.studentId);
        f.cartaId = a.preset.cartaId ? String(a.preset.cartaId) : String((cartas.find(c => !this.actaOf(c.id)) || cartas[0] || {}).id || '');
      }
      if (f.incluir === undefined) f.incluir = true;
    });
    return groups;
  },
  setActaStudent(i, id) {
    const g = this.actaGroups()[i];
    g.first.studentId = id;
    const cartas = id ? this.cartasOf(id) : [];
    g.first.cartaId = String((cartas.find(c => !this.actaOf(c.id)) || cartas[0] || {}).id || '');
    g.first.incluir = !!id;
    this.renderActas();
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
    const optsAlumnos = sel => `<option value="">Elegir estudiante...</option>${students.map(s => `<option value="${esc(s.id)}" ${sameId(s.id, sel) ? 'selected' : ''}>${esc(s.name)} (${esc(s.curso)})</option>`).join('')}`;
    el('actas-content').innerHTML = `
      <div class="stats stats--4">
        <div class="stat"><span class="stat__num num">${a.pages.length}</span><span class="stat__label">Páginas leídas</span></div>
        <div class="stat" data-tone="warn"><span class="stat__num num">${groups.length}</span><span class="stat__label">Actas separadas</span></div>
        <div class="stat" data-tone="conv"><span class="stat__num num">${listos}</span><span class="stat__label">Con estudiante asignado</span></div>
        <div class="stat"><span class="stat__num num">${groups.length - listos}</span><span class="stat__label">Por revisar</span></div>
      </div>
      ${escaneadas && !a.preset.studentId ? `<div class="subpanel"><p class="small">${ico('scan')}Algunas páginas son escaneadas (imagen sin texto), así que el estudiante no se puede leer: elíjalo en cada acta. ${fieldHtml('Páginas por acta en los PDF escaneados', `<select class="input" onchange="State.actas.porCarta=+this.value; app.groupActas(); app.renderActas()">${options([[1, '1 página'], [2, '2 páginas'], [3, '3 páginas'], [4, '4 páginas']], a.porCarta)}</select>`, 'field--inline')}</p></div>` : ''}
      <p class="muted small">Revise cada acta. Pinche "Separar aquí" en una página para que comience una acta nueva, o "Unir" para juntarla con la anterior.</p>
      <div class="stack">${groups.map((g, gi) => {
        const f = g.first;
        const cartas = f.studentId ? this.cartasOf(f.studentId) : [];
        return `<article class="acta-group" data-ok="${!!(f.incluir && f.studentId)}">
          <div class="acta-group__pages">${g.pages.map(pg => { const pi = a.pages.indexOf(pg); const primeraDelArchivo = pi === 0 || a.pages[pi - 1].fi !== pg.fi; return `
            <figure class="acta-page"><img src="${pg.thumb}" alt="Página ${pg.p + 1} de ${esc(a.files[pg.fi].name)}"><figcaption>${esc(a.files[pg.fi].name.length > 18 ? a.files[pg.fi].name.slice(0, 16) + '…' : a.files[pg.fi].name)} · p. ${pg.p + 1}</figcaption>
              ${primeraDelArchivo ? '' : `<button type="button" class="btn btn--sm" onclick="app.toggleActaSplit(${pi})">${pg.start ? `${ico('merge')}Unir con la anterior` : `${ico('scissors')}Separar aquí`}</button>`}</figure>`; }).join('')}</div>
          <div class="acta-group__form">
            <label class="check"><input type="checkbox" ${f.incluir ? 'checked' : ''} onchange="app.actaGroups()[${gi}].first.incluir=this.checked; app.renderActas()"><span><strong>Acta ${gi + 1}</strong> · ${g.pages.length} página(s)${f.detected && sameId(f.detected, f.studentId) ? ' · estudiante reconocido en el documento' : ''}</span></label>
            ${fieldHtml('Estudiante', `<select class="input" onchange="app.setActaStudent(${gi}, this.value)">${optsAlumnos(f.studentId)}</select>`)}
            ${fieldHtml('Carta de compromiso a la que corresponde', `<select class="input" ${f.studentId ? '' : 'disabled'} onchange="app.actaGroups()[${gi}].first.cartaId=this.value">${options([['', 'Sin vincular a una carta'], ...cartas.map(c => [String(c.id), `${fmtDate(c.date)} · ${c.type}${this.actaOf(c.id) ? ' (ya tiene acta)' : ''}`])], f.cartaId)}</select>`)}
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
        const carta = g.first.cartaId ? s.history.find(h => sameId(h.id, g.first.cartaId)) : null;
        const fecha = today();
        const nombre = `${fecha}_Acta_firmada_${this.clean(s.name).replace(/\s+/g, '_')}.pdf`;
        const up = await API.call('upload', { folderName: `${s.curso} - ${s.name}`, fileName: nombre, mimeType: 'application/pdf', base64: this.u8ToBase64(bytes) });
        await DB.save('evidences', { id: newId(), studentId: String(s.id), studentName: s.name, course: s.curso, date: fecha, type: ACTA_TIPO, cartaId: carta ? String(carta.id) : '', description: carta ? `Acta firmada de ${carta.type} del ${fmtDate(carta.date)}` : 'Acta firmada de carta de compromiso', fileName: nombre, mimeType: 'application/pdf', uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive', driveId: up.fileId, url: up.url, archivado: true, paginas: g.pages.length });
        ok++;
      }
      toast(`${ok} acta(s) firmada(s) guardada(s) en las fichas`);
    } catch (e) { console.error(e); toast(`Se guardaron ${ok}. Se detuvo: ${e.message}`, 'error'); }
    finally { done(); State.actas = null; this.render(); }
  }
});
