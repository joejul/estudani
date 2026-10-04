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

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(estado));
  } catch {
    memoriaSolo = true;
  }
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

// ---------- preguntas ----------
export const infoPregunta = (id) => estado.preguntas[id] || null;

export function registrar(id, resultado) {
  // resultado: 'ok' | 'fail' | 'blank'
  const p = estado.preguntas[id] || { box: 0, due: hoy(), n: 0, ok: 0, fail: 0, blank: 0 };
  p.n += 1;
  p[resultado] += 1;
  p.last = resultado;
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

// ---------- copia de seguridad ----------
export const exportar = () => JSON.stringify(estado);
export function importar(texto) {
  const datos = JSON.parse(texto);
  if (!datos || typeof datos !== 'object' || !datos.preguntas || !datos.ajustes) throw new Error('Formato no válido');
  estado = { ...vacio(), ...datos };
  guardar();
}
export function borrarTodo() {
  estado = vacio();
  guardar();
}
