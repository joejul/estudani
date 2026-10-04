#!/usr/bin/env python3
"""Baja una ley consolidada del BOE (datos abiertos) y muestra solo lo que se pide.

  python3 tools/boe.py BOE-A-2004-4214 --indice            # títulos/capítulos y artículos
  python3 tools/boe.py BOE-A-2004-4214 20 21 28-31 --max 700   # texto de esos artículos (recortado)
Guarda una copia en tools/.cache/ para no volver a descargar.
"""
import sys, re, os, urllib.request, xml.etree.ElementTree as ET

def cargar(id_):
    os.makedirs(os.path.join(os.path.dirname(__file__), '.cache'), exist_ok=True)
    ruta = os.path.join(os.path.dirname(__file__), '.cache', id_ + '.xml')
    if not os.path.exists(ruta):
        req = urllib.request.Request(f'https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/{id_}/texto', headers={'Accept': 'application/xml'})
        open(ruta, 'wb').write(urllib.request.urlopen(req, timeout=90).read())
    bloques = {}
    orden = []
    for b in ET.parse(ruta).getroot().iter('bloque'):
        vs = b.findall('version')
        if not vs: continue
        txt = '\n'.join(''.join(p.itertext()).strip() for p in vs[-1].findall('p'))
        bloques[b.get('id')] = (b.get('titulo', ''), txt)
        orden.append(b.get('id'))
    # índice por número real de artículo (las leyes autonómicas usan ids irregulares como a5-2)
    for k in list(orden):
        m0 = re.match(r'art(\d+)$', k)
        if m0 and ('n' + m0.group(1)) not in bloques: bloques['n' + m0.group(1)] = bloques[k]
        m = re.match(r'Art[ií]culo\s+(\d+)(?:\s*(bis|ter|quater))?\b', bloques[k][1])
        if m and not m.group(2) and ('n%s' % m.group(1)) not in bloques:
            bloques['n' + m.group(1)] = bloques[k]
    return bloques, orden

def main():
    a = sys.argv[1:]
    if not a: return print(__doc__)
    id_, rest = a[0], a[1:]
    mx = 600
    if '--max' in rest:
        i = rest.index('--max'); mx = int(rest[i + 1]); del rest[i:i + 2]
    bloques, orden = cargar(id_)
    if '--indice' in rest:
        for k in orden:
            t, x = bloques[k]
            if not re.match(r'a\d', k):
                print(k, '·', x.replace('\n', ' · ')[:90])
        arts = [k for k in orden if re.match(r'(a|n)\d', k)]
        print('Artículos:', arts[0], '…', arts[-1], f'({len(arts)})')
        return
    for r in rest:
        m = re.match(r'(\d+)(?:-(\d+))?$', r)
        if not m: continue
        for n in range(int(m.group(1)), int(m.group(2) or m.group(1)) + 1):
            k = f'n{n}'
            if k in bloques:
                x = bloques[k][1]
                print(f'[{n}]', re.sub(r'\s+', ' ', x)[:mx]); print()
            else: print(f'[{n}] (no existe)')
main()
