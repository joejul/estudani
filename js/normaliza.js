// Formato compacto de contenido (para ahorrar espacio al escribir cada tema).
// Se expande a la forma larga al cargar, así que el resto de la app no cambia.
//   pregunta:  [enunciado, [opciones], índiceCorrecta, explicación, referencia, trampa?, hub?, [claves]?]
//   pista:     [tipo, texto, s?]
//   bloque:    ["p", texto] · ["h", texto] · ["lista", [..]] · ["key"|"ejemplo"|"trampa", texto] · ["tabla", cols, filas]
//   flash:     [pregunta, respuesta]
const BLOQUES_TEXTO = new Set(['p', 'h', 'key', 'ejemplo', 'trampa']);

export function bloque(b) {
  if (!Array.isArray(b)) return b;
  const [t, a, c] = b;
  if (BLOQUES_TEXTO.has(t)) return { t, x: a };
  if (t === 'lista') return { t, items: a };
  if (t === 'tabla') return { t, cols: a, filas: c };
  return { t, x: a };
}

export function pregunta(q, i, prefijo) {
  if (!Array.isArray(q)) return q;
  const [enunciado, o, c, e, ref, trampa, hub, claves, extra] = q;
  const r = { id: `${prefijo}-${String(i + 1).padStart(3, '0')}`, q: enunciado, o, c, e, ref, tipo: trampa ? 'trampa' : 'directa', dif: trampa ? 3 : 2 };
  // referencia nueva «lx artículo» (p. ej. «lpac 53.1»): enlaza la pregunta con su ficha de artículo
  const m = /^([a-z0-9-]+) ((?:D[ATFD])?\d+(?: bis| ter)?)(\S*)$/.exec(String(ref));
  if (m) { r.lx = m[1]; r.art = m[2]; r.artTxt = m[2] + m[3]; }
  // extra: { z: «examen y pregunta» (⭐ preguntada en Zaragoza), dif: 2|3, off: 1 (fuera del temario, no se pregunta) }
  if (extra) Object.assign(r, extra);
  if (trampa) r.trampa = trampa;
  if (hub) r.hub = hub;
  if (claves) r.claves = claves;
  return r;
}

// ficha de artículo: [lx, n, ref (≤10 palabras), intuición, pregunta mental, {txt?, add?}?]
export function articulo(a) {
  if (!Array.isArray(a)) return a;
  const [lx, n, ref, int, preg, extra] = a;
  return { lx, n: String(n), ref, int, preg, ...(extra || {}) };
}

export function normalizaTema(t) {
  const prefijo = `t${String(t.n).padStart(2, '0')}`;
  t.epigrafes.forEach((e) => {
    e.bloques = e.bloques.map(bloque);
    e.articulos = (e.articulos || []).map(articulo);
    e.flash = (e.flash || []).map((f) => (Array.isArray(f) ? { q: f[0], a: f[1] } : f));
  });
  t.preguntas = t.preguntas.map((q, i) => pregunta(q, i, prefijo));
  const v = t.visual;
  if (v) {
    (v.hubs || []).forEach((h) => {
      h.pistas = h.pistas.map((p) => (Array.isArray(p) ? { k: p[0], t: p[1], ...(p[2] ? { s: 1 } : {}) } : p));
    });
    // las anotaciones hub/claves de las preguntas pueden venir aparte (tema 1) o en la propia pregunta (compacto)
    t.preguntas.forEach((q) => Object.assign(q, (v.preguntas && v.preguntas[q.id]) || {}));
    // cada pregunta pertenece al epígrafe de su idea (hub): sirve para los tests por epígrafe y para el repaso
    const epiDeHub = Object.fromEntries((v.hubs || []).map((h) => [h.id, h.epi]));
    t.preguntas.forEach((q) => { if (!q.epi && q.hub && epiDeHub[q.hub]) q.epi = epiDeHub[q.hub]; });
  }
  return t;
}
