'use strict';
// =====================================================================
// CONSTANTES DEL ESTABLECIMIENTO
// =====================================================================
const CYCLES = {
  'Pre-básica': { courses: ['Pre -Kínder', 'Kínder'], icon: 'palette', tone: 'proto' },
  'Primer Ciclo (1° a 4° básico)': { courses: ['1° Básico A', '1° Básico B', '2° Básico A', '2° Básico B', '3° Básico A', '3° Básico B', '4° Básico A', '4° Básico B'], icon: 'book-open', tone: 'warn' },
  'Segundo Ciclo (5° a 8° básico)': { courses: ['5° Básico A', '5° Básico B', '6° Básico A', '6° Básico B', '7° Básico A', '7° Básico B', '8° Básico A', '8° Básico B'], icon: 'compass', tone: 'conv' },
  'Enseñanza Media (1° a 4° medio)': { courses: ['1° Medio A', '1° Medio B', '1° Medio C', '2° Medio A', '2° Medio B', '2° Medio C', '3° Medio A', '3° Medio B', '3° Medio C', '4° Medio A', '4° Medio B', '4° Medio C'], icon: 'graduation-cap', tone: 'pie' }
};
const ALL_COURSES = Object.values(CYCLES).flatMap(c => c.courses);
const PROTOCOLO = 'Activación de Protocolo';

const INIT_VARS = {
  interviewTypes: ['Activación de Protocolo', 'Entrevista Apoderado', 'Entrevista Estudiante', 'Resolución de Conflictos', 'Apoyo Socioemocional', 'Derivación a Redes', 'Seguimiento', 'Citación Disciplinaria', 'Carta Compromiso', 'Acción Estudiantil (Anotación)'],
  professionals: ['Psicólogo/a', 'Trabajador/a Social', 'Orientador/a', 'Inspector/a General', 'Encargado/a Convivencia', 'Docente Jefe', 'Enfermero/a'],
  progressLevels: ['No Iniciado', 'En Proceso', 'Logrado', 'No Logrado', 'Requiere Modificación'],
  roles: ['Docente', 'Asistente de la Educación', 'Directivo', 'Convivencia', 'UTP', 'Administrador', 'Equipo PIE'],
  functionsList: ['gestionar_usuarios', 'editar_fichas', 'ver_fichas', 'agregar_entrevistas', 'ver_reportes', 'ver_todos_reportes', 'configurar_sistema', 'gestionar_protocolos', 'ver_top_intervenciones', 'ver_resumen_cursos', 'registro_rapido', 'ver_bitacora'],
  schoolLogo: 'img/logo-colegio.png',
  slepLogo: 'img/logo-slep.png',
  bgImage: 'img/COLEGIO.jpg',
  diasTotalesClases: 180,
  tiposPlanes: ['Plan de Revinculación', 'Plan de Trabajo Psicosocial', 'Plan Prevención de Violencia', 'Plan de Acompañamiento General'],
  appName: '',
  appTagline: '',
  soloGoogle: false,
  loginImages: [],
  aiConfigured: false
};

const FUNCTION_LABELS = {
  ver_fichas: 'Ver fichas y descargar PDF (solo lectura)',
  agregar_entrevistas: 'Crear nuevas intervenciones',
  editar_fichas: 'Editar avances y actualizar',
  ver_reportes: 'Imprimir mi reporte de gestión',
  ver_todos_reportes: 'Imprimir el reporte de todos los funcionarios',
  gestionar_usuarios: 'Gestionar funcionarios y alumnos',
  configurar_sistema: 'Carga masiva SIGE y logos',
  gestionar_protocolos: 'Gestión confidencial de protocolos',
  ver_top_intervenciones: 'Ver alertas preventivas',
  ver_resumen_cursos: 'Ver resumen por cursos',
  registro_rapido: 'Registro rápido: anotaciones, atrasos, inasistencias y entrevistas (asistentes de la educación; sin ver fichas)',
  ver_bitacora: 'Ver la bitácora de acciones de los funcionarios'
};

// Texto de confidencialidad que se envía a cada funcionario (Ley N° 21.719)
const TXT_CONFIDENCIALIDAD = `**Confidencialidad y protección de datos personales (Ley N° 21.719)**
La información de este sistema son datos personales de estudiantes y sus familias. Parte de ella son datos sensibles (salud, situación socioemocional, protocolos) y datos de niños, niñas y adolescentes, que la ley protege de manera especial atendiendo a su interés superior. Al usar su cuenta usted se compromete a:
1. Usar la información solo para la finalidad educativa y de apoyo para la que fue registrada, y solo en lo necesario para su función.
2. Guardar reserva: no compartir, copiar, fotografiar ni enviar información fuera de los canales institucionales. Este deber se mantiene aun después de terminar su relación con el establecimiento.
3. No compartir su cuenta ni su clave, y cerrar la sesión en equipos compartidos.
4. Registrar información objetiva, exacta y actualizada.
5. Respetar los registros confidenciales: si necesita conocer uno, solicítelo a su autor o a Convivencia Escolar.
6. Avisar de inmediato a Dirección o a Convivencia Escolar si detecta un acceso indebido o la pérdida de información.`;

const ROLE_TONE = { 'Docente': 'obs', 'Asistente de la Educación': 'warn', 'Directivo': 'plan', 'Convivencia': 'conv', 'UTP': 'conv', 'Administrador': 'proto', 'Equipo PIE': 'pie' };

const PLAN_TYPES = ['Plan de Revinculación', 'Plan de Trabajo Psicosocial', 'Plan Prevención de Violencia Escolar', 'Plan de Acompañamiento General', 'Plan de Asistencia y Puntualidad'];
const PROTOCOL_TYPES = ['Acoso Escolar (Bullying)', 'Connotación Sexual', 'Vulneración de Derechos', 'Agresión Física/Psicológica', ['Armas/Drogas', 'Ley de Armas / Drogas'], ['Protocolo PIE/TEA', 'Desregulación Emocional / TEA'], ['Ideación Suicida', 'Ideación Suicida (Prevención Mineduc)']];
const JUSTIFICATIVO_TYPES = ['Certificado Médico', 'Correo Familia', 'Entrevista Presencial', 'Otro'];
const EVIDENCE_TYPES = ['Respaldo de Intervención', 'Reporte Académico', 'Certificado o Justificativo', 'Informe Profesional Externo', 'Acta o Compromiso Firmado', 'Otro'];
const MESES = ['Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_NOMBRE = { Mar: 'Marzo', Abr: 'Abril', May: 'Mayo', Jun: 'Junio', Jul: 'Julio', Ago: 'Agosto', Sep: 'Septiembre', Oct: 'Octubre', Nov: 'Noviembre', Dic: 'Diciembre' };
const RUBRIC_SCALE = [[1, 'Nunca'], [2, 'Rara vez'], [3, 'A veces'], [4, 'Generalmente'], [5, 'Siempre']];

const DEFAULT_EVAL = {
  course: ['¿Se han cumplido las metas trazadas para el período?', '¿Existe mejora observable en el clima o convivencia del curso?', '¿Las estrategias aplicadas han sido efectivas?', '¿Se evidencia colaboración del equipo docente/apoderados?', '¿Se sugiere dar continuidad a este plan en el futuro?'],
  student: ['¿El estudiante participa activamente en las estrategias implementadas?', '¿Muestra una mejora en el área socioemocional o conductual?', '¿Cumple con los acuerdos establecidos en las entrevistas?', '¿La familia se ha involucrado positivamente en el proceso?', '¿Se han reducido las incidencias o disrupciones reportadas?']
};

// Nombres fijos de los cargos directivos (firmas)
const FIRMANTES = { 'DIRECTORA': 'NICOLE ROMERO PEDREROS', 'ENCARGADA DE CONVIVENCIA ESCOLAR': 'NAYARET CONTRERAS VALLEJOS' };
const SIG_ROLES = ['DIRECTORA', 'ENCARGADA DE CONVIVENCIA ESCOLAR', 'INSPECTOR/A GENERAL', 'UNIDAD TÉCNICO PEDAGÓGICA (UTP)', 'PROFESOR/A JEFE', 'FUNCIONARIO/A RESPONSABLE', 'ESTUDIANTE', 'APODERADO/A'];

// Texto normativo que se repetía en tres lugares: plan de asistencia, carta compromiso e informes PDF.
const TXT_INCUMPLIMIENTO = 'En caso de persistir el incumplimiento —ya sea por inasistencia reiterada, falta de puntualidad o no participación en las instancias obligatorias— el establecimiento procederá a realizar la derivación a organismos competentes, tales como el Tribunal de Familia o la Oficina Local de la Niñez (OLN), conforme a la normativa vigente.';
const TXT_FUNDAMENTO_INTRO = 'Lo anterior se sustenta en el marco legal chileno que reconoce la asistencia regular a clases como un componente esencial del derecho a la educación, entre los que destacan:';
const TXT_FUNDAMENTO_LEYES = [
  ['Ley N° 20.370, Ley General de Educación (LGE)', 'establece que la educación es un derecho fundamental y que el Estado debe garantizar condiciones para su ejercicio efectivo.'],
  ['Ley N° 21.430 sobre Garantías y Protección Integral de los Derechos de la Niñez y Adolescencia', 'reconoce el derecho a la educación como un derecho esencial, señalando que la inasistencia sistemática sin justificación puede constituir una vulneración de derechos, obligando a los organismos del Estado a activar medidas de protección.'],
  ['Convención sobre los Derechos del Niño (ratificada por Chile)', 'en su artículo 28, establece el derecho del niño, niña y adolescente a la educación, debiendo el Estado adoptar medidas para fomentar la asistencia regular a las escuelas.'],
  ['Normativa del Ministerio de Educación (orientaciones de asistencia escolar)', 'indica que la inasistencia reiterada sin respaldo de un especialista o situación debidamente justificada constituye un factor de riesgo educativo y social, debiendo ser abordado mediante estrategias institucionales y, de persistir, mediante redes de protección.']
];
const TXT_FUNDAMENTO_CIERRE = 'En este contexto, la falta de asistencia regular sin justificación formal (por ejemplo, certificación médica u otro respaldo profesional) se configura como un indicador de posible vulneración del derecho a la educación, lo que obliga al establecimiento a activar protocolos de resguardo y derivación.';
const txtNormativoPlano = () => `MEDIDA EN CASO DE INCUMPLIMIENTO:\n${TXT_INCUMPLIMIENTO}\n\nFUNDAMENTACIÓN NORMATIVA:\n${TXT_FUNDAMENTO_INTRO}\n${TXT_FUNDAMENTO_LEYES.map(([l, t]) => `- ${l}: ${t}`).join('\n')}\n\n${TXT_FUNDAMENTO_CIERRE}`;

// =====================================================================
// ESTADO GLOBAL
// =====================================================================
window.State = {
  loading: true, currentUser: null, showWithdrawn: false, demo: false, lastSync: 0,
  users: [], rawStudents: [], rawInterventions: [], rawNursings: [], rawObservations: [], rawCoursesDB: [],
  rawInclusionReports: [], knowledgeDocs: [], coursePlans: [], studentPlans: [], rawEvidences: [], traspasos: [], riesgos: [], dia: [],
  loginOptions: { roles: INIT_VARS.roles, users: [] },
  variables: { ...INIT_VARS },
  currentView: 'dashboard', selectedStudentId: null, detailTab: 'entrevistas', filterCourse: '',
  adminTab: 'users', tempKbForm: { title: '', content: '' },
  plan: null, planType: 'course',
  editing: { intervention: null, observations: null, nursings: null },
  forms: { newAgreements: [] },
  export: { context: '', size: 'letter', customSignatures: [] },
  attendanceImport: null
};

// =====================================================================
// UTILIDADES
// =====================================================================
const el = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = t => esc(t).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const newId = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const sameId = (a, b) => String(a) === String(b);
const fmtDate = s => { if (!s) return ''; const p = String(s).split('T')[0].split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(s); };
const icons = () => { if (window.lucide) lucide.createIcons(); };
const ico = (name, cls = '') => `<i data-lucide="${name}" class="ico ${cls}" aria-hidden="true"></i>`;
// Valor seguro para pasar como argumento en un onclick="app.x(...)"
const jsq = v => esc(JSON.stringify(String(v ?? '')));
const options = (list, selected) => list.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`; }).join('');
const hasAccess = f => { const fn = State.currentUser?.functions || []; return fn.includes('acceso_total') || fn.includes(f); };
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const readFileAsDataURL = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('No se pudo leer el archivo')); r.readAsDataURL(file); });

/**
 * Los avisos se cierran solos a los 12 segundos (o antes con la X). Mientras el mouse está
 * encima o se usa uno de sus botones, la cuenta se detiene. Una barra muestra el tiempo restante.
 */
const AVISO_MS = 12000;
function autoCerrar(node, ms = AVISO_MS) {
  let restante = ms, inicio = Date.now(), timer = null;
  const bar = document.createElement('span');
  bar.className = 'aviso-timer';
  bar.style.animationDuration = `${ms}ms`;
  node.appendChild(bar);
  const correr = () => { inicio = Date.now(); timer = setTimeout(() => node.remove(), restante); bar.style.animationPlayState = 'running'; };
  const pausar = () => { clearTimeout(timer); restante = Math.max(1500, restante - (Date.now() - inicio)); bar.style.animationPlayState = 'paused'; };
  node.addEventListener('mouseenter', pausar);
  node.addEventListener('mouseleave', correr);
  node.addEventListener('focusin', pausar);
  node.addEventListener('focusout', correr);
  correr();
}

/** Aviso breve (se muestran los 4 más recientes; se cierra solo a los 12 segundos). */
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const hora = new Date().toTimeString().slice(0, 5);
  t.innerHTML = `<span class="toast__icon">${ico(type === 'error' ? 'x-circle' : 'check-circle')}</span><span class="toast__msg"></span><span class="toast__time num">${hora}</span><button type="button" class="toast__close" aria-label="Cerrar aviso">${ico('x')}</button>`;
  t.querySelector('.toast__msg').textContent = msg;
  t.querySelector('.toast__close').onclick = () => t.remove();
  const box = el('toast-container');
  box.appendChild(t);
  while (box.children.length > 4) box.firstElementChild.remove();
  autoCerrar(t);
  icons();
}

/**
 * Resultado de una acción importante (subir, vincular, cargar...): ventana que queda abierta
 * hasta cerrarla con la X, indicando claramente si se realizó o no y qué cambió.
 * type: 'success' | 'error' | 'warn'. items: lista de detalles. actions: [[texto, función]].
 */
function notice({ type = 'success', title, msg = '', items = [], actions = [] }) {
  let layer = el('notice-layer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'notice-layer'; document.body.appendChild(layer); }
  const card = document.createElement('section');
  card.className = `notice notice--${type}`;
  card.setAttribute('role', type === 'error' ? 'alertdialog' : 'status');
  card.setAttribute('aria-label', title);
  const icon = { success: 'check-circle-2', error: 'x-circle', warn: 'alert-triangle' }[type] || 'info';
  const estado = { success: 'Se realizó correctamente', error: 'No se realizó', warn: 'Se realizó con observaciones' }[type] || '';
  card.innerHTML = `<div class="notice__icon">${ico(icon)}</div>
    <div class="notice__body"><span class="notice__estado">${estado} · ${new Date().toTimeString().slice(0, 5)}</span><h3>${esc(title)}</h3>${msg ? `<p>${esc(msg)}</p>` : ''}
      ${items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      ${actions.length ? `<div class="row-actions">${actions.map((a, i) => `<button type="button" class="btn btn--sm" data-act="${i}">${esc(a[0])}</button>`).join('')}</div>` : ''}</div>
    <button type="button" class="notice__close" aria-label="Cerrar aviso">${ico('x')}</button>`;
  card.querySelector('.notice__close').onclick = () => card.remove();
  card.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => { card.remove(); actions[+b.dataset.act][1](); }; });
  layer.prepend(card);
  while (layer.children.length > 3) layer.lastElementChild.remove();
  autoCerrar(card);
  icons();
  // No se quita el foco de lo que el funcionario está escribiendo
}

// Etiquetas reutilizables
const chip = (text, tone = 'neutral', icon = '') => `<span class="chip" data-tone="${tone}">${icon ? ico(icon) : ''}${esc(text)}</span>`;
const empty = (icon, text, tone = 'neutral') => `<div class="empty" data-tone="${tone}">${ico(icon)}<p>${esc(text)}</p></div>`;
const fieldHtml = (label, control, cls = '') => `<label class="field ${cls}"><span class="field__label">${esc(label)}</span>${control}</label>`;

// =====================================================================
// MODALES (uno solo, reutilizado por todas las confirmaciones y formularios)
// =====================================================================
const ui = {
  _onOk: null,
  modal({ title, icon = '', tone = 'neutral', body = '', size = 'sm', okText = 'Confirmar', okTone = 'primary', cancelText = 'Cancelar', onOk = null, hideOk = false }) {
    const m = el('modal');
    m.querySelector('.modal__panel').dataset.size = size;
    el('modal-icon').innerHTML = icon ? ico(icon) : '';
    el('modal-icon').dataset.tone = tone;
    el('modal-icon').hidden = !icon;
    el('modal-title').textContent = title;
    el('modal-body').innerHTML = body;
    const ok = hideOk ? '' : `<button type="button" class="btn btn--${okTone}" id="modal-ok">${esc(okText)}</button>`;
    el('modal-foot').innerHTML = `<button type="button" class="btn" data-close>${esc(cancelText)}</button>${ok}`;
    this._onOk = onOk;
    m.hidden = false;
    document.body.classList.add('has-modal');
    if (el('modal-ok')) el('modal-ok').onclick = () => this._confirm();
    icons();
    setTimeout(() => (m.querySelector('#modal-body input, #modal-body select, #modal-body textarea') || el('modal-ok') || m.querySelector('[data-close]'))?.focus(), 30);
    return el('modal-body');
  },
  async _confirm() {
    const btn = el('modal-ok');
    if (!this._onOk) return this.close();
    btn.disabled = true; btn.classList.add('is-loading');
    try { const r = await this._onOk(el('modal-body')); if (r !== false) this.close(); }
    catch (e) { console.error(e); toast(e.message || 'Ocurrió un error', 'error'); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-loading'); } }
  },
  close() { el('modal').hidden = true; document.body.classList.remove('has-modal'); this._onOk = null; },
  confirm({ title, msg, okText = 'Sí, eliminar', tone = 'danger', icon = 'trash-2', action }) {
    this.modal({ title, icon, tone, body: `<p class="modal__msg">${msg}</p>`, okText, okTone: tone === 'danger' ? 'danger' : 'primary', onOk: action });
  },
  prompt({ title, msg = '', icon = 'edit-2', value = '', type = 'text', placeholder = '', okText = 'Guardar', action }) {
    this.modal({ title, icon, body: `${msg ? `<p class="modal__msg">${msg}</p>` : ''}<input id="modal-input" class="input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`, okText, onOk: () => action(el('modal-input').value.trim()) });
  },
  busy(title, msg = '') {
    el('busy-title').textContent = title;
    el('busy-msg').textContent = msg;
    el('busy').hidden = false;
    // Si una operación se demora demasiado, se ofrece cerrar la espera para no dejar la página bloqueada
    clearTimeout(this._busyT);
    el('busy-escape')?.remove();
    this._busyT = setTimeout(() => {
      if (el('busy').hidden) return;
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'busy-escape'; b.className = 'btn btn--sm';
      b.textContent = 'Seguir trabajando (la operación continúa en segundo plano)';
      b.onclick = () => { el('busy').hidden = true; b.remove(); };
      el('busy-msg').after(b);
    }, 25000);
    return () => { clearTimeout(this._busyT); el('busy-escape')?.remove(); el('busy').hidden = true; };
  }
};

document.addEventListener('click', e => { if (e.target.closest('[data-close]') && e.target.closest('#modal')) ui.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el('modal').hidden) ui.close(); });

// =====================================================================
// CONEXIÓN CON GOOGLE APPS SCRIPT
// =====================================================================
const Store = {
  get(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) { /* almacenamiento bloqueado */ } }
};

const API = {
  get url() { return String(window.APP_CONFIG?.API_URL || '').trim(); },
  get demo() { return !this.url; },
  token: Store.get('cm_token'),
  setToken(t) { this.token = t || ''; Store.set('cm_token', this.token); },
  async call(action, payload = {}) {
    if (this.demo) return Demo.handle(action, payload);
    let res;
    // Tiempo máximo de espera: si el servidor no responde, la página no queda bloqueada
    const largas = ['ai', 'cerrarAnio', 'exportarTodo', 'restaurarTodo', 'indexarCarpeta', 'upload', 'ocrPagina', 'subirCertificado', 'convertirWord', 'exportarDocumento', 'crearDocumento', 'guardarDocumento', 'archivarDocumentos', 'import', 'batch'];
    const ms = largas.includes(action) ? 300000 : action === 'getAll' ? 120000 : 60000;
    const ctrl = window.AbortController ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    try {
      res = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: this.token, ...payload }), signal: ctrl?.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(`El servidor tardó más de ${Math.round(ms / 60000)} minuto(s) en responder. Revise su conexión e intente de nuevo; si guardaba algo, actualice la página para confirmar si quedó registrado.`);
      throw new Error('Sin conexión con el servidor. Revise su internet.');
    } finally { if (timer) clearTimeout(timer); }
    let out;
    try { out = await res.json(); } catch (e) { throw new Error('El servidor no respondió correctamente. Revise la publicación del Apps Script.'); }
    if (!out.ok) {
      if (out.code === 'AUTH' && action !== 'login') app.sessionExpired(out.error);
      const err = new Error(out.error || 'Error del servidor');
      err.code = out.code || '';
      throw err;
    }
    return out.data;
  }
};

// Colección del servidor → arreglo en State
const STORE = { users: 'users', students: 'rawStudents', courses: 'rawCoursesDB', interventions: 'rawInterventions', nursings: 'rawNursings', observations: 'rawObservations', reports: 'rawInclusionReports', knowledgeDocs: 'knowledgeDocs', coursePlans: 'coursePlans', studentPlans: 'studentPlans', evidences: 'rawEvidences', traspasos: 'traspasos', riesgos: 'riesgos', dia: 'dia', reuniones: 'reuniones' };

const DB = {
  async load() {
    const d = await API.call('getAll');
    Object.entries(STORE).forEach(([col, key]) => { State[key] = d[col] || []; });
    State.variables = { ...INIT_VARS, ...(d.variables || {}) };
    if (d.me) State.currentUser = d.me;
    State.directorio = d.directorio || [];
    State.lastSync = Date.now();
  },
  upsertLocal(col, doc, merge = false) {
    const arr = State[STORE[col]];
    const i = arr.findIndex(x => sameId(x.id, doc.id));
    if (i > -1) arr[i] = merge ? { ...arr[i], ...doc } : doc; else arr.push(doc);
    return i > -1 ? arr[i] : doc;
  },
  /** Guarda un registro. merge = true actualiza solo los campos enviados. */
  async save(col, doc, merge = false) {
    const saved = await API.call('save', { col, id: String(doc.id), data: doc, merge });
    // Los funcionarios vuelven del servidor sin clave: se guarda esa versión, nunca la clave escrita.
    return col === 'users' ? this.upsertLocal(col, saved) : this.upsertLocal(col, doc, merge);
  },
  async patch(col, id, fields) { return this.save(col, { id, ...fields }, true); },
  async remove(col, id) {
    await API.call('remove', { col, id: String(id) });
    State[STORE[col]] = State[STORE[col]].filter(x => !sameId(x.id, id));
  },
  async batch(ops) {
    for (let i = 0; i < ops.length; i += 150) await API.call('batch', { ops: ops.slice(i, i + 150) });
    ops.forEach(op => this.upsertLocal(op.col, { ...op.data, id: op.id }, op.merge));
  },
  async saveVars(patch) {
    await API.call('save', { col: 'variables', id: 'main', data: patch, merge: true });
    Object.assign(State.variables, patch);
  }
};

const AI = {
  ready() {
    if (API.demo) { toast('La IA no está disponible en modo demostración.', 'error'); return false; }
    if (!State.variables.aiConfigured) { toast('Falta la API Key de IA en Administración.', 'error'); return false; }
    return true;
  },
  async json(prompt) { return (await API.call('ai', { prompt, json: true })).json; },
  async text(prompt) { return (await API.call('ai', { prompt, json: false })).text; },
  /** Muestra la espera, ejecuta la petición y avisa el error real. */
  async run(title, msg, fn) {
    if (!this.ready()) return;
    const done = ui.busy(title, msg);
    try { await fn(); }
    catch (e) { console.error(e); toast('No se pudo completar: ' + e.message, 'error'); }
    finally { done(); }
  }
};

// =====================================================================
// MODO DEMOSTRACIÓN (sin URL configurada): datos en memoria, nada se guarda
// =====================================================================
const Demo = {
  db: null,
  seed() {
    const users = [
      { id: '1', name: 'Admin Principal', role: 'Administrador', customRole: 'Administrador General', active: true, functions: ['acceso_total'], assignedCourses: [] },
      { id: '2', name: 'Profesional PIE', role: 'Equipo PIE', customRole: 'Coordinador Inclusión', active: true, functions: ['ver_fichas', 'agregar_entrevistas'], assignedCourses: [] },
      { id: '3', name: 'Profesional Convivencia', role: 'Convivencia', customRole: 'Encargado', active: true, functions: ['ver_fichas', 'agregar_entrevistas', 'editar_fichas', 'gestionar_protocolos', 'ver_reportes'], assignedCourses: [] }
    ];
    this.db = { variables: { ...INIT_VARS }, users };
    Object.keys(STORE).forEach(c => { if (!this.db[c]) this.db[c] = []; });
  },
  handle(action, p) {
    if (!this.db) this.seed();
    const clone = v => JSON.parse(JSON.stringify(v));
    const col = p.col;
    const accion = { login: 'Ingreso', remove: 'Eliminación', registrarEvento: 'Registro rápido', notificarAcceso: 'Aviso de acceso', logout: 'Cierre de sesión', batch: 'Modificación masiva', import: 'Traspaso de datos', save: Array.isArray(this.db[col]) && this.db[col].some(x => sameId(x.id, p.id)) ? 'Modificación' : 'Creación' }[action];
    if (accion && !this._inner) {
      const u = action === 'login' ? this.db.users.find(x => sameId(x.id, p.userId)) : State.currentUser;
      const d = new Date();
      (this.audit = this.audit || []).push({ fecha: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19), funcionario: u?.name || '', perfil: u?.customRole || u?.role || '', accion, seccion: col || (action === 'registrarEvento' ? 'Estudiantes' : action === 'login' || action === 'logout' ? 'Sesión' : ''), registro: p.id || p.studentId || '', detalle: p.data?.name || p.data?.type || p.kind || '' });
    }
    switch (action) {
      case 'bootstrap': return { loginImages: this.db.variables.loginImages || [], soloGoogle: !!this.db.variables.soloGoogle, appName: this.db.variables.appName, appTagline: this.db.variables.appTagline, roles: this.db.variables.roles, users: this.db.users.map(u => ({ id: u.id, name: u.name, role: u.role })), schoolLogo: this.db.variables.schoolLogo, slepLogo: this.db.variables.slepLogo, bgImage: this.db.variables.bgImage };
      case 'login': { if (this.db.variables.soloGoogle) throw new Error('El ingreso es solo con su cuenta de Google @andaliensur.cl.'); const u = this.db.users.find(x => sameId(x.id, p.userId)); if (!u) throw new Error('Usuario no encontrado'); if (u.active === false) throw new Error('Usuario inactivo'); return { token: 'demo', user: clone(u) }; }
      case 'getAll': { const out = clone(this.db); out.me = clone(this.db.users.find(u => sameId(u.id, State.currentUser?.id)) || State.currentUser); return out; }
      case 'save': {
        if (col === 'variables') { Object.assign(this.db.variables, clone(p.data)); return this.db.variables; }
        const arr = this.db[col]; const i = arr.findIndex(x => sameId(x.id, p.id)); const doc = clone(p.data); delete doc.password;
        if (i > -1) arr[i] = (p.merge || col === 'users') ? { ...arr[i], ...doc } : doc; else arr.push(doc);
        return clone(i > -1 ? arr[i] : doc);
      }
      case 'batch': this._inner = true; p.ops.forEach(op => this.handle('save', { col: op.col, id: op.id, data: op.data, merge: op.merge })); this._inner = false; return { saved: p.ops.length };
      case 'remove': this.db[col] = this.db[col].filter(x => !sameId(x.id, p.id)); return { removed: 1 };
      case 'import': p.docs.forEach(d => this.handle('save', { col, id: d.id, data: d })); return { saved: p.docs.length };
      case 'changePassword': case 'logout': case 'setSecret': return {};
      case 'file': {
        const ev = (this.db.evidences || []).find(x => sameId(x.id, p.id)) || {};
        const html = ev.demoHtml || `<h1>${esc(ev.fileName || 'Documento de ejemplo')}</h1><p>Documento de demostración del estudiante ${esc(ev.studentName || '')}. En el sistema real aquí se muestra el archivo de Drive.</p><table><tr><th>Ámbito</th><th>Acciones</th><th>Responsable</th></tr><tr><td>ÁMBITO PEDAGÓGICO</td><td>Apoyo en lectura dos veces por semana</td><td></td></tr><tr><td>ÁMBITO FAMILIAR</td><td></td><td>Profesor jefe</td></tr></table>`;
        return { base64: btoa(unescape(encodeURIComponent(html))), mimeType: 'text/html', fileName: ev.fileName || 'documento.html' };
      }
      case 'guardarDocumento': {
        const ev = this.db.evidences.find(x => sameId(x.id, p.id));
        const fecha = new Date().toISOString().slice(0, 16);
        Object.assign(ev, { versiones: [...(ev.versiones || []), { fileName: ev.fileName, fecha: ev.fechaEdicion || ev.date, por: ev.editadoPor || ev.uploadedBy }], demoHtml: p.html, fileName: String(ev.fileName).replace(/\.\w+$/, '').replace(/ \(editado [^)]*\)$/, '') + ` (editado ${fecha.replace('T', ' ')}).docx`, editadoPor: State.currentUser?.name, fechaEdicion: fecha, archivado: true });
        return clone(ev);
      }
      case 'crearDocumento': { const id = 'demo' + Date.now(); return { fileId: id, url: '#', fileName: String(p.nombre).replace(/\.docx$/i, '') + '.docx' }; }
      case 'ocrPagina': return { texto: '' };
      case 'subirCertificado': { const id = 'cert_demo' + Date.now() + Math.random().toString(36).slice(2, 5); const ev = { id, studentId: '', pendiente: true, categoria: 'certificado', type: p.tipo || 'Certificado médico', fileName: p.fileName || 'certificado_drive.pdf', mimeType: p.mimeType || 'application/pdf', date: today(), uploaderId: String(State.currentUser.id), uploadedBy: State.currentUser.name, storage: 'drive', driveId: id, url: '#', archivado: !!p.base64 }; this.db.evidences.push(ev); return { evidence: clone(ev), texto: '' }; }
      case 'asignarCertificado': { const ev = this.db.evidences.find(x => sameId(x.id, p.id)); const s = this.db.students.find(x => sameId(x.id, p.studentId)); if (ev.studentId && !sameId(ev.studentId, s.id)) { const prev = this.db.students.find(x => sameId(x.id, ev.studentId)); if (prev) prev.justificativos = (prev.justificativos || []).filter(j => j.evidenceId !== ev.id); } Object.assign(ev, { studentId: s.id, studentName: s.name, course: s.curso, pendiente: false, inicio: p.inicio, termino: p.termino, diasReposo: p.diasReposo, diasHabiles: p.diasHabiles, type: p.tipo || ev.type, observacion: p.observacion || '' }); s.justificativos = [...(s.justificativos || []).filter(j => j.evidenceId !== ev.id), { fecha: p.inicio, inicio: p.inicio, termino: p.termino, tipo: ev.type, dias: p.diasHabiles, evidenceId: ev.id, por: State.currentUser.name }]; return { evidence: clone(ev), justificativos: clone(s.justificativos) }; }
      case 'registrarSuspension': { const s = this.db.students.find(x => sameId(x.id, p.studentId)); const l = s.suspensiones = s.suspensiones || []; const i = p.id ? l.findIndex(x => sameId(x.id, p.id)) : -1; if (p.anular) Object.assign(l[i], { estado: 'anulada', motivoAnulacion: p.motivoAnulacion }); else { const d = { id: i >= 0 ? l[i].id : String(Date.now()), inicio: p.inicio, termino: p.termino, dias: p.dias, tipo: p.tipo, motivo: p.motivo, interventionId: p.interventionId, estado: 'vigente', por: State.currentUser.name, fecha: today() }; if (i >= 0) l[i] = d; else l.push(d); } return { suspensiones: clone(l) }; }
      case 'upload': { const id = 'demo' + Date.now() + Math.random().toString(36).slice(2, 6); return { fileId: id, url: '#' }; }
      case 'archivarDocumentos': { const ids = (p.ids || []).filter(id => { const e = this.db.evidences.find(x => sameId(x.id, id)); if (e) e.archivado = true; return !!e; }); return { archivados: ids.length, errores: [], ids }; }
      case 'iaClaves': return { keys: (this.keys = this.keys || []).map((k, i) => ({ ...k, label: k.label || `Clave ${i + 1}`, usos: 0, estado: 'disponible' })) };
      case 'iaClaveAgregar': { this.keys = this.keys || []; if (!/^gsk_/.test(p.key)) throw new Error('La clave no parece una API Key de Groq (debe comenzar con gsk_).'); this.keys.push({ id: 'k' + Date.now(), label: p.label, fin: p.key.slice(-4), added: today() }); return { total: this.keys.length }; }
      case 'iaClaveQuitar': this.keys = (this.keys || []).filter(k => k.id !== p.id); return { total: this.keys.length };
      case 'notificarAsignacion': return { enviado: (this.db.users.find(x => sameId(x.id, p.userId)) || {}).email || 'sin correo' };
      case 'getAudit': return { rows: [...(this.audit || [])].reverse(), total: (this.audit || []).length };
      case 'notificarAcceso': { const u = this.db.users.find(x => sameId(x.id, p.userId)); u.accesoNotificado = today(); return { enviado: u.email, fecha: u.accesoNotificado, quedan: 99 }; }
      case 'registrarEvento': {
        const s = this.db.students.find(x => sameId(x.id, p.studentId));
        if (p.kind === 'entrevista') { const prev = p.id ? this.db.interventions.find(x => sameId(x.id, p.id)) : null; const id = prev ? prev.id : Date.now(); const doc = { ...(prev || {}), id, studentId: s.id, studentName: s.name, date: p.date, type: p.tipoEntrevista, professional: prev ? prev.professional : State.currentUser.name, professionalId: prev ? prev.professionalId : State.currentUser.id, background: `Motivo: ${p.motivo}${p.desarrollo ? `\n\nDesarrollo: ${p.desarrollo}` : ''}`, agreements: (p.acuerdos || []).map(a => ({ ...a, progress: 'No Iniciado' })), isPrivate: !!p.confidencial, sharedWith: [], solicitaSeguimiento: !!p.seguimiento, entrevista: { version: 2, hora: p.hora, lugar: p.lugar, entrevistador: { id: State.currentUser.id, name: State.currentUser.name, cargo: State.currentUser.customRole || State.currentUser.role }, apoyo: p.apoyo || [], participantes: p.participantes || [], red: p.red, motivo: p.motivo, desarrollo: p.desarrollo, proxima: p.proxima } }; if (prev) Object.assign(prev, doc); else this.db.interventions.push(doc); const apod = (p.participantes || []).find(x => /apoderad/i.test(x.tipo)); if (apod && p.actualizarApoderado) s.contacto = { ...(s.contacto || {}), apoderado: apod.nombre.toUpperCase(), parentesco: apod.relacion, telefono: apod.telefono, email: apod.correo }; s.contactos = [...(s.contactos || []).filter(c => !(p.participantes || []).some(x => x.nombre === c.nombre)), ...(p.participantes || []).filter(x => x.tipo !== 'Estudiante' && (x.correo || x.telefono)).map(x => ({ nombre: x.nombre, relacion: x.relacion || x.tipo, correo: x.correo, telefono: x.telefono }))]; if (p.red) s.redes = [...(s.redes || []).filter(r => r.institucion !== p.red.institucion), { ...p.red, contactos: (p.participantes || []).filter(x => x.tipo === 'Red de apoyo').map(x => ({ nombre: x.nombre, cargo: x.relacion, correo: x.correo, telefono: x.telefono })) }]; return { ok: true, id, intervention: clone(doc), contacto: s.contacto, contactos: s.contactos, redes: s.redes }; }
        if (p.kind === 'anotacion') this.db.interventions.push({ id: Date.now(), studentId: s.id, studentName: s.name, date: p.date, type: 'Acción Estudiantil (Anotación)', professional: State.currentUser.name, professionalId: State.currentUser.id, background: `Anotación ${String(p.tipo).toLowerCase()}: ${p.detail}`, anotacion: { tipo: p.tipo }, isPrivate: false, sharedWith: [], agreements: [] });
        else { const f = p.kind === 'atraso' ? 'atrasos' : 'inasistencias'; s[f] = (parseInt(s[f]) || 0) + 1; s.registroAsistencia = [...(s.registroAsistencia || []), { fecha: p.date, tipo: p.kind, detalle: p.detail || '', por: State.currentUser.name }]; }
        return { ok: true };
      }
      default: throw new Error('Esta función necesita el servidor de Apps Script configurado.');
    }
  }
};
