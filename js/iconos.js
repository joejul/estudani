// Iconos (emoji) automáticos por palabra clave. Un icono explícito (`ic`) en los datos siempre manda.
// El orden importa: gana la primera regla que encaje, así que van antes las más específicas.
const REGLAS = [
  [/recursos? administrativos?|revisi[oó]n|nulidad|anulabilidad|impugn/i, '🔁'],
  [/igualdad|mujer|g[eé]nero|violencia/i, '👩‍⚖️'],
  [/hacienda|tribut|impuesto|tasa|precio p[uú]blic|contribuci[oó]n|presupuest|financ|gasto|ingreso|\bcoste|econom/i, '💰'],
  [/urban[ií]s|\bsuelo|edific|\bobras?\b|licencia/i, '🏗️'],
  [/contrat|convenio|licitaci/i, '🤝'],
  [/bienes|patrimonio|dominio p[uú]blico|comunal/i, '🏠'],
  [/empleado|funcionari|personal|disciplinari|situaciones administrativas|carrera/i, '👥'],
  [/plazo|t[eé]rmino|d[ií]as h[aá]biles|caducidad|prescripci/i, '⏳'],
  [/acto administrativo|resoluci[oó]n|notificaci|procedimiento|iniciaci|instrucci|interesad/i, '📜'],
  [/ordenanza|reglamento|norma|decreto|ley\b|leyes|jerarqu/i, '⚖️'],
  [/capitalidad|municipio|ayuntamiento|alcalde|concejal|entidades? locales?|local\b|provincia|diputaci/i, '🏘️'],
  [/territor|comunidad aut|auton[oó]m|competenc|estatuto/i, '🗺️'],
  [/polic[ií]a|seguridad|fuerzas|defensa/i, '🛡️'],
  [/participaci[oó]n|ciudadan|atenci[oó]n/i, '🗣️'],
  [/elector|sufragio|voto|refer[eé]ndum|mayor[ií]a/i, '🗳️'],
  [/publicidad|BOE|publicaci[oó]n|boletin|bolet[ií]n/i, '📣'],
  [/bandera|capital del estado|lengua|castellano/i, '🇪🇸'],
  [/tribunal|judicial|juez|justicia|jueces|garant[ií]a|control/i, '⚔️'],
  [/constituci[oó]n|cortes|gobierno|congreso|senado|corona|estado|poder|instituci/i, '🏛️'],
  [/administraci[oó]n|principio|servicio p[uú]blico/i, '🧭'],
  [/ofim[aá]tica|windows|writer|calc|internet|correo|inform[aá]tica|software|linux|ubuntu/i, '💻'],
  [/origen|elaboraci[oó]n|historia|naci[oó]|1978|1977/i, '📅'],
  [/estructura|t[ií]tulos?\b/i, '🧱'],
  [/reforma/i, '🛠️'],
];

export function ic(texto, explicito) {
  if (explicito) return explicito;
  const t = String(texto || '');
  for (const [re, emoji] of REGLAS) if (re.test(t)) return emoji;
  return '';
}

export const icHtml = (texto, explicito) => {
  const e = ic(texto, explicito);
  return e ? `<span class="ic" aria-hidden="true">${e}</span>` : '';
};
