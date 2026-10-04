# EstuDani

PWA para preparar la oposición de **Auxiliar Administrativo del Ayuntamiento de Zaragoza** (convocatoria 2026, BOPZ nº 170). Pensada para estudiar desde el iPhone, también sin conexión.

Estado: **20 de los 21 temas** del Anexo I (falta **ofimática**, aplazada). 337 preguntas de test, 85 mapas de ideas, 75 diagramas, ~170 términos de glosario y el **examen real de 2025** con su plantilla oficial.

**Contenido parcial** (falta el documento oficial): Tema 2 (Plan de Igualdad del Ayuntamiento) y Tema 15 (Reglamento de Órganos Territoriales y Manual de Atención a la ciudadanía); solo llevan los datos de las preguntas oficiales de 2025.

## Qué incluye

- **Lección por epígrafes**: explicación desde cero, conceptos clave, ejemplos, trampas, tarjetas de memoria y esquema.
- **Glosario**: toca cualquier término subrayado (ley orgánica, desconcentración, mayoría absoluta…) y se abre su definición.
- **Mapa visual**: mapa conceptual dibujado (idea central + 4 ramas de color). Cada rama se abre en un diagrama de nodos con «modo recordar» (difumina las hojas) y enlaza con su lección. Incluye conexiones entre ideas.
- **Esquema visual**: 11 diagramas (mosaico de Títulos, línea de tiempo, pirámide de normas, barras de mayorías, comparativas, cajas anidadas, flujos de reforma).
- **Asociar ideas**: 18 mapas de ideas (idea central + pistas por tipo: quién, dice, cifra, trampa). Las preguntas resaltan las palabras clave y enlazan con su idea; hay un entrenamiento «pistas → idea» con repaso espaciado.
- **Test** con 3 opciones (como el examen real; el Tema 1 conserva 4), justificación y artículo. **Los errores restan** y existe «No contesto».
- **Repaso espaciado** (cajas tipo Leitner: 0, 1, 2, 4, 8, 16, 32, 64 días), test rápido, simulacro con cronómetro y «mis fallos».
- Progreso guardado en el dispositivo + copia de seguridad en Ajustes.

## Ejecutar en local

No hay dependencias ni paso de compilación:

```bash
python3 -m http.server 5173
```

y abrir <http://localhost:5173>.

## Publicar para el iPhone

Hay que servirlo por **HTTPS** (GitHub Pages, Netlify, Cloudflare Pages…). Después, en Safari: Compartir → *Añadir a pantalla de inicio*.

## Estructura

```
index.html · manifest.webmanifest · sw.js
css/styles.css
js/app.js      vistas, rutas y motor de test
js/store.js    progreso, repetición espaciada, ajustes
js/markup.js   formato de texto ([[término]], **negrita**)
js/visual.js   mapa SVG, ramas, mapas de ideas y diagramas
data/temas.json     índice de los 20 temas + ofimática
data/glosario.json  conceptos básicos
data/temaNN.json    contenido de cada tema (epígrafes, mapa, preguntas)
data/temaNN-visual.json  mapas de ideas, palabras clave por pregunta y diagramas del esquema
```

Al añadir un tema nuevo: crear `data/temaNN.json`, indicar `"archivo"` en `data/temas.json` y añadirlo a `PRECACHE` en `sw.js` y `data/temaNN-visual.json` (y subir `CACHE`).

## Pendiente de confirmar

- **Penalización por error**: está en las bases generales (TRBGTL, base 7.4.D), que no se ha incorporado. Ahora mismo se usa 1/3 (configurable en *Más*).
- **Fecha del examen**: aún no convocada; la cuenta atrás usa el 1-may-2027 como estimación.
- Las bases dicen que ofimática es **Writer y Calc** (LibreOffice 24.2.6), **Windows 11 y Ubuntu 24**; la web de Vence lista también Base e Impress. Se sigue lo que dicen las bases.

## Fuente del contenido

Los artículos se contrastan con el texto consolidado del BOE (API de datos abiertos). Cada tema indica la fecha de verificación.

## Añadir un tema nuevo (flujo económico)

1. `python3 tools/boe.py <ID-BOE> --indice` y luego `python3 tools/boe.py <ID-BOE> 20 21 28-31 --max 500` para leer solo los artículos necesarios (guarda caché en `tools/.cache/`).
2. Escribir `data/temaNN.json` en **formato compacto** (preguntas, pistas y bloques como arrays; ver `js/normaliza.js`) y `data/temaNN-visual.json` (ideas, diagramas).
3. Registrarlo en `data/temas.json` (`archivo`, `visual`) y en `sw.js`.

Los iconos se asignan solos por palabra clave (`js/iconos.js`); para forzar uno, añade `"ic": "💰"` al epígrafe, idea, rama o diagrama.

Las preguntas reales del examen de 2025 están en `data/examen2025.json` (3 opciones, **sin plantilla de respuestas todavía**).
