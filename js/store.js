// Estado y progreso del estudiante. Todo vive en localStorage (con respaldo en memoria
// si el navegador lo bloquea, p. ej. en modo privado).

const KEY = 'estudani.v1';

// Cajas de repetición espaciada (estilo Leitner): días hasta el siguiente repaso.
const INTERVALOS = [0, 1, 2, 4, 8, 16, 32, 64];

export const PENALIZACIONES = {
  '0': { etiqueta: 'No resta', valor: 0 },
  '1/4': { etiqueta: '1/4 por fallo (0,25)', valor: 1 / 4 },
  '1/3': { etiqueta: '1/3 por fallo (0,33)', valor: 1 / 3 },
  '1/2': { etiqueta: '1/2 por fallo (0,50)', valor: 1 / 2 },
};

const vacio = () => ({
  ajustes: { penalizacion: '1/3' },
  preguntas: {}, // id -> { box, due, n, ok, fail, blank, last }
  dias: {}, // dayNum -> { n, ok, fail, blank }
  lecciones: {}, // "1:e3" -> true
  sesiones: [], // últimas sesiones de test
  reportes: [], // problemas anotados para enviar: { id, fecha, tipo, texto, qid?, ref?, enun? }
  ocultas: {}, // id de pregunta -> true (apartadas en este dispositivo)
});

let estado = cargar();
let memoriaSolo = false;

function cargar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return vacio();
    return { ...vacio(), ...JSON.parse(raw) };
  } catch {
    memoriaSolo = true;
    return vacio();
  }
}

let silencio = false; // true mientras se fusiona: no cuenta como un cambio del estudiante
const oyentes = [];
export const alCambiar = (f) => oyentes.push(f);

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(estado));
  } catch {
    memoriaSolo = true;
  }
  if (!silencio) oyentes.forEach((f) => f());
}

export const sinPersistencia = () => memoriaSolo;

export function hoy() {
  const d = new Date();
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// ---------- ajustes ----------
export const getAjustes = () => estado.ajustes;
export function setAjuste(clave, valor) {
  estado.ajustes[clave] = valor;
  guardar();
}
export const penalizacion = () => (PENALIZACIONES[estado.ajustes.penalizacion] || PENALIZACIONES['1/3']).valor;

// ---------- temas incluidos en el repaso ----------
// true/false = elección manual del estudiante; undefined = automático (según lo estudiado)
export const repasoTema = (n) => (estado.ajustes.repaso || {})[n];
export function setRepasoTema(n, valor) {
  estado.ajustes.repaso = estado.ajustes.repaso || {};
  estado.ajustes.repaso[n] = !!valor;
  guardar();
}
export function resetRepaso() {
  estado.ajustes.repaso = {};
  guardar();
}

// ---------- preguntas ----------
export const infoPregunta = (id) => estado.preguntas[id] || null;

export function registrar(id, resultado) {
  // resultado: 'ok' | 'fail' | 'blank'
  const p = estado.preguntas[id] || { box: 0, due: hoy(), n: 0, ok: 0, fail: 0, blank: 0 };
  p.n += 1;
  p[resultado] += 1;
  p.last = resultado;
  p.t = Date.now(); // cuándo se contestó por última vez: sirve para fusionar el progreso de varios dispositivos
  p.box = resultado === 'ok' ? Math.min(p.box + 1, INTERVALOS.length - 1) : 0;
  p.due = hoy() + INTERVALOS[p.box];
  estado.preguntas[id] = p;

  const d = estado.dias[hoy()] || { n: 0, ok: 0, fail: 0, blank: 0 };
  d.n += 1;
  d[resultado] += 1;
  estado.dias[hoy()] = d;
  guardar();
}

export function pendientesHoy(ids) {
  const h = hoy();
  return ids.filter((id) => estado.preguntas[id] && estado.preguntas[id].due <= h);
}
export const nuevas = (ids) => ids.filter((id) => !estado.preguntas[id]);
export const falladas = (ids) =>
  ids.filter((id) => {
    const p = estado.preguntas[id];
    return p && (p.last === 'fail' || p.last === 'blank');
  });

// ---------- lecciones ----------
export const leccionHecha = (tema, epi) => !!estado.lecciones[`${tema}:${epi}`];
export function marcarLeccion(tema, epi, valor) {
  const k = `${tema}:${epi}`;
  if (valor) estado.lecciones[k] = true;
  else delete estado.lecciones[k];
  guardar();
}

// ---------- estadísticas ----------
export function resumen(ids) {
  let ok = 0, fail = 0, blank = 0, vistas = 0, dominadas = 0;
  for (const id of ids) {
    const p = estado.preguntas[id];
    if (!p) continue;
    vistas += 1;
    ok += p.ok;
    fail += p.fail;
    blank += p.blank;
    if (p.box >= 4) dominadas += 1;
  }
  const contestadas = ok + fail;
  return { ok, fail, blank, vistas, dominadas, precision: contestadas ? Math.round((ok / contestadas) * 100) : null };
}

export function hoyContestadas() {
  const d = estado.dias[hoy()];
  return d ? d.n : 0;
}

export function racha() {
  let dia = hoy();
  if (!estado.dias[dia]) dia -= 1; // si aún no ha estudiado hoy, no rompemos la racha
  let n = 0;
  while (estado.dias[dia] && estado.dias[dia].n > 0) {
    n += 1;
    dia -= 1;
  }
  return n;
}

export function guardarSesion(s) {
  estado.sesiones.unshift(s);
  estado.sesiones = estado.sesiones.slice(0, 30);
  guardar();
}
export const sesiones = () => estado.sesiones;

// ---------- reportes y preguntas ocultas ----------
export const reportes = () => estado.reportes || [];
export function addReporte(r) {
  estado.reportes = [...reportes(), { id: Date.now().toString(36), fecha: new Date().toISOString().slice(0, 10), ...r }];
  guardar();
}
export function vaciarReportes() {
  estado.reportes = [];
  guardar();
}
export const ocultas = () => Object.keys(estado.ocultas || {});
export function ocultar(id, si = true) {
  estado.ocultas = { ...(estado.ocultas || {}) };
  if (si) estado.ocultas[id] = true; else delete estado.ocultas[id];
  guardar();
}
export const esOculta = (id) => !!(estado.ocultas && estado.ocultas[id]);

// ---------- copia de seguridad ----------
export const marcarCopia = () => { estado.ajustes.copia = Date.now(); guardar(); };
export const diasDesdeCopia = () => (estado.ajustes.copia ? Math.floor((Date.now() - estado.ajustes.copia) / 86400000) : null);
export const hayProgreso = () => Object.keys(estado.preguntas).length > 0;
export const exportar = () => JSON.stringify(estado);
export function importar(texto) {
  const datos = JSON.parse(texto);
  if (!datos || typeof datos !== 'object' || !datos.preguntas || !datos.ajustes) throw new Error('Formato no válido');
  estado = { ...vacio(), ...datos };
  guardar();
}
// Fusiona el progreso de otro dispositivo con el de este SIN borrar nada: por pregunta gana la respuesta más reciente
// (los contadores se quedan con el mayor de los dos), los días y las lecciones se juntan.
export function fusionar(texto, { silencioso = false } = {}) {
  const o = JSON.parse(texto);
  if (!o || typeof o !== 'object' || !o.preguntas || !o.ajustes) throw new Error('Formato no válido');
  const antes = Object.keys(estado.preguntas).length;
  let cambiadas = 0;
  for (const [id, b] of Object.entries(o.preguntas)) {
    const a = estado.preguntas[id];
    if (!a) { estado.preguntas[id] = b; cambiadas += 1; continue; }
    const gana = (b.t || 0) > (a.t || 0) || ((b.t || 0) === (a.t || 0) && b.n > a.n) ? b : a;
    const f = { ...gana };
    for (const k of ['n', 'ok', 'fail', 'blank']) f[k] = Math.max(a[k] || 0, b[k] || 0);
    if (gana === b) cambiadas += 1;
    estado.preguntas[id] = f;
  }
  for (const [d, b] of Object.entries(o.dias || {})) {
    const a = estado.dias[d] || { n: 0, ok: 0, fail: 0, blank: 0 };
    estado.dias[d] = { n: Math.max(a.n, b.n || 0), ok: Math.max(a.ok, b.ok || 0), fail: Math.max(a.fail, b.fail || 0), blank: Math.max(a.blank, b.blank || 0) };
  }
  Object.assign(estado.lecciones, o.lecciones || {});
  const vistas = new Set();
  estado.sesiones = [...estado.sesiones, ...(o.sesiones || [])]
    .filter((x) => { const k = JSON.stringify(x); if (vistas.has(k)) return false; vistas.add(k); return true; })
    .sort((x, y) => (y.fecha || 0) - (x.fecha || 0)).slice(0, 30);
  const ids = new Set(estado.reportes.map((r) => r.id));
  estado.reportes = [...estado.reportes, ...(o.reportes || []).filter((r) => !ids.has(r.id))];
  estado.ajustes.repaso = { ...((o.ajustes || {}).repaso || {}), ...(estado.ajustes.repaso || {}) };
  silencio = silencioso;
  guardar();
  silencio = false;
  return { nuevas: Object.keys(estado.preguntas).length - antes, actualizadas: cambiadas };
}
export function borrarTodo() {
  estado = vacio();
  guardar();
}
