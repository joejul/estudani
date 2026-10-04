// Piezas visuales: mapa conceptual (SVG), detalle de ramas, mapas de ideas y diagramas del esquema.
// Todas devuelven HTML/SVG como texto; los colores llegan como --c y se mezclan con el tema claro/oscuro en CSS.
import { esc, fmt } from './markup.js';
import { ic, icHtml } from './iconos.js';

const PALETA = ['#247ba0', '#70c1b3', '#ffe066', '#f25f5c', '#50514f'];

// ------------------------------------------------------------------ utilidades
function partir(texto, max) {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).split(' ')) {
    if (actual && (actual + ' ' + palabra).length > max) {
      lineas.push(actual);
      actual = palabra;
    } else actual = actual ? actual + ' ' + palabra : palabra;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

const tspans = (lineas, x, y0, paso) =>
  lineas.map((l, i) => `<tspan x="${x}" y="${y0 + i * paso}">${esc(l)}</tspan>`).join('');

// ------------------------------------------------------------------ mapa conceptual (SVG)
export function mapaSvg(mapa, base) {
  const W = 343;
  const PASO = 21;
  const ramas = mapa.ramas.slice(0, 4).map((r, i) => {
    const lineas = partir(r.titulo, 15);
    return { r, i, lineas, w: 160, h: lineas.length * PASO + 50 + 28, emoji: ic(r.titulo, r.ic) };
  });
  const arriba = Math.max(ramas[0].h, ramas[1]?.h || 0);
  const abajo = Math.max(ramas[2]?.h || 0, ramas[3]?.h || 0);
  const centroLineas = partir(mapa.titulo, 13);
  const cw = 132;
  const ch = centroLineas.length * 24 + 30;
  const sep = 56;
  const cy = 8 + arriba + sep + ch / 2;
  const cx = W / 2;
  const H = cy + ch / 2 + sep + abajo + 8;
  const filas = [8 + arriba / 2, null, cy + ch / 2 + sep + abajo / 2];
  const colX = [W / 4 + 2, (W * 3) / 4 - 2];

  const pos = ramas.map((n) => ({ x: colX[n.i % 2], y: n.i < 2 ? filas[0] : filas[2] }));

  const caminos = ramas
    .map((n, k) => {
      const p = pos[k];
      const sy = n.i < 2 ? cy - ch / 2 + 10 : cy + ch / 2 - 10;
      const sx = cx + (n.i % 2 ? 24 : -24);
      const fy = n.i < 2 ? p.y + n.h / 2 : p.y - n.h / 2;
      return `<path d="M${sx},${sy} C${sx},${(sy + fy) / 2} ${p.x},${(sy + fy) / 2} ${p.x},${fy}" style="--c:${n.r.color}" class="mm-cam"/>`;
    })
    .join('');

  const nodos = ramas
    .map((n, k) => {
      const p = pos[k];
      const y0 = p.y - n.h / 2;
      const textoY = y0 + 29 + 28;
      return `<a href="${base}${n.i}" class="mm-nodo" style="--c:${n.r.color}" aria-label="${esc(n.r.titulo)}: abrir">
        <rect x="${p.x - n.w / 2}" y="${y0}" width="${n.w}" height="${n.h}" rx="20"/>
        <text class="mm-e" x="${p.x}" y="${y0 + 32}" text-anchor="middle">${n.emoji}</text>
        <text class="mm-t" x="${p.x}" text-anchor="middle">${tspans(n.lineas, p.x, textoY, PASO)}</text>
        <text class="mm-m" x="${p.x}" y="${y0 + n.h - 12}" text-anchor="middle">${n.r.hijos.length} apartados ›</text>
      </a>`;
    })
    .join('');

  const centro = `<g class="mm-centro">
      <rect x="${cx - cw / 2}" y="${cy - ch / 2}" width="${cw}" height="${ch}" rx="22"/>
      <text text-anchor="middle">${tspans(centroLineas, cx, cy - ((centroLineas.length - 1) * 24) / 2 + 6, 24)}</text>
    </g>`;

  return `<svg class="mm-svg" viewBox="0 0 ${W} ${H.toFixed(0)}" role="group" aria-label="Mapa conceptual: ${esc(mapa.titulo)}">${caminos}${centro}${nodos}</svg>`;
}

// ------------------------------------------------------------------ detalle de una rama
export function ramaHtml(rama, i, total, base, epis, hrefEpi) {
  const nodos = (lista) =>
    lista
      .map((h) =>
        h.hijos && h.hijos.length
          ? `<div class="rh"><div class="rh-t">${icHtml(h.titulo, h.ic)}${esc(h.titulo)}</div><div class="rh-hojas">${nodos(h.hijos)}</div></div>`
          : `<button type="button" class="hoja" data-act="hoja"><span>${esc(h.titulo)}</span></button>`
      )
      .join('');
  const nav = `<div class="pager">${
    i > 0 ? `<a href="${base}${i - 1}">‹ Anterior</a>` : '<span></span>'
  }${i + 1 < total ? `<a href="${base}${i + 1}">Siguiente ›</a>` : '<span></span>'}</div>`;
  const lecciones = epis.length
    ? `<div class="rama-lec"><span class="tiny muted">Estudiar este bloque:</span> ${epis.map((e) => `<a class="chip-a" href="${hrefEpi(e.id)}">${esc(e.titulo)} ›</a>`).join('')}</div>`
    : '';
  return `<section class="rama" style="--c:${rama.color}">
    <a class="rama-volver" href="${base.replace(/\/$/, '')}">‹ Ver todo el mapa</a>
    <div class="rama-raiz"><span class="rama-n">${ic(rama.titulo, rama.ic) || i + 1}</span><b>${esc(rama.titulo)}</b></div>
    <div class="mm-tools"><button class="btn small" data-act="mm-recordar" aria-pressed="false">Modo recordar</button></div>
    <div class="rama-hijos" id="mm">${nodos(rama.hijos)}</div>
    ${lecciones}${nav}</section>`;
}

export function conexionesHtml(lista) {
  return lista
    .map(
      (c, i) => `<div class="cnx" style="--c:${PALETA[i % 4]}">
        <div class="cnx-n">${esc(c.de)}</div>
        <div class="cnx-l"><span>⇅</span><p>${esc(c.porque)}</p></div>
        <div class="cnx-n">${esc(c.a)}</div></div>`
    )
    .join('');
}

// ------------------------------------------------------------------ mapa de ideas (hub)
const ROTULO = { q: 'Quién', d: 'Dice', n: 'Cifra', t: '⚠ Trampa' };

export function leyendaHub() {
  return `<ul class="leyenda">${['q', 'd', 'n', 't'].map((k) => `<li class="k-${k}"><i></i>${ROTULO[k]}</li>`).join('')}</ul>`;
}

export function hubHtml(h) {
  return `<div class="hub">
    <div class="hub-c"><span class="hub-i" aria-hidden="true">${ic(h.titulo, h.ic)}</span><small>${esc(h.art)}</small><b>${esc(h.titulo)}</b></div>
    <div class="hub-r">${h.pistas
      .map((p) => `<button type="button" class="sp k-${p.k}" data-act="hoja"><span class="sp-k">${ROTULO[p.k]}</span><span class="tx">${esc(p.t)}</span></button>`)
      .join('')}</div></div>`;
}

// ------------------------------------------------------------------ diagramas del esquema
const marco = (b, n, cuerpo) => `<section class="diag">
  <div class="diag-h"><h3>${icHtml(b.titulo, b.ic)}${esc(b.titulo)}</h3>${b.epi ? `<a href="#/tema/${n}/e/${b.epi}">Lección ›</a>` : ''}</div>
  ${b.intro ? `<p class="tiny muted">${fmt(b.intro)}</p>` : ''}${cuerpo}
  ${b.nota ? `<p class="diag-nota">${fmt(b.nota)}</p>` : ''}</section>`;

const R = {
  tiles(b, n) {
    const leyenda = b.leyenda
      ? `<ul class="leyenda">${b.leyenda.map(([x, c]) => `<li style="--c:${c}"><i></i>${esc(x)}</li>`).join('')}</ul>`
      : '';
    const items = b.items
      .map((t) => `<div class="tile" style="--c:${t.c}"><span class="tile-n">${esc(t.n)}</span><span class="tile-x"><b>${icHtml(t.x, t.ic)}${esc(t.x)}</b>${t.s ? `<small>${esc(t.s)}</small>` : ''}</span></div>`)
      .join('');
    return marco(b, n, `${leyenda}<div class="tiles">${items}</div>`);
  },
  timeline(b, n) {
    return marco(
      b,
      n,
      `<ol class="tl">${b.items.map((i) => `<li class="${i.dest ? 'dest' : ''}"><time>${esc(i.f)}</time><span>${esc(i.x)}</span></li>`).join('')}</ol>`
    );
  },
  tarjetas(b, n) {
    return marco(
      b,
      n,
      b.items
        .map(
          (t) => `<div class="tj" style="--c:${t.c}"><span class="tj-n">${esc(t.n)}</span><div><b>${esc(t.x)}</b><p class="tj-s">${esc(t.s)}</p><p>${esc(t.d)}</p></div></div>`
        )
        .join('')
    );
  },
  piramide(b, n) {
    const k = b.niveles.length;
    return marco(
      b,
      n,
      `<div class="pir">${b.niveles
        .map((l, i) => `<div class="pir-n" style="--c:${l.c};width:${k > 1 ? 58 + (42 * i) / (k - 1) : 100}%"><b>${esc(l.x)}</b><small>${esc(l.s)}</small></div>`)
        .join('')}</div>`
    );
  },
  barras(b, n) {
    return marco(
      b,
      n,
      `<div class="bars">${b.items
        .map(
          (i) => `<div class="bar-f" style="--c:${i.c}"><div class="bar-e"><b>${esc(i.x)}</b><small>${esc(i.s)}</small></div>
            <div class="bar-p"><span style="width:${((i.v / b.total) * 100).toFixed(1)}%"></span><em>${i.v}</em></div></div>`
        )
        .join('')}<p class="tiny muted bar-t">Base: ${b.total} miembros</p></div>`
    );
  },
  contraste(b, n) {
    const lado = (s) => `<div class="vs-c" style="--c:${s.c}"><h4>${esc(s.x)}</h4>${s.pasos
      .map((p, i) => `${i ? '<span class="vs-f">↓</span>' : ''}<span class="vs-p">${esc(p)}</span>`)
      .join('')}<p class="tiny">${fmt(s.nota)}</p></div>`;
    return marco(b, n, `<div class="vs">${lado(b.a)}<span class="vs-vs">VS</span>${lado(b.b)}</div>`);
  },
  anidado(b, n) {
    const nivel = (i) =>
      i >= b.niveles.length
        ? ''
        : `<div class="an" style="--c:${PALETA[i % 4]}"><div class="an-t"><b>${esc(b.niveles[i].x)}</b><small>${esc(b.niveles[i].s)}</small></div>${nivel(i + 1)}</div>`;
    return marco(b, n, nivel(0));
  },
  flujo(b, n) {
    return marco(
      b,
      n,
      b.flujos
        .map(
          (f) => `<div class="fl" style="--c:${f.c}"><h4>${esc(f.x)}</h4><ol>${f.pasos.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`
        )
        .join('')
    );
  },
};

export const esquemaHtml = (bloques, n) => bloques.map((b) => (R[b.t] ? R[b.t](b, n) : '')).join('');
