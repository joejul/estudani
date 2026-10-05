"""Asigna el nivel (dif 1, 2 o 3) a las preguntas nuevas según señales objetivas del enunciado y las opciones.
Uso: python3 tools/dificultad.py [--aplicar]   (sin --aplicar solo muestra el reparto)"""
import json, glob, re, sys, collections

NEG = re.compile(r'\b(no |excepto|salvo|incorrect|falsa|no es|no podr|no cabe)', re.I)
NUM = re.compile(r'\d|\b(un|dos|tres|cuatro|cinco|seis|diez|quince|veinte|treinta|mes|meses|año|años|d[ií]as?|semana|tercio|quinta|décima|mitad|mayoría|absoluta|simple|cualificada)\b', re.I)

def puntos(q):
    enun, o, c, ex = q[0], q[1], q[2], q[8]
    ok = o[c]
    p = 0
    if len(re.findall(r'\d', ok)) or re.search(r'\b(d[ií]as?|meses|años|tercio|quinta|décima|mitad|mayoría)\b', ok, re.I): p += 1
    if sum(1 for x in o if NUM.search(x)) == 3: p += 1      # las tres opciones difieren en un dato numérico
    if len(ok) > 110: p += 1
    if NEG.search(enun): p += 1
    if ex.get('z'): p += 1
    if re.match(r'^[a-z0-9-]+ D[ATFD]', q[4]): p += 1
    return p

def nivel(q):
    p = puntos(q)
    ok = q[1][q[2]]
    if p >= 2: return 3
    if p == 0 and len(ok) < 70: return 1
    return 2

if __name__ == '__main__':
    aplicar = '--aplicar' in sys.argv
    cuenta = collections.Counter()
    for f in sorted(glob.glob('data/tema[0-9][0-9].json')):
        d = json.load(open(f, encoding='utf-8'))
        for q in d['preguntas']:
            if isinstance(q, list) and len(q) > 8 and isinstance(q[8], dict) and q[8].get('nuevo'):
                n = nivel(q)
                cuenta[n] += 1
                if n == 2: q[8].pop('dif', None)
                else: q[8]['dif'] = n
        if aplicar: json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(dict(sorted(cuenta.items())))
