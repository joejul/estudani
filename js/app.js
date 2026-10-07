import * as store from './store.js';
import { esc, fmt, plano, setGlosario } from './markup.js';
import { icHtml } from './iconos.js';
import { normalizaTema } from './normaliza.js';
import * as autoglos from './autoglos.js';
import { mapaSvg, ramaHtml, conexionesHtml, hubHtml, leyendaHub, esquemaHtml } from './visual.js';

const $ = (s, r = document) => r.querySelector(s);
const top = $('#top');
const view = $('#view');
const tabs = $('#tabs');
const sheet = $('#sheet');

const D = { examen: null, temas: null, glos: [], glosMap: {}, tema: {}, preguntas: [], qById: {}, hubs: [], hubById: {} };
let S = null; // sesión de test activa
let reloj = null;

const OBJETIVO_EXAMEN = new Date(2027, 4, 1); // 1-may-2027: estimación, la fecha oficial aún no existe

// ---------------------------------------------------------------- datos
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

async function init() {
  try {
    const [temas, glos] = await Promise.all([getJSON('data/temas.json'), getJSON('data/glosario.json')]);
    D.temas = temas;
    D.glos = glos;
    await Promise.all(
      temas.temas.filter((t) => t.archivo).map(async (t) => {
        D.tema[t.n] = await getJSON(`data/${t.archivo}`);
        if (t.visual) D.tema[t.n].visual = await getJSON(`data/${t.visual}`);
        normalizaTema(D.tema[t.n]);
      })
    );
    // cada tema puede traer sus propios términos de glosario: [id, término, definición, ref?, trampa?]
    Object.values(D.tema).forEach((t) => ((t.visual && t.visual.glosario) || []).forEach((g) => {
      const x = Array.isArray(g) ? { id: g[0], termino: g[1], def: g[2], ref: g[3] || '', ...(g[4] ? { trampa: g[4] } : {}) } : g;
      if (!D.glos.some((y) => y.id === x.id)) D.glos.push(x);
    }));
    try { D.leyes = await getJSON('data/leyes.json'); D.zgz = await getJSON('data/zaragoza.json'); } catch { D.leyes = {}; D.zgz = {}; }
    D.glosMap = Object.fromEntries(D.glos.map((g) => [g.id, g]));
    setGlosario(D.glos);
    autoglos.construir(D.glos);
    // cada pregunta nueva («lx artículo») hereda el epígrafe de la ficha que la explica y muestra su referencia legible
    const epiPorArt = {};
    Object.values(D.tema).forEach((t) => t.epigrafes.forEach((e) => (e.articulos || []).forEach((a) => { epiPorArt[`${t.n}:${a.lx}:${a.n}`] = e.id; })));
    Object.values(D.tema).forEach((t) => {
      t.preguntas = t.preguntas.filter((q) => !q.off && !store.esOculta(q.id)).map((q) => {
        const r = { ...q, tema: t.n };
        if (q.lx) {
          r.epi = q.epi || epiPorArt[`${t.n}:${q.lx}:${q.art}`];
          const ley = (D.leyes[q.lx] && D.leyes[q.lx].corto) || q.lx;
          r.ref = `${etiquetaArt(q.art).replace(/^Art\. .*/, `Art. ${q.artTxt}`)} · ${ley}`;
        }
        return r;
      });
    });
    D.preguntas = Object.values(D.tema).flatMap((t) => t.preguntas);
    D.qById = Object.fromEntries(D.preguntas.map((q) => [q.id, q]));
    D.hubs = Object.values(D.tema).flatMap((t) => ((t.visual && t.visual.hubs) || []).map((h) => ({ ...h, tema: t.n })));
    D.hubById = Object.fromEntries(D.hubs.map((h) => [h.id, h]));
    await cargarExamen();
  } catch (e) {
    view.innerHTML = `<div class="card"><h2>No se pudo cargar el contenido</h2><p class="muted">${esc(e.message)}</p><p>Comprueba la conexión y recarga la página.</p></div>`;
    return;
  }
  tabs.innerHTML = tabsHtml();
  window.addEventListener('hashchange', route);
  route();
}

async function cargarExamen() {
  try {
    const [e1, e2] = await Promise.all([getJSON('data/examen2025.json'), getJSON('data/examen2025-supuestos.json')]);
    const ok = (q, n) => q.c !== null && q.c !== undefined && q.o.length === n && q.o.every((o) => o.length > 1);
    const mk = (q, id, ref, extra = {}) => ({ id, tema: 0, tipo: 'real', dif: 3, q: q.q, o: q.o, c: q.c, e: q.e || '', ref, claves: [], ...extra });
    D.examen = {
      p1: e1.preguntas.filter((q) => !String(q.n).startsWith('R') && ok(q, 3)).map((q) => mk(q, `x25-${q.n}`, `Prueba oficial · pregunta ${q.n}`)),
      descartadas: e1.preguntas.filter((q) => !String(q.n).startsWith('R') && !ok(q, 3)).length,
      sup: e2.supuestos.map((sp, i) => ({
        titulo: sp.titulo,
        preguntas: sp.preguntas.filter((q) => ok(q, 4)).map((q) => mk(q, `x25s-${q.n}`, `Supuesto ${i + 1} · pregunta ${q.n}`, { contexto: sp.texto })),
      })),
    };
  } catch {
    D.examen = null; // el examen real es opcional
  }
}

const infoTema = (n) => D.temas.temas.find((t) => t.n === n);
const idsTema = (n) => (D.tema[n] ? D.tema[n].preguntas.map((q) => q.id) : []);
const todasIds = () => D.preguntas.map((q) => q.id);

// ---- qué entra en el repaso: lo estudiado o con progreso (o lo que el estudiante active a mano) ----
const epiDe = (q) => q.epi || (D.hubById[q.hub] && D.hubById[q.hub].epi);
function estadoTema(n) {
  const t = D.tema[n];
  const hechos = t.epigrafes.filter((e) => store.leccionHecha(n, e.id)).length;
  const visto = idsTema(n).some((id) => store.infoPregunta(id));
  return { hechos, total: t.epigrafes.length, estado: hechos === t.epigrafes.length ? 'completo' : hechos > 0 || visto ? 'progreso' : 'nuevo' };
}
function temaActivo(n) {
  const ov = store.repasoTema(n);
  return ov !== undefined ? ov : estadoTema(n).estado !== 'nuevo';
}
function elegible(q) {
  const ov = store.repasoTema(q.tema);
  if (ov === false) return false;
  if (ov === true) return true;
  const e = epiDe(q);
  return !!store.infoPregunta(q.id) || !!(e && store.leccionHecha(q.tema, e));
}
const idsRepaso = () => D.preguntas.filter(elegible).map((q) => q.id);
function hubElegible(h) {
  const ov = store.repasoTema(h.tema);
  if (ov === false) return false;
  if (ov === true) return true;
  return !!store.infoPregunta(`a:${h.id}`) || store.leccionHecha(h.tema, h.epi);
}
// ---- dominio por tema: cuánto sabe de lo que ya ha estudiado (0-100) ----
// Cada pregunta vale según su caja de repaso (acertada varias veces = más); fallada o sin ver = 0.
const puntosPregunta = (id) => {
  const p = store.infoPregunta(id);
  return p && p.last === 'ok' ? Math.min(p.box, 4) / 4 : 0;
};
function dominioTemas() {
  return Object.keys(D.tema)
    .map(Number)
    .filter(temaActivo)
    .map((n) => {
      const ids = D.tema[n].preguntas.filter(elegible).map((q) => q.id);
      const vistas = ids.filter((id) => store.infoPregunta(id)).length;
      const pct = ids.length ? Math.round((ids.reduce((a, id) => a + puntosPregunta(id), 0) / ids.length) * 100) : 0;
      const nivel = vistas < 3 ? 'nuevo' : pct >= 70 ? 'alto' : pct >= 40 ? 'medio' : 'bajo';
      return { n, pct, vistas, total: ids.length, nivel, ids };
    })
    .filter((d) => d.total)
    .sort((a, b) => a.pct - b.pct);
}
const NIVEL = { nuevo: ['Sin practicar', '⚪'], bajo: ['Flojo', '🔴'], medio: ['En camino', '🟡'], alto: ['Dominado', '🟢'] };
// los temas que más conviene reforzar: los 3 de menor dominio (salvo los ya dominados, si hay otros)
function temasDebiles() {
  const d = dominioTemas();
  const flojos = d.filter((x) => x.nivel !== 'alto');
  return (flojos.length ? flojos : d).slice(0, 3);
}
function dominioHtml(completo) {
  const d = dominioTemas();
  if (!d.length) return '';
  const deb = temasDebiles();
  const fila = (x) => `<a class="dom-fila" href="#/tema/${x.n}"><span class="dom-t">${icHtml(infoTema(x.n).titulo, infoTema(x.n).ic)}<b>Tema ${x.n}</b> <span class="muted">${esc(infoTema(x.n).titulo)}</span></span>
      <span class="dom-b d-${x.nivel}"><span style="width:${Math.max(x.pct, 3)}%"></span></span>
      <small class="dom-n">${NIVEL[x.nivel][1]} ${x.nivel === 'nuevo' ? NIVEL[x.nivel][0] : `${x.pct}% · ${NIVEL[x.nivel][0]}`}${x.vistas ? ` · ${x.vistas}/${x.total} vistas` : ''}</small></a>`;
  return `<section class="card"><h3>${completo ? '📈 Tu dominio por tema' : '🎯 Te conviene reforzar'}</h3>
    <p class="tiny muted">${completo ? 'Según tus respuestas en lo que ya has estudiado. Un fallo o una pregunta sin ver cuenta 0; cada acierto seguido sube.' : 'Los temas donde menos aciertas ahora mismo.'}</p>
    <div class="dom-lista">${(completo ? d : deb).map(fila).join('')}</div>
    <button class="btn primary" data-act="empezar" data-modo="refuerzo">Reforzar ${deb.map((x) => 'T' + x.n).join(' · ')}</button>
    ${completo ? '' : '<a class="link" href="#/repaso">Ver todos los temas</a>'}</section>`;
}
const nTemasRepaso = () => Object.keys(D.tema).filter((n) => temaActivo(+n)).length;

// ---------------------------------------------------------------- utilidades
function barajar(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function ir(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function aviso(texto) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

const num = (x) => x.toFixed(2).replace('.', ',');

const fmtTiempo = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- enrutado
function route() {
  clearInterval(reloj);
  const [a, b, c, d] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  let v;
  if (!a) v = vistaInicio();
  else if (a === 'temas') v = vistaTemas();
  else if (a === 'tema') v = b ? vistaTema(+b, c, d) : vistaTemas();
  else if (a === 'repaso') v = vistaRepaso();
  else if (a === 'quiz') v = vistaQuiz();
  else if (a === 'glosario') v = vistaGlosario(b);
  else if (a === 'ajustes') v = vistaAjustes();
  else if (a === 'guia') v = vistaGuia();
  else v = vistaInicio();
  montar(v);
}

function montar(v, { conservarScroll = false } = {}) {
  top.innerHTML = `<div class="bar">${
    v.volver ? `<a class="back" href="${v.volver}" aria-label="Volver">‹</a>` : '<span class="back-space"></span>'
  }<h1>${esc(v.titulo)}</h1><span class="bar-right">${v.derecha || ''}</span></div>`;
  view.innerHTML = v.html;
  tabs.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === v.tab));
  tabs.hidden = !!v.sinTabs;
  if (!conservarScroll) window.scrollTo(0, 0);
  if (!v.sinGlosario) autoglos.enlazar(view);
  if (v.despues) v.despues();
}

function tabsHtml() {
  const icono = (p) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const items = [
    ['inicio', '#/', 'Inicio', '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'],
    ['temas', '#/temas', 'Temas', '<path d="M4 5h16M4 12h16M4 19h10"/>'],
    ['repaso', '#/repaso', 'Test', '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>'],
    ['glosario', '#/glosario', 'Glosario', '<path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M8 8h8M8 12h8"/>'],
    ['ajustes', '#/ajustes', 'Más', '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'],
  ];
  return items.map(([id, href, txt, p]) => `<a href="${href}" data-tab="${id}">${icono(p)}<span>${txt}</span></a>`).join('');
}

// ---------------------------------------------------------------- inicio
const guiaVista = () => { try { return localStorage.getItem('estudani.guia') === '1'; } catch { return false; } };

function vistaInicio() {
  const ids = todasIds();
  const rep = idsRepaso();
  const pend = store.pendientesHoy(rep).length;
  const nuevas = Math.min(store.nuevas(rep).length, 10);
  const r = store.resumen(ids);
  const dias = Math.max(0, Math.ceil((OBJETIVO_EXAMEN - new Date()) / 86400000));
  const abiertos = Object.values(D.tema).sort((a, b) => a.n - b.n);
  const t1 = abiertos.find((t) => t.epigrafes.some((e) => !store.leccionHecha(t.n, e.id))) || abiertos[abiertos.length - 1];
  const hechas = t1.epigrafes.filter((e) => store.leccionHecha(t1.n, e.id)).length;
  const sig = t1.epigrafes.find((e) => !store.leccionHecha(t1.n, e.id));
  const racha = store.racha();
  const esIOS = /iphone|ipad/i.test(navigator.userAgent);
  const instalada = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  let ocultarInstalar = false;
  try {
    ocultarInstalar = localStorage.getItem('estudani.instalar') === '1';
  } catch {}

  const html = `
    <section class="hero">
      <p class="eyebrow">Auxiliar Administrativo · Zaragoza</p>
      <h2>Hola, Dani 👋</h2>
      <p class="muted">Faltan unos <strong>${dias} días</strong> para el objetivo de mayo de 2027 <span class="tiny">(fecha oficial por confirmar)</span>.</p>
    </section>

    ${guiaVista() ? '' : `<section class="card tip"><h3>👋 ¿Primera vez?</h3><p>En 3 minutos te explico para qué sirve cada parte de la app y cómo estudiar con ella cada día.</p><a class="btn primary" href="#/guia">Cómo usar EstuDani</a></section>`}
    ${store.hayProgreso() && (store.diasDesdeCopia() === null || store.diasDesdeCopia() > 14) ? `<section class="card tip"><p><strong>Guarda una copia de tu progreso</strong>: ${store.diasDesdeCopia() === null ? 'aún no tienes ninguna' : `hace ${store.diasDesdeCopia()} días de la última`}. <a href="#/ajustes">Hacerlo ahora</a></p></section>` : ''}
    ${esIOS && !instalada && !ocultarInstalar ? `<section class="card tip"><p><strong>Instálala en tu iPhone</strong>: en Safari toca <em>Compartir</em> <span aria-hidden="true">⎙</span> y luego <em>Añadir a pantalla de inicio</em>. Funcionará sin conexión.</p><button class="link" data-act="ocultar-instalar">Entendido</button></section>` : ''}

    <section class="card">
      <h3>Repaso de hoy</h3>
      <p class="big">${pend}<span class="muted"> pendientes</span> · ${nuevas}<span class="muted"> nuevas</span></p>
      <p class="tiny muted">${nTemasRepaso() ? `De ${nTemasRepaso()} tema${nTemasRepaso() > 1 ? 's' : ''} que has estudiado o empezado.` : 'Marca un epígrafe como estudiado para empezar a repasar.'}</p>
      <button class="btn primary" data-act="empezar" data-modo="repaso" ${pend + nuevas === 0 ? 'disabled' : ''}>${pend + nuevas === 0 ? (nTemasRepaso() ? 'Todo al día 🎉' : 'Aún no hay nada que repasar') : 'Empezar repaso'}</button>
    </section>

    ${dominioHtml(false)}

    <section class="card">
      <h3>${sig ? 'Sigue donde lo dejaste' : `Tema ${t1.n} completado`}</h3>
      <p class="muted">Tema ${t1.n} · ${esc(t1.titulo)}</p>
      <div class="bar-prog" role="progressbar" aria-valuenow="${hechas}" aria-valuemax="${t1.epigrafes.length}"><span style="width:${(hechas / t1.epigrafes.length) * 100}%"></span></div>
      <p class="tiny muted">${hechas} de ${t1.epigrafes.length} epígrafes estudiados</p>
      <a class="btn" href="${sig ? `#/tema/${t1.n}/e/${sig.id}` : `#/tema/${t1.n}/test`}">${sig ? `Continuar: ${esc(sig.titulo)}` : 'Hacer el test del tema'}</a>
    </section>

    <section class="grid3">
      <div class="stat"><b>${racha}</b><span>días seguidos</span></div>
      <div class="stat"><b>${store.hoyContestadas()}</b><span>respondidas hoy</span></div>
      <div class="stat"><b>${r.precision === null ? '–' : r.precision + '%'}</b><span>acierto</span></div>
    </section>

    <section class="card note">
      <p class="tiny muted">En el examen <strong>los errores restan</strong> y dejar en blanco no resta. Aquí tienes el botón «No contesto» para entrenar esa decisión. Penalización actual: <strong>${esc(store.PENALIZACIONES[store.getAjustes().penalizacion].etiqueta)}</strong> <a href="#/ajustes">(cambiar)</a>.</p>
    </section>
    <p class="tiny" style="text-align:center"><a href="#/guia">📘 Cómo usar la app</a> · <button class="link" data-act="reportar">⚑ Reportar un problema</button></p>`;
  return { titulo: 'EstuDani', tab: 'inicio', html };
}

// ---------------------------------------------------------------- temas
function vistaTemas() {
  const bloques = D.temas.bloques
    .map((b) => {
      const filas = b.temas
        .map((n) => {
          const t = infoTema(n);
          const ok = !!D.tema[n];
          const etiqueta = n === 21 ? 'P' : n;
          const pct = ok ? store.resumen(idsTema(n)) : null;
          return `<${ok ? `a href="#/tema/${n}"` : 'div'} class="fila ${ok ? '' : 'off'}">
            <span class="num ${t.practica ? 'prac' : ''}">${etiqueta}</span>
            <span class="fila-t"><strong>${icHtml(t.titulo, t.ic)}${esc(t.titulo)}</strong><small>${esc(t.resumen)}</small></span>
            <span class="fila-r">${ok ? (pct.precision === null ? 'Empezar ›' : pct.precision + '% ›') : 'Próximamente'}</span>
          </${ok ? 'a' : 'div'}>`;
        })
        .join('');
      return `<h3 class="bloque">Bloque ${b.id} · ${esc(b.titulo)}</h3><div class="lista">${filas}</div>`;
    })
    .join('');
  return {
    titulo: 'Temario',
    tab: 'temas',
    html: `<p class="muted tiny">${esc(D.temas.oposicion)}<br>Fuente: ${esc(D.temas.fuenteTemario)}.</p>${bloques}`,
  };
}

// ---------------------------------------------------------------- tema
function vistaTema(n, seccion, extra) {
  const t = D.tema[n];
  if (!t) {
    const i = infoTema(n);
    return { titulo: i ? `Tema ${n}` : 'Tema', volver: '#/temas', tab: 'temas', html: `<div class="card"><h3>Próximamente</h3><p class="muted">Este tema se construirá cuando validemos el formato del Tema 1.</p></div>` };
  }
  const base = `#/tema/${n}`;
  const activa = seccion === 'esquema' ? 'mapa' : !seccion || seccion === 'e' ? 'leccion' : seccion;
  const sub = (id, txt) => `<a href="${base}/${id}" class="${activa === id ? 'on' : ''}">${txt}</a>`;
  const subtabs = `<nav class="subtabs">${sub('leccion', 'Lección')}${sub('mapa', 'Mapa')}${sub('asociar', 'Asociar')}${sub('test', 'Test')}</nav>`;
  if (seccion === 'e') {
    const r = vistaEpigrafe(n, extra);
    if (r) return r;
  }
  let cuerpo;
  let volver = '#/temas';
  if (seccion === 'mapa') { cuerpo = cuerpoMapa(n, t, extra); if (extra !== undefined) volver = `${base}/mapa`; }
  else if (seccion === 'esquema') cuerpo = cuerpoEsquema(n, t);
  else if (seccion === 'asociar') { cuerpo = cuerpoAsociar(n, t, extra); if (extra !== undefined) volver = `${base}/asociar`; }
  else if (seccion === 'test') cuerpo = cuerpoTestTema(n, t);
  else cuerpo = cuerpoLeccion(n, t);
  return { titulo: `Tema ${n}`, volver, tab: 'temas', html: `<header class="tema-h"><h2>${esc(t.titulo)}</h2><p class="tiny muted">Fuente verificada el ${esc(t.verificado)}</p></header>${subtabs}${cuerpo}` };
}

function cuerpoLeccion(n, t) {
  const items = t.epigrafes
    .map((e, i) => {
      const hecho = store.leccionHecha(n, e.id);
      const nq = t.preguntas.filter((q) => q.epi === e.id).length;
      return `<a class="fila" href="#/tema/${n}/e/${e.id}">
        <span class="num ${hecho ? 'hecho' : ''}">${hecho ? '✓' : i + 1}</span>
        <span class="fila-t"><strong>${icHtml(e.titulo, e.ic)}${esc(e.titulo)}</strong><small>${esc(e.subtitulo)} · ${nq} preguntas</small></span>
        <span class="fila-r">›</span></a>`;
    })
    .join('');
  return `<div class="lista">${items}</div>
    <p class="tiny muted">Cada epígrafe: explicación desde cero → conceptos clave → ejemplo → trampa → tarjetas de memoria → test.</p>`;
}

// «Artículo por artículo»: ficha plegable con la etiqueta corta, el texto oficial literal, la explicación sencilla
// y una pregunta mental (+ marcas ⭐ preguntado en Zaragoza / 🟠 añadido para cobertura 2026)
const etiquetaArt = (n) => {
  const m = /^D([ATFD])(\d+)$/.exec(String(n));
  return m ? `Disp. ${{ A: 'adicional', T: 'transitoria', F: 'final', D: 'derogatoria' }[m[1]]} ${m[2]}.ª` : `Art. ${n}`;
};
function articulosHtml(e) {
  if (!e.articulos || !e.articulos.length) return '';
  const lineas = (x) => String(x).split('\n').map((l) => `<p>${fmt(l)}</p>`).join('');
  const ficha = (a) => {
    const ley = (D.leyes || {})[a.lx] || {};
    const oficial = ley.arts && ley.arts[a.n];
    const zs = (D.zgz || {})[`${a.lx}:${a.n}`] || [];
    return `<details class="art ${zs.length ? 'zgz' : ''}"><summary><span class="art-n">${esc(etiquetaArt(a.n))}</span><b>${esc(a.ref)}</b>${zs.length ? '<span class="art-b" title="Preguntado en Zaragoza">⭐</span>' : ''}${a.add === 1 ? '<span class="art-b" title="Añadido para cobertura 2026">🟠</span>' : ''}</summary>
      <p class="art-ley">${esc(ley.corto || a.lx)}</p>
      ${oficial ? `<div class="art-of"><h4>📜 Texto oficial</h4>${oficial.split('\n').map((l, i) => (i === 0 ? `<p><b>${esc(l)}</b></p>` : `<p>${esc(l)}</p>`)).join('')}<p class="tiny muted">Texto consolidado vigente · ${esc(ley.nombre)}</p></div>` : '<p class="tiny muted">El texto oficial de este artículo no está incluido aún.</p>'}
      ${a.txt ? `<div class="art-t"><h4>✅ Lo esencial</h4>${lineas(a.txt)}</div>` : ''}
      <p class="art-i"><b>🧠 En sencillo:</b> ${fmt(a.int)}</p>
      <p class="art-q"><b>💭 Pregunta mental:</b> ${fmt(a.preg)}</p>
      ${zs.map((z) => `<p class="art-z">⭐ PREGUNTADO EN ZARAGOZA — ${esc(z)} · ${esc(ley.corto || '')}, ${esc(etiquetaArt(a.n).toLowerCase())}</p>`).join('')}
      ${a.add === 1 ? '<p class="art-add">🟠 AÑADIDO PARA COBERTURA 2026</p>' : ''}${a.add === 'z' ? '<p class="art-add">⭐ AÑADIDO POR HABER SIDO PREGUNTADO EN ZARAGOZA</p>' : ''}
    </details>`;
  };
  return `<section class="arts"><h3>📚 Artículo por artículo</h3>
    <p class="tiny muted">Toca un artículo para abrirlo. ⭐ = ya se preguntó en un examen de Zaragoza.</p>
    ${e.articulos.map(ficha).join('')}</section>`;
}

function vistaEpigrafe(n, id) {
  const t = D.tema[n];
  const i = t.epigrafes.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const e = t.epigrafes[i];
  const hecho = store.leccionHecha(n, id);
  const prev = t.epigrafes[i - 1];
  const next = t.epigrafes[i + 1];
  const nq = t.preguntas.filter((q) => q.epi === id).length;
  const html = `
    <article class="epi">
      <p class="eyebrow">Tema ${n} · epígrafe ${i + 1} de ${t.epigrafes.length}</p>
      <h2>${icHtml(e.titulo, e.ic)}${esc(e.titulo)}</h2>
      <p class="muted">${esc(e.subtitulo)}</p>
      <section class="card dominar"><h3>Debes dominar</h3><ul class="chips">${e.clave.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>
      ${e.bloques.map(bloqueHtml).join('')}
      ${hubsDeEpi(n, id)}
      ${articulosHtml(e)}
      <details class="card esq"><summary>Esquema para repasar</summary><ul>${e.esquema.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul></details>
      <section class="flashes"><h3>Antes de seguir: ¿lo recuerdas?</h3><p class="tiny muted">Intenta responder en tu cabeza y luego toca la tarjeta.</p>
        ${e.flash.map((f) => `<button class="flash" data-act="flash"><span class="fq">${fmt(f.q)}</span><span class="fa">${fmt(f.a)}</span></button>`).join('')}
      </section>
      <div class="acciones">
        <button class="btn ${hecho ? '' : 'primary'}" data-act="hecho" data-tema="${n}" data-epi="${id}">${hecho ? '✓ Estudiado (deshacer)' : 'Marcar como estudiado'}</button>
        <button class="btn" data-act="empezar" data-modo="epi" data-tema="${n}" data-epi="${id}">Test de este epígrafe (${nq})</button>
      </div>
      <div class="pager">
        ${prev ? `<a href="#/tema/${n}/e/${prev.id}">‹ ${esc(prev.titulo)}</a>` : '<span></span>'}
        ${next ? `<a href="#/tema/${n}/e/${next.id}">${esc(next.titulo)} ›</a>` : `<a href="#/tema/${n}/test">Ir al test del tema ›</a>`}
      </div>
      <p class="tiny"><button class="link" data-act="reportar" data-ctx="Tema ${n} · ${esc(e.titulo)}">⚑ ¿Algo no cuadra en este epígrafe? Reportar</button></p>
    </article>`;
  return { titulo: `Tema ${n}`, volver: `#/tema/${n}`, tab: 'temas', html };
}

function hubsDeEpi(n, epi) {
  const hs = D.hubs.filter((h) => h.tema === n && h.epi === epi);
  if (!hs.length) return '';
  return `<section class="card ideas"><h3>Mapas de ideas de este epígrafe</h3><p class="tiny muted">Palabras-pista que te llevan a cada idea.</p>${hs.map((h) => `<a class="chip-a" href="#/tema/${n}/asociar/${h.id}">${icHtml(h.titulo, h.ic)}${esc(h.titulo)} ›</a>`).join('')}</section>`;
}

function bloqueHtml(b) {
  switch (b.t) {
    case 'p': return `<p>${fmt(b.x)}</p>`;
    case 'h': return `<h3 class="sub">${fmt(b.x)}</h3>`;
    case 'lista': return `<ul class="lst">${b.items.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`;
    case 'key': return `<div class="callout key"><b>Clave</b><p>${fmt(b.x)}</p></div>`;
    case 'ejemplo': return `<div class="callout ej"><b>Ejemplo</b><p>${fmt(b.x)}</p></div>`;
    case 'trampa': return `<div class="callout tr"><b>⚠ Trampa</b><p>${fmt(b.x)}</p></div>`;
    case 'tabla':
      return `<div class="tbl"><table><thead><tr>${b.cols.map((c) => `<th>${fmt(c)}</th>`).join('')}</tr></thead><tbody>${b.filas
        .map((r) => `<tr>${r.map((c, k) => `<td data-label="${esc(plano(b.cols[k] || ''))}">${fmt(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
    default: return '';
  }
}

// ---------------------------------------------------------------- mapa y esquema
const segHtml = (n, activo) =>
  `<div class="seg"><a href="#/tema/${n}/mapa" class="${activo === 'mapa' ? 'on' : ''}">Mapa</a><a href="#/tema/${n}/esquema" class="${activo === 'esquema' ? 'on' : ''}">Esquema</a></div>`;

function cuerpoMapa(n, t, extra) {
  const m = t.mapa;
  const i = extra !== undefined ? +extra : -1;
  if (i >= 0 && m.ramas[i]) {
    const ids = ((t.visual && t.visual.mapaEpis) || [])[i] || [];
    const epis = ids.map((id) => t.epigrafes.find((e) => e.id === id)).filter(Boolean);
    return ramaHtml(m.ramas[i], i, m.ramas.length, `#/tema/${n}/mapa/`, epis, (id) => `#/tema/${n}/e/${id}`);
  }
  return `${segHtml(n, 'mapa')}
    <p class="tiny muted">Toca una rama para abrirla. Cuando la domines, usa «Modo recordar» dentro de ella.</p>
    <div class="mm-wrap">${mapaSvg(m, `#/tema/${n}/mapa/`)}</div>
    <h3 class="sub">Conexiones entre ideas</h3>${conexionesHtml(m.conexiones)}`;
}

function cuerpoEsquema(n, t) {
  const texto = t.epigrafes
    .map((e, i) => `<section class="card"><h3>${i + 1}. ${esc(e.titulo)}</h3><ul class="lst">${e.esquema.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul></section>`)
    .join('');
  if (!t.visual || !t.visual.esquema) return segHtml(n, 'esquema') + texto;
  return `${segHtml(n, 'esquema')}
    <p class="tiny muted">Diagramas para ver de un vistazo lo que hay que memorizar. Cada uno enlaza con su lección.</p>
    ${esquemaHtml(t.visual.esquema, n)}
    <details class="card"><summary>Versión en texto</summary>${texto}</details>`;
}

// ---------------------------------------------------------------- mapas de ideas (asociar)
function estadoHub(id) {
  const p = store.infoPregunta(`a:${id}`);
  if (!p) return 'nuevo';
  return p.box >= 4 ? 'ok' : p.last === 'ok' ? 'medio' : 'fallo';
}

function cuerpoAsociar(n, t, id) {
  const hubs = D.hubs.filter((h) => h.tema === n);
  if (!hubs.length) return '<div class="card"><p class="muted">Este tema aún no tiene mapas de ideas.</p></div>';
  const i = id ? hubs.findIndex((h) => h.id === id) : -1;
  if (i >= 0) {
    const h = hubs[i];
    const nq = D.preguntas.filter((q) => q.hub === h.id).length;
    const e = t.epigrafes.find((x) => x.id === h.epi);
    const prev = hubs[i - 1];
    const next = hubs[i + 1];
    return `<a class="rama-volver" href="#/tema/${n}/asociar">‹ Todas las ideas</a>
      <div class="mm-tools"><button class="btn small" data-act="mm-recordar" aria-pressed="false">Modo recordar</button></div>
      <p class="tiny muted">Pista → idea: cuando leas estas palabras en una pregunta, piensa en «${esc(h.titulo)}».</p>
      <div id="mm">${hubHtml(h)}</div>${leyendaHub()}
      <div class="acciones">
        ${nq ? `<button class="btn primary" data-act="empezar" data-modo="hub" data-hub="${h.id}" data-tema="${n}">Preguntas de esta idea (${nq})</button>` : ''}
        ${e ? `<a class="btn" href="#/tema/${n}/e/${e.id}">Ver la lección: ${esc(e.titulo)}</a>` : ''}
      </div>
      <div class="pager">${prev ? `<a href="#/tema/${n}/asociar/${prev.id}">‹ ${esc(prev.titulo)}</a>` : '<span></span>'}${next ? `<a href="#/tema/${n}/asociar/${next.id}">${esc(next.titulo)} ›</a>` : '<span></span>'}</div>`;
  }
  const ids = hubs.map((h) => `a:${h.id}`);
  const pend = store.pendientesHoy(ids).length;
  const nuevas = store.nuevas(ids).length;
  const filas = hubs
    .map((h, k) => `<a class="fila" href="#/tema/${n}/asociar/${h.id}"><span class="num">${k + 1}</span><span class="fila-t"><strong>${icHtml(h.titulo, h.ic)}${esc(h.titulo)}</strong><small>${esc(h.resumen)}</small></span><span class="fila-r"><i class="dot d-${estadoHub(h.id)}" title="${estadoHub(h.id)}"></i> ›</span></a>`)
    .join('');
  return `<section class="card"><h3>Asocia palabras con ideas</h3>
      <p class="muted">En el examen, unas pocas palabras de la pregunta (<em>«extraordinaria y urgente necesidad»</em>) te llevan a una idea (<em>decreto-ley</em>). Aquí construyes esos atajos.</p>
      <p class="tiny muted">${hubs.length} ideas · ${pend} para repasar hoy · ${nuevas} sin empezar</p>
      <button class="btn primary" data-act="empezar" data-modo="asociar" data-tema="${n}">Entrenar asociaciones (10)</button></section>
    ${leyendaHub()}
    <div class="lista">${filas}</div>
    <p class="tiny muted">● verde: dominada · ● amarillo: en proceso · ● coral: fallada · ○ sin empezar</p>`;
}

// ---------------------------------------------------------------- test del tema
function cuerpoTestTema(n, t) {
  const total = t.preguntas.length;
  const trampas = t.preguntas.filter((q) => q.tipo === 'trampa').length;
  const altas = t.preguntas.filter((q) => q.dif >= 3).length;
  const fallos = store.falladas(idsTema(n)).length;
  const r = store.resumen(idsTema(n));
  const porEpi = t.epigrafes
    .map((e, i) => {
      const nq = t.preguntas.filter((q) => q.epi === e.id).length;
      return `<button class="fila" data-act="empezar" data-modo="epi" data-tema="${n}" data-epi="${e.id}"><span class="num">${i + 1}</span><span class="fila-t"><strong>${icHtml(e.titulo, e.ic)}${esc(e.titulo)}</strong><small>${nq} preguntas</small></span><span class="fila-r">›</span></button>`;
    })
    .join('');
  return `
    <section class="card"><h3>Todo el tema</h3>
      <p class="muted">${total} preguntas · ${trampas} trampa · ${r.vistas} vistas · ${r.precision === null ? 'sin datos' : r.precision + '% de acierto'}</p>
      <button class="btn primary" data-act="empezar" data-modo="tema" data-tema="${n}">Test completo (${total})</button>
      <div class="acciones">
        <button class="btn" data-act="empezar" data-modo="trampas" data-tema="${n}">Solo preguntas trampa (${trampas})</button>
        <button class="btn" data-act="empezar" data-modo="dificiles" data-tema="${n}" ${altas ? '' : 'disabled'}>Solo nivel alto (${altas})</button>
        <button class="btn" data-act="empezar" data-modo="fallos" data-tema="${n}" ${fallos ? '' : 'disabled'}>Mis fallos (${fallos})</button>
      </div>
    </section>
    <h3 class="sub">Por epígrafe</h3><div class="lista">${porEpi}</div>`;
}

// ---------------------------------------------------------------- hub de test / repaso
function selectorTemas() {
  const filas = Object.values(D.tema)
    .sort((a, b) => a.n - b.n)
    .map((t) => {
      const e = estadoTema(t.n);
      const elig = idsTema(t.n).filter((id) => elegible(D.qById[id]));
      const pendT = store.pendientesHoy(elig).length;
      const etq = e.estado === 'completo' ? 'Completo' : e.estado === 'progreso' ? `En progreso · ${e.hechos}/${e.total} epígrafes` : 'Sin empezar';
      const manual = store.repasoTema(t.n) !== undefined ? ' · manual' : '';
      return `<label class="sel-t"><input type="checkbox" data-act="toggle-tema" data-tema="${t.n}" ${temaActivo(t.n) ? 'checked' : ''} aria-label="Incluir el tema ${t.n} en el repaso">
        <span class="sel-x"><strong>${icHtml(t.titulo, infoTema(t.n).ic)}Tema ${t.n} · ${esc(t.titulo)}</strong><small>${etq}${pendT ? ` · ${pendT} pendientes` : ''}${manual}</small></span></label>`;
    })
    .join('');
  return `<section class="card"><h3>Temas del repaso</h3>
    <p class="muted">El «Repaso de hoy» solo pregunta lo que ya has estudiado: los epígrafes marcados como estudiados y las preguntas que ya has respondido. Activa o desactiva temas a mano cuando quieras.</p>
    <div class="sel-lista">${filas}</div>
    <button class="btn small" data-act="repaso-auto">Volver a automático</button></section>`;
}

function vistaRepaso() {
  const ids = todasIds();
  const rep = idsRepaso();
  const pend = store.pendientesHoy(rep).length;
  const nuevas = Math.min(store.nuevas(rep).length, 10);
  const fallos = store.falladas(ids).length;
  const trampas = D.preguntas.filter((q) => q.tipo === 'trampa').length;
  const altas = D.preguntas.filter((q) => q.dif >= 3).length;
  const html = `
    <section class="card"><h3>Repaso espaciado</h3>
      <p class="muted">Las preguntas vuelven justo cuando estás a punto de olvidarlas. Es lo que más rinde por minuto de estudio.</p>
      <p class="big">${pend}<span class="muted"> pendientes</span> · ${nuevas}<span class="muted"> nuevas</span></p>
      <button class="btn primary" data-act="empezar" data-modo="repaso" ${pend + nuevas === 0 ? 'disabled' : ''}>Repaso de hoy</button></section>
    ${dominioHtml(true)}
    ${selectorTemas()}
    <section class="card"><h3>Test rápido</h3><p class="muted">10 preguntas mezcladas, con corrección inmediata. Ideal para 5 minutos.</p>
      <button class="btn" data-act="empezar" data-modo="rapido">Empezar (10)</button></section>
    <section class="card"><h3>Simulacro tipo examen</h3><p class="muted">Sin corrección hasta el final, con cronómetro y <strong>penalización por fallo</strong>. Practica cuándo dejar en blanco.</p>
      <button class="btn" data-act="empezar" data-modo="simulacro">Simulacro (20)</button></section>
    ${D.examen ? `<section class="card examen"><h3>🎯 Prueba oficial real</h3>
      <p class="muted">Preguntas oficiales del Ayuntamiento con su plantilla de respuestas. Sin ayudas, con cronómetro y penalización.</p>
      <button class="btn primary" data-act="empezar" data-modo="examen">Parte 1 completa (${D.examen.p1.length} preguntas · 3 opciones)</button>
      <button class="btn" data-act="empezar" data-modo="examen20">Parte 1: 20 al azar</button>
      ${D.examen.sup.map((sp, i) => `<button class="btn" data-act="empezar" data-modo="supuesto" data-n="${i}">${esc(sp.titulo)} (${sp.preguntas.length})</button>`).join('')}
      ${D.examen.descartadas ? `<p class="tiny muted">${D.examen.descartadas} preguntas se han dejado fuera hasta revisar el texto escaneado.</p>` : ''}</section>` : ''}
    <section class="card"><h3>Asociar ideas</h3><p class="muted">Te damos 2 o 3 pistas y tú dices de qué idea son. Es el atajo mental que usarás en el examen.</p>
      <button class="btn" data-act="empezar" data-modo="asociar">Entrenar asociaciones (10)</button></section>
    <section class="card"><h3>Entrenar puntos débiles</h3>
      <div class="acciones">
        <button class="btn" data-act="empezar" data-modo="trampas">Solo trampas (${trampas})</button>
        <button class="btn" data-act="empezar" data-modo="dificiles">Solo nivel alto (${altas})</button>
        <button class="btn" data-act="empezar" data-modo="fallos" ${fallos ? '' : 'disabled'}>Mis fallos (${fallos})</button>
      </div></section>`;
  return { titulo: 'Test', tab: 'repaso', html };
}

// ---------------------------------------------------------------- motor de test
function empezar(modo, p = {}) {
  const n = p.tema ? +p.tema : null;
  const delTema = (q) => !n || q.tema === n;
  let pool = [];
  let titulo = 'Test';
  let inmediato = true;
  let volver = '#/repaso';
  let ordenar = false;
  if (modo === 'tema') { pool = D.preguntas.filter(delTema); titulo = `Tema ${n}`; volver = `#/tema/${n}/test`; }
  else if (modo === 'epi') { pool = D.preguntas.filter((q) => delTema(q) && q.epi === p.epi); titulo = `Tema ${n}`; volver = `#/tema/${n}/test`; }
  else if (modo === 'trampas') { pool = D.preguntas.filter((q) => delTema(q) && q.tipo === 'trampa'); titulo = 'Preguntas trampa'; volver = n ? `#/tema/${n}/test` : '#/repaso'; }
  else if (modo === 'dificiles') { pool = barajar(D.preguntas.filter((q) => delTema(q) && q.dif >= 3)).slice(0, 20); titulo = 'Nivel alto'; volver = n ? `#/tema/${n}/test` : '#/repaso'; }
  else if (modo === 'fallos') { const ids = new Set(store.falladas(todasIds())); pool = D.preguntas.filter((q) => ids.has(q.id) && delTema(q)); titulo = 'Mis fallos'; volver = n ? `#/tema/${n}/test` : '#/repaso'; }
  else if (modo === 'repaso') {
    const rep = idsRepaso();
    const debidas = store.pendientesHoy(rep).map((id) => D.qById[id]);
    const nuevas = barajar(store.nuevas(rep).map((id) => D.qById[id])).slice(0, 10);
    pool = [...barajar(debidas).slice(0, 30), ...nuevas];
    titulo = 'Repaso de hoy'; volver = '#/';
  }
  else if (modo === 'refuerzo') {
    const flojos = new Set(temasDebiles().map((x) => x.n));
    const hoyDue = new Set(store.pendientesHoy(todasIds()));
    const rango = (q) => {
      const i = store.infoPregunta(q.id);
      return !i ? 2 : i.last !== 'ok' ? 0 : hoyDue.has(q.id) ? 1 : 3;
    };
    // primero lo fallado, luego lo que toca repasar, luego lo que aún no ha visto
    pool = barajar(D.preguntas.filter((q) => flojos.has(q.tema) && elegible(q)))
      .sort((a, b) => rango(a) - rango(b))
      .slice(0, 12);
    titulo = `Reforzar ${[...flojos].map((n) => 'T' + n).join(' · ')}`; volver = '#/repaso';
  }
  else if (modo === 'hub') { pool = D.preguntas.filter((q) => q.hub === p.hub); titulo = 'Esta idea'; volver = `#/tema/${n}/asociar/${p.hub}`; }
  else if (modo === 'asociar') {
    const hubs = D.hubs.filter((h) => (n ? h.tema === n : hubElegible(h)));
    const ids = hubs.map((h) => `a:${h.id}`);
    const debidas = new Set(store.pendientesHoy(ids));
    const nuevas = new Set(store.nuevas(ids));
    const orden = [
      ...hubs.filter((h) => debidas.has(`a:${h.id}`)),
      ...barajar(hubs.filter((h) => nuevas.has(`a:${h.id}`))),
      ...barajar(hubs.filter((h) => !debidas.has(`a:${h.id}`) && !nuevas.has(`a:${h.id}`))),
    ].slice(0, 10);
    pool = orden.map(preguntaAsoc);
    titulo = 'Asociar ideas';
    volver = n ? `#/tema/${n}/asociar` : '#/repaso';
  }
  else if (modo === 'examen' || modo === 'examen20') {
    pool = modo === 'examen' ? D.examen.p1.slice() : barajar(D.examen.p1).slice(0, 20);
    titulo = modo === 'examen' ? 'Prueba oficial' : 'Prueba oficial (20)'; inmediato = false;
  }
  else if (modo === 'supuesto') { pool = D.examen.sup[+p.n].preguntas.slice(); titulo = `Supuesto ${+p.n + 1}`; inmediato = false; ordenar = true; }
  else if (modo === 'rapido') { pool = barajar(D.preguntas).slice(0, 10); titulo = 'Test rápido'; }
  else if (modo === 'simulacro') { pool = barajar(D.preguntas).slice(0, 20); titulo = 'Simulacro'; inmediato = false; }
  if (!pool.length) return aviso('No hay preguntas para este modo');
  S = {
    modo, titulo, inmediato, volver, i: 0, fin: false, t0: Date.now(),
    items: (ordenar ? pool : barajar(pool)).map((q) => ({ q, orden: barajar(q.o.map((_, i) => i)), sel: undefined, hecho: false })),
  };
  ir('#/quiz');
}

function preguntaAsoc(h) {
  const pistas = barajar(h.pistas.filter((x) => x.k !== 't' && !x.s)).slice(0, 3);
  const parecidas = (h.confunde || []).map((id) => D.hubById[id]).filter(Boolean);
  const resto = barajar(D.hubs.filter((x) => x.id !== h.id && !parecidas.includes(x)));
  const distractores = [...parecidas, ...resto].slice(0, 3);
  const trampa = h.pistas.find((x) => x.k === 't');
  return {
    id: `a:${h.id}`, tema: h.tema, tipo: 'asoc', dif: 1, hub: h.id, claves: [],
    q: '¿De qué idea son estas pistas?', pistas: pistas.map((x) => x.t),
    o: [h.titulo, ...distractores.map((x) => x.titulo)], c: 0,
    e: `Es «${h.titulo}» (${h.art}). ${h.resumen}`, ojo: trampa ? trampa.t : '', ref: h.art,
  };
}

function marcar(texto, claves) {
  const t = esc(texto);
  if (!claves || !claves.length) return t;
  const alt = claves.map(esc).sort((a, b) => b.length - a.length).map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return t.replace(new RegExp(`(${alt.join('|')})`, 'gi'), '<mark>$1</mark>');
}

function enlaceIdea(q) {
  const h = D.hubById[q.hub];
  if (!h) return '';
  const claves = (q.claves || []).filter((c) => c.length <= 60);
  return `<div class="enlace">
    ${claves.length ? `<div class="claves">${claves.map((c) => `<span class="clave-pista">${esc(c)}</span>`).join('')}</div><span class="flecha-v" aria-hidden="true">↓</span>` : ''}
    <a class="idea-b" href="#/tema/${q.tema}/asociar/${h.id}"><small>Idea asociada · ${esc(h.art)}</small><b>${icHtml(h.titulo, h.ic)}${esc(h.titulo)}</b><span>Ver el mapa ›</span></a></div>`;
}

function vistaQuiz() {
  if (!S) return vistaInicio();
  if (S.fin) return vistaResultados();
  const it = S.items[S.i];
  const q = it.q;
  const total = S.items.length;
  const fb = S.inmediato && it.hecho;
  const opciones = it.orden
    .map((orig, k) => {
      let cls = 'opt';
      if (fb) cls += orig === q.c ? ' correct' : it.sel === orig ? ' wrong' : ' dim';
      else if (it.sel === orig) cls += ' picked';
      const texto = fb && orig === q.c ? marcar(q.o[orig], q.claves) : esc(q.o[orig]);
      return `<button class="${cls}" data-act="opt" data-k="${k}" ${fb ? 'disabled' : ''}><span class="letter">${'ABCD'[k]}</span><span>${texto}</span></button>`;
    })
    .join('');
  const blanco = it.sel === -1;
  let pie = '';
  if (fb) {
    const acierto = it.sel === q.c;
    pie = `<section class="feedback ${acierto ? 'ok' : it.sel === -1 ? 'bl' : 'ko'}">
      <h3>${acierto ? '✓ Correcta' : it.sel === -1 ? 'Dejada en blanco' : '✗ Incorrecta'}</h3>
      ${q.e ? `<p>${esc(q.e)}</p>` : `<p class="muted">Respuesta correcta: <strong>${esc(q.o[q.c])}</strong></p>`}
      ${q.trampa ? `<p class="tiny"><b>Tipo de trampa:</b> ${esc(q.trampa)}</p>` : ''}
      ${q.ojo ? `<p class="tiny tr-t"><b>⚠ Ojo:</b> ${esc(q.ojo)}</p>` : ''}
      <p class="tiny muted">${esc(q.ref)}</p>
      ${q.z ? `<p class="tiny z-t">⭐ <b>Preguntada en Zaragoza:</b> ${esc(q.z)}</p>` : ''}
      ${enlaceIdea(q)}
      <p class="tiny"><button class="link" data-act="reportar" data-q="${esc(q.id)}">⚑ Reportar error en esta pregunta</button></p>
      <button class="btn primary" data-act="sig">${S.i + 1 < total ? 'Siguiente' : 'Ver resultado'}</button>
    </section>`;
  } else if (S.inmediato) {
    pie = `<button class="btn ghost" data-act="opt" data-k="-1">No contesto (no resta)</button>`;
  } else {
    const sinResp = S.items.filter((x) => x.sel === undefined).length;
    pie = `<button class="btn ghost ${blanco ? 'picked' : ''}" data-act="opt" data-k="-1">${blanco ? '✓ En blanco' : 'Dejar en blanco (no resta)'}</button>
      <div class="pager">
        <button class="btn small" data-act="ant" ${S.i === 0 ? 'disabled' : ''}>‹ Anterior</button>
        ${S.i + 1 < total ? `<button class="btn small" data-act="sig">Siguiente ›</button>` : `<button class="btn primary small" data-act="entregar">Entregar (${sinResp} sin responder)</button>`}
      </div>`;
  }
  const html = `
    <div class="qhead"><span>${S.i + 1} / ${total}</span>${S.inmediato ? '' : `<span id="reloj" class="reloj">${fmtTiempo(Date.now() - S.t0)}</span>`}
      <span class="tags">${q.tipo === 'trampa' ? '<span class="tag tr">Trampa</span>' : ''}<span class="tag">Nivel ${q.dif}</span></span></div>
    <div class="bar-prog thin"><span style="width:${((S.i + (fb ? 1 : 0)) / total) * 100}%"></span></div>
    ${q.contexto ? `<details class="contexto"><summary>Enunciado del supuesto</summary><p>${esc(q.contexto)}</p></details>` : ''}
    <h2 class="enun">${fb ? marcar(q.q, q.claves) : esc(q.q)}</h2>
    ${q.pistas ? `<ul class="pistas">${q.pistas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="opts">${opciones}</div>
    ${pie}`;
  return {
    titulo: S.titulo, volver: S.volver, tab: 'repaso', sinTabs: true, sinGlosario: true, html,
    derecha: `<button class="link" data-act="salir">Salir</button>`,
    despues() {
      if (!S.inmediato) reloj = setInterval(() => { const el = $('#reloj'); if (el) el.textContent = fmtTiempo(Date.now() - S.t0); }, 1000);
    },
  };
}

function responder(k) {
  const it = S.items[S.i];
  if (S.inmediato && it.hecho) return;
  it.sel = k === -1 ? -1 : it.orden[k];
  if (S.inmediato) {
    it.hecho = true;
    store.registrar(it.q.id, it.sel === -1 ? 'blank' : it.sel === it.q.c ? 'ok' : 'fail');
  }
  montar(vistaQuiz(), { conservarScroll: !S.inmediato });
  if (S.inmediato) $('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function siguiente() {
  if (S.i + 1 < S.items.length) {
    S.i += 1;
    montar(vistaQuiz());
  } else terminar();
}

function terminar() {
  if (!S.inmediato) {
    for (const it of S.items) {
      const r = it.sel === undefined || it.sel === -1 ? 'blank' : it.sel === it.q.c ? 'ok' : 'fail';
      store.registrar(it.q.id, r);
    }
  }
  const c = contar();
  S.fin = true;
  S.duracion = Date.now() - S.t0;
  store.guardarSesion({ fecha: Date.now(), modo: S.modo, n: S.items.length, ok: c.ok, fail: c.fail, blank: c.blank });
  ir('#/quiz');
}

function contar() {
  let ok = 0, fail = 0, blank = 0;
  for (const it of S.items) {
    if (it.sel === undefined || it.sel === -1) blank += 1;
    else if (it.sel === it.q.c) ok += 1;
    else fail += 1;
  }
  return { ok, fail, blank };
}

function vistaResultados() {
  const { ok, fail, blank } = contar();
  const n = S.items.length;
  const p = store.penalizacion();
  const neto = ok - fail * p;
  const nota = Math.max(0, neto) / n * 10;
  const revisar = S.items.filter((it) => it.sel !== it.q.c);
  const lista = revisar
    .map((it) => {
      const q = it.q;
      const etiqueta = it.sel === undefined || it.sel === -1 ? 'En blanco' : 'Tu respuesta: ' + esc(q.o[it.sel]);
      return `<details class="rev"><summary>${esc(q.q)}</summary>
        ${q.pistas ? `<ul class="pistas">${q.pistas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <p class="tiny"><b>${etiqueta}</b></p>
        <p class="tiny ok-t"><b>Correcta:</b> ${esc(q.o[q.c])}</p>
        ${q.e ? `<p>${esc(q.e)}</p>` : ''}${q.trampa ? `<p class="tiny"><b>Trampa:</b> ${esc(q.trampa)}</p>` : ''}<p class="tiny muted">${esc(q.ref)}</p>${q.z ? `<p class="tiny z-t">⭐ <b>Preguntada en Zaragoza:</b> ${esc(q.z)}</p>` : ''}<p class="tiny"><button class="link" data-act="reportar" data-q="${esc(q.id)}">⚑ Reportar error</button></p></details>`;
    })
    .join('');
  const html = `
    <section class="card resultado">
      <p class="eyebrow">${esc(S.titulo)} · ${fmtTiempo(S.duracion)}</p>
      <p class="nota">${num(nota)}<span> / 10</span></p>
      <p class="muted">${ok} aciertos · ${fail} fallos · ${blank} en blanco</p>
      <p class="tiny muted">Puntos netos: ${ok} − ${fail} × ${num(p)} = <strong>${num(neto)}</strong> de ${n}. ${p ? `Cada fallo te quitó ${num(p)} puntos; dejar una en blanco no resta.` : ''}</p>
      ${fail > 0 && blank === 0 ? '<p class="tiny">💡 Con penalización, si no tienes ni idea, déjala en blanco. Si puedes descartar una opción, merece la pena arriesgar.</p>' : ''}
    </section>
    <div class="acciones">
      ${revisar.length ? `<button class="btn primary" data-act="repetir">Repetir fallos y blancos (${revisar.length})</button>` : ''}
      <a class="btn" href="${S.volver}">Volver</a>
    </div>
    ${revisar.length ? `<h3 class="sub">Para revisar</h3>${lista}` : '<p class="muted">¡Sin fallos! 🎉</p>'}`;
  return { titulo: 'Resultado', volver: S.volver, tab: 'repaso', sinGlosario: true, html };
}

// ---------------------------------------------------------------- glosario
function vistaGlosario(abrir) {
  const lista = [...D.glos].sort((a, b) => a.termino.localeCompare(b.termino, 'es'));
  const item = (g) => `<details class="gl" id="g-${g.id}" ${abrir === g.id ? 'open' : ''} data-t="${esc((g.termino + ' ' + g.def).toLowerCase())}">
      <summary>${esc(g.termino)}${g.tipo ? ` <span class="gl-tipo">${esc(g.tipo)}</span>` : ''}</summary>
      <p>${esc(g.def)}</p>
      ${g.ejemplo ? `<p class="tiny"><b>Ejemplo:</b> ${esc(g.ejemplo)}</p>` : ''}
      ${g.trampa ? `<p class="tiny tr-t"><b>⚠ Trampa:</b> ${esc(g.trampa)}</p>` : ''}
      <p class="tiny muted">${esc(g.ref || '')}</p></details>`;
  const html = `<div class="buscador"><input id="q" type="search" placeholder="Buscar: mayoría absoluta, desconcentración…" autocomplete="off" aria-label="Buscar en el glosario"></div>
    <p class="tiny muted" id="gl-n">${lista.length} términos</p><div id="gl-lista">${lista.map(item).join('')}</div>`;
  return {
    titulo: 'Glosario', tab: 'glosario', sinGlosario: true, html,
    despues() {
      const inp = $('#q');
      inp.addEventListener('input', () => {
        const t = inp.value.trim().toLowerCase();
        let n = 0;
        document.querySelectorAll('.gl').forEach((d) => {
          const ok = !t || d.dataset.t.includes(t);
          d.hidden = !ok;
          if (ok) n += 1;
        });
        $('#gl-n').textContent = `${n} términos`;
      });
      if (abrir) document.getElementById(`g-${abrir}`)?.scrollIntoView({ block: 'center' });
    },
  };
}

function abrirTermino(id) {
  const g = D.glosMap[id];
  if (!g) return;
  sheet.innerHTML = `<div class="sheet-bg" data-act="cerrar-hoja"></div>
    <div class="sheet-p" role="dialog" aria-modal="true" aria-label="${esc(g.termino)}">
      <div class="sheet-h"><h3>${esc(g.termino)}</h3><button class="link" data-act="cerrar-hoja" aria-label="Cerrar">✕</button></div>
      <p>${esc(g.def)}</p>
      ${g.ejemplo ? `<p class="tiny"><b>Ejemplo:</b> ${esc(g.ejemplo)}</p>` : ''}
      ${g.trampa ? `<p class="tiny tr-t"><b>⚠ Trampa:</b> ${esc(g.trampa)}</p>` : ''}
      <p class="tiny muted">${esc(g.ref || '')} · <a href="#/glosario/${g.id}" data-act="cerrar-hoja">Ver en el glosario</a></p>
    </div>`;
  sheet.hidden = false;
  document.body.classList.add('noscroll');
  autoglos.enlazar(sheet.querySelector('.sheet-p'), { excluirId: id });
}
function cerrarHoja() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.classList.remove('noscroll');
}

// ---------------------------------------------------------------- guía de uso
function vistaGuia() {
  try { localStorage.setItem('estudani.guia', '1'); } catch {}
  const sec = (ico, titulo, cuerpo, abierta) => `<details class="card guia" ${abierta ? 'open' : ''}><summary><b>${ico} ${titulo}</b></summary>${cuerpo}</details>`;
  const html = `
    <section class="card">
      <h3>La idea en una frase</h3>
      <p>EstuDani te <strong>enseña cada tema desde cero</strong> y después te <strong>hace repasarlo justo antes de olvidarlo</strong>. No hace falta decidir qué estudiar cada día: la app te lo va diciendo.</p>
    </section>

    ${sec('🗓️', 'Tu rutina diaria (30 a 45 minutos)', `
      <ol class="pasos">
        <li><b>Repaso de hoy.</b> Siempre lo primero. Está en <em>Inicio</em> y en <em>Test</em>. Son las preguntas que toca recordar hoy y unas pocas nuevas. Si hoy no hay nada, lo dice.</li>
        <li><b>Una lección nueva.</b> En <em>Inicio</em>, la tarjeta «Sigue donde lo dejaste» te lleva al siguiente epígrafe. Léelo con calma, prueba las tarjetas de memoria y pulsa <em>Marcar como estudiado</em>.</li>
        <li><b>El test de ese epígrafe.</b> Al final de la lección tienes «Test de este epígrafe». Con corrección inmediata: aprendes mientras fallas.</li>
        <li><b>5 minutos de refuerzo.</b> Pulsa «Reforzar» en el Inicio (te propone los temas donde peor vas) o «Mis fallos» en <em>Test</em>.</li>
      </ol>
      <p class="tiny muted">Lo importante es la constancia: 30 minutos cada día rinden más que 4 horas un solo día. La racha de días seguidos te lo recuerda.</p>`, true)}

    ${sec('📆', 'Rutina semanal y de examen', `
      <ul>
        <li><b>Un día a la semana:</b> un <em>Simulacro</em> (20 preguntas, con cronómetro y sin corrección hasta el final). Es el único modo que se parece al examen.</li>
        <li><b>Cada dos semanas:</b> la <em>Prueba oficial real</em> completa (en <em>Test</em>) y los supuestos prácticos.</li>
        <li><b>Mirando el calendario:</b> cuando se acerque el examen, deja de estudiar temas nuevos y dedica los últimos días a Repaso, Mis fallos y Simulacros.</li>
      </ul>`)}

    ${sec('🏠', 'Inicio', `
      <ul>
        <li><b>Repaso de hoy:</b> cuántas preguntas tienes pendientes y nuevas.</li>
        <li><b>Te conviene reforzar:</b> los 3 temas donde menos aciertas.</li>
        <li><b>Sigue donde lo dejaste:</b> el siguiente epígrafe por estudiar.</li>
        <li><b>Días seguidos, respondidas hoy y acierto:</b> tu ritmo.</li>
      </ul>`)}

    ${sec('📚', 'Temas', `
      <p>Los 20 temas del programa. Al abrir uno verás cuatro pestañas:</p>
      <ul>
        <li><b>Lección:</b> los epígrafes en orden. Cada uno trae la explicación desde cero, «Debes dominar», ejemplos, trampas, tarjetas de memoria y, abajo, <em>Artículo por artículo</em> con el texto oficial literal y una explicación sencilla.</li>
        <li><b>Mapa:</b> el tema entero en un esquema visual. Con «Modo recordar» se tapan las respuestas para que te pruebes.</li>
        <li><b>Asociar:</b> te damos 2 o 3 pistas y tú dices de qué idea son. Es el atajo mental para el examen.</li>
        <li><b>Test:</b> preguntas de ese tema, por epígrafes o completas.</li>
      </ul>
      <p class="tiny muted">Marca cada epígrafe como estudiado al terminarlo: así empieza a entrar en tu repaso diario.</p>`)}

    ${sec('✅', 'Test (los distintos modos)', `
      <ul>
        <li><b>Repaso de hoy:</b> repaso espaciado. Si aciertas una pregunta, tarda más en volver; si fallas, vuelve pronto. Es lo que más rinde por minuto.</li>
        <li><b>Elegir temas:</b> en esta misma pantalla decides qué temas entran en el repaso (por defecto, los que ya estudiaste).</li>
        <li><b>Test rápido:</b> 10 preguntas mezcladas con corrección inmediata. Para 5 minutos.</li>
        <li><b>Simulacro:</b> 20 preguntas sin corrección hasta el final, con cronómetro y <b>penalización por fallo</b>. Practica cuándo dejar en blanco.</li>
        <li><b>Prueba oficial real:</b> preguntas del examen del Ayuntamiento con su plantilla de respuestas, y los supuestos prácticos.</li>
        <li><b>Asociar ideas:</b> las pistas y el atajo mental.</li>
        <li><b>Solo trampas:</b> las preguntas que juegan con detalles (plazos, mayorías, «excepto»).</li>
        <li><b>Solo nivel alto:</b> las más difíciles. Úsalo cuando ya domines lo básico.</li>
        <li><b>Mis fallos:</b> todo lo que has fallado la última vez.</li>
      </ul>`)}

    ${sec('📖', 'Glosario y palabras subrayadas', `
      <p>Las palabras con <span class="term">subrayado de puntos</span> están en el glosario. <strong>Tócalas</strong> y se abre una ficha con qué significan, un ejemplo y la ley donde sale. Funciona en toda la app, menos en las preguntas (para no darte pistas).</p>
      <p>En la pestaña <em>Glosario</em> las tienes todas ordenadas, con buscador. Si no entiendes un verbo del examen («impugnar», «subsanar», «incoar»…), búscalo ahí.</p>`)}

    ${sec('⚙️', 'Más (ajustes)', `
      <ul>
        <li><b>Penalización por fallo:</b> cuánto resta cada error en simulacros y en la prueba oficial. Mientras no se confirme la oficial, usa 1/3.</li>
        <li><b>Copia de seguridad:</b> tu progreso está solo en este móvil. Descarga una copia de vez en cuando y guárdala en iCloud o mándatela.</li>
        <li><b>Reportes:</b> si ves una pregunta con error o algo del temario que no cuadra, díselo a la app con «⚑ Reportar». Luego los envías todos juntos desde aquí.</li>
        <li><b>Instalar como app:</b> en iPhone, Compartir y «Añadir a pantalla de inicio». Funciona sin conexión.</li>
      </ul>`)}

    ${sec('🔎', 'Qué significan las marcas', `
      <ul>
        <li>⭐ <b>Preguntado en la prueba oficial:</b> ese artículo ya ha salido en un examen del Ayuntamiento. Presta atención doble.</li>
        <li>🟠 <b>Añadido por cobertura:</b> no ha salido todavía, pero podría salir.</li>
        <li><b>Trampa:</b> la pregunta se apoya en un detalle fácil de confundir.</li>
        <li><b>Nivel 1, 2 o 3:</b> dificultad de la pregunta.</li>
        <li>⚪ 🔴 🟡 🟢 <b>Dominio:</b> sin practicar, flojo, en camino o dominado.</li>
      </ul>`)}

    ${sec('🎯', 'Trucos para el examen', `
      <ul>
        <li><b>Los errores restan y en blanco no.</b> Si no tienes ni idea, déjala en blanco. Si descartas una opción, merece la pena arriesgar.</li>
        <li><b>Lee el enunciado hasta el final:</b> «excepto», «no» y «incorrecta» cambian la respuesta.</li>
        <li><b>Fíjate en plazos, mayorías y quién decide:</b> es donde más trampas hay.</li>
        <li><b>Cuando falles, lee la explicación</b> y el artículo que cita: es lo que de verdad enseña.</li>
      </ul>`)}

    <p class="tiny" style="text-align:center"><button class="link" data-act="reportar">⚑ ¿Algo no se entiende? Reportar</button></p>`;
  return { titulo: 'Cómo usar la app', volver: '#/', tab: 'inicio', sinGlosario: true, html };
}

// ---------------------------------------------------------------- reportes
const TIPOS_REPORTE = ['Error en una pregunta', 'Error en el contenido (explicación, artículo)', 'Falta o sobra algo en el temario', 'Fallo de la aplicación', 'Sugerencia'];
let REP = null; // contexto del reporte que se está escribiendo

const preguntaPorId = (id) => D.qById[id] || (S && S.items.map((x) => x.q).find((q) => q.id === id));

function abrirReporte(ctx) {
  REP = ctx;
  const q = ctx.q ? preguntaPorId(ctx.q) : null;
  const donde = q ? `Pregunta: «${q.q.slice(0, 110)}${q.q.length > 110 ? '…' : ''}»` : ctx.ctx ? `Sobre: ${ctx.ctx}` : 'Reporte general de la aplicación';
  const tipo = q ? TIPOS_REPORTE[0] : ctx.ctx ? TIPOS_REPORTE[1] : TIPOS_REPORTE[3];
  sheet.innerHTML = `<div class="sheet-bg" data-act="cerrar-hoja"></div>
    <div class="sheet-p" role="dialog" aria-modal="true" aria-label="Reportar un problema">
      <div class="sheet-h"><h3>⚑ Reportar un problema</h3><button class="link" data-act="cerrar-hoja" aria-label="Cerrar">✕</button></div>
      <p class="tiny muted">${esc(donde)}</p>
      <select id="rep-tipo" aria-label="Tipo de problema">${TIPOS_REPORTE.map((t) => `<option ${t === tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <textarea id="rep-txt" rows="4" placeholder="¿Qué pasa? (por ejemplo: «la respuesta correcta debería ser la B porque…»)" aria-label="Descripción"></textarea>
      ${q ? '<label class="tiny"><input type="checkbox" id="rep-ocultar"> No volver a preguntarme esta pregunta en este móvil</label>' : ''}
      <div class="acciones"><button class="btn primary" data-act="rep-guardar">Guardar reporte</button></div>
      <p class="tiny muted">Se guarda en tu móvil. Luego lo envías todo junto desde Más → Reportes.</p>
    </div>`;
  sheet.hidden = false;
  document.body.classList.add('noscroll');
  setTimeout(() => { const t = $('#rep-txt'); if (t) t.focus(); }, 50);
}

function guardarReporte() {
  const texto = $('#rep-txt').value.trim();
  if (!texto) return aviso('Escribe qué ha pasado');
  const q = REP && REP.q ? preguntaPorId(REP.q) : null;
  store.addReporte({
    tipo: $('#rep-tipo').value, texto,
    ...(q ? { qid: q.id, tema: q.tema, ref: q.ref, enun: q.q.slice(0, 160) } : {}),
    ...(REP && REP.ctx ? { ctx: REP.ctx } : {}),
    pantalla: location.hash || '#/',
  });
  if (q && $('#rep-ocultar') && $('#rep-ocultar').checked) {
    store.ocultar(q.id);
    D.preguntas = D.preguntas.filter((x) => x.id !== q.id);
    if (D.tema[q.tema]) D.tema[q.tema].preguntas = D.tema[q.tema].preguntas.filter((x) => x.id !== q.id);
  }
  cerrarHoja();
  aviso('Reporte guardado');
  if (location.hash === '#/ajustes') route();
}

function textoReportes() {
  const rs = store.reportes();
  return `Reportes de EstuDani (${rs.length})\n\n` + rs.map((r, i) => [
    `${i + 1}. [${r.fecha}] ${r.tipo}`,
    r.enun ? `   Pregunta: ${r.enun}${r.ref ? ` (${r.ref})` : ''}` : '',
    r.ctx ? `   Sobre: ${r.ctx}` : '',
    `   ${r.texto}`,
    r.pantalla ? `   Pantalla: ${r.pantalla}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function descargarCopia() {
  const blob = new Blob([store.exportar()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `estudani-copia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  store.marcarCopia();
  aviso('Copia descargada');
}

function cargarCopiaArchivo(file) {
  const fr = new FileReader();
  fr.onload = () => {
    if (!confirm('Se sustituirá el progreso de este dispositivo por el de la copia. ¿Seguro?')) return;
    try { store.importar(String(fr.result)); aviso('Progreso restaurado'); route(); } catch { aviso('El archivo no es una copia válida'); }
  };
  fr.readAsText(file);
}

// ---------------------------------------------------------------- ajustes
function vistaAjustes() {
  const a = store.getAjustes();
  const opciones = Object.entries(store.PENALIZACIONES)
    .map(([k, v]) => `<option value="${k}" ${a.penalizacion === k ? 'selected' : ''}>${esc(v.etiqueta)}</option>`)
    .join('');
  const html = `
    <section class="card"><h3>Penalización por fallo</h3>
      <p class="muted tiny">El examen resta por error, pero el valor exacto está en las bases generales (base 7.4.D). Hasta confirmarlo se usa 1/3, el valor más habitual con 4 opciones.</p>
      <select id="pen" aria-label="Penalización por fallo">${opciones}</select></section>
    <section class="card"><h3>Copia de seguridad</h3>
      <p class="muted tiny">Tu progreso solo vive en este dispositivo. ${store.diasDesdeCopia() === null ? 'Aún no has guardado ninguna copia.' : `Última copia: hace ${store.diasDesdeCopia()} día(s).`} Descarga un archivo (mejor, guárdalo en iCloud o mándatelo) o copia el código.</p>
      <div class="acciones"><button class="btn primary small" data-act="descargar">Descargar copia (.json)</button><button class="btn small" data-act="cargar-archivo">Cargar copia desde archivo</button></div>
      <input type="file" id="archivo" accept="application/json,.json" hidden>
      <p class="muted tiny">O con código de texto:</p>
      <textarea id="bk" rows="3" readonly></textarea>
      <div class="acciones"><button class="btn small" data-act="copiar">Copiar</button><button class="btn small" data-act="restaurar">Restaurar desde el código pegado</button></div></section>
    <section class="card"><h3>Reportes</h3>
      <p class="muted tiny">¿Una pregunta con error, algo del temario que no cuadra o un fallo de la app? Anótalo aquí y envíalo cuando quieras. Los de una pregunta también salen en la corrección.</p>
      <div class="acciones"><button class="btn primary small" data-act="reportar">⚑ Reportar un problema</button></div>
      ${store.reportes().length ? `<p class="tiny"><b>${store.reportes().length}</b> reporte(s) pendientes de enviar.</p>
        <ul class="tiny">${store.reportes().map((r) => `<li>${esc(r.tipo)}: ${esc(r.texto.slice(0, 70))}${r.texto.length > 70 ? '…' : ''}</li>`).join('')}</ul>
        <div class="acciones"><button class="btn small" data-act="rep-compartir">Enviar</button><button class="btn small" data-act="rep-copiar">Copiar texto</button><button class="btn small" data-act="rep-vaciar">Vaciar lista</button></div>` : ''}
      ${store.ocultas().length ? `<p class="tiny">Tienes <b>${store.ocultas().length}</b> pregunta(s) ocultas en este móvil. <button class="link" data-act="des-ocultar">Volver a mostrarlas</button></p>` : ''}</section>
    <section class="card"><h3>Cómo usar la app</h3><p class="muted tiny">Para qué sirve cada sección y una rutina de estudio recomendada.</p><a class="btn small" href="#/guia">Abrir la guía</a></section>
    <section class="card"><h3>Instalar como app</h3>
      <p class="muted tiny"><b>iPhone (Safari):</b> toca Compartir ⎙ → «Añadir a pantalla de inicio». Se abrirá a pantalla completa y funcionará sin conexión.</p></section>
    <section class="card"><h3>Sobre el contenido</h3>
      <p class="muted tiny">Los artículos se han contrastado con el texto consolidado del BOE (verificado entre ${esc(Object.values(D.tema).map((t) => `T${t.n}: ${t.verificado}`).join(' · '))}). Si algo no te cuadra con tu manual, díselo a quien mantiene la app: la ley cambia y conviene revisarlo.</p>
      <p class="muted tiny">${esc(Object.values(D.tema).map((t) => t.notaVerificacion).filter(Boolean).join(' '))}</p></section>
    <section class="card"><h3>Borrar progreso</h3><button class="btn danger" data-act="borrar">Borrar todo mi progreso</button></section>
    ${store.sinPersistencia() ? '<p class="tiny tr-t">Tu navegador no deja guardar datos: el progreso se perderá al cerrar.</p>' : ''}`;
  return {
    titulo: 'Más', tab: 'ajustes', sinGlosario: true, html,
    despues() {
      $('#bk').value = store.exportar();
      $('#pen').addEventListener('change', (e) => { store.setAjuste('penalizacion', e.target.value); aviso('Guardado'); });
      $('#archivo').addEventListener('change', (e) => { if (e.target.files[0]) cargarCopiaArchivo(e.target.files[0]); });
    },
  };
}

// ---------------------------------------------------------------- eventos
document.addEventListener('click', (e) => {
  const termino = e.target.closest('[data-term]');
  if (termino) return abrirTermino(termino.dataset.term);
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'empezar': return empezar(d.modo, d);
    case 'opt': return responder(+d.k);
    case 'sig': return siguiente();
    case 'ant': if (S.i > 0) { S.i -= 1; montar(vistaQuiz()); } return;
    case 'entregar': {
      const sin = S.items.filter((x) => x.sel === undefined).length;
      if (sin && !confirm(`Tienes ${sin} sin responder (contarán como en blanco). ¿Entregar?`)) return;
      return terminar();
    }
    case 'salir': if (confirm('¿Salir del test? Lo respondido en modo inmediato ya está guardado.')) { const v = S.volver; S = null; ir(v); } return;
    case 'repetir': {
      const pool = S.items.filter((it) => it.sel !== it.q.c).map((it) => it.q);
      const { titulo, volver } = S;
      S = { modo: 'repetir', titulo: `${titulo} (repaso)`, inmediato: true, volver, i: 0, fin: false, t0: Date.now(),
        items: barajar(pool).map((q) => ({ q, orden: barajar(q.o.map((_, i) => i)), sel: undefined, hecho: false })) };
      return ir('#/quiz');
    }
    case 'toggle-tema': { store.setRepasoTema(+d.tema, el.checked); const y = window.scrollY; route(); window.scrollTo(0, y); return; }
    case 'repaso-auto': { store.resetRepaso(); const y = window.scrollY; route(); window.scrollTo(0, y); return aviso('Repaso en automático'); }
    case 'flash': return el.classList.toggle('open');
    case 'hecho': { const ya = store.leccionHecha(+d.tema, d.epi); store.marcarLeccion(+d.tema, d.epi, !ya); const y = window.scrollY; route(); window.scrollTo(0, y); return aviso(ya ? 'Marcado como pendiente' : '¡Epígrafe estudiado!'); }
    case 'cerrar-hoja': return cerrarHoja();
    case 'mm-abrir': return document.querySelectorAll('#mm details').forEach((x) => (x.open = true));
    case 'mm-cerrar': return document.querySelectorAll('#mm details').forEach((x) => (x.open = false));
    case 'mm-recordar': { const on = $('#mm').classList.toggle('recordar'); el.setAttribute('aria-pressed', on); el.classList.toggle('primary', on); return; }
    case 'hoja': return el.classList.toggle('ver');
    case 'ocultar-instalar': try { localStorage.setItem('estudani.instalar', '1'); } catch {} return route();
    case 'copiar': { const t = $('#bk'); t.select(); return (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => aviso('Copiado'), () => { document.execCommand?.('copy'); aviso('Copiado'); }); }
    case 'restaurar': {
      const t = $('#bk'); t.readOnly = false;
      const texto = prompt('Pega aquí el código de la copia de seguridad:');
      t.readOnly = true;
      if (!texto) return;
      try { store.importar(texto); aviso('Progreso restaurado'); route(); } catch { aviso('El código no es válido'); }
      return;
    }
    case 'reportar': return abrirReporte({ q: d.q, ctx: d.ctx });
    case 'rep-guardar': return guardarReporte();
    case 'rep-copiar': return (navigator.clipboard ? navigator.clipboard.writeText(textoReportes()) : Promise.reject()).then(() => aviso('Copiado'), () => aviso('No se pudo copiar'));
    case 'rep-compartir': {
      const texto = textoReportes();
      if (navigator.share) return navigator.share({ title: 'Reportes de EstuDani', text: texto }).catch(() => {});
      location.href = `mailto:?subject=${encodeURIComponent('Reportes de EstuDani')}&body=${encodeURIComponent(texto)}`;
      return;
    }
    case 'rep-vaciar': if (confirm('¿Vaciar la lista? Asegúrate de haberla enviado antes.')) { store.vaciarReportes(); route(); } return;
    case 'des-ocultar': { store.ocultas().forEach((id) => store.ocultar(id, false)); aviso('Recargando preguntas…'); return setTimeout(() => location.reload(), 600); }
    case 'descargar': return descargarCopia();
    case 'cargar-archivo': return $('#archivo').click();
    case 'borrar': if (confirm('Se borrará todo tu progreso en este dispositivo. ¿Seguro?')) { store.borrarTodo(); aviso('Progreso borrado'); route(); } return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheet.hidden) cerrarHoja();
});
window.addEventListener('hashchange', cerrarHoja);

// ---------------------------------------------------------------- arranque
init();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
