// Sincronización automática del progreso entre dispositivos.
// Cada dispositivo vinculado comparte un código; el progreso se guarda en el servicio bajo el SHA-256 del código.
// Siempre se trae lo remoto, se FUSIONA con lo local (gana lo más reciente por pregunta) y se vuelve a subir,
// así que nunca se pisa lo de otro dispositivo. Sin conexión no hace nada y lo intenta cuando vuelve.
import * as store from './store.js';
import { SYNC_URL } from './config.js';

const LS = 'estudani.sync';
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I
const ESPERA = 15000; // tras cambiar algo, se sube a los 15 s
const MINIMO = 20000; // y nunca más de una vez cada 20 s

let cfg = leer();
let temporizador = null;
let enCurso = null;
let ultimoIntento = 0;
const oyentes = new Set();

function leer() {
  try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; }
}
function guardarCfg() {
  try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch { /* sin almacenamiento */ }
  oyentes.forEach((f) => f());
}

export const disponible = () => !!SYNC_URL;
export const activo = () => disponible() && !!cfg.code;
export const codigo = () => cfg.code || '';
export const estado = () => ({ ultima: cfg.ultima || null, error: cfg.error || '', sincronizando: !!enCurso });
export const alCambiar = (f) => { oyentes.add(f); return () => oyentes.delete(f); };

export const normalizar = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const formatear = (c) => normalizar(c).replace(/(.{4})(?=.)/g, '$1-');

export function nuevoCodigo() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return formatear([...b].map((x) => ALFABETO[x % ALFABETO.length]).join(''));
}

async function idDe(c) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`estudani:${normalizar(c)}`));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function traer(c) {
  const r = await fetch(`${SYNC_URL}/sync/${await idDe(c)}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`El servicio respondió ${r.status}`);
  return r.text();
}
async function subir(c) {
  const r = await fetch(`${SYNC_URL}/sync/${await idDe(c)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: store.exportar() });
  if (!r.ok) throw new Error(`No se pudo guardar (${r.status})`);
}

// Trae, fusiona y sube. Devuelve cuántas preguntas cambiaron por lo traído.
export function sincronizar() {
  if (!activo()) return Promise.resolve(null);
  if (enCurso) return enCurso;
  ultimoIntento = Date.now();
  clearTimeout(temporizador);
  enCurso = (async () => {
    try {
      const remoto = await traer(cfg.code);
      let r = { nuevas: 0, actualizadas: 0 };
      if (remoto) r = store.fusionar(remoto, { silencioso: true });
      await subir(cfg.code);
      cfg.ultima = Date.now();
      cfg.error = '';
      return r;
    } catch (e) {
      cfg.error = navigator.onLine === false ? 'Sin conexión: se sincronizará cuando vuelva.' : 'No se pudo sincronizar. Se reintentará.';
      return null;
    } finally {
      enCurso = null;
      guardarCfg();
    }
  })();
  oyentes.forEach((f) => f());
  return enCurso;
}

function programar() {
  if (!activo() || enCurso) return;
  clearTimeout(temporizador);
  const espera = Math.max(ESPERA, MINIMO - (Date.now() - ultimoIntento));
  temporizador = setTimeout(sincronizar, espera);
}

// Crea un código nuevo en este dispositivo y sube lo que hay.
export async function activar() {
  cfg = { code: nuevoCodigo(), ultima: null, error: '' };
  guardarCfg();
  await sincronizar();
  return cfg.code;
}
// Vincula este dispositivo con un código que ya existe (creado en otro). Falla si el código no se encuentra.
export async function vincular(texto) {
  const c = formatear(texto);
  if (normalizar(c).length !== 12) throw new Error('El código tiene 12 letras y números, por ejemplo K7M2-P9QX-4TWD.');
  let remoto;
  try { remoto = await traer(c); } catch { throw new Error('No hay conexión con el servicio. Inténtalo con internet.'); }
  if (remoto === null) throw new Error('No he encontrado ese código. Revísalo o créalo de nuevo en el otro dispositivo.');
  cfg = { code: c, ultima: null, error: '' };
  guardarCfg();
  await sincronizar();
  return c;
}
export function desvincular() {
  clearTimeout(temporizador);
  cfg = {};
  guardarCfg();
}

export function iniciar() {
  if (!disponible()) return;
  store.alCambiar(() => { if (!enCurso) programar(); });
  document.addEventListener('visibilitychange', () => { if (activo() && Date.now() - ultimoIntento > 5000) sincronizar(); });
  window.addEventListener('online', () => sincronizar());
  setTimeout(() => sincronizar(), 1500);
}
