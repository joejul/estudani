// Mini-formateador para los textos de los datos.
//   **negrita**
//   [[id]] o [[id|texto visible]]  -> término del glosario (se abre en una hoja)
//   [[glosario|texto]]             -> enlace a la página del glosario

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let glosarioPorId = {};
export const setGlosario = (lista) => {
  glosarioPorId = Object.fromEntries(lista.map((g) => [g.id, g]));
};

export function fmt(texto) {
  return esc(texto)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, id, visible) => {
      if (id === 'glosario') return `<a class="term" href="#/glosario">${visible || 'glosario'}</a>`;
      const g = glosarioPorId[id];
      const texto = visible || (g ? g.termino : id);
      return `<button type="button" class="term" data-term="${id}">${texto}</button>`;
    });
}

// Texto plano (sin marcas) para búsquedas y títulos.
export const plano = (texto) => String(texto).replace(/\*\*/g, '').replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, id, v) => v || id);
