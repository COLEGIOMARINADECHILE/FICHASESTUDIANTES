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
  registro_rapido: 'Registro rápido: anotaciones, atrasos e inasistencias (paradocentes; sin ver fichas)',
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
  rawInclusionReports: [], knowledgeDocs: [], coursePlans: [], studentPlans: [], rawEvidences: [],
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

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.textContent = msg;
  el('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
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
    return () => { el('busy').hidden = true; };
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
    try {
      res = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: this.token, ...payload }) });
    } catch (e) { throw new Error('Sin conexión con el servidor. Revise su internet.'); }
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
const STORE = { users: 'users', students: 'rawStudents', courses: 'rawCoursesDB', interventions: 'rawInterventions', nursings: 'rawNursings', observations: 'rawObservations', reports: 'rawInclusionReports', knowledgeDocs: 'knowledgeDocs', coursePlans: 'coursePlans', studentPlans: 'studentPlans', evidences: 'rawEvidences' };

const DB = {
  async load() {
    const d = await API.call('getAll');
    Object.entries(STORE).forEach(([col, key]) => { State[key] = d[col] || []; });
    State.variables = { ...INIT_VARS, ...(d.variables || {}) };
    if (d.me) State.currentUser = d.me;
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
      case 'bootstrap': return { soloGoogle: !!this.db.variables.soloGoogle, appName: this.db.variables.appName, appTagline: this.db.variables.appTagline, roles: this.db.variables.roles, users: this.db.users.map(u => ({ id: u.id, name: u.name, role: u.role })), schoolLogo: this.db.variables.schoolLogo, slepLogo: this.db.variables.slepLogo, bgImage: this.db.variables.bgImage };
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
      case 'getAudit': return { rows: [...(this.audit || [])].reverse(), total: (this.audit || []).length };
      case 'notificarAcceso': { const u = this.db.users.find(x => sameId(x.id, p.userId)); u.accesoNotificado = today(); return { enviado: u.email, fecha: u.accesoNotificado, quedan: 99 }; }
      case 'registrarEvento': {
        const s = this.db.students.find(x => sameId(x.id, p.studentId));
        if (p.kind === 'anotacion') this.db.interventions.push({ id: Date.now(), studentId: s.id, studentName: s.name, date: p.date, type: 'Acción Estudiantil (Anotación)', professional: State.currentUser.name, professionalId: State.currentUser.id, background: `Anotación ${String(p.tipo).toLowerCase()}: ${p.detail}`, anotacion: { tipo: p.tipo }, isPrivate: false, sharedWith: [], agreements: [] });
        else { const f = p.kind === 'atraso' ? 'atrasos' : 'inasistencias'; s[f] = (parseInt(s[f]) || 0) + 1; s.registroAsistencia = [...(s.registroAsistencia || []), { fecha: p.date, tipo: p.kind, detalle: p.detail || '', por: State.currentUser.name }]; }
        return { ok: true };
      }
      default: throw new Error('Esta función necesita el servidor de Apps Script configurado.');
    }
  }
};
