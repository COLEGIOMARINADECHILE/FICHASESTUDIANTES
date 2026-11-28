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
  /** ¿La carta de esta acta se registró junto con ella (escaneada) y no tiene otra acta? Entonces se mueve con el acta. */
  actaCartaPropia(e) {
    const old = e.cartaId && (State.rawInterventions || []).find(h => sameId(h.id, e.cartaId));
    return old && old.cartaEscaneada && !(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, old.id) && !sameId(x.id, e.id)) ? old : null;
  },
  /** Las cartas del estudiante elegido, para vincular el acta a la que corresponde. */
  actaCartasOpciones(studentId, actual) {
    const e = (State.rawEvidences || []).find(x => sameId(x.id, State.ar.id)) || {}, cartas = studentId ? this.cartasOf(studentId) : [], propia = this.actaCartaPropia(e);
    return options([...(propia ? [['__keep', 'Pasar también su carta (se registró junto con el acta)']] : []), ['__new', 'Registrar como carta nueva en la ficha'], ...cartas.map(c => [String(c.id), `${fmtDate(c.date)} · ${c.type}${(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, c.id) && !sameId(x.id, State.ar.id)) ? ' (ya tiene otra acta)' : ''}`]), ['', 'Acta transversal (sin carta; el estudiante puede tener varias)']], actual || '');
  },
  /** Opción automática: la carta que viaja con el acta; si era transversal sigue siéndolo; si no, la primera carta libre del estudiante. */
  actaCartaAuto(studentId, e) {
    if (!e.cartaId) return '';
    // Si el estudiante ya tiene una carta pendiente de firma, el acta se adjunta a esa (y deja de estar pendiente)
    const libres = this.cartasOf(studentId).filter(c => !(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, c.id) && !sameId(x.id, e.id)));
    if (libres.length) return String(libres[0].id);
    return this.actaCartaPropia(e) ? '__keep' : '__new';
  },
  actaElegirEstudiante(valor) {
    const s = this.studentByLabel(valor); State.ar.studentId = s ? String(s.id) : '';
    const e = (State.rawEvidences || []).find(x => sameId(x.id, State.ar.id)), sel = el('ar-carta'); if (!sel || !e) return;
    State.ar.cartaId = State.ar.studentId ? this.actaCartaAuto(State.ar.studentId, e) : '';
    sel.innerHTML = this.actaCartasOpciones(State.ar.studentId, State.ar.cartaId); sel.disabled = !State.ar.studentId;
  },
  actaReasignar(id) {
    const e = (State.rawEvidences || []).find(x => sameId(x.id, id)); if (!e) return;
    if (!this.actaPuedeCambiar(e)) return toast('No tiene permiso para cambiar esta acta', 'error');
    const s0 = State.rawStudents.find(x => sameId(x.id, e.studentId));
    State.ar = { id: e.id, studentId: '', cartaId: '' };
    ui.modal({ title: 'Cambiar el acta a otro estudiante', icon: 'repeat', size: 'md', okText: 'Guardar el cambio',
      body: `<div class="stack">
        <p class="note">${ico('info')}<span>El acta <strong>${esc(e.fileName || e.description || '')}</strong> está en la ficha de <strong>${esc(s0 ? this.formatStudentName(this.clean(s0.name)) : e.studentName || 'otro estudiante')}</strong>. Elija a quién corresponde en realidad: la carta se pasa sola y desaparece de la lista del estudiante equivocado.</span></p>
        ${this.studentDatalist('ar-est')}
        ${fieldHtml('Estudiante al que corresponde', `<input id="ar-est-in" class="input" list="ar-est" placeholder="Escriba el nombre o RUN" onchange="app.actaElegirEstudiante(this.value)">`)}
        ${fieldHtml('Carta a la que corresponde', `<select id="ar-carta" class="input" disabled onchange="State.ar.cartaId=this.value">${this.actaCartasOpciones('', '')}</select>`)}
        <p class="muted small">El PDF no se vuelve a subir: solo cambia la ficha a la que pertenece.</p></div>`,
      onOk: async () => {
        const st = State.ar.studentId ? State.rawStudents.find(x => sameId(x.id, State.ar.studentId)) : this.studentByLabel(el('ar-est-in').value);
        if (!st) { toast('Elija un estudiante de la lista', 'error'); return false; }
        let nueva = el('ar-carta').value || '';
        const old = e.cartaId ? (State.rawInterventions || []).find(h => sameId(h.id, e.cartaId)) : null, propia = this.actaCartaPropia(e), antes = e.cartaId;
        let c = null;
        if (nueva === '__keep' && propia) { await DB.patch('interventions', propia.id, { studentId: String(st.id), studentName: st.name }); nueva = String(propia.id); c = propia; }
        else if (nueva === '__new') { c = { id: Date.now(), studentId: String(st.id), studentName: st.name, date: (old && old.date) || e.date || today(), type: (old && old.type) || 'Carta Compromiso', professional: State.currentUser.name, professionalId: State.currentUser.id, background: `**DOCUMENTO OFICIAL:**\n\n${(old && old.type) || 'Carta Compromiso'} firmada en papel. El documento escaneado está guardado como acta firmada.`, isPrivate: false, sharedWith: [], agreements: [], cartaEscaneada: true }; await DB.save('interventions', c); nueva = String(c.id); }
        else if (nueva) c = (State.rawInterventions || []).find(h => sameId(h.id, nueva)) || null;
        await DB.patch('evidences', e.id, { studentId: String(st.id), studentName: st.name, course: this.courseNameOf(st), cartaId: nueva, transversal: !nueva, description: c ? `Acta firmada de ${c.type} del ${fmtDate(c.date)}` : 'Acta transversal firmada', reasignadaDe: String(e.studentId || ''), reasignadaFecha: today() });
        try {
          // La carta que se registró solo por este acta y ya no se usa desaparece de la lista del estudiante equivocado
          if (propia && String(propia.id) !== nueva) await DB.remove('interventions', propia.id);
          else if (antes && String(antes) !== nueva && !(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, antes))) { if (old && old.cartaMeta) await DB.patch('interventions', old.id, { estadoCarta: 'pendiente' }); }
          if (c && c.cartaMeta) await DB.patch('interventions', c.id, { estadoCarta: 'firmada', fechaFirma: today() });
        } catch (er) { /* el acta ya quedó cambiada */ }
        toast(`Acta cambiada a ${this.formatStudentName(this.clean(st.name))}`);
        if (State.currentView === 'cartas_fmt') this.renderCartasFmt(); else this.render();
      } });
  },  /** Actas ya cambiadas de estudiante (con la versión anterior) que quedaron sueltas o con una carta duplicada, mientras el estudiante tiene una carta pendiente. */
  actasPorReparar() {
    const out = [], usadas = new Set();
    (State.rawEvidences || []).filter(e => e.reasignadaDe || e.reasignadaFecha).forEach(e => {
      const cartas = this.cartasOf(e.studentId), propia = e.cartaId && cartas.find(c => sameId(c.id, e.cartaId));
      if (propia && !propia.cartaEscaneada) return; // ya está en una carta real
      const libre = cartas.find(c => !sameId(c.id, e.cartaId) && !usadas.has(String(c.id)) && !(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, c.id)));
      if (libre) { usadas.add(String(libre.id)); out.push({ e, libre, vieja: propia || null }); }
    });
    return out;
  },
  actasReparar() {
    const lista = this.actasPorReparar(); if (!lista.length) return toast('No hay actas por reparar');
    ui.confirm({ title: 'Unir actas con la carta pendiente', icon: 'link', okText: 'Sí, unir', msg: `Se adjuntarán <strong>${lista.length}</strong> acta(s) a la carta que su estudiante tiene pendiente de firma, que pasará a «Firmada y guardada». La carta «firmada en papel» duplicada se elimina.`,
      action: async () => {
        for (const { e, libre, vieja } of lista) {
          await DB.patch('evidences', e.id, { cartaId: String(libre.id), transversal: false, description: `Acta firmada de ${libre.type} del ${fmtDate(libre.date)}` });
          if (libre.cartaMeta) await DB.patch('interventions', libre.id, { estadoCarta: 'firmada', fechaFirma: today() });
          if (vieja && vieja.cartaEscaneada && !(State.rawEvidences || []).some(x => x.cartaId && sameId(x.cartaId, vieja.id))) await DB.remove('interventions', vieja.id);
        }
        toast(`${lista.length} acta(s) unidas a su carta`); if (State.currentView === 'cartas_fmt') this.renderCartasFmt(); else this.render();
      } });
  },
  /** Todas las actas guardadas (para encontrar las que están en el estudiante equivocado). */
  actasGuardadasHtml() {
    const lista = (State.rawEvidences || []).filter(e => this.esActa(e)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const filas = lista.slice(0, 300).map(e => { const s = State.rawStudents.find(x => sameId(x.id, e.studentId)), c = e.cartaId && (State.rawInterventions || []).find(h => sameId(h.id, e.cartaId));
      return `<tr><td>${s ? `<button type="button" class="link-btn" onclick="app.openStudent(${jsq(s.id)})">${esc(this.formatStudentName(this.clean(s.name)))}</button>` : esc(e.studentName || '—')}</td><td class="small">${s ? esc(this.courseNameOf(s)) : ''}</td><td class="small">${c ? esc(c.type) : chip('Transversal', 'conv')}</td><td class="num small">${fmtDate(e.date)}</td><td class="t-actions"><div class="row-actions"><button class="btn btn--sm" onclick="app.openEvidence(${jsq(e.id)})">${ico('eye')}Ver acta</button>${this.actaCambiarBtn(e)}</div></td></tr>`; }).join('');
    return `<section class="panel" data-actas-guardadas><div class="panel__head"><h2><span class="rpt-n">5</span>Actas firmadas guardadas</h2><span class="chip">${lista.length} acta(s)</span></div>
      <p class="muted small">Un estudiante puede tener varias actas a la vez. Si un acta quedó en el estudiante equivocado, use el botón ${ico('repeat')} para pasarla al que corresponde.</p>
      ${this.actasPorReparar().length ? `<div class="note" data-tone="warn">${ico('alert-triangle')}<span><strong>${this.actasPorReparar().length} acta(s) cambiadas antes</strong> no quedaron unidas a la carta pendiente de su estudiante.</span><button type="button" class="btn btn--primary btn--sm" onclick="app.actasReparar()">${ico('link')}Unir con su carta</button></div>` : ''}
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
