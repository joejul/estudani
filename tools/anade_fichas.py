#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Añade fichas «Artículo por artículo» y una pregunta por ficha a los temas, desde un JSON de lotes.
  python3 tools/anade_fichas.py lote.json            # aplica (idempotente: no repite fichas ya existentes)
Cada elemento: {"t":9,"e":"e8","lx":"lcsp","n":"36","ref":"…","int":"…","preg":"…","q":[cola, correcta, falsa1, falsa2, explicación, trampa]}
La pregunta se redacta «De acuerdo con el artículo N de <ley>, <cola>»."""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
R = os.path.join(os.path.dirname(__file__), '..')
leyes = json.load(open(os.path.join(R, 'data', 'leyes.json'), encoding='utf-8'))

def clave(n):
    m = re.match(r'(\d+)\s*(bis|ter)?', n)
    return (int(m.group(1)), m.group(2) or '') if m else (9999, n)

def main(f):
    lote = json.load(open(f, encoding='utf-8'))
    por = {}
    for x in lote: por.setdefault(x['t'], []).append(x)
    for t, xs in por.items():
        p = os.path.join(R, 'data', f'tema{t:02d}.json')
        d = json.load(open(p, encoding='utf-8'))
        epis = {e['id']: e for e in d['epigrafes']}
        ya = {(a[0], str(a[1])) for e in d['epigrafes'] for a in e.get('articulos', [])}
        nuevas = 0
        for x in xs:
            if (x['lx'], x['n']) in ya: continue
            e = epis[x['e']]
            arts = e.setdefault('articulos', [])
            arts.append([x['lx'], x['n'], x['ref'], x['int'], x['preg']])
            orden = []
            for a in arts:
                if a[0] not in orden: orden.append(a[0])
            arts.sort(key=lambda a: (orden.index(a[0]), clave(str(a[1]))))
            L = leyes.get(x['lx']) or dict(zip(('id','nombre','corto'), __import__('leyes').LEYES[x['lx']]))
            cola, ok, f1, f2, ex, tr = x['q']
            enun = f"De acuerdo con el artículo {x['n']} de {L['nombre'].split(' (texto')[0]}, {cola}"
            d['preguntas'].append([enun, [ok, f1, f2], 0, f"Art. {x['n']} · {L['corto']}: {ex}", f"{x['lx']} {x['n']}", tr, '', [], {'nuevo': 1}])
            nuevas += 1
        json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'T{t}: +{nuevas} fichas/preguntas')

if __name__ == '__main__': main(sys.argv[1])
