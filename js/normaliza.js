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
  const [enunciado, o, c, e, ref, trampa, hub, claves] = q;
  const r = { id: `${prefijo}-${String(i + 1).padStart(3, '0')}`, q: enunciado, o, c, e, ref, tipo: trampa ? 'trampa' : 'directa', dif: trampa ? 3 : 2 };
  if (trampa) r.trampa = trampa;
  if (hub) r.hub = hub;
  if (claves) r.claves = claves;
  return r;
}

export function normalizaTema(t) {
  const prefijo = `t${String(t.n).padStart(2, '0')}`;
  t.epigrafes.forEach((e) => {
    e.bloques = e.bloques.map(bloque);
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
