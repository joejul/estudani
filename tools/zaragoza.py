#!/usr/bin/env python3
"""Busca en los exámenes reales los artículos que se han preguntado y escribe data/zaragoza.json
  python3 tools/zaragoza.py "/ruta/a/pruebas pasadas"
Clave "lx:artículo" → lista de textos "Prueba oficial, pregunta 11".
Solo cuenta los artículos citados en el ENUNCIADO (no en las opciones de respuesta).
Las marcas manuales (preguntas que no citan el artículo) están en tools/zaragoza_manual.json."""
import sys, re, os, json, glob, collections
import pypdf

# examen → (etiqueta, orden). Los supuestos (2.º ejercicio) casi nunca citan artículos en el enunciado.
EXAMENES = {
    'examen1': ('Prueba oficial', 2023),
    'examen2': ('Prueba oficial', 2023),
    'examen3': ('Prueba oficial', 2024),
    'examen4': ('Prueba oficial', 2024),
    'examen5': ('Prueba oficial', 2022),
    'examen6': ('Prueba oficial', 2016),
    'examen7': ('Prueba oficial', 2018),
}
LEYES = {  # clave → patrón tolerante con los errores típicos del OCR
    'lpac': r'39[\D1t]{0,2}2015|39\D?15\b|LPAC|Procedimiento Administrativo Com',
    'trlrhl': r'2[\D1t]{0,2}2004|Haciendas Locales',
    'lbrl': r'7[\D1t]{0,2}1985|7\D?85\b|Bases (?:del|de) R[eé]gimen Local|LBRL',
    'l7-1999': r'7[\D1t]{0,2}1999|Administraci[oó]n Local de Arag',
    'trebep': r'5[\D1t]{0,2}2015|Estatuto B[aá]sico del Empleado|EBEP|TREBEP',
    'ce': r'Constituci[oó]n',
    'lcsp': r'9[\D1t]{0,2}2017|Contratos del Sector',
    'l10-2017': r'10[\D1t]{0,2}2017',
    'eaar': r'Estatuto de Autonom[ií]a de Arag',
    'lo3-2007': r'3[\D1t]{0,2}2007',
    'l4-2007': r'4[\D1t]{0,2}2007',
    'rbaso': r'347[\D1t]{0,2}2002|Reglamento de Bienes, Actividades',
    'rb': r'1372[\D1t]{0,2}1986',
    'rdleg781': r'781[\D1t]{0,2}1986|Texto Refundido de R[eé]gimen Local',
    'urb': r'1[\D1t]{0,2}2014|Urbanismo de Arag',
    'rot': r'Reglamento de [OÓ]rganos Territoriales',
    'rd500': r'500[\D1t]{0,2}1990',
    'rof': r'2568[\D1t]{0,2}1986',
}
ART = re.compile(r'art(?:[íi]culos?|s?\.)\s*(\d+)(?:\s*(bis|ter))?', re.I)

def enunciado(t):
    m = re.search(r'\s[a-d]\)\s', t[40:])
    return t[:40 + m.start()] if m else t

def refs(texto):
    out = []
    pos = {k: [m.start() for m in re.finditer(p, texto, re.I)] for k, p in LEYES.items()}
    for m in ART.finditer(texto):
        n = m.group(1) + (' ' + m.group(2).lower() if m.group(2) else '')
        cand = [(p - m.end(), k) for k, ps in pos.items() for p in ps if 0 <= p - m.end() <= 160]
        if not cand:
            cand = [(m.start() - p, k) for k, ps in pos.items() for p in ps if 0 <= m.start() - p <= 160]
        if cand: out.append((min(cand)[1], n))
    return out

def preguntas_pdf(f):
    r = pypdf.PdfReader(f)
    t = '\n'.join(p.extract_text() or '' for p in r.pages)
    parts = re.split(r'\n\s*(\d{1,3})\s*[\.\-]\s*[\.\-]?\s*(?=\S)', t)
    res, last, seccion = [], 0, 1
    for i in range(1, len(parts) - 1, 2):
        n, cuerpo = int(parts[i]), parts[i + 1].replace('\n', ' ')
        if n == 1 and last >= 40: seccion += 1; last = 0
        if n <= last or n > last + 4:  # número falso del OCR (p. ej. «53.1.a)»): es continuación
            if res: res[-1][2] += ' ' + str(n) + ' ' + cuerpo
            continue
        res.append([seccion, n, cuerpo]); last = n
    return res

def main():
    carpeta = sys.argv[1]
    idx = collections.defaultdict(list)
    def add(lx, art, txt):
        if txt not in idx[f'{lx}:{art}']: idx[f'{lx}:{art}'].append(txt)
    for ex, (et, _) in EXAMENES.items():
        for sec, n, cuerpo in preguntas_pdf(os.path.join(carpeta, ex + '.pdf')):
            if ex in ('examen2', 'examen4') or (ex == 'examen5' and sec > 1): continue
            for lx, art in refs(enunciado(cuerpo)):
                add(lx, art, f'{et}, pregunta {n}')
    base = os.path.join(os.path.dirname(__file__), '..', 'data')
    e1 = json.load(open(os.path.join(base, 'examen2025.json')))
    for q in e1['preguntas']:
        for lx, art in refs(enunciado(q['q'])):
            add(lx, art, f"Prueba oficial, pregunta {q['n']}")
    man = os.path.join(os.path.dirname(__file__), 'zaragoza_manual.json')
    if os.path.exists(man):
        for k, v in json.load(open(man)).items():
            for x in v: add(*k.split(':'), x)
    def clave(k): l, a = k.split(':'); return (l, int(re.match(r'\d+', a).group()), a)
    json.dump({k: idx[k] for k in sorted(idx, key=clave)}, open(os.path.join(base, 'zaragoza.json'), 'w'), ensure_ascii=False, indent=0)
    print(len(idx), 'artículos con marca ⭐')

if __name__ == '__main__': main()
