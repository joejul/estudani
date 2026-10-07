// Subrayado automático del glosario: busca en el texto ya pintado las palabras y expresiones del glosario
// y las convierte en botones que abren la ficha del término (igual que las marcas [[id]] escritas a mano).
// Se aplica en toda la app salvo en las preguntas, y nunca dentro de botones, enlaces o resúmenes plegables.

// Formas extra por término (el término tal cual ya se busca solo). Clave: id del glosario.
const ALIAS = {
  'sufragio': ['sufragio universal'],
  'estados-excepcionales': ['estado de alarma', 'estado de excepción', 'estado de sitio'],
  'patria-potestad': ['patria potestad'],
  'disposiciones-finales': ['disposición adicional', 'disposición transitoria', 'disposición derogatoria', 'disposición final'],
  'proyecto-proposicion': ['proyecto de ley', 'proposición de ley'],
  'cabildo': ['cabildo', 'consejo insular'],
  'firma-electronica': ['firma electrónica', 'sello electrónico'],
  'dictamen': ['dictamen'],
  'expediente': ['expediente', 'expediente administrativo'],
  'expreso-tacito': ['expreso', 'tácito'],
  'subsidiario': ['subsidiario', 'supletorio'],
  'apoderamiento': ['apoderamiento', 'poderdante', 'apoderado'],
  'tributo-directo-indirecto': ['tributo directo', 'tributo indirecto', 'impuesto directo', 'impuesto indirecto'],
  'contencioso': ['recurso contencioso-administrativo', 'contencioso-administrativo', 'jurisdicción contencioso-administrativa'],
  'vecindad-civil': ['vecindad civil'],
  'ordenador-pagos': ['ordenador de gastos y de pagos', 'ordenador de pagos'],
  'escala-subescala': ['escala', 'subescala'],
  'mayorias-reforzadas': ['mayorías reforzadas', 'mayoría reforzada'],
  'estado-social-democratico-derecho': ['estado social y democrático de derecho'],
  'firme': ['acto firme'],
  'interponer': ['interponer', 'interpone', 'interponen', 'interpuesto', 'interpuesta', 'interpuestos', 'interponerse'],
  'personarse': ['personarse', 'personado', 'personada', 'personados', 'personándose'],
  'gravar': ['gravar', 'grava', 'gravan', 'gravado', 'gravada', 'gravados', 'gravadas', 'gravará', 'gravarán'],
  'resolver': ['resolver', 'resuelve', 'resuelven', 'resuelto', 'resuelta', 'resolución', 'resoluciones', 'resolverá', 'resolverán'],
  'estimar': ['estimar', 'estimación', 'estimatoria', 'desestimar', 'desestimación', 'desestimatoria', 'estima', 'estiman', 'estimado', 'estimada'],
};

// Verbos: se buscan por raíz para cubrir conjugaciones y derivados (impugna, impugnación, impugnado…).
const RAIZ = {
  impugnar: 'impugn', recurrir: 'recurr', inadmitir: 'inadmit', subsanar: 'subsan', requerir: 'requer', comparecer: 'comparec',
  alegar: 'aleg', renunciar: 'renunci', revocar: 'revoc', rectificar: 'rectific', anular: 'anul', derogar: 'derog',
  notificar: 'notific', tramitar: 'tramit', incoar: 'incoa', suspender: 'suspend', habilitar: 'habilit', recabar: 'recab',
  ejecutar: 'ejecut', sancionar: 'sancion', delegar: 'deleg', otorgar: 'otorg', adjudicar: 'adjudic', enajenar: 'enajen',
  liquidar: 'liquid', fiscalizar: 'fiscaliz',
};

// Demasiado genéricos o ambiguos para subrayarlos solos.
const OMITIR = new Set(['eficacia', 'jerarquia-administrativa', 'coordinacion', 'sector', 'violencia-contra-mujeres', 'identificacion-firma']);
// Solo si coincide la mayúscula (el «Estado» como institución, no «estado» de las cosas).
const MAYUSCULA = new Set(['estado', 'boe']);
const NO_FLEXIONAR = /^(de|del|la|las|los|el|y|e|en|a|o|u|su|sus|por|con|para|un|una|al|lo|sin|que)$/i;

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Una palabra con sus variantes de plural (y de género si va dentro de una expresión).
function palabra(w, enExpresion) {
  if (NO_FLEXIONAR.test(w) || w.length < 3) return escRe(w);
  const m = (re, f) => re.test(w) && f(w.replace(re, ''));
  let r =
    m(/ón$/, (r0) => `${escRe(r0)}(?:ón|ones)`) ||
    m(/z$/, (r0) => `${escRe(r0)}(?:z|ces)`) ||
    (enExpresion && m(/[oa]$/, (r0) => `${escRe(r0)}[oa]s?`)) ||
    m(/[aeiouáéíóú]$/, () => `${escRe(w)}s?`) ||
    `${escRe(w)}(?:es)?`;
  return r;
}

let regex = null; // { i: {re, ids}, s: {re, ids} }

export function construir(glos) {
  const alts = []; // { cuerpo, largo, sens, id }
  const vistos = new Set();
  const agregar = (cuerpo, largo, id, sens, clave) => {
    if (vistos.has(clave)) return;
    vistos.add(clave);
    alts.push({ cuerpo, largo, sens, id });
  };
  const frase = (f, id) => {
    const t = f.trim();
    if (!t) return;
    const ws = t.split(/\s+/);
    agregar(ws.map((w) => palabra(w, ws.length > 1)).join('\\s+'), t.length, id, MAYUSCULA.has(id), t.toLowerCase());
  };
  for (const g of glos) {
    if (OMITIR.has(g.id)) continue;
    // «Interponer (un recurso)» -> «Interponer»; «Anular / anulable» -> dos formas; las frases con comas solo por alias
    const partes = g.termino.replace(/\s*\([^)]*\)/g, '').split(' / ').map((x) => x.trim()).filter((x) => x && !/,/.test(x));
    const verbo = Object.keys(RAIZ).find((v) => partes.some((t) => t.toLowerCase() === v));
    if (verbo) agregar(`${escRe(RAIZ[verbo])}[\\p{L}]*`, RAIZ[verbo].length + 8, g.id, false, `raiz:${RAIZ[verbo]}`);
    else partes.forEach((t) => frase(t, g.id));
    (ALIAS[g.id] || []).forEach((t) => frase(t, g.id));
  }
  alts.sort((x, y) => y.largo - x.largo); // «Recurso de alzada» gana a «Recurso»
  const limite = '(?<![\\p{L}\\p{N}_@-])';
  const fin = '(?![\\p{L}\\p{N}_@])';
  const montarRe = (lista, flags) => (lista.length ? { re: new RegExp(`${limite}(?:${lista.map((x) => `(${x.cuerpo})`).join('|')})${fin}`, flags), ids: lista.map((x) => x.id) } : null);
  regex = { i: montarRe(alts.filter((x) => !x.sens), 'giu'), s: montarRe(alts.filter((x) => x.sens), 'gu') };
}

const SALTAR = 'a, button, summary, svg, textarea, select, option, script, style, h1, h2, input, label, [data-nogl], .term, .sheet-h';

export function enlazar(raiz, { excluirId } = {}) {
  if (!regex || !raiz) return;
  const nodos = [];
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || n.nodeValue.trim().length < 3) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p || p.closest(SALTAR)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (w.nextNode()) nodos.push(w.currentNode);
  // para no llenar la pantalla de subrayados: en cada bloque (tarjeta, artículo…) solo se subraya la primera vez que sale cada término
  const hechos = new Map();
  for (const n of nodos) {
    const bloque = n.parentElement.closest('.card, details, article, section, .lista, li, .sheet-p') || raiz;
    if (!hechos.has(bloque)) hechos.set(bloque, new Set());
    const ya = hechos.get(bloque);
    const texto = n.nodeValue;
    const hallazgos = [];
    for (const r of [regex.i, regex.s]) {
      if (!r) continue;
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(texto))) {
        let k = 1;
        while (k < m.length && m[k] === undefined) k += 1;
        const id = r.ids[k - 1];
        if (id && id !== excluirId && !ya.has(id)) { ya.add(id); hallazgos.push({ i: m.index, f: m.index + m[0].length, id, t: m[0] }); }
        if (m[0].length === 0) r.re.lastIndex += 1;
      }
    }
    if (!hallazgos.length) continue;
    hallazgos.sort((a, b) => a.i - b.i || b.f - a.f);
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const h of hallazgos) {
      if (h.i < pos) continue; // solapado con uno anterior
      if (h.i > pos) frag.append(texto.slice(pos, h.i));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'term';
      b.dataset.term = h.id;
      b.textContent = h.t;
      frag.append(b);
      pos = h.f;
    }
    if (pos < texto.length) frag.append(texto.slice(pos));
    n.replaceWith(frag);
  }
}
