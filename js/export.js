'use strict';
// =====================================================================
// INFORMES PDF Y FIRMAS
// Cada informe es una función pequeña; el encabezado, las tablas, el
// texto normativo y las firmas se arman una sola vez (clases .doc en app.css).
// =====================================================================
const docTable = (heads, rows, emptyText, cls = '') => `<table class="doc-table ${cls}"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}" class="doc-empty">${emptyText}</td></tr>`}</tbody></table>`;
const docKv = pairs => `<table class="doc-kv">${pairs.map(row => `<tr>${row.map(([k, v]) => `<th>${k}</th><td>${v}</td>`).join('')}</tr>`).join('')}</table>`;
const docH = t => `<h4 class="doc-h">${t}</h4>`;

Object.assign(app, {
  printSingleCarta(id, isFromPie) {
    State.export.tempCartaId = id;
    State.export.tempCartaIsPie = !!isFromPie;
    this.openExportModal('single_carta');
  },

  // ---------------- MODAL DE DESCARGA ----------------
  openExportModal(ctx) {
    const ex = State.export;
    ex.context = ctx;
    ex.customSignatures = [];
    const add = (role, name, checked) => ex.customSignatures.push({ id: newId(), role, name: String(name || '').toUpperCase(), checked: !!checked });

    if (['course_plan_final', 'student_plan_final'].includes(ctx) && State.plan) (State.plan.responsibles || []).forEach(r => { if (r.name) add((r.cargo || 'RESPONSABLE').toUpperCase(), r.name, true); });
    const studentDoc = ['student_plan_final', 'single_carta', 'student_internal', 'protocolo_informe', 'ficha_entrevistas'].includes(ctx);
    if (studentDoc) {
      const st = this.current();
      add('ESTUDIANTE', st ? this.formatStudentName(st.name) : '', true);
      add('APODERADO/A', st?.contacto?.apoderado || '', true);
      add('PROFESOR/A JEFE', st ? this.profJefeOf(st.curso) : '', true);
    }
    if (ctx === 'single_carta') {
      const meta = State.rawInterventions.find(i => sameId(i.id, ex.tempCartaId))?.cartaMeta;
      if (meta?.apoderado) ex.customSignatures.find(s => s.role === 'APODERADO/A').name = meta.apoderado;
      if (meta?.extraName) add(meta.extraRole || 'FIRMA', meta.extraName, true);
    }
    add('FUNCIONARIO/A RESPONSABLE', State.currentUser.name, true);
    add('ENCARGADA DE CONVIVENCIA ESCOLAR', FIRMANTES['ENCARGADA DE CONVIVENCIA ESCOLAR'], studentDoc);
    add('INSPECTOR/A GENERAL', '', false);
    add('UNIDAD TÉCNICO PEDAGÓGICA (UTP)', '', false);
    add('DIRECTORA', FIRMANTES['DIRECTORA'], !studentDoc);

    ui.modal({
      title: 'Opciones de descarga', icon: 'file-down', size: 'md', okText: 'Generar archivo',
      body: `<div class="stack">
        <div><span class="field__label">Formato del archivo</span><div class="segs" role="group" aria-label="Formato del archivo">
          <button type="button" class="seg" id="btn-fmt-pdf" aria-pressed="${ex.format !== 'word'}" onclick="app.setExportFormat('pdf')">${ico('file-text')}PDF</button>
          <button type="button" class="seg" id="btn-fmt-word" aria-pressed="${ex.format === 'word'}" onclick="app.setExportFormat('word')">${ico('file-type-2')}Word (editable)</button></div></div>
        <div><span class="field__label">Tamaño de papel</span><div class="segs" role="group" aria-label="Tamaño de papel">
          <button type="button" class="seg" id="btn-size-letter" aria-pressed="${ex.size === 'letter'}" onclick="app.setExportSize('letter')">Carta</button>
          <button type="button" class="seg" id="btn-size-legal" aria-pressed="${ex.size === 'legal'}" onclick="app.setExportSize('legal')">Oficio</button></div></div>
        ${ctx === 'student_internal' ? '<label class="check" data-tone="proto"><input type="checkbox" id="export-confidential"><span>Incluir detalles de protocolos e intervenciones confidenciales</span></label>' : ''}
        ${['student_internal', 'student_plan_final'].includes(ctx) && Object.keys(this.current()?.calificaciones || {}).length ? `<label class="check"><input type="checkbox" id="export-grades" ${ex.includeGrades ? 'checked' : ''}><span>Incluir el registro de notas</span></label>` : ''}
        <label class="check"><input type="checkbox" id="export-sig" checked onchange="el('signature-selector').hidden=!this.checked"><span>Incluir firmas al final</span></label>
        <div id="signature-selector" class="subpanel">
          <h4>${ico('pen-tool')}Firmas del documento</h4>
          <div class="sig-add">
            <select id="custom-sig-role" class="input" aria-label="Cargo" onchange="app.onSigRoleChange()">${options([...SIG_ROLES.map(r => [r, r]), ['OTRO', 'OTRO (escribir cargo)...']])}</select>
            <input id="custom-sig-other" class="input" placeholder="Cargo" aria-label="Cargo personalizado" hidden oninput="this.value=this.value.toUpperCase()">
            <input id="custom-sig-name" class="input" placeholder="Nombre de quien firma" aria-label="Nombre de quien firma" oninput="this.value=this.value.toUpperCase()">
            <button type="button" class="btn btn--sm" onclick="app.addCustomSignature()">Añadir firma</button>
          </div>
          <div id="signature-list" class="stack"></div>
        </div>
      </div>`,
      onOk: () => this.executeExport()
    });
    this.onSigRoleChange();
    this.renderCustomSignatures();
  },
  setExportFormat(fmt) {
    State.export.format = fmt;
    el('btn-fmt-pdf').setAttribute('aria-pressed', fmt !== 'word');
    el('btn-fmt-word').setAttribute('aria-pressed', fmt === 'word');
  },
  setExportSize(sz) {
    State.export.size = sz;
    el('btn-size-letter').setAttribute('aria-pressed', sz === 'letter');
    el('btn-size-legal').setAttribute('aria-pressed', sz === 'legal');
  },
  onSigRoleChange() {
    const rol = el('custom-sig-role').value;
    el('custom-sig-other').hidden = rol !== 'OTRO';
    const st = this.current();
    const auto = {
      ...FIRMANTES,
      'FUNCIONARIO/A RESPONSABLE': State.currentUser.name,
      'ESTUDIANTE': st ? this.formatStudentName(st.name) : '',
      'PROFESOR/A JEFE': this.profJefeOf(st ? st.curso : State.filterCourse),
      'APODERADO/A': st?.contacto?.apoderado || ''
    };
    el('custom-sig-name').value = String(auto[rol] || '').toUpperCase();
  },
  renderCustomSignatures() {
    const list = State.export.customSignatures;
    el('signature-list').innerHTML = list.length ? list.map((s, i) => `
      <div class="sig-row">
        <label class="check"><input type="checkbox" ${s.checked ? 'checked' : ''} onchange="State.export.customSignatures[${i}].checked=this.checked"><span><strong>${esc(s.role)}</strong><span class="cell-sub">${s.name ? esc(s.name) : 'Sin nombre: se imprime solo la línea'}</span></span></label>
        <button type="button" class="icon-btn icon-btn--danger" aria-label="Quitar firma" onclick="app.removeCustomSignature(${i})">${ico('trash-2')}</button>
      </div>`).join('') : '<p class="muted small">No hay firmas configuradas.</p>';
    icons();
  },
  addCustomSignature() {
    let role = el('custom-sig-role').value;
    if (role === 'OTRO') { role = el('custom-sig-other').value.trim().toUpperCase(); if (!role) return toast('Escriba el cargo de quien firma', 'error'); }
    State.export.customSignatures.push({ id: newId(), name: el('custom-sig-name').value.trim().toUpperCase(), role, checked: true });
    el('custom-sig-name').value = '';
    this.renderCustomSignatures();
  },
  removeCustomSignature(i) { State.export.customSignatures.splice(i, 1); this.renderCustomSignatures(); },

  // ---------------- REPORTE DE FUNCIONARIO ----------------
  openStaffReportModal() {
    const all = hasAccess('ver_todos_reportes');
    const people = all ? State.users.map(u => [u.id, u.name]) : [[State.currentUser.id, State.currentUser.name]];
    ui.modal({
      title: 'Reporte de gestión', icon: 'calendar-days', size: 'sm', okText: 'Generar reporte',
      body: `<div class="stack">
        ${fieldHtml('Funcionario', `<select id="report-prof-select" class="input">${options(people, State.currentUser.id)}</select>`)}
        ${fieldHtml('Tipo de reporte', `<select id="report-type" class="input" onchange="el('report-month-wrapper').hidden=this.value==='annual'; el('report-year-wrapper').hidden=this.value!=='annual'">${options([['monthly', 'Mensual'], ['annual', 'Anual']])}</select>`)}
        <div id="report-month-wrapper">${fieldHtml('Mes y año', `<input type="month" id="report-month" class="input" value="${today().slice(0, 7)}">`)}</div>
        <div id="report-year-wrapper" hidden>${fieldHtml('Año', `<input type="number" id="report-year" class="input num" min="2020" max="2100" value="${today().slice(0, 4)}">`)}</div>
      </div>`,
      onOk: () => {
        const type = el('report-type').value;
        const time = type === 'monthly' ? el('report-month').value : el('report-year').value;
        if (!time) { toast('Complete los campos', 'error'); return false; }
        Object.assign(State.export, { context: 'staff_report', customSignatures: [], tempProfId: el('report-prof-select').value, tempTime: time, tempType: type });
        ui.close();
        this.executeExport({ includeSig: false });
        return false;
      }
    });
  },

  // ---------------- CONSTRUCTORES DE CADA INFORME ----------------
  REPORTS: {
    plan(ctx) {
      const p = State.plan;
      const acciones = (p.actions || []).map((a, i) => `
        <div class="doc-block">
          <div class="doc-block__head">Acción ${i + 1}: ${esc(a.name)}</div>
          <p><strong>Justificación técnico-normativa:</strong><br>${esc(a.justification || 'Sin justificación registrada.')}</p>
          <p><strong>Indicador de logro:</strong><br>${esc(a.indicator || 'N/A')}</p>
          <p class="doc-small"><strong>Bitácora de avances</strong></p>
          ${(a.logs || []).length ? docTable(['Fecha', 'Detalle'], a.logs.map(l => [fmtDate(l.date), esc(l.desc)]), '', 'doc-table--log') : '<p class="doc-small doc-muted">Sin registros de ejecución.</p>'}
        </div>`).join('');
      const rubrica = (p.evaluationItems || []).length ? `<div class="doc-avoid">${docH(`Rúbrica de evaluación (logro: ${p.evalQuant || 0}%)`)}${docTable(['Indicador de rúbrica', ...p.responsibles.map(r => esc(r.name))], p.evaluationItems.map(it => [esc(it.text), ...p.responsibles.map(r => (r.answers || {})[it.id] || '-')]), 'Sin responsables')}</div>` : '';
      return {
        filename: `Plan_${String(p.studentName || p.course).replace(/\s+/g, '_')}_Oficial.pdf`,
        title: p.type ? p.type.toUpperCase() : (ctx === 'course_plan_final' ? 'PLAN COLECTIVO DE CURSO' : 'PLAN DE TRABAJO INDIVIDUAL'),
        student: ctx === 'student_plan_final',
        body: `<div class="doc-box doc-avoid"><h4>Objetivo general</h4><p>${esc(p.objective)}</p></div>
          ${acciones ? docH('Detalle de acciones y seguimiento') + acciones : ''}${rubrica}
          ${p.evalQual ? `<div class="doc-avoid">${docH('Conclusión cualitativa final')}<div class="doc-box doc-pre">${esc(p.evalQual)}</div></div>` : ''}`,
        normative: true
      };
    },
    single_carta() {
      const ex = State.export;
      let found = State.rawInterventions.find(i => sameId(i.id, ex.tempCartaId));
      if (!found && ex.tempCartaIsPie) {
        State.rawInclusionReports.forEach(r => (r.reportesFamilia || []).forEach(rf => { if (sameId(rf.id, ex.tempCartaId)) found = { type: rf.tipoDocumento || 'Documento PIE', background: rf.contenido || '' }; }));
      }
      return { filename: 'Documento_Oficial.pdf', title: String(found?.type || 'DOCUMENTO DE COMPROMISO').toUpperCase(), student: true, body: `<div class="doc-pre doc-letter">${esc(String(found?.background || '').replace(/\*\*/g, '').replace(/DOCUMENTO OFICIAL:/g, '').trim())}</div>`, normative: true };
    },
    protocolo_informe() {
      const r = State.rawInterventions.find(i => sameId(i.id, State.export.tempIntId));
      const p = r?.protocol || {};
      const m = p.mediacion || {};
      return {
        filename: `Informe_Protocolo_${fmtDate(r?.date).replace(/\//g, '-')}.pdf`, title: 'INFORME DE CIERRE DE PROTOCOLO', student: true,
        body: `${docKv([[['Protocolo', esc(p.type)], ['Estado', esc(p.status || 'En Proceso')]], [['Fecha de activación', fmtDate(r?.date)], ['Fecha de cierre', fmtDate(p.fechaCierre) || '-']], [['Quién activa', esc(p.activator || '-')], ['Redes externas', p.denuncia ? 'Sí aplica' : 'No aplica']], [['Afectado', esc(p.afectado)], ['Denunciado', esc(p.denunciado)]]])}
          ${docH('Antecedentes')}<div class="doc-box doc-pre">${esc(r?.background || 'Sin antecedentes registrados.')}</div>
          ${docH('Medidas formativas y disciplinarias')}<div class="doc-box doc-pre">${esc(p.medidas || '-')}</div>
          ${m.motivo || m.acuerdos ? `${docH('Proceso de mediación')}${docKv([[['Participantes', esc(m.participantes)]], [['Motivo', esc(m.motivo)]], [['Acuerdos', esc(m.acuerdos)]], [['Solución', esc(m.solucion)]]])}` : ''}
          ${(r?.agreements || []).length ? docH('Medidas y acuerdos') + docTable(['Medida o acuerdo', 'Plazo', 'Estado'], r.agreements.map(a => [`<span class="doc-pre">${esc(a.text)}</span>`, esc(a.plazo ? app.fmtPlazo(a) : '-'), esc(app.agreementStatusText ? app.agreementStatusText(a) : a.progress)]), '') : ''}
          <p class="doc-small">Registrado por ${esc(r?.professional || '')}.</p>`
      };
    },
    student_internal(ctx, opts) {
      const s = app.current();
      const rows = [];
      s.history.forEach(h => {
        const conf = h.isPrivate || h.type === PROTOCOLO;
        const txt = esc(h.background || 'Intervención formal');
        rows.push([h.date, esc(h.type), conf ? (opts.includeConfidential && !h.restricted ? `Confidencial: <span class="doc-pre">${txt}</span>` : '[Información confidencial oculta]') : `<span class="doc-pre">${txt}</span>`, esc(h.professional)]);
      });
      s.observations.forEach(o => rows.push([o.date, 'Observación docente', 'Registro en aula', esc(o.professional)]));
      s.nursing.forEach(n => rows.push([n.date, 'Atención enfermería', esc(n.reason), esc(n.professional)]));
      State.rawInclusionReports.filter(r => sameId(r.studentId, s.id)).forEach(r => rows.push([r.date || '', esc(r.type || 'Plan PIE'), 'Doc. inclusión y estrategias', esc(r.responsablePlan || 'Equipo PIE')]));
      app.getStudentEvidences(s.id).forEach(ev => rows.push([ev.date || '', `Respaldo: ${esc(ev.type || 'Archivo')}`, esc(ev.description || ev.fileName), esc(ev.uploadedBy || 'Sistema')]));
      rows.sort((a, b) => new Date(b[0]) - new Date(a[0]));
      const c = s.contacto || {};
      const mens = s.inasistenciasMensuales;
      return {
        filename: `Ficha_${s.name.replace(/\s+/g, '_')}.pdf`, title: 'RESUMEN GENERAL DE ACTIVIDADES DEL ESTUDIANTE', student: true,
        body: `${(c.apoderado || c.email || c.telefono) ? docH('Datos de contacto') + docKv([[['Apoderado/a', `${esc(c.apoderado || '-')}${c.parentesco ? ' (' + esc(c.parentesco) + ')' : ''}`]], [['Correo', esc(c.email || '-')]], [['Teléfonos', esc([c.telefono, c.telefono2].filter(Boolean).join(' / ') || '-')]]]) : ''}
          ${mens && Object.keys(mens).length ? docH('Inasistencias por mes') + docTable([...MESES, 'Total'], [[...MESES.map(m => parseInt(mens[m]) || 0), `<strong>${MESES.reduce((a, m) => a + (parseInt(mens[m]) || 0), 0)}</strong>`]], '', 'doc-table--center') : ''}
          ${docH('Historial de actividades y registros')}${docTable(['Fecha', 'Tipo de registro', 'Descripción', 'Profesional a cargo'], rows.map(r => [fmtDate(r[0]), `<strong>${r[1]}</strong>`, r[2], r[3]]), 'No hay actividades registradas para este estudiante.')}`
      };
    },
    staff_report() {
      const ex = State.export;
      const prof = State.users.find(u => sameId(u.id, ex.tempProfId));
      const pid = prof ? String(prof.id) : '';
      const periodo = String(ex.tempTime || '');
      const inP = f => !!f && String(f).split('T')[0].startsWith(periodo);
      const est = id => { const st = State.rawStudents.find(x => sameId(x.id, id)); return st ? [app.formatStudentName(String(st.name || '')), app.courseNameOf(st)] : ['No identificado', '-']; };
      const regs = [];
      State.rawInterventions.forEach(i => {
        if ((sameId(i.professionalId, pid) || (i.sharedWith || []).map(String).includes(pid)) && inP(i.date)) {
          const [n, c] = est(i.studentId);
          regs.push([i.date, i.type, n, c, (i.isPrivate || i.type === PROTOCOLO) ? 'Registro confidencial (detalle reservado)' : String(i.background || '').substring(0, 200)]);
        }
      });
      State.rawObservations.forEach(o => { if (sameId(o.professionalId, pid) && inP(o.date)) regs.push([o.date, 'Observación docente', ...est(o.studentId), String(o.content || '').substring(0, 200)]); });
      State.rawNursings.forEach(n => { if (sameId(n.professionalId, pid) && inP(n.date)) regs.push([n.date, 'Atención de enfermería', ...est(n.studentId), String(n.reason || '').substring(0, 200)]); });
      State.studentPlans.forEach(p => { if (sameId(p.creatorId, pid) && inP(p.date)) regs.push([p.date, p.type || 'Plan individual', app.formatStudentName(String(p.studentName || '')), p.course || '-', String(p.objective || '').substring(0, 200)]); });
      State.coursePlans.forEach(p => { if (sameId(p.creatorId, pid) && inP(p.date)) regs.push([p.date, 'Plan de curso', 'Grupo curso completo', p.course || '-', String(p.objective || '').substring(0, 200)]); });
      State.rawEvidences.forEach(ev => { if (sameId(ev.uploaderId, pid) && inP(ev.date)) regs.push([ev.date, `Respaldo: ${ev.type || 'Archivo'}`, app.formatStudentName(String(ev.studentName || '')), ev.course || '-', String(ev.description || ev.fileName || '').substring(0, 200)]); });
      regs.sort((a, b) => new Date(a[0]) - new Date(b[0]));
      const resumen = {};
      regs.forEach(r => { resumen[r[1]] = (resumen[r[1]] || 0) + 1; });
      const name = prof ? prof.name : 'Profesional';
      return {
        filename: `Reporte_${name.replace(/\s+/g, '_')}_${periodo}.pdf`, title: 'INFORME DE GESTIÓN DE FUNCIONARIO', wide: true,
        body: `${docKv([[['Funcionario', `${esc(name)}${prof?.customRole ? ' — ' + esc(prof.customRole) : ''}`]], [['Período', ex.tempType === 'annual' ? 'Año ' + periodo : 'Mes ' + periodo]], [['Total de registros', `<strong>${regs.length}</strong>`]]])}
          ${docH('Resumen por tipo de acción')}${docTable(['Tipo de acción', 'Cantidad'], Object.entries(resumen).map(([k, v]) => [esc(k), `<strong>${v}</strong>`]), 'Sin registros en el período.')}
          ${docH('Detalle cronológico')}${docTable(['Fecha', 'Tipo', 'Estudiante', 'Curso', 'Detalle'], regs.map(r => [fmtDate(r[0]), `<strong>${esc(r[1])}</strong>`, esc(r[2]), esc(r[3]), esc(r[4])]), 'No se registran acciones en el período seleccionado.')}`
      };
    },
    alerts_report() {
      const course = el('alerts-course-filter')?.value || '';
      const rows = app.rankedAlerts(course);
      return {
        filename: `Alertas_Preventivas${course ? '_' + course.replace(/\s+/g, '_') : ''}.pdf`, title: 'REPORTE DE ALERTAS PREVENTIVAS', wide: true,
        body: `<p><strong>Alcance:</strong> ${esc(course || 'Todos los cursos del establecimiento')}. <strong>Fecha de emisión:</strong> ${fmtDate(today())}. <strong>Estudiantes con registros:</strong> ${rows.length}.</p>
          ${docTable(['N°', 'Estudiante', 'Curso', 'Asist.', 'Prot.', 'Conv.', 'PIE', 'Obs.', 'Enf.', 'Total'], rows.map((r, i) => [i + 1, `<strong>${esc(app.formatStudentName(r.name))}</strong>`, esc(r.curso), `${r.asistencia.real}%`, r.proto, r.conv, r.pie, r.obs, r.enf, `<strong>${r.total}</strong>`]), 'No hay alertas registradas con este criterio.', 'doc-table--center')}
          <p class="doc-small">Este reporte consolida la cantidad de registros por estudiante (protocolos, intervenciones de convivencia o PIE, observaciones docentes y atenciones de enfermería). No incluye el detalle de los registros confidenciales.</p>`
      };
    },
    course_summary_report() {
      const rows = app.courseSummaryRows();
      const keys = ['matricula', 'proto', 'conv', 'pie', 'obs', 'enf', 'planesIndiv', 'planesCurso', 'total'];
      const tot = keys.map(k => rows.reduce((a, r) => a + r[k], 0));
      const body = rows.map(r => [`<strong>${esc(r.curso)}</strong>`, ...keys.map(k => r[k])]);
      if (rows.length) body.push(['<strong>TOTALES</strong>', ...tot.map(v => `<strong>${v}</strong>`)]);
      return {
        filename: 'Resumen_Por_Cursos.pdf', title: 'RESUMEN CONSOLIDADO POR CURSOS', wide: true,
        body: `<p><strong>Fecha de emisión:</strong> ${fmtDate(today())}</p>${docTable(['Curso', 'Matrícula', 'Protocolos', 'Conv.', 'PIE', 'Obs.', 'Enf.', 'Planes ind.', 'Planes curso', 'Total'], body, 'No hay datos disponibles.', 'doc-table--center')}`
      };
    },
    global_course_plans_report() {
      const planes = State.coursePlans.slice().sort((a, b) => String(a.course).localeCompare(String(b.course)));
      return {
        filename: 'Reporte_Planes_De_Curso.pdf', title: 'REPORTE GENERAL DE PLANES DE CURSO',
        body: `<p><strong>Total de planes registrados:</strong> ${planes.length}. <strong>Fecha de emisión:</strong> ${fmtDate(today())}.</p>
          ${planes.map(p => `<div class="doc-block"><div class="doc-block__head">${esc(p.course || 'Sin curso')}, ${fmtDate(p.date)}. Logro rúbrica: ${p.evalQuant || 0}%</div>
            <p><strong>Objetivo:</strong> ${esc(p.objective || 'Sin objetivo registrado')}</p><p><strong>Acciones definidas:</strong> ${(p.actions || []).length}</p>
            <p><strong>Responsables:</strong> ${esc((p.responsibles || []).map(r => r.name).filter(Boolean).join(', ') || 'No registrados')}</p>
            <p><strong>Redes de apoyo:</strong> ${esc((p.networks || []).map(n => n.name).filter(Boolean).join(', ') || 'No registradas')}</p></div>`).join('') || '<p class="doc-empty">No hay planes de curso registrados en el sistema.</p>'}`
      };
    },
    course_full_report() {
      const course = State.filterCourse || 'Todos los cursos';
      const studs = app.getStudents().filter(x => x.status !== 'blocked' && (!State.filterCourse || x.curso === State.filterCourse)).sort((a, b) => a.name.localeCompare(b.name));
      return {
        filename: `Reporte_Curso_${course.replace(/\s+/g, '_')}.pdf`, title: 'REPORTE GENERAL DEL CURSO', wide: true,
        body: `<p><strong>Curso:</strong> ${esc(course)}. <strong>Profesor(a) jefe:</strong> ${esc(app.profJefeOf(State.filterCourse) || 'No registrado')}. <strong>Matrícula:</strong> ${studs.length}. <strong>Emisión:</strong> ${fmtDate(today())}.</p>
          ${docTable(['N°', 'Estudiante', 'Asist.', 'Inasist.', 'Atrasos', 'Prot.', 'Conv.', 'PIE', 'Obs.', 'Enf.', 'Planes'], studs.map((st, i) => { const c = app.countRecords(st); return [i + 1, `<strong>${esc(app.formatStudentName(st.name))}</strong>`, st.asistencia.alerta ? `<strong class="doc-alert">${st.asistencia.real}%</strong>` : `${st.asistencia.real}%`, st.asistencia.inasistencias, st.asistencia.atrasos, c.proto, c.conv, c.pie, c.obs, c.enf, State.studentPlans.filter(p => sameId(p.studentId, st.id)).length]; }), 'No hay estudiantes registrados en este curso.', 'doc-table--center')}`
      };
    },
    traspaso() {
      const d = State.trDraft || {}, a = State.trData || app.computeTraspaso(State.traspasoCourse, State.traspasoAnio);
      const n = s => esc(app.formatStudentName(s.name));
      const graficos = (app._trCharts || []).map(c => { try { return `<img src="${c.toBase64Image('image/png', 1)}" style="width:32%;display:inline-block;margin-right:1%">`; } catch (e) { return ''; } }).join('');
      const listaSimple = (arr, fn) => arr.length ? `<ul>${arr.map(x => `<li>${fn(x)}</li>`).join('')}</ul>` : '<p class="doc-muted">Sin registros.</p>';
      const auto = {
        matricula: `${docKv([[['Matrícula inicial', a.matriculaInicial], ['Matrícula actual', a.activos.length]], [['Se incorporaron', a.incorporados.length], ['Se retiraron', a.retirados.length]]])}
          ${a.incorporados.length ? docTable(['Incorporado', 'Fecha'], a.incorporados.map(s => [n(s), fmtDate(s.fechaIngreso)]), '') : ''}
          ${a.retirados.length ? docTable(['Retirado', 'Fecha', 'Motivo'], a.retirados.map(s => [n(s), fmtDate(s.fechaRetiro), esc(s.motivoRetiro || '')]), '') : ''}`,
        rendimiento: a.rendimiento.length ? docTable(['Asignatura', 'Bajo 4,0', '%', '4,0 a 5,9', '%', '6,0 o más', '%', 'Promedio'], a.rendimiento.map(r => { const p = v => r.n ? Math.round(v / r.n * 100) : 0; return [esc(r.nombre), r.bajo, p(r.bajo), r.medio, p(r.medio), r.alto, p(r.alto), `<strong>${String(r.promedio).replace('.', ',')}</strong>`]; }), '', 'doc-table--center') : '<p class="doc-muted">Sin notas cargadas.</p>',
        riesgo: listaSimple(a.riesgo, x => `${n(x.s)}: ${esc(x.motivos.join(', '))}`),
        asistencia: listaSimple(a.asistencia, s => `${n(s)}: ${s.asistencia.real} % (${s.asistencia.inasistencias} inasistencias)`),
        disciplina: listaSimple(a.disciplina, x => `${n(x.s)}: ${[x.prot && `${x.prot} protocolo(s)`, x.graves && `${x.graves} falta(s) grave(s)`, x.anot && `${x.anot} anotación(es) negativa(s)`].filter(Boolean).join(', ')}`),
        socioemocional: listaSimple(a.socio, x => `${n(x.s)}: ${esc([x.planes.join(', '), x.apoyos && `${x.apoyos} apoyo(s)`].filter(Boolean).join('. '))}`),
        pie: listaSimple(a.pie, x => `${n(x.s)}: ${esc(x.tipos.join(', ') || 'Documentos PIE')} (${x.docs} documento(s))`),
        ritmo: `<p><strong>Evaluación:</strong> ${esc((RITMO_OPCIONES.find(o => o[0] === d.ritmo) || [, 'Sin definir'])[1])}</p>`,
        talleres: listaSimple(a.talleres, t => esc(t)),
        dia: app.diaReportHtml(State.traspasoCourse, State.traspasoAnio, true) || '<p class="doc-muted">Sin informes DIA cargados.</p>',
        convivencia: (v => v ? `${docKv([[['Registros de convivencia', v.total], ['Protocolos', v.protocolos]], [['Faltas graves o gravísimas', v.faltas.GRAVE + v.faltas['GRAVÍSIMA']], ['Concentración en 3 estudiantes', `${v.concentracion} %`]], [['Cartas de compromiso', v.cartas], ['Anotaciones positivas / negativas', `${v.anot.positivas} / ${v.anot.negativas}`]]])}
          ${v.porTipo.length ? `<p class="doc-muted"><strong>Tipos más frecuentes:</strong> ${v.porTipo.slice(0, 5).map(([t, n]) => `${esc(t)} (${n})`).join('; ')}.</p>` : ''}
          ${d.convivenciaIA ? `<div class="doc-box"><strong>Análisis de convivencia (IA${d.convivenciaIA.revisado ? `, revisado por ${esc(d.convivenciaIA.revisadoPor || '')}` : ', pendiente de revisión'}):</strong> ${esc(d.convivenciaIA.clima || '')}
            ${[['Claves para organizar el curso', d.convivenciaIA.claves_organizacion], ['Acciones preventivas', d.convivenciaIA.acciones_preventivas], ['Trabajo con familias', d.convivenciaIA.trabajo_con_familias], ['Coordinaciones', d.convivenciaIA.coordinaciones]].filter(([, l]) => (l || []).length).map(([t, l]) => `<p><strong>${t}:</strong></p><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>` : ''}` : '')(a.convivencia)
      };
      const an = d.analisis;
      const interp = k => an?.interpretaciones?.[k] ? `<p class="doc-muted"><strong>Interpretación (IA):</strong> ${esc(an.interpretaciones[k])}</p>` : '';
      const analisis = an ? `<div class="doc-avoid">${docH('Conclusión general e interpretación (IA)')}${an.conclusion_general ? `<div class="doc-box doc-pre"><strong>Conclusión general:</strong> ${esc(an.conclusion_general)}</div>` : ''}${an.resumen ? `<div class="doc-box doc-pre">${esc(an.resumen)}</div>` : ''}
        ${[['Fortalezas', an.fortalezas], ['Desafíos y alertas', an.desafios], ['Recomendaciones para planificar', an.recomendaciones], ['Apoyos sugeridos', an.apoyos_sugeridos]].filter(([, l]) => (l || []).length).map(([t, l]) => `<p><strong>${t}:</strong></p><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
        ${(an.focos_por_asignatura || []).length ? docTable(['Asignatura', 'Foco sugerido'], an.focos_por_asignatura.map(f => [esc(f.asignatura), esc(f.sugerencia)]), '') : ''}
        <p class="doc-muted">Interpretación generada con IA a partir de datos agregados y sin identificar a los estudiantes (Ley 19.628 y Ley 21.719). Revisada por el equipo antes de su uso.</p></div>` : '';
      return {
        filename: `Ficha_Traspaso_${String(State.traspasoCourse).replace(/\s+/g, '_')}_${State.traspasoAnio}.pdf`, title: 'FICHA DE CARACTERIZACIÓN Y TRASPASO',
        body: `${docKv([[['Curso', esc(State.traspasoCourse)], ['Año', esc(State.traspasoAnio)]], [['Profesor(a) jefe', esc(app.profJefeOf(State.traspasoCourse) || '-')], ['Profesor(a) especialista', esc(d.profesorEspecialista || '-')]], [['Asistencia promedio', `${a.promAsis}%`], ['Promedio del curso', a.promCurso]]])}
          ${graficos ? `<div class="doc-avoid" style="margin:8px 0 14px">${graficos}</div>` : ''}
          ${TRASPASO_SECCIONES.map(([k, t]) => `<div class="doc-avoid">${docH(t)}${auto[k] || ''}${interp(k)}${d.secciones?.[k]?.texto ? `<div class="doc-box doc-pre">${esc(d.secciones[k].texto)}</div>` : ''}</div>`).join('')}
          ${analisis}`
      };
    },
    course_active_plans() {
      const course = State.filterCourse || 'Todos los cursos';
      const planes = State.studentPlans.filter(p => !State.filterCourse || p.course === State.filterCourse);
      return {
        filename: `Planes_Activos_${course.replace(/\s+/g, '_')}.pdf`, title: 'REPORTE DE PLANES DE TRABAJO DEL CURSO',
        body: `<p><strong>Curso:</strong> ${esc(course)}. <strong>Planes registrados:</strong> ${planes.length}. <strong>Emisión:</strong> ${fmtDate(today())}.</p>
          ${planes.map(p => `<div class="doc-block"><div class="doc-block__head">${esc(app.formatStudentName(String(p.studentName || '')))}: ${esc(p.type || 'Plan individual')}. ${fmtDate(p.date)}. Estado: ${esc(p.status || 'En Desarrollo')}. Logro: ${p.evalQuant || 0}%</div>
            <p><strong>Objetivo:</strong> ${esc(p.objective || 'Sin objetivo registrado')}</p><p><strong>Acciones:</strong> ${(p.actions || []).length} definida(s)</p>
            <p><strong>Responsables:</strong> ${esc((p.responsibles || []).map(r => r.name).filter(Boolean).join(', ') || 'No registrados')}</p></div>`).join('') || '<p class="doc-empty">No hay planes de trabajo individuales registrados en este curso.</p>'}`
      };
    }
  },

  gradesDocHtml(s) {
    const recs = Object.values(s?.calificaciones || {}).sort((a, b) => String(b.anio).localeCompare(String(a.anio)));
    return recs.map(r => `<div class="doc-avoid">${docH(`Registro de notas ${esc(r.anio)}${r.periodo ? ` (${esc(r.periodo)})` : ''}`)}
      ${docTable(['Asignatura', ...(r.columnas || []).map(esc)], (r.asignaturas || []).map(a => [esc(a.nombre), ...a.valores.map((v, i) => i === a.valores.length - 1 ? `<strong>${esc(v)}</strong>` : esc(v))]), 'Sin asignaturas', 'doc-table--center')}
      <p class="doc-small"><strong>Promedio general:</strong> ${esc(r.promedioGeneral || '-')}. <strong>Asistencia del informe:</strong> ${esc(r.asistencia?.promedio || '-')}% (${esc(r.asistencia?.inasistencias || '0')} días de inasistencia de ${esc(r.asistencia?.trabajados || '-')}). Fuente: informe de calificaciones cargado el ${fmtDate(r.cargado)}.</p></div>`).join('');
  },

  normativeHtml() {
    return `<div class="doc-normative doc-avoid">
      <h4 class="doc-normative__alert">Medida en caso de incumplimiento:</h4><p>${TXT_INCUMPLIMIENTO}</p>
      <h4>Fundamentación normativa:</h4><p>${TXT_FUNDAMENTO_INTRO}</p>
      <ul>${TXT_FUNDAMENTO_LEYES.map(([l, t]) => `<li><strong>${l}:</strong> ${t}</li>`).join('')}</ul>
      <p>${TXT_FUNDAMENTO_CIERRE}</p></div>`;
  },

  signaturesHtml() {
    const sigs = State.export.customSignatures.filter(s => s.checked);
    if (!sigs.length) return '';
    let rows = '';
    for (let i = 0; i < sigs.length; i += 3) {
      const g = sigs.slice(i, i + 3);
      rows += `<tr>${g.map(s => `<td><div class="doc-sig"><strong>${esc(s.name) || '&nbsp;'}</strong><span>${esc(s.role)}</span></div></td>`).join('')}${'<td></td>'.repeat(3 - g.length)}</tr>`;
    }
    return `<div class="doc-avoid doc-sigs"><p class="doc-small"><strong>Firmas</strong></p><table>${rows}</table></div>`;
  },

  // ---------------- DESCARGA EN WORD ----------------
  /** Copia los estilos calculados como estilos en línea, para que Word conserve el diseño. */
  inlineDocStyles(src, dst) {
    const props = ['font-size', 'font-weight', 'font-style', 'color', 'background-color', 'text-align', 'vertical-align', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom', 'border-top', 'border-right', 'border-bottom', 'border-left', 'line-height', 'text-transform', 'text-decoration'];
    const a = [src, ...src.querySelectorAll('*')], b = [dst, ...dst.querySelectorAll('*')];
    a.forEach((n, i) => {
      const cs = getComputedStyle(n), t = b[i];
      if (!t || !t.style) return;
      t.removeAttribute('class');
      props.forEach(p => { const v = cs.getPropertyValue(p); if (v && !/^(0px|none|normal|auto|rgba\(0, 0, 0, 0\)|0px none.*)$/.test(v)) t.style.setProperty(p, v); });
      if (n.tagName === 'TABLE') { t.setAttribute('width', '100%'); t.style.borderCollapse = 'collapse'; t.setAttribute('cellpadding', '4'); }
      if (n.tagName === 'IMG') { const w = Math.round(n.getBoundingClientRect().width) || 80; t.setAttribute('width', w); t.style.width = w + 'px'; t.style.height = 'auto'; }
    });
  },
  async imgToDataUrl(img) {
    if (/^data:/.test(img.src)) return img.src;
    try { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png'); }
    catch (e) { return img.src; }
  },
  async exportWord(area, filename, size, landscape, [mv, mh]) {
    const clone = area.cloneNode(true);
    this.inlineDocStyles(area, clone);
    const imgs = [...area.querySelectorAll('img')], cimgs = [...clone.querySelectorAll('img')];
    for (const [i, img] of imgs.entries()) { if (img.naturalWidth) cimgs[i].src = await this.imgToDataUrl(img); else cimgs[i].remove(); }
    clone.querySelectorAll('.doc-pad').forEach(n => n.remove());
    clone.style.width = '';
    const papel = size === 'legal' ? (landscape ? '35.56cm 21.59cm' : '21.59cm 35.56cm') : (landscape ? '27.94cm 21.59cm' : '21.59cm 27.94cm');
    const html = `<html><head><meta charset="utf-8"><style>@page { size: ${papel}; margin: ${mv / 10}cm ${mh / 10}cm; } body { font-family: Arial, sans-serif; font-size: 10.5pt; } p { text-align: justify; } td, th { vertical-align: top; }</style></head><body>${clone.outerHTML}</body></html>`;
    const nombre = String(filename || 'informe.pdf').replace(/\.pdf$/i, '');
    let blob, ext = 'docx';
    try {
      if (API.demo) throw new Error('demo');
      const out = await API.call('convertirWord', { html, nombre });
      blob = new Blob([Uint8Array.from(atob(out.base64), ch => ch.charCodeAt(0))], { type: out.mimeType });
    } catch (e) {
      // Respaldo sin servidor: documento Word en formato HTML (.doc), que Word abre y permite editar
      blob = new Blob(['\ufeff', html.replace('<html>', '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">')], { type: 'application/msword' });
      ext = 'doc';
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${nombre}.${ext}`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(ext === 'docx' ? 'Documento Word descargado' : 'Documento Word descargado (formato compatible .doc)');
  },

  // ---------------- GENERACIÓN DEL PDF ----------------
  async executeExport(opts = {}) {
    const word = State.export.format === 'word' && !opts.forcePdf;
    if (!word && !window.html2pdf) { toast('No se pudo cargar el generador de PDF. Revise su conexión.', 'error'); return false; }
    const ctx = State.export.context;
    const includeSig = opts.includeSig !== undefined ? opts.includeSig : !!el('export-sig')?.checked;
    const includeConfidential = !!el('export-confidential')?.checked;
    const includeGrades = !!el('export-grades')?.checked;
    State.export.includeGrades = false;
    const key = ['student_plan_final', 'course_plan_final'].includes(ctx) ? 'plan' : ctx;
    const builder = this.REPORTS[key];
    if (!builder) { toast('No fue posible identificar el tipo de reporte solicitado.', 'error'); return false; }
    const r = builder.call(this, ctx, { includeConfidential });
    if (includeGrades) r.body += this.gradesDocHtml(this.current());
    const v = State.variables;
    const s = r.student ? this.current() : null;

    const header = `<table class="doc-header"><tr>
      <td class="doc-header__l"><img src="${esc(v.schoolLogo)}" alt="" crossorigin="anonymous"></td>
      <td class="doc-header__c"><h2>COLEGIO MARINA DE CHILE</h2></td>
      <td class="doc-header__r"><img src="${esc(v.slepLogo)}" alt="" crossorigin="anonymous"></td></tr></table>`;
    const info = s ? docKv([[['Estudiante', esc(this.formatStudentName(s.name))], ['RUT', esc(s.rut)]], [['Curso', esc(s.curso)], ['Fecha', fmtDate(today())]]]) : '';

    // Ancho útil en píxeles según hoja y orientación (evita que se corte el borde derecho)
    const landscape = !!r.wide;
    const size = State.export.size || 'letter';
    const mv = landscape ? 15 : 25, mh = landscape ? 15 : 30;
    const paperW = landscape ? (size === 'legal' ? 355.6 : 279.4) : 215.9;
    const widthPx = Math.round((paperW - mh * 2) * (96 / 25.4));

    ui.close();
    const done = ui.busy('Generando documento', word ? 'Preparando el documento Word...' : 'Preparando el PDF para descargar...');
    const prevScroll = window.scrollY;
    window.scrollTo(0, 0);
    const host = document.createElement('div');
    host.className = 'doc-host';
    host.innerHTML = `<div id="capture-area" class="doc" style="width:${widthPx}px">${header}<h1 class="doc-title">${r.title}</h1>${info}<div>${r.body}</div>${r.normative ? this.normativeHtml() : ''}${includeSig ? this.signaturesHtml() : ''}<div class="doc-pad"></div></div>`;
    document.body.appendChild(host);
    document.documentElement.classList.add('is-exporting');
    await Promise.all(Array.from(host.querySelectorAll('img')).map(img => (img.complete && img.naturalHeight) ? null : new Promise(res => { img.onload = img.onerror = res; setTimeout(res, 4000); })));
    try {
      if (word) { await this.exportWord(el('capture-area'), r.filename, size, landscape, [mv, mh]); return false; }
      await html2pdf().set({
        margin: [mv, mh, mv, mh], filename: r.filename, image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: cssVar('--doc-paper') || null, width: widthPx, windowWidth: widthPx, scrollX: 0, scrollY: 0, x: 0, y: 0 },
        jsPDF: { unit: 'mm', format: size, orientation: landscape ? 'landscape' : 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.doc-avoid', 'tr', 'h4'] }
      }).from(el('capture-area')).save();
      toast('Descarga completada');
    } catch (e) { console.error(e); toast('Error al generar el PDF', 'error'); }
    finally { host.remove(); document.documentElement.classList.remove('is-exporting'); done(); window.scrollTo(0, prevScroll); }
    return false;
  }
});
