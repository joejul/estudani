#!/usr/bin/env python3
"""Marca en cada ficha «Artículo por artículo» si es contenido añadido respecto a Vence:
   add = 1  → 🟠 AÑADIDO PARA COBERTURA 2026 (está en el programa oficial pero no en la lista de Vence)
   add = 'z'→ ⭐ AÑADIDO POR HABER SIDO PREGUNTADO EN ZARAGOZA (no está en Vence, pero ha caído en un examen)
Las listas de Vence (VENCE) salen de su web pública (temario por temas) y son orientativas.
  python3 tools/marcas.py"""
import json, os, re

R = lambda a, b: [str(i) for i in range(a, b + 1)]
VENCE = {
    1: {'ce': R(1, 9) + R(103, 107) + R(137, 158)},
    2: {'lo3-2007': R(1, 14), 'l4-2007': R(1, 3) + R(18, 31)},
    3: {'eaar': ['1', '2', '3', '4', '5', '10'] + R(33, 69) + R(71, 87) + ['115']},
    4: {'lpac': R(3, 12)},
    5: {'lpac': R(13, 33)},
    6: {'lpac': R(34, 52)},
    7: {'lpac': R(53, 95)},
    8: {'lpac': R(106, 126)},
    9: {'lcsp': R(1, 35)},
    10: {'lbrl': R(79, 83), 'rbaso': ['99'], 'l7-1999': ['179']},
    11: {'l7-1999': ['224'], 'lrjsp': ['118'], 'lbrl': ['84', '84 bis', '84 ter', '85', '85 bis', '85 ter', '86']},
    12: {'trlrhl': R(2, 127)},
    13: {'trlrhl': R(162, 193), 'l10-2017': ['50']},
    14: {'lbrl': R(11, 24) + ['24 bis'] + R(25, 28) + R(121, 138), 'l10-2017': R(1, 18)},
    15: {'rot': R(1, 117)},
    16: {'lbrl': ['49', '50', '70 bis'], 'l7-1999': ['139', '142'], 'l10-2017': ['48', '49']},
    17: {'trebep': R(8, 24) + ['52', '53', '54']},
    18: {'trebep': R(55, 68) + R(85, 98)},
    19: {'lbrl': R(89, 104), 'trebep': R(69, 84)},
    20: {},
}

def main():
    base = os.path.join(os.path.dirname(__file__), '..', 'data')
    zgz = json.load(open(os.path.join(base, 'zaragoza.json')))
    cont = {'vence': 0, 'cobertura': 0, 'zaragoza': 0}
    for n in range(1, 21):
        f = os.path.join(base, f'tema{n:02d}.json')
        t = json.load(open(f))
        for e in t['epigrafes']:
            for a in e.get('articulos', []):
                lx, art = a[0], str(a[1])
                if len(a) > 5 and isinstance(a[5], dict): a[5].pop('add', None)
                if art in VENCE.get(n, {}).get(lx, []):
                    cont['vence'] += 1
                    continue
                marca = 'z' if f'{lx}:{art}' in zgz else 1
                cont['zaragoza' if marca == 'z' else 'cobertura'] += 1
                if len(a) > 5 and isinstance(a[5], dict): a[5]['add'] = marca
                elif len(a) == 5: a.append({'add': marca})
                else: a[5:] = [{'add': marca}]
        json.dump(t, open(f, 'w'), ensure_ascii=False, indent=1); open(f, 'a').write('\n')
    print(cont)

if __name__ == '__main__': main()
