#!/usr/bin/env python3
"""Comprueba que cada pregunta cite un artículo que está en las fichas «Artículo por artículo» de su tema.
  python3 tools/audita_preguntas.py            # resumen por tema
  python3 tools/audita_preguntas.py -v         # lista las preguntas fuera del temario"""
import json, re, sys, os
R = os.path.join(os.path.dirname(__file__), '..', 'data')
LEY = [  # patrón en la referencia → clave de ley
    ('lpac', r'39/2015|LPAC'), ('lrjsp', r'40/2015'), ('trlrhl', r'2/2004|Haciendas Locales|TRLRHL'), ('lbrl', r'7/1985|LBRL|Bases del R'),
    ('l7-1999', r'7/1999'), ('trebep', r'5/2015|TREBEP|Estatuto B[aá]sico'), ('ce', r'\bCE\b|Constituci'), ('lcsp', r'9/2017|LCSP'),
    ('l10-2017', r'10/2017'), ('eaar', r'Estatuto de Autonom|EAAr|5/2007'), ('lo3-2007', r'3/2007'), ('l4-2007', r'4/2007'),
    ('rbaso', r'347/2002|RBASO'), ('rdleg781', r'781/1986'), ('urb', r'Urbanismo|1/2014'), ('rot', r'Reglamento (?:de )?[OÓ]rganos|ROT'),
]
def lx_de(ref):
    for k, p in LEY:
        if re.search(p, ref, re.I): return k
def arts_de(ref):
    m = re.match(r'^\s*DA\s*(\d)', ref)
    if m: return ['DA' + m.group(1)]
    m = re.match(r'^\s*(?:Arts?\.?|Artículos?)\s*([\d ,y\.\-–a]+)', ref)
    if m: return [x for x in re.findall(r'\d+', m.group(1))]
    return []
def main():
    verb = '-v' in sys.argv
    tot = fuera = 0
    for n in range(1, 21):
        t = json.load(open(os.path.join(R, f'tema{n:02d}.json')))
        fich = {(a[0], str(a[1])) for e in t['epigrafes'] for a in e.get('articulos', [])}
        malas = []
        for i, q in enumerate(t['preguntas']):
            if isinstance(q, dict): ref = q.get('ref', ''); off = q.get('off')
            else: ref = q[4] if len(q) > 4 else ''; off = len(q) > 8 and isinstance(q[8], dict) and q[8].get('off')
            if off: continue
            tot += 1
            m = re.match(r'^([a-z0-9-]+) ((?:DA)?\d+(?: bis| ter)?)', ref)
            if m: lx, arts = m.group(1), [m.group(2)]
            else:
                lx, arts = lx_de(ref), arts_de(ref)
            ok = bool(lx and arts and any((lx, a) in fich for a in arts))
            if not ok: malas.append((i + 1, ref, (q['q'] if isinstance(q, dict) else q[0])[:70]))
        fuera += len(malas)
        print(f'T{n}: {len(t["preguntas"])} preguntas · {len(malas)} sin ficha')
        if verb:
            for x in malas: print('   ', x)
    print('TOTAL', tot, 'fuera', fuera)
main()
