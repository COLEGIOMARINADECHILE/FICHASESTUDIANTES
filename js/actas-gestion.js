// =====================================================================
// ACTAS FIRMADAS: CAMBIAR DE ESTUDIANTE Y ACTAS TRANSVERSALES
// - Un acta guardada en el estudiante equivocado se puede pasar al que corresponde (y a su carta).
// - Un estudiante puede tener varias actas a la vez: las «transversales» (p. ej. de asistencia) no dependen de una carta.
// - La página Cartas lista todas las actas guardadas, para encontrar y corregir las que están mal.
// =====================================================================
const ACTA_TIPO_G = 'Acta o Compromiso Firmado';
Object.assign(app, {
  esActa(e) { return !!(e && (e.cartaId || e.transversal || e.type === ACTA_TIPO_G)); },
  actaPuedeCambiar(e) { return !!e && ((this.canUploadActas && this.canUploadActas()) || sameId(e.uploaderId, State.currentUser.id) || !!(this.esAutorPlataforma && this.esAutorPlataforma())); },
  actaCambiarBtn(e) { return this.actaPuedeCambiar(e) ? `<button class="icon-btn" aria-label="Cambiar esta acta a otro estudiante" title="Cambiar esta acta a otro estudiante" onclick="app.actaReasignar(${jsq(e.id)})">${ico('repeat')}</button>` : ''; },
  /** Las cartas del estudiante elegido, para vincular el acta a la que corresponde. */
  actaCartasOpciones(studentId, actual) {
    const cartas = studentId ? this.cartasOf(studentId) : [];
    return options([['', 'Acta transversal (sin carta; el estudiante puede tener varias)'], ...cartas.map(c => [String(c.id), `${fmtDate(c.date)} · ${c.type}${(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, c.id) && !sameId(x.id, State.ar.id)) ? ' (ya tiene otra acta)' : ''}`])], actual || '');
  },
  actaReasignar(id) {
    const e = (State.rawEvidences || []).find(x => sameId(x.id, id)); if (!e) return;
    if (!this.actaPuedeCambiar(e)) return toast('No tiene permiso para cambiar esta acta', 'error');
    const s0 = State.rawStudents.find(x => sameId(x.id, e.studentId));
    State.ar = { id: e.id, studentId: '', cartaId: '' };
    ui.modal({ title: 'Cambiar el acta a otro estudiante', icon: 'repeat', size: 'md', okText: 'Guardar el cambio',
      body: `<div class="stack">
        <p class="note">${ico('info')}<span>El acta <strong>${esc(e.fileName || e.description || '')}</strong> está en la ficha de <strong>${esc(s0 ? this.formatStudentName(this.clean(s0.name)) : e.studentName || 'otro estudiante')}</strong>. Elija a quién corresponde en realidad.</span></p>
        ${this.studentDatalist('ar-est')}
        ${fieldHtml('Estudiante al que corresponde', `<input id="ar-est-in" class="input" list="ar-est" placeholder="Escriba el nombre o RUN" onchange="const s=app.studentByLabel(this.value); State.ar.studentId=s?String(s.id):''; State.ar.cartaId=''; el('ar-carta').innerHTML=app.actaCartasOpciones(State.ar.studentId,''); el('ar-carta').disabled=!State.ar.studentId">`)}
        ${fieldHtml('Carta a la que corresponde', `<select id="ar-carta" class="input" disabled onchange="State.ar.cartaId=this.value">${this.actaCartasOpciones('', '')}</select>`)}
        <p class="muted small">El PDF no se vuelve a subir: solo cambia la ficha a la que pertenece. Si la carta anterior queda sin acta, vuelve a «pendiente de firma».</p></div>`,
      onOk: async () => {
        const v = el('ar-est-in').value, st = State.ar.studentId ? State.rawStudents.find(x => sameId(x.id, State.ar.studentId)) : this.studentByLabel(v);
        if (!st) { toast('Elija un estudiante de la lista', 'error'); return false; }
        const nueva = el('ar-carta').value || '', antes = e.cartaId;
        const c = nueva ? (State.rawInterventions || []).find(h => sameId(h.id, nueva)) : null;
        await DB.patch('evidences', e.id, { studentId: String(st.id), studentName: st.name, course: this.courseNameOf(st), cartaId: nueva, transversal: !nueva, description: c ? `Acta firmada de ${c.type} del ${fmtDate(c.date)}` : 'Acta transversal firmada', reasignadaDe: String(e.studentId || ''), reasignadaFecha: today() });
        // La carta anterior sin acta vuelve a pendiente; la nueva carta pasa a firmada
        try {
          if (antes && !(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, antes))) { const ca = (State.rawInterventions || []).find(h => sameId(h.id, antes)); if (ca && ca.cartaMeta) await DB.patch('interventions', ca.id, { estadoCarta: 'pendiente' }); }
          if (c && c.cartaMeta) await DB.patch('interventions', c.id, { estadoCarta: 'firmada', fechaFirma: today() });
        } catch (er) { /* el acta ya quedó cambiada */ }
        toast(`Acta cambiada a ${this.formatStudentName(this.clean(st.name))}`);
        this.render();
      } });
  },
  /** Todas las actas guardadas (para encontrar las que están en el estudiante equivocado). */
  actasGuardadasHtml() {
    const lista = (State.rawEvidences || []).filter(e => this.esActa(e)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const filas = lista.slice(0, 300).map(e => { const s = State.rawStudents.find(x => sameId(x.id, e.studentId)), c = e.cartaId && (State.rawInterventions || []).find(h => sameId(h.id, e.cartaId));
      return `<tr><td>${s ? `<button type="button" class="link-btn" onclick="app.openStudent(${jsq(s.id)})">${esc(this.formatStudentName(this.clean(s.name)))}</button>` : esc(e.studentName || '—')}</td><td class="small">${s ? esc(this.courseNameOf(s)) : ''}</td><td class="small">${c ? esc(c.type) : chip('Transversal', 'conv')}</td><td class="num small">${fmtDate(e.date)}</td><td class="t-actions"><div class="row-actions"><button class="btn btn--sm" onclick="app.openEvidence(${jsq(e.id)})">${ico('eye')}Ver acta</button>${this.actaCambiarBtn(e)}</div></td></tr>`; }).join('');
    return `<section class="panel" data-actas-guardadas><div class="panel__head"><h2><span class="rpt-n">5</span>Actas firmadas guardadas</h2><span class="chip">${lista.length} acta(s)</span></div>
      <p class="muted small">Un estudiante puede tener varias actas a la vez. Si un acta quedó en el estudiante equivocado, use el botón ${ico('repeat')} para pasarla al que corresponde.</p>
      ${lista.length ? `<div class="table-wrap"><table class="table table--dense"><thead><tr><th>Estudiante</th><th>Curso</th><th>Carta</th><th>Fecha</th><th class="t-actions">Acta</th></tr></thead><tbody>${filas}</tbody></table></div>` : '<p class="muted small">Aún no hay actas firmadas guardadas.</p>'}</section>`;
  }
});
(() => {
  const rc = app.renderCartasFmt;
  if (rc) app.renderCartasFmt = function () {
    const r = rc.apply(this, arguments), cont = document.querySelector('[data-view="cartas_fmt"] .stack');
    if (cont && !cont.querySelector('[data-actas-guardadas]')) { cont.insertAdjacentHTML('beforeend', this.actasGuardadasHtml()); icons(); }
    return r;
  };
  // Página Asistencia: acta transversal
  const ra = app.renderAsistenciaRapida;
  if (ra) app.renderAsistenciaRapida = function () {
    const r = ra.apply(this, arguments);
    const base = el('asm-panel') || (el('asr-lista') && el('asr-lista').closest('section'));
    if (base && this.canUploadActas && this.canUploadActas() && !document.querySelector('[data-acta-trans]')) {
      const sec = base.closest('.stack') || base.parentNode;
      sec.insertAdjacentHTML('afterbegin', `<section class="panel" data-acta-trans><div class="panel__head"><h2>${ico('file-check')}Actas de asistencia (transversales)</h2></div><p class="muted small">Suba el PDF con actas o compromisos de asistencia firmados. No dependen de una carta: un estudiante puede tener varias actas a la vez. Se reconoce al estudiante y se guarda en su ficha.</p><div class="row-actions"><button class="btn btn--primary" onclick="app.openActasImport({ transversal: true })">${ico('upload')}Subir acta transversal (PDF)</button></div></section>`); icons();
    }
    return r;
  };
})();
