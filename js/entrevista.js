'use strict';
// =====================================================================
// APOYO A LA ENTREVISTA
// Ventana lateral con el resumen de todo lo realizado con el estudiante
// (entrevistas, acuerdos, planes, anotaciones, calificaciones, asistencia)
// que acompaña al funcionario mientras entrevista y que puede cerrar.
// También genera la "Ficha de entrevistas" del estudiante para descargar.
// =====================================================================
Object.assign(app, {
  esEntrevista(h) { return !this.isCarta(h) && h.type !== PROTOCOLO && !h.anotacion; },
  acuerdoPendiente(a) { return a && a.text && !/complet|logrado|cumplid|finaliz/i.test(a.progress || ''); },
  edadDe(s) { const f = s.fechaNacimiento ? new Date(s.fechaNacimiento) : null; if (!f || isNaN(f)) return ''; const d = new Date(); let a = d.getFullYear() - f.getFullYear(); if (d < new Date(d.getFullYear(), f.getMonth(), f.getDate())) a--; return `${a} años`; },

  /** Todo lo relevante del estudiante, en una sola estructura (respeta la confidencialidad). */
  studentDigest(s) {
    const visibles = s.history.filter(h => this.canSeeConfidential(h));
    const ocultas = s.history.filter(h => !this.canSeeConfidential(h));
    const anios = Object.keys(s.calificaciones || {}).sort();
    const notas = anios.length ? s.calificaciones[anios[anios.length - 1]] : null;
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
    const bajo4 = notas ? (notas.asignaturas || []).map(a => ({ nombre: a.nombre, nota: num(a.valores[a.valores.length - 1]) })).filter(a => a.nota !== null && a.nota < 4) : [];
    return {
      entrevistas: visibles.filter(h => this.esEntrevista(h)),
      protocolos: visibles.filter(h => h.type === PROTOCOLO),
      cartas: visibles.filter(h => this.isCarta(h)),
      anotaciones: visibles.filter(h => h.anotacion),
      ocultas,
      acuerdos: visibles.flatMap(h => (h.agreements || []).filter(a => this.acuerdoPendiente(a)).map(a => ({ ...a, fecha: h.date, tipo: h.type }))),
      planes: State.studentPlans.filter(p => sameId(p.studentId, s.id)),
      planesArea: State.rawInclusionReports.filter(r => sameId(r.studentId, s.id)).map(r => ({ ...r, area: this.planArea(r) })),
      observaciones: (s.observations || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
      enfermeria: s.nursing || [],
      notas, anioNotas: anios[anios.length - 1] || '', bajo4,
      actas: State.rawEvidences.filter(e => sameId(e.studentId, s.id) && e.cartaId).length
    };
  },

  // ---------------- VENTANA LATERAL DURANTE LA ENTREVISTA ----------------
  autoResumen() { try { return localStorage.getItem('cm_auto_resumen') !== 'no'; } catch (e) { return true; } },
  setAutoResumen(v) { try { localStorage.setItem('cm_auto_resumen', v ? 'si' : 'no'); } catch (e) { /* sin almacenamiento */ } },
  openInterviewPanel(studentId = State.selectedStudentId) {
    const s = this.getStudent(studentId);
    if (!s) return;
    let p = el('interview-panel');
    if (!p) {
      p = document.createElement('aside');
      p.id = 'interview-panel';
      p.className = 'iv-panel';
      p.setAttribute('role', 'complementary');
      p.setAttribute('aria-label', 'Resumen del estudiante para la entrevista');
      document.body.appendChild(p);
    }
    p.dataset.student = String(s.id);
    p.hidden = false;
    p.classList.remove('is-min');
    document.body.classList.add('has-iv-panel');
    this.renderInterviewPanel();
  },
  closeInterviewPanel() {
    const p = el('interview-panel');
    if (p) p.hidden = true;
    document.body.classList.remove('has-iv-panel');
  },
  toggleInterviewPanelMin() { const p = el('interview-panel'); if (p) { p.classList.toggle('is-min'); document.body.classList.toggle('has-iv-panel', !p.classList.contains('is-min')); } },
  renderInterviewPanel() {
    const p = el('interview-panel');
    if (!p || p.hidden) return;
    const s = this.getStudent(p.dataset.student);
    if (!s) return this.closeInterviewPanel();
    const g = this.studentDigest(s);
    const c = s.contacto || {};
    const fecha = d => fmtDate(d) || 'Sin fecha';
    const corto = (t, n = 220) => { t = String(t || '').replace(/\*\*/g, '').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
    const sec = (id, icon, titulo, n, html, abierto = false) => `<details class="iv-sec" ${abierto ? 'open' : ''}><summary>${ico(icon)}<span>${titulo}</span>${n !== '' ? `<span class="iv-count">${n}</span>` : ''}</summary><div class="iv-body">${html}</div></details>`;
    const vacio = t => `<p class="muted small">${t}</p>`;
    p.innerHTML = `
      <header class="iv-head">
        <div><span class="iv-kicker">Resumen para la entrevista</span><h2>${esc(s.name)}</h2>
          <div class="chips">${chip(s.curso, 'conv')}${chip(s.rut || 'Sin RUN', 'neutral')}${this.areaBadges(s)}</div></div>
        <div class="iv-actions">
          <button type="button" class="icon-btn" title="Minimizar" aria-label="Minimizar el resumen" onclick="app.toggleInterviewPanelMin()">${ico('panel-right-close')}</button>
          <button type="button" class="icon-btn" title="Cerrar" aria-label="Cerrar el resumen" onclick="app.closeInterviewPanel()">${ico('x')}</button>
        </div>
      </header>
      <button type="button" class="iv-tab" onclick="app.toggleInterviewPanelMin()" aria-label="Abrir el resumen del estudiante">${ico('panel-right-open')}<span>Resumen</span></button>
      <div class="iv-scroll">
        <div class="iv-kpis">
          <div class="iv-kpi" data-alert="${s.asistencia.alerta}"><span class="num">${s.asistencia.real}%</span><small>Asistencia</small></div>
          <div class="iv-kpi"><span class="num">${s.asistencia.atrasos}</span><small>Atrasos</small></div>
          <div class="iv-kpi" data-alert="${!!g.notas && ivNum(g.notas.promedioGeneral) !== null && ivNum(g.notas.promedioGeneral) < 4.5}"><span class="num">${esc(g.notas?.promedioGeneral || '-')}</span><small>Promedio ${esc(g.anioNotas)}</small></div>
          <div class="iv-kpi"><span class="num">${g.entrevistas.length}</span><small>Entrevistas</small></div>
        </div>
        ${s.riesgoRepitencia?.activo ? `<p class="iv-alert">${ico('alert-triangle')}<span>Riesgo de repitencia${s.riesgoRepitencia.motivo ? `: ${esc(s.riesgoRepitencia.motivo)}` : ''}</span></p>` : ''}
        ${g.acuerdos.length ? `<p class="iv-alert iv-alert--info">${ico('list-checks')}<span>${g.acuerdos.length} acuerdo(s) pendiente(s) de revisar en esta entrevista</span></p>` : ''}

        ${sec('contacto', 'contact', 'Apoderado y contacto', '', `<dl class="iv-dl"><dt>Apoderado(a)</dt><dd>${esc(c.apoderado || 'Sin registrar')}${c.parentesco ? ` (${esc(c.parentesco)})` : ''}</dd><dt>Teléfono</dt><dd>${esc(c.telefono || '-')}${c.telefono2 ? ` / ${esc(c.telefono2)}` : ''}</dd><dt>Correo</dt><dd>${esc(c.email || '-')}</dd><dt>Profesor(a) jefe</dt><dd>${esc(this.profJefeOf(s.curso) || '-')}</dd>${this.edadDe(s) ? `<dt>Edad</dt><dd>${this.edadDe(s)}</dd>` : ''}</dl>`, true)}

        ${sec('acuerdos', 'list-checks', 'Acuerdos pendientes', g.acuerdos.length, g.acuerdos.length ? `<ul class="iv-list">${g.acuerdos.map(a => `<li><strong>${esc(corto(a.text, 160))}</strong><span>${fecha(a.fecha)} · ${esc(a.tipo)} · ${esc(a.progress || 'No iniciado')}</span></li>`).join('')}</ul>` : vacio('No hay acuerdos pendientes.'), g.acuerdos.length > 0)}

        ${sec('entrevistas', 'messages-square', 'Entrevistas e intervenciones', g.entrevistas.length, g.entrevistas.length ? `<ul class="iv-list">${g.entrevistas.slice(0, 10).map(h => `<li><strong>${fecha(h.date)} · ${esc(h.type)}</strong><span>${esc(corto(h.background))}</span><em>${esc(h.professional || '')}</em></li>`).join('')}</ul>${g.entrevistas.length > 10 ? vacio(`Y ${g.entrevistas.length - 10} más en la pestaña Intervenciones.`) : ''}` : vacio('Sin entrevistas registradas.'), true)}

        ${sec('notas', 'graduation-cap', `Calificaciones ${esc(g.anioNotas)}`, g.bajo4.length ? `${g.bajo4.length} bajo 4` : '', g.notas ? `<p class="small">Promedio general: <strong>${esc(g.notas.promedioGeneral || '-')}</strong>${g.notas.periodo ? ` (${esc(g.notas.periodo)})` : ''}</p>${g.bajo4.length ? `<ul class="iv-list iv-list--tight">${g.bajo4.map(a => `<li><strong>${esc(a.nombre)}</strong><span class="num">${String(a.nota).replace('.', ',')}</span></li>`).join('')}</ul>` : vacio('Sin asignaturas bajo 4,0.')}` : vacio('Sin notas cargadas.'), g.bajo4.length > 0)}

        ${sec('anotaciones', 'pen-line', 'Anotaciones', g.anotaciones.length, g.anotaciones.length ? `<p class="small">Positivas: <strong>${g.anotaciones.filter(h => h.anotacion.tipo === 'Positiva').length}</strong> · Negativas: <strong>${g.anotaciones.filter(h => h.anotacion.tipo !== 'Positiva').length}</strong></p><ul class="iv-list">${g.anotaciones.slice(0, 6).map(h => `<li><strong>${fecha(h.date)} · ${esc(h.anotacion.tipo)}</strong><span>${esc(corto(String(h.background).replace(/^Anotación \w+: /, ''), 140))}</span></li>`).join('')}</ul>` : vacio('Sin anotaciones.'))}

        ${sec('planes', 'clipboard-list', 'Planes', g.planes.length + g.planesArea.length, (g.planes.length || g.planesArea.length) ? `<ul class="iv-list">${g.planes.map(pl => `<li><strong>${esc(pl.type || 'Plan individual')}</strong><span>${esc(corto(pl.objective, 150))}</span><em>${esc(pl.status || 'En desarrollo')}${pl.evalQuant ? ` · logro ${pl.evalQuant}%` : ''}</em></li>`).join('')}${g.planesArea.map(r => `<li><strong>${esc(r.type || 'Plan')}</strong><span>${r.area === 'PIE' ? 'Programa PIE' : 'Riesgo de repitencia'} · ${fecha(r.date)}</span></li>`).join('')}</ul>` : vacio('Sin planes registrados.'))}

        ${sec('protocolos', 'alert-octagon', 'Protocolos y cartas', g.protocolos.length + g.cartas.length, (g.protocolos.length || g.cartas.length) ? `<ul class="iv-list">${g.protocolos.map(h => `<li><strong>${fecha(h.date)} · ${esc(h.protocol?.type || 'Protocolo')}</strong><span>Estado: ${esc(h.protocol?.status || 'En proceso')}</span></li>`).join('')}${g.cartas.map(h => `<li><strong>${fecha(h.date)} · ${esc(h.type)}</strong><span>${this.actaOf && this.actaOf(h.id) ? 'Acta firmada subida' : 'Sin acta firmada'}</span></li>`).join('')}</ul>` : vacio('Sin protocolos ni cartas.'))}

        ${sec('obs', 'eye', 'Observaciones docentes y enfermería', g.observaciones.length + g.enfermeria.length, `${g.observaciones.length ? `<ul class="iv-list">${g.observaciones.slice(0, 5).map(o => `<li><strong>${fecha(o.date)}</strong><span>${esc(corto(o.content || o.observacion || '', 150))}</span><em>${esc(o.professional || '')}</em></li>`).join('')}</ul>` : vacio('Sin observaciones docentes.')}${g.enfermeria.length ? `<p class="small">Atenciones de enfermería: <strong>${g.enfermeria.length}</strong></p>` : ''}`)}

        ${g.ocultas.length ? `<p class="note">${ico('lock')}${g.ocultas.length} registro(s) confidencial(es) no se muestran.</p>` : ''}
      </div>
      <footer class="iv-foot">
        <label class="check"><input type="checkbox" ${this.autoResumen() ? 'checked' : ''} onchange="app.setAutoResumen(this.checked)"><span>Abrir al iniciar una entrevista</span></label>
        <button type="button" class="btn btn--sm" onclick="app.openExportModal('ficha_entrevistas')">${ico('file-output')}Ficha de entrevistas</button>
      </footer>`;
    icons();
  },
  /** Inicia una entrevista nueva: abre el formulario y, al lado, el resumen del estudiante. */
  startInterview() {
    this.changeDetailTab('entrevistas');
    this.openInterventionForm();
    this.openInterviewPanel();
  }
});

const ivNum = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };

// Al abrir el formulario de una entrevista nueva se muestra el resumen (si el funcionario lo dejó activado)
(() => {
  const abrir = app.openInterventionForm;
  app.openInterventionForm = function (r = null) {
    abrir.call(this, r);
    if (!r && this.autoResumen()) this.openInterviewPanel();
  };
  // Si se cambia de estudiante o se sale de la ficha, el resumen se cierra; si cambian los datos, se actualiza
  const nav = app.navigate;
  app.navigate = function (v) { if (v !== 'student_detail') this.closeInterviewPanel(); return nav.call(this, v); };
  const rs = app.renderStudentDetail;
  app.renderStudentDetail = function () {
    const out = rs.call(this);
    const p = el('interview-panel');
    if (p && !p.hidden) { if (!sameId(p.dataset.student, State.selectedStudentId)) this.closeInterviewPanel(); else this.renderInterviewPanel(); }
    return out;
  };
})();

// Ficha de entrevistas del estudiante (PDF o Word)
app.REPORTS.ficha_entrevistas = function () {
  const s = app.current();
  const g = app.studentDigest(s);
  const c = s.contacto || {};
  const filas = [...g.entrevistas, ...g.protocolos, ...g.cartas].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    filename: `Ficha_Entrevistas_${String(s.name).replace(/\s+/g, '_')}.pdf`, title: 'FICHA DE ENTREVISTAS DEL ESTUDIANTE', student: true,
    body: `${docKv([[['Apoderado(a)', esc(c.apoderado || '-')], ['Teléfono', esc(c.telefono || '-')]], [['Profesor(a) jefe', esc(app.profJefeOf(s.curso) || '-')], ['Asistencia', `${s.asistencia.real} % (${s.asistencia.inasistencias} inasistencias, ${s.asistencia.atrasos} atrasos)`]], [['Promedio general', `${esc(g.notas?.promedioGeneral || '-')}${g.anioNotas ? ` (${esc(g.anioNotas)})` : ''}`], ['Anotaciones', `${g.anotaciones.filter(h => h.anotacion.tipo === 'Positiva').length} positivas / ${g.anotaciones.filter(h => h.anotacion.tipo !== 'Positiva').length} negativas`]]])}
      <div class="doc-avoid">${docH('Resumen de lo realizado con el estudiante')}
        ${docTable(['Ámbito', 'Cantidad', 'Detalle'], [
          ['Entrevistas e intervenciones', g.entrevistas.length, esc([...new Set(g.entrevistas.map(h => h.type))].slice(0, 5).join(', '))],
          ['Protocolos', g.protocolos.length, esc(g.protocolos.map(h => `${h.protocol?.type || 'Protocolo'} (${h.protocol?.status || 'En proceso'})`).join('; '))],
          ['Cartas de compromiso', g.cartas.length, g.actas ? `${g.actas} con acta firmada` : ''],
          ['Planes', g.planes.length + g.planesArea.length, esc([...g.planes.map(p => p.type || 'Plan individual'), ...g.planesArea.map(r => r.type || 'Plan')].join(', '))],
          ['Asignaturas bajo 4,0', g.bajo4.length, esc(g.bajo4.map(a => `${a.nombre} (${String(a.nota).replace('.', ',')})`).join(', '))],
          ['Observaciones docentes', g.observaciones.length, ''], ['Atenciones de enfermería', g.enfermeria.length, '']
        ], '')}</div>
      ${g.acuerdos.length ? `<div class="doc-avoid">${docH('Acuerdos pendientes')}${docTable(['Fecha', 'Acuerdo', 'Estado'], g.acuerdos.map(a => [fmtDate(a.fecha), esc(a.text), esc(a.progress || 'No iniciado')]), '')}</div>` : ''}
      ${docH('Registro de entrevistas')}
      ${filas.length ? filas.map(h => `<div class="doc-block doc-avoid"><div class="doc-block__head">${fmtDate(h.date)} · ${esc(h.type)} · ${esc(h.professional || '')}</div>
        <p class="doc-pre">${esc(String(h.background || '').replace(/\*\*/g, ''))}</p>
        ${(h.agreements || []).filter(a => a.text).length ? `<p><strong>Acuerdos:</strong></p><ul>${h.agreements.filter(a => a.text).map(a => `<li>${esc(a.text)} <em>(${esc(a.progress || 'No iniciado')})</em></li>`).join('')}</ul>` : ''}</div>`).join('') : '<p class="doc-empty">Sin entrevistas registradas.</p>'}
      ${g.ocultas.length ? `<p class="doc-muted">${g.ocultas.length} registro(s) confidencial(es) no se incluyen.</p>` : ''}`
  };
};
