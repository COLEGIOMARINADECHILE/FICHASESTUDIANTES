/**
 * Backend · Gestión de Convivencia e Inclusión · Colegio Marina de Chile
 *
 * Google Apps Script vinculado a una Hoja de Cálculo de Google.
 * - Cada colección es una hoja (pestaña). Cada fila guarda un registro en JSON.
 * - Las contraseñas se guardan cifradas (SHA-256 con sal), nunca en texto plano.
 * - La API Key de la IA y la clave maestra viven en las Propiedades del Script,
 *   nunca en el navegador ni en GitHub.
 * - Los respaldos se guardan en Google Drive de forma privada y solo se entregan
 *   a usuarios con sesión iniciada.
 *
 * Instalación: ver README.md (sección "1. Backend en Google Apps Script").
 */

const COLLECTIONS = ['variables', 'users', 'students', 'courses', 'interventions', 'nursings',
  'observations', 'reports', 'knowledgeDocs', 'coursePlans', 'studentPlans', 'evidences'];
const CHUNK = 45000;                 // caracteres por celda (límite de Sheets: 50.000)
const SESSION_SECONDS = 21600;       // 6 horas (máximo permitido por CacheService)
const DRIVE_FOLDER_NAME = 'Respaldos Convivencia - Marina de Chile';
const PROTOCOLO = 'Activación de Protocolo';
// ID de cliente de Google (proyecto "trayectoria-escolar"). Se puede reemplazar con la propiedad GOOGLE_CLIENT_ID.
const GOOGLE_CLIENT_ID_DEFAULT = '32573029246-77gl0qesv05r3g18t0oolpiv3dlaru9i.apps.googleusercontent.com';
// Correo de contacto del sistema (respuestas a los avisos). Se puede reemplazar con la propiedad CORREO_CONTACTO.
const CORREO_CONTACTO_DEFAULT = 'datos@andaliensur.cl';
const GROQ_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];

const INIT_VARS = {
  interviewTypes: ['Activación de Protocolo', 'Entrevista Apoderado', 'Entrevista Estudiante', 'Resolución de Conflictos',
    'Apoyo Socioemocional', 'Derivación a Redes', 'Seguimiento', 'Citación Disciplinaria', 'Carta Compromiso', 'Acción Estudiantil (Anotación)'],
  professionals: ['Psicólogo/a', 'Trabajador/a Social', 'Orientador/a', 'Inspector/a General', 'Encargado/a Convivencia', 'Docente Jefe', 'Enfermero/a'],
  progressLevels: ['No Iniciado', 'En Proceso', 'Logrado', 'No Logrado', 'Requiere Modificación'],
  roles: ['Docente', 'Asistente de la Educación', 'Directivo', 'Convivencia', 'UTP', 'Administrador', 'Equipo PIE'],
  functionsList: ['gestionar_usuarios', 'editar_fichas', 'ver_fichas', 'agregar_entrevistas', 'ver_reportes', 'ver_todos_reportes',
    'configurar_sistema', 'gestionar_protocolos', 'ver_top_intervenciones', 'ver_resumen_cursos', 'registro_rapido', 'ver_bitacora'],
  schoolLogo: 'img/logo-colegio.png',
  slepLogo: 'img/logo-slep.png',
  bgImage: 'img/COLEGIO.jpg',
  diasTotalesClases: 180,
  tiposPlanes: ['Plan de Revinculación', 'Plan de Trabajo Psicosocial', 'Plan Prevención de Violencia', 'Plan de Acompañamiento General'],
  appName: '',      // vacío = se usa el nombre de js/config.js
  appTagline: ''
};

// =====================================================================
// ENTRADA HTTP
// =====================================================================
function doGet() {
  return json_({ ok: true, service: 'convivencia-marina', time: new Date().toISOString() });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'Solicitud inválida' }); }
  AUDIT = null;
  let user = null;
  try {
    if (PUBLIC_ACTIONS[req.action]) {
      const data = PUBLIC_ACTIONS[req.action](req);
      if (AUDIT) audit_(AUDIT.user, AUDIT);
      return json_({ ok: true, data: data });
    }
    user = auth_(req.token);
    const handler = PRIVATE_ACTIONS[req.action];
    if (!handler) fail_('Acción desconocida: ' + req.action);
    const data = handler(req, user);
    if (AUDIT) audit_(user, AUDIT);
    return json_({ ok: true, data: data });
  } catch (err) {
    if (AUDIT && AUDIT.alFallar) audit_(AUDIT.user || user, AUDIT);
    return json_({ ok: false, error: err.message, code: err.code || '' });
  }
}

// =====================================================================
// BITÁCORA DE ACCIONES (hoja "bitacora"): quién hizo qué y cuándo
// =====================================================================
let AUDIT = null; // cada acción deja aquí lo que se debe registrar
const SECCIONES = { students: 'Estudiantes', interventions: 'Intervenciones y protocolos', observations: 'Observaciones docentes', nursings: 'Enfermería', users: 'Funcionarios', courses: 'Cursos', coursePlans: 'Planes de curso', studentPlans: 'Planes individuales', evidences: 'Respaldos', knowledgeDocs: 'Normativas IA', variables: 'Configuración', reports: 'Reportes PIE', sesion: 'Sesión', ia: 'Inteligencia artificial' };

function auditSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName('bitacora');
  if (!sh) {
    sh = ss.insertSheet('bitacora');
    sh.getRange(1, 1, 1, 8).setValues([['Fecha y hora', 'Funcionario', 'Perfil', 'Acción', 'Sección', 'Registro', 'Detalle', 'ID funcionario']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function audit_(u, a) {
  try {
    const nombre = u ? u.name : (a.nombre || 'Desconocido');
    auditSheet_().appendRow([new Date(), nombre, u ? (u.customRole || u.role || '') : '', a.accion, SECCIONES[a.seccion] || a.seccion || '', "'" + String(a.registro || ''), String(a.detalle || '').slice(0, 900), "'" + String(u ? u.id : '')]);
  } catch (e) { /* la bitácora nunca debe impedir la acción */ }
}

/** Texto corto que identifica un registro en la bitácora. */
function describe_(col, doc, changes) {
  doc = doc || {};
  const quien = { students: doc.name, interventions: (doc.type || '') + ' de ' + (doc.studentName || doc.studentId || ''), users: doc.name,
    coursePlans: 'Plan del curso ' + (doc.course || ''), studentPlans: (doc.type || 'Plan individual') + ' de ' + (doc.studentName || ''),
    evidences: (doc.fileName || '') + ' de ' + (doc.studentName || ''), knowledgeDocs: doc.title, courses: doc.name,
    observations: 'Observación del estudiante ' + (doc.studentId || ''), nursings: 'Atención del estudiante ' + (doc.studentId || '') }[col] || '';
  const campos = changes ? Object.keys(changes).filter(function (k) { return ['id', 'password', 'passwordHash', 'salt'].indexOf(k) < 0; }) : [];
  return (quien || '') + (campos.length ? ' (campos: ' + campos.slice(0, 10).join(', ') + ')' : '');
}

function getAudit_(req, u) {
  if (!has_(u, 'gestionar_usuarios') && !has_(u, 'ver_bitacora')) fail_('No tiene permiso para ver la bitácora');
  const sh = auditSheet_();
  const last = sh.getLastRow();
  if (last < 2) return { rows: [] };
  const desde = req.desde ? new Date(req.desde + 'T00:00:00') : null;
  const hasta = req.hasta ? new Date(req.hasta + 'T23:59:59') : null;
  const rows = sh.getRange(2, 1, last - 1, 8).getValues().filter(function (r) {
    const f = r[0] instanceof Date ? r[0] : new Date(r[0]);
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  }).map(function (r) {
    return { fecha: Utilities.formatDate(r[0] instanceof Date ? r[0] : new Date(r[0]), 'America/Santiago', "yyyy-MM-dd'T'HH:mm:ss"), funcionario: r[1], perfil: r[2], accion: r[3], seccion: r[4], registro: String(r[5]), detalle: r[6], userId: String(r[7]) };
  });
  rows.reverse();
  return { rows: rows.slice(0, 5000), total: rows.length };
}

const PUBLIC_ACTIONS = {
  bootstrap: bootstrap_,
  login: login_,
  loginGoogle: loginGoogle_
};

const PRIVATE_ACTIONS = {
  getAll: getAll_,
  save: save_,
  batch: batch_,
  remove: remove_,
  changePassword: changePassword_,
  logout: logout_,
  setSecret: setSecret_,
  ai: ai_,
  upload: upload_,
  file: file_,
  import: import_,
  registrarEvento: registrarEvento_,
  notificarAcceso: notificarAcceso_,
  getAudit: getAudit_
};

// =====================================================================
// INSTALACIÓN (ejecutar una vez desde el editor: menú Ejecutar > instalar)
// =====================================================================
function instalar() {
  COLLECTIONS.forEach(sheet_);
  if (!getDoc_('variables', 'main')) putDoc_('variables', 'main', Object.assign({ id: 'main' }, INIT_VARS));
  if (readAll_('users').length === 0) {
    const clave = Utilities.getUuid().slice(0, 10);
    const admin = { id: '1', name: 'Admin Principal', role: 'Administrador', customRole: 'Administrador General', active: true, functions: ['acceso_total'], assignedCourses: [] };
    setPassword_(admin, clave);
    putDoc_('users', admin.id, admin);
    Logger.log('Usuario "Admin Principal" creado. Clave temporal: ' + clave + '  (cámbiela al ingresar)');
  }
  DriveApp.getRootFolder(); // solicita el permiso de Drive en la primera ejecución
  Logger.log('Datos en la hoja: ' + ss_().getUrl());
  Logger.log('Instalación lista.');
}

/**
 * Rescate: deja activo al usuario "Admin Principal" (lo crea si no existe) con una clave nueva.
 * Ejecutar desde el editor si se pierde la clave o si no aparece ningún funcionario en el ingreso.
 */
function restablecerAdmin() {
  COLLECTIONS.forEach(sheet_);
  if (!getDoc_('variables', 'main')) putDoc_('variables', 'main', Object.assign({ id: 'main' }, INIT_VARS));
  const admin = getDoc_('users', '1') || { id: '1', name: 'Admin Principal', customRole: 'Administrador General', assignedCourses: [] };
  Object.assign(admin, { role: 'Administrador', active: true, functions: ['acceso_total'] });
  const clave = Utilities.getUuid().slice(0, 10);
  setPassword_(admin, clave);
  putDoc_('users', admin.id, admin);
  Logger.log('Ingrese con perfil "Administrador", nombre "' + admin.name + '" y clave: ' + clave);
  Logger.log('Datos en la hoja: ' + ss_().getUrl());
}

// =====================================================================
// ALMACENAMIENTO EN HOJAS
// =====================================================================
/**
 * Hoja de cálculo donde se guardan los datos. Como aplicación web, Apps Script no conoce la
 * "hoja activa", así que su identificador se guarda en las Propiedades del Script (SPREADSHEET_ID).
 * Si el script está dentro de una hoja, la usa; si es un script suelto, crea una hoja nueva.
 */
let SS_CACHE = null;
function ss_() {
  if (SS_CACHE) return SS_CACHE;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return (SS_CACHE = SpreadsheetApp.openById(id));
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) ss = SpreadsheetApp.create('Base Trayectoria Escolar');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return (SS_CACHE = ss);
}

function sheet_(col) {
  if (COLLECTIONS.indexOf(col) < 0) fail_('Colección no válida: ' + col);
  const ss = ss_();
  let sh = ss.getSheetByName(col);
  if (!sh) {
    sh = ss.insertSheet(col);
    sh.getRange(1, 1, 1, 3).setValues([['id', 'actualizado', 'datos (JSON)']]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowText_(row) { return row.slice(2).join(''); }

function readAll_(col) {
  const sh = sheet_(col);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const out = [];
  rows.forEach(function (r) {
    const txt = rowText_(r);
    if (!txt) return;
    try { out.push(JSON.parse(txt)); } catch (e) { /* fila dañada: se omite */ }
  });
  return out;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const f = sh.getRange(2, 1, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}

function getDoc_(col, id) {
  const sh = sheet_(col);
  const r = findRow_(sh, id);
  if (!r) return null;
  const txt = rowText_(sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0]);
  return txt ? JSON.parse(txt) : null;
}

function toRow_(id, doc, width) {
  const text = JSON.stringify(doc);
  const row = ["'" + id, new Date()];
  for (let i = 0; i < text.length; i += CHUNK) row.push("'" + text.slice(i, i + CHUNK)); // el apóstrofo fuerza texto
  while (row.length < width) row.push('');
  return row;
}

function ensureWidth_(sh, width) {
  if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
}

function putDoc_(col, id, doc) {
  writeMany_(col, [Object.assign({}, doc, { id: doc.id !== undefined ? doc.id : id })]);
}

/** Escribe varios registros con una sola lectura del índice. */
function writeMany_(col, docs) {
  if (!docs.length) return;
  const sh = sheet_(col);
  const last = sh.getLastRow();
  const index = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (v, i) { index[String(v[0])] = i + 2; });
  const need = docs.reduce(function (m, d) { return Math.max(m, Math.ceil(JSON.stringify(d).length / CHUNK) + 2); }, 3);
  const width = Math.max(sh.getLastColumn(), need);
  ensureWidth_(sh, width);
  const appends = [];
  docs.forEach(function (d) {
    const id = String(d.id);
    const row = toRow_(id, d, width);
    if (index[id]) sh.getRange(index[id], 1, 1, width).setValues([row]);
    else { appends.push(row); index[id] = -1; }
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, width).setValues(appends);
}

function delDoc_(col, id) {
  const sh = sheet_(col);
  const r = findRow_(sh, id);
  if (r) sh.deleteRow(r);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// =====================================================================
// SESIÓN Y PERMISOS
// =====================================================================
function fail_(msg, code) { const e = new Error(msg); e.code = code || ''; throw e; }

function has_(u, f) {
  const fn = u.functions || [];
  return fn.indexOf('acceso_total') >= 0 || fn.indexOf(f) >= 0;
}
function isAdmin_(u) { return has_(u, 'gestionar_usuarios') || has_(u, 'configurar_sistema'); }

function clean_(u) {
  const c = Object.assign({}, u);
  delete c.password; delete c.passwordHash; delete c.salt;
  return c;
}

function hash_(pass, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pass, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function setPassword_(u, pass) {
  u.salt = Utilities.getUuid();
  u.passwordHash = hash_(String(pass).trim(), u.salt);
  delete u.password;
}

function auth_(token) {
  if (!token) fail_('Sesión no iniciada', 'AUTH');
  const cache = CacheService.getScriptCache();
  const uid = cache.get('s_' + token);
  if (!uid) fail_('La sesión expiró. Vuelva a ingresar.', 'AUTH');
  const u = getDoc_('users', uid);
  if (!u || u.active === false) fail_('Usuario no autorizado', 'AUTH');
  cache.put('s_' + token, uid, SESSION_SECONDS);
  return u;
}

function canSeeIntervention_(u, i) {
  const confidential = i.isPrivate || i.type === PROTOCOLO;
  if (!confidential || has_(u, 'gestionar_protocolos')) return true;
  const uid = String(u.id);
  return String(i.professionalId) === uid || (i.sharedWith || []).map(String).indexOf(uid) >= 0;
}

function checkWrite_(u, col, data, existing) {
  if (quickOnly_(u)) fail_('Su perfil solo permite registrar anotaciones, atrasos e inasistencias');
  if (col === 'users' && !has_(u, 'gestionar_usuarios')) fail_('No tiene permiso para gestionar funcionarios');
  if (col === 'knowledgeDocs' && !isAdmin_(u)) fail_('No tiene permiso para modificar normativas');
  if (col === 'variables' && !isAdmin_(u)) {
    const otros = Object.keys(data || {}).filter(function (k) { return k !== 'diasTotalesClases' && k !== 'id'; });
    if (otros.length) fail_('No tiene permiso para configurar el sistema');
  }
  if (col === 'interventions' && existing && !canSeeIntervention_(u, existing)) fail_('Registro confidencial');
}

// =====================================================================
// ACCIONES PÚBLICAS
// =====================================================================
function vars_() {
  const v = Object.assign({}, INIT_VARS, getDoc_('variables', 'main') || {});
  ['interviewTypes', 'roles', 'functionsList'].forEach(function (k) {
    INIT_VARS[k].forEach(function (x) { if (v[k].indexOf(x) < 0) v[k].push(x); });
  });
  delete v.aiApiKey;
  delete v.driveApiUrl;
  return v;
}

function bootstrap_() {
  const v = vars_();
  return {
    appName: v.appName, appTagline: v.appTagline,
    roles: v.roles,
    users: readAll_('users').map(function (u) { return { id: String(u.id), name: u.name, role: u.role }; }),
    schoolLogo: v.schoolLogo, slepLogo: v.slepLogo, bgImage: v.bgImage,
    googleClientId: googleClientId_(),
    dominio: dominio_()
  };
}

function login_(req) {
  const u = getDoc_('users', req.userId);
  if (!u) fail_('Usuario no encontrado');
  const pass = String(req.password || '').trim();
  const master = PropertiesService.getScriptProperties().getProperty('CLAVE_MAESTRA');
  let ok = false;
  if (u.passwordHash) ok = hash_(pass, u.salt) === u.passwordHash;
  else if (u.password !== undefined && u.password !== null) {
    ok = String(u.password).trim() === pass;
    if (ok) { setPassword_(u, pass); withLock_(function () { putDoc_('users', u.id, u); }); } // migra la clave antigua a cifrada
  }
  const viaMaster = !ok && !!master && pass === master;
  if (!ok && !viaMaster) { AUDIT = { user: u, accion: 'Ingreso fallido', seccion: 'sesion', detalle: 'Clave incorrecta', alFallar: true }; Utilities.sleep(900); fail_('Credenciales incorrectas'); }
  if (u.active === false) { AUDIT = { user: u, accion: 'Ingreso fallido', seccion: 'sesion', detalle: 'Usuario inactivo', alFallar: true }; fail_('Usuario inactivo'); }
  AUDIT = { user: u, accion: 'Ingreso', seccion: 'sesion', detalle: viaMaster ? 'Con clave maestra' : 'Con perfil y clave' };
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, String(u.id), SESSION_SECONDS);
  return { token: token, user: clean_(u), master: viaMaster };
}

// =====================================================================
// ACCIONES CON SESIÓN
// =====================================================================
/** Funcionario que solo registra anotaciones, atrasos e inasistencias (paradocente): no ve fichas. */
function quickOnly_(u) { return has_(u, 'registro_rapido') && !has_(u, 'ver_fichas') && !has_(u, 'editar_fichas') && !has_(u, 'agregar_entrevistas'); }

function getAll_(req, u) {
  const out = {};
  COLLECTIONS.forEach(function (c) { if (c !== 'variables') out[c] = readAll_(c); });
  out.variables = vars_();
  out.variables.aiConfigured = !!PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  out.users = out.users.map(clean_);
  out.me = clean_(u);

  // Cursos asignados: el funcionario solo recibe los estudiantes y registros de sus cursos
  const assigned = (u.assignedCourses || []);
  if (!has_(u, 'acceso_total') && assigned.length) {
    const courseName = {};
    out.courses.forEach(function (c) { courseName[String(c.id)] = c.name; });
    out.students = out.students.filter(function (s) { return assigned.indexOf(courseName[String(s.courseId)] || s.curso) >= 0; });
    const ids = {};
    out.students.forEach(function (s) { ids[String(s.id)] = true; });
    ['interventions', 'nursings', 'observations', 'evidences', 'studentPlans', 'reports'].forEach(function (c) {
      out[c] = out[c].filter(function (x) { return ids[String(x.studentId)]; });
    });
    out.coursePlans = out.coursePlans.filter(function (p) { return assigned.indexOf(p.course) >= 0; });
  }

  // Paradocentes: solo la nómina (nombre, RUN y curso), ningún registro
  if (quickOnly_(u)) {
    out.students = out.students.map(function (s) { return { id: s.id, name: s.name, rut: s.rut, curso: s.curso, courseId: s.courseId, status: s.status }; });
    ['interventions', 'nursings', 'observations', 'evidences', 'studentPlans', 'coursePlans', 'reports', 'knowledgeDocs'].forEach(function (c) { out[c] = []; });
    out.users = out.users.filter(function (x) { return String(x.id) === String(u.id); });
    return out;
  }
  out.interventions = out.interventions.map(function (i) {
    if (canSeeIntervention_(u, i)) return i;
    return { id: i.id, studentId: i.studentId, studentName: i.studentName, date: i.date, type: i.type,
      professional: i.professional, professionalId: i.professionalId, isPrivate: true, sharedWith: i.sharedWith || [],
      background: '', agreements: [], restricted: true };
  });
  return out;
}

function save_(req, u) {
  const col = req.col;
  const id = String(req.id || (req.data && req.data.id) || '');
  if (!id) fail_('Falta el identificador del registro');
  return withLock_(function () {
    const existing = getDoc_(col, id);
    checkWrite_(u, col, req.data, existing);
    let doc;
    if (col === 'users') {
      doc = Object.assign({}, existing || {}, req.data);
      if (req.data.password) setPassword_(doc, req.data.password);
      else if (!existing) fail_('Debe asignar una clave al nuevo funcionario');
      else delete doc.password;
    } else {
      doc = req.merge && existing ? Object.assign({}, existing, req.data) : Object.assign({}, req.data);
    }
    if (col === 'variables') { delete doc.aiApiKey; delete doc.aiConfigured; delete doc.driveApiUrl; }
    doc.id = doc.id !== undefined ? doc.id : id;
    putDoc_(col, id, doc);
    AUDIT = { accion: existing ? 'Modificación' : 'Creación', seccion: col, registro: id, detalle: describe_(col, doc, existing ? req.data : null) };
    return col === 'users' ? clean_(doc) : doc;
  });
}

/** Varias escrituras en una sola llamada: { ops: [{ col, id, data, merge }] } */
function batch_(req, u) {
  return withLock_(function () {
    const byCol = {};
    (req.ops || []).forEach(function (op) { (byCol[op.col] = byCol[op.col] || []).push(op); });
    let total = 0;
    Object.keys(byCol).forEach(function (col) {
      if (col === 'users') byCol[col].forEach(function (op) { op.merge = true; ['password', 'passwordHash', 'salt'].forEach(function (k) { delete op.data[k]; }); });
      const existing = {};
      readAll_(col).forEach(function (d) { existing[String(d.id)] = d; });
      const docs = byCol[col].map(function (op) {
        const id = String(op.id || op.data.id);
        checkWrite_(u, col, op.data, existing[id]);
        const doc = op.merge && existing[id] ? Object.assign({}, existing[id], op.data) : Object.assign({}, op.data);
        doc.id = doc.id !== undefined ? doc.id : id;
        return doc;
      });
      writeMany_(col, docs);
      total += docs.length;
    });
    AUDIT = { accion: 'Modificación masiva', seccion: Object.keys(byCol).join(', '), detalle: total + ' registros actualizados o creados de una vez' };
    return { saved: total };
  });
}

function remove_(req, u) {
  const col = req.col, id = String(req.id);
  return withLock_(function () {
    const existing = getDoc_(col, id);
    if (!existing) return { removed: 0 };
    if ((col === 'students' || col === 'users') && !has_(u, 'gestionar_usuarios')) fail_('No tiene permiso para eliminar');
    if (col === 'users' && String(id) === String(u.id)) fail_('No puede eliminar su propia cuenta');
    if (col === 'variables') fail_('La configuración no se puede eliminar');
    if (col === 'knowledgeDocs' && !isAdmin_(u)) fail_('No tiene permiso para eliminar normativas');
    if (col === 'interventions' && !canSeeIntervention_(u, existing)) fail_('Registro confidencial');
    if (col === 'evidences' && existing.storage === 'drive' && existing.driveId) {
      try { DriveApp.getFileById(existing.driveId).setTrashed(true); } catch (e) { /* ya no existe */ }
    }
    delDoc_(col, id);
    AUDIT = { accion: 'Eliminación', seccion: col, registro: id, detalle: describe_(col, existing) };
    return { removed: 1 };
  });
}

function changePassword_(req, u) {
  const target = String(req.userId || u.id);
  if (target !== String(u.id) && !has_(u, 'gestionar_usuarios')) fail_('No tiene permiso para cambiar esta clave');
  const pass = String(req.password || '').trim();
  if (pass.length < 4) fail_('La clave debe tener al menos 4 caracteres');
  return withLock_(function () {
    const doc = getDoc_('users', target);
    if (!doc) fail_('Usuario no encontrado');
    setPassword_(doc, pass);
    putDoc_('users', target, doc);
    AUDIT = { accion: 'Cambio de clave', seccion: 'users', registro: target, detalle: target === String(u.id) ? 'Cambió su propia clave' : 'Cambió la clave de ' + doc.name };
    return { changed: true };
  });
}

function logout_(req) {
  CacheService.getScriptCache().remove('s_' + req.token);
  AUDIT = { accion: 'Cierre de sesión', seccion: 'sesion' };
  return { closed: true };
}

function setSecret_(req, u) {
  if (!isAdmin_(u)) fail_('No tiene permiso para configurar el sistema');
  if (req.key !== 'GROQ_API_KEY') fail_('Clave no permitida');
  const props = PropertiesService.getScriptProperties();
  const value = String(req.value || '').trim();
  if (value) props.setProperty(req.key, value); else props.deleteProperty(req.key);
  AUDIT = { accion: 'Configuración', seccion: 'variables', detalle: 'Actualizó la API Key de la IA' };
  return { configured: !!value };
}

// =====================================================================
// INTELIGENCIA ARTIFICIAL (Groq). La API Key nunca sale del servidor.
// =====================================================================
function ai_(req) {
  AUDIT = { accion: 'Uso de IA', seccion: 'ia', detalle: 'Consulta de ' + (req.json ? 'generación de plan o medidas' : 'redacción de texto') };
  const key = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!key) fail_('Falta la API Key de IA. Configúrela en Administración.');
  let last = '';
  for (let k = 0; k < GROQ_MODELS.length; k++) {
    const body = { model: GROQ_MODELS[k], temperature: 0.4, messages: [] };
    if (req.json) {
      body.response_format = { type: 'json_object' };
      body.messages.push({ role: 'system', content: 'Responde únicamente con un objeto JSON válido, sin texto adicional ni bloques de código.' });
    }
    body.messages.push({ role: 'user', content: String(req.prompt || '').slice(0, 24000) });
    const res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + key }, payload: JSON.stringify(body)
    });
    const code = res.getResponseCode();
    let d = {};
    try { d = JSON.parse(res.getContentText()); } catch (e) { /* respuesta vacía */ }
    if (code === 401) fail_('La API Key de IA no es válida. Revísela en Administración.');
    if (code === 429) fail_('Se alcanzó el límite de uso de la IA. Espere un minuto e intente de nuevo.');
    if (code >= 300) { last = (d.error && d.error.message) || ('Error ' + code); continue; }
    let text = String((((d.choices || [])[0] || {}).message || {}).content || '').trim();
    if (!req.json) return { text: text };
    text = text.replace(/```json|```/g, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
    try { return { json: JSON.parse(text) }; }
    catch (e) {
      try { return { json: JSON.parse(text.replace(/[\u0000-\u001F]+/g, ' ')) }; }
      catch (e2) { last = 'La IA respondió en un formato no válido.'; }
    }
  }
  fail_(last || 'No fue posible obtener respuesta de la IA.');
}

// =====================================================================
// RESPALDOS EN GOOGLE DRIVE (privados)
// =====================================================================
function rootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('DRIVE_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* se recrea */ } }
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
  props.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function upload_(req) {
  if (!req.base64) fail_('Archivo vacío');
  const root = rootFolder_();
  const name = String(req.folderName || 'Sin curso').replace(/[\\/]/g, '-').slice(0, 120);
  const it = root.getFoldersByName(name);
  const folder = it.hasNext() ? it.next() : root.createFolder(name);
  const blob = Utilities.newBlob(Utilities.base64Decode(req.base64), req.mimeType || 'application/octet-stream', String(req.fileName || 'respaldo'));
  const file = folder.createFile(blob);
  AUDIT = { accion: 'Subida de archivo', seccion: 'evidences', detalle: String(req.fileName || '') + ' (' + name + ')' };
  return { fileId: file.getId(), url: file.getUrl() };
}

function file_(req) {
  const ev = getDoc_('evidences', req.id);
  if (!ev) fail_('Respaldo no encontrado');
  AUDIT = { accion: 'Apertura de archivo', seccion: 'evidences', registro: req.id, detalle: describe_('evidences', ev) };
  if (ev.storage !== 'drive') return { base64: String(ev.base64 || '').split(',').pop(), mimeType: ev.mimeType, fileName: ev.fileName };
  const f = DriveApp.getFileById(ev.driveId);
  return { base64: Utilities.base64Encode(f.getBlob().getBytes()), mimeType: f.getMimeType(), fileName: ev.fileName || f.getName() };
}

// =====================================================================
// IMPORTACIÓN MASIVA (migración desde Firebase)
// =====================================================================
function import_(req, u) {
  if (!has_(u, 'gestionar_usuarios')) fail_('Solo un administrador puede importar datos');
  const col = req.col;
  const docs = (req.docs || []).map(function (d) { return Object.assign({}, d); });
  return withLock_(function () {
    if (col === 'variables') {
      const v = Object.assign({}, getDoc_('variables', 'main') || {}, docs[0] || {}, { id: 'main' });
      if (v.aiApiKey && !PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY')) {
        PropertiesService.getScriptProperties().setProperty('GROQ_API_KEY', String(v.aiApiKey));
      }
      delete v.aiApiKey; delete v.driveApiUrl;
      putDoc_('variables', 'main', v);
      AUDIT = { accion: 'Traspaso de datos', seccion: 'variables', detalle: 'Configuración importada' };
      return { saved: 1 };
    }
    if (col === 'users') {
      const existing = {};
      readAll_('users').forEach(function (x) { existing[String(x.id)] = x; });
      docs.forEach(function (d) {
        const prev = existing[String(d.id)];
        if (prev && prev.passwordHash && !d.passwordHash) { d.passwordHash = prev.passwordHash; d.salt = prev.salt; delete d.password; }
        else if (d.password !== undefined && d.password !== null && d.password !== '') setPassword_(d, d.password);
      });
    }
    writeMany_(col, docs);
    AUDIT = { accion: 'Traspaso de datos', seccion: col, detalle: docs.length + ' registros importados' };
    return { saved: docs.length };
  });
}

// =====================================================================
// INGRESO CON CUENTA INSTITUCIONAL DE GOOGLE (@andaliensur.cl)
// =====================================================================
function googleClientId_() { return PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || GOOGLE_CLIENT_ID_DEFAULT; }
function correoContacto_() { return PropertiesService.getScriptProperties().getProperty('CORREO_CONTACTO') || CORREO_CONTACTO_DEFAULT; }
function dominio_() { return (PropertiesService.getScriptProperties().getProperty('DOMINIO_PERMITIDO') || 'andaliensur.cl').toLowerCase(); }

function newSession_(u) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('s_' + token, String(u.id), SESSION_SECONDS);
  return token;
}

function loginGoogle_(req) {
  const clientId = googleClientId_();
  if (!clientId) fail_('El ingreso con Google no está configurado.');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(req.credential || ''), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) fail_('No se pudo verificar la cuenta de Google. Intente nuevamente.');
  const info = JSON.parse(res.getContentText());
  const email = String(info.email || '').toLowerCase();
  if (info.aud !== clientId) fail_('La verificación de Google no corresponde a este sistema.');
  if (String(info.email_verified) !== 'true') fail_('La cuenta de Google no está verificada.');
  if (!email.endsWith('@' + dominio_())) fail_('Use su cuenta institucional @' + dominio_() + '.');
  const u = readAll_('users').filter(function (x) { return String(x.email || '').toLowerCase() === email; })[0];
  if (!u) { AUDIT = { nombre: email, accion: 'Ingreso fallido', seccion: 'sesion', detalle: 'Cuenta de Google no registrada: ' + email, alFallar: true }; }
  if (!u) fail_('La cuenta ' + email + ' no está registrada. Pida al administrador que la agregue a su perfil.');
  if (u.active === false) fail_('Usuario inactivo');
  AUDIT = { user: u, accion: 'Ingreso', seccion: 'sesion', detalle: 'Con cuenta de Google ' + email };
  return { token: newSession_(u), user: clean_(u) };
}

// =====================================================================
// REGISTRO RÁPIDO: anotaciones, atrasos e inasistencias (sin ver fichas)
// =====================================================================
function registrarEvento_(req, u) {
  if (!(has_(u, 'registro_rapido') || has_(u, 'agregar_entrevistas') || has_(u, 'editar_fichas'))) fail_('No tiene permiso para registrar');
  const kind = req.kind;
  if (['anotacion', 'atraso', 'inasistencia'].indexOf(kind) < 0) fail_('Tipo de registro no válido');
  return withLock_(function () {
    const s = getDoc_('students', req.studentId);
    if (!s) fail_('Estudiante no encontrado');
    const assigned = u.assignedCourses || [];
    if (!has_(u, 'acceso_total') && assigned.length && assigned.indexOf(s.curso) < 0) fail_('El estudiante no pertenece a sus cursos asignados');
    const fecha = String(req.date || '').slice(0, 10) || Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
    if (kind === 'anotacion') {
      const texto = String(req.detail || '').trim();
      if (!texto) fail_('Escriba el detalle de la anotación');
      const tipo = req.tipo === 'Positiva' ? 'Positiva' : 'Negativa';
      putDoc_('interventions', String(Date.now()), {
        id: Date.now(), studentId: s.id, studentName: s.name, date: fecha, type: 'Acción Estudiantil (Anotación)',
        professional: u.name, professionalId: u.id, background: 'Anotación ' + tipo.toLowerCase() + ': ' + texto,
        anotacion: { tipo: tipo }, isPrivate: false, sharedWith: [], agreements: []
      });
    } else {
      const field = kind === 'atraso' ? 'atrasos' : 'inasistencias';
      s[field] = (parseInt(s[field], 10) || 0) + 1;
      s.registroAsistencia = (s.registroAsistencia || []).concat([{ fecha: fecha, tipo: kind, detalle: String(req.detail || ''), por: u.name }]);
      putDoc_('students', String(s.id), s);
    }
    AUDIT = { accion: 'Registro rápido', seccion: 'students', registro: s.id, detalle: { anotacion: 'Anotación', atraso: 'Atraso', inasistencia: 'Inasistencia' }[kind] + ' de ' + s.name + ' (' + fecha + ')' };
    return { ok: true, atrasos: s.atrasos || 0, inasistencias: s.inasistencias || 0 };
  });
}

// =====================================================================
// AVISO DE CUENTA AL FUNCIONARIO (correo)
// =====================================================================
function notificarAcceso_(req, u) {
  if (!has_(u, 'gestionar_usuarios')) fail_('No tiene permiso para enviar avisos');
  return withLock_(function () {
    const target = getDoc_('users', req.userId);
    if (!target) fail_('Funcionario no encontrado');
    const email = String(target.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('El funcionario no tiene un correo válido');
    let texto = String(req.mensaje || '');
    if (texto.indexOf('{CLAVE}') >= 0) {
      const clave = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
      setPassword_(target, clave);
      texto = texto.split('{CLAVE}').join(clave);
    }
    const images = {};
    const logo = imageBlob_(req.logoUrl, 'logo');
    const slep = imageBlob_(req.slepUrl, 'slep');
    if (logo) images.logo = logo;
    if (slep) images.slep = slep;
    const html = emailHtml_(texto, { pageUrl: req.pageUrl, appName: req.appName || 'Trayectoria Escolar', tagline: req.remitente || 'Colegio Marina de Chile', nombre: target.name, logo: !!logo, slep: !!slep });
    MailApp.sendEmail({ to: email, replyTo: correoContacto_(), subject: String(req.asunto || 'Su cuenta en el sistema escolar'), htmlBody: html, inlineImages: images, body: texto.replace(/\*\*/g, ''), name: String(req.remitente || 'Colegio Marina de Chile') });
    target.accesoNotificado = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
    putDoc_('users', String(target.id), target);
    AUDIT = { accion: 'Aviso de acceso', seccion: 'users', registro: target.id, detalle: 'Correo enviado a ' + email + (req.mensaje && String(req.mensaje).indexOf('{CLAVE}') >= 0 ? ' con clave temporal' : '') };
    return { enviado: email, fecha: target.accesoNotificado, quedan: MailApp.getRemainingDailyQuota() };
  });
}

/** Imagen para incrustar en el correo: dirección web pública o imagen subida (data:...). */
function imageBlob_(src, name) {
  try {
    src = String(src || '');
    if (!src) return null;
    if (src.indexOf('data:') === 0) {
      const m = src.match(/^data:([^;]+);base64,(.+)$/);
      return m ? Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name) : null;
    }
    const res = UrlFetchApp.fetch(src, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return null;
    const blob = res.getBlob().setName(name);
    return /^image\//.test(blob.getContentType()) ? blob : null;
  } catch (e) { return null; }
}

/**
 * Correo con el diseño del sistema: encabezado azul marino con el escudo, botón dorado de ingreso,
 * recuadro de confidencialidad y pie con el logo del SLEP. El texto que escribió el administrador
 * se respeta: los títulos van entre **asteriscos**, las listas con "1." y los enlaces se activan solos.
 */
function emailHtml_(texto, o) {
  const NAVY = '#172f57', GOLD = '#e3b341', INK = '#1d2a44', MUTED = '#5b6478', PAPER = '#f6f3ec';
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const inline = function (s) {
    return esc(s)
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:' + NAVY + ';font-weight:bold">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong style="background:#fff3cf;color:' + INK + ';padding:1px 6px;border-radius:4px">$1</strong>');
  };
  const bloques = String(texto).replace(/\r/g, '').split(/\n\s*\n/);
  let cuerpo = '';
  bloques.forEach(function (b) {
    const lineas = b.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lineas.length) return;
    const titulo = lineas[0].match(/^\*\*(.+)\*\*$/);
    const resto = titulo ? lineas.slice(1) : lineas;
    const esConfidencial = titulo && /confidencial/i.test(titulo[1]);
    let html = '';
    if (titulo) html += '<h2 style="margin:0 0 10px;font-size:17px;line-height:1.3;color:' + NAVY + '">' + esc(titulo[1]) + '</h2>';
    const items = resto.filter(function (l) { return /^\s*\d+\.\s/.test(l); });
    const texto2 = resto.filter(function (l) { return !/^\s*\d+\.\s/.test(l); });
    texto2.forEach(function (l) { html += '<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:' + INK + '">' + inline(l) + '</p>'; });
    if (items.length) {
      html += '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 6px">';
      items.forEach(function (l) {
        const m = l.match(/^\s*(\d+)\.\s+(.*)$/);
        html += '<tr><td valign="top" style="width:30px;padding:4px 0"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:11px;background:' + NAVY + ';color:#fff;font-size:12px;font-weight:bold">' + m[1] + '</span></td><td style="padding:4px 0;font-size:15px;line-height:1.55;color:' + INK + '">' + inline(m[2]) + '</td></tr>';
      });
      html += '</table>';
    }
    cuerpo += esConfidencial
      ? '<div style="margin:22px 0;padding:18px 20px;background:' + PAPER + ';border-left:4px solid ' + GOLD + ';border-radius:8px">' + html + '</div>'
      : '<div style="margin:0 0 14px">' + html + '</div>';
  });
  const boton = o.pageUrl ? '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="background:' + GOLD + ';border-radius:10px"><a href="' + esc(o.pageUrl) + '" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:bold;color:' + NAVY + ';text-decoration:none">Ingresar a ' + esc(o.appName) + ' &rarr;</a></td></tr></table>' : '';
  const escudo = o.logo ? '<img src="cid:logo" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border-radius:36px;background:#fff;border:3px solid ' + GOLD + '">' : '';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#e9edf3">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9edf3;padding:24px 12px;font-family:Arial,Helvetica,sans-serif"><tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden">' +
      '<tr><td style="background:' + NAVY + ';padding:26px 30px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
        (escudo ? '<td style="padding-right:16px">' + escudo + '</td>' : '') +
        '<td><div style="font-size:13px;color:' + GOLD + ';font-weight:bold">' + esc(o.tagline) + '</div><div style="font-size:24px;line-height:1.2;color:#ffffff;font-weight:bold">' + esc(o.appName) + '</div><div style="font-size:13px;color:#c9d3e6">Su cuenta está lista</div></td>' +
      '</tr></table></td></tr>' +
      '<tr><td style="height:5px;background:' + GOLD + ';font-size:0;line-height:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:30px 30px 10px">' + cuerpo + boton + '</td></tr>' +
      '<tr><td style="padding:18px 30px 26px;border-top:1px solid #e6e9ef"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
        '<td style="font-size:12px;line-height:1.5;color:' + MUTED + '">Consultas sobre su cuenta o sobre el tratamiento de datos: <a href="mailto:' + correoContacto_() + '" style="color:' + NAVY + '">' + correoContacto_() + '</a><br>Este correo contiene información personal y es solo para su destinatario.</td>' +
        (o.slep ? '<td align="right" style="padding-left:12px"><img src="cid:slep" height="38" alt="SLEP Andalién Sur" style="display:block;height:38px;width:auto"></td>' : '') +
      '</tr></table></td></tr>' +
    '</table></td></tr></table></body></html>';
}

/** Ejecutar una vez desde el editor para autorizar el envío de correos. */
function autorizarCorreo() {
  Logger.log('Correos disponibles hoy: ' + MailApp.getRemainingDailyQuota());
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
