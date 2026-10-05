#!/usr/bin/env python3
"""Genera data/leyes.json con el TEXTO LITERAL (BOE/BOA, versión consolidada vigente) de cada artículo
que aparece en las fichas «Artículo por artículo» de los temas.
  python3 tools/leyes.py            # reconstruye data/leyes.json y avisa de artículos que no existen
Las fichas se declaran en data/temaNN.json (epígrafe → "articulos": [[lx, n, ref, ...]])."""
import sys, re, os, json, glob
sys.path.insert(0, os.path.dirname(__file__))
from boe import cargar

LEYES = {
    'ce': ('BOE-A-1978-31229', 'Constitución Española de 1978', 'Constitución'),
    'lpac': ('BOE-A-2015-10565', 'Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas', 'Ley 39/2015'),
    'lrjsp': ('BOE-A-2015-10566', 'Ley 40/2015, de 1 de octubre, de Régimen Jurídico del Sector Público', 'Ley 40/2015'),
    'lo3-2007': ('BOE-A-2007-6115', 'Ley Orgánica 3/2007, de 22 de marzo, para la igualdad efectiva de mujeres y hombres', 'LO 3/2007'),
    'l4-2007': ('BOE-A-2007-11593', 'Ley 4/2007, de 22 de marzo, de prevención y protección integral a las mujeres víctimas de violencia en Aragón', 'Ley 4/2007 (Aragón)'),
    'eaar': ('BOE-A-2007-8444', 'Ley Orgánica 5/2007, de 20 de abril, de reforma del Estatuto de Autonomía de Aragón', 'Estatuto de Autonomía de Aragón'),
    'lcsp': ('BOE-A-2017-12902', 'Ley 9/2017, de 8 de noviembre, de Contratos del Sector Público', 'Ley 9/2017 (LCSP)'),
    'lbrl': ('BOE-A-1985-5392', 'Ley 7/1985, de 2 de abril, Reguladora de las Bases del Régimen Local', 'Ley 7/1985 (LBRL)'),
    'rb': ('BOE-A-1986-17958', 'Real Decreto 1372/1986, de 13 de junio, Reglamento de Bienes de las Entidades Locales', 'RD 1372/1986'),
    'l7-1999': ('BOE-A-1999-10151', 'Ley 7/1999, de 9 de abril, de Administración Local de Aragón', 'Ley 7/1999 (Aragón)'),
    'l33-2003': ('BOE-A-2003-20254', 'Ley 33/2003, de 3 de noviembre, del Patrimonio de las Administraciones Públicas', 'Ley 33/2003'),
    'trlrhl': ('BOE-A-2004-4214', 'Real Decreto Legislativo 2/2004, de 5 de marzo, Texto Refundido de la Ley Reguladora de las Haciendas Locales', 'RDLeg 2/2004 (TRLRHL)'),
    'rd500': ('BOE-A-1990-9664', 'Real Decreto 500/1990, de 20 de abril (presupuestos de las entidades locales)', 'RD 500/1990'),
    'l10-2017': ('BOE-A-2018-1683', 'Ley 10/2017, de 30 de noviembre, de régimen especial del municipio de Zaragoza como capital de Aragón', 'Ley 10/2017 (Zaragoza)'),
    'trebep': ('BOE-A-2015-11719', 'Real Decreto Legislativo 5/2015, de 30 de octubre, Texto Refundido del Estatuto Básico del Empleado Público', 'RDLeg 5/2015 (TREBEP)'),
    'rdleg781': ('BOE-A-1986-9865', 'Real Decreto Legislativo 781/1986, de 18 de abril, Texto Refundido de disposiciones legales vigentes en materia de Régimen Local', 'RDLeg 781/1986'),
    'rbaso': ('https://www.boa.aragon.es/eli/es-ar/d/2002/11/19/347/dof/spa/html', 'Decreto 347/2002, de 19 de noviembre, del Gobierno de Aragón, Reglamento de Bienes, Actividades, Servicios y Obras de las Entidades Locales de Aragón (texto publicado en el BOA de 25-11-2002; conviene comprobar modificaciones posteriores)', 'Decreto 347/2002 (RBASO)'),
    'rot': ('zgz:https://www.zaragoza.es/sede/servicio/normativa/109', 'Reglamento de Órganos Territoriales y Participación Ciudadana del Ayuntamiento de Zaragoza (texto de la sede electrónica municipal)', 'Reglamento de Órganos Territoriales'),
    'urb': ('BOA-d-2014-90410', 'Decreto Legislativo 1/2014, de 8 de julio, Texto Refundido de la Ley de Urbanismo de Aragón', 'Urbanismo de Aragón'),
}
ORD = {'primera':1,'segunda':2,'tercera':3,'cuarta':4,'quinta':5,'sexta':6,'séptima':7,'octava':8,'novena':9,'décima':10,'undécima':11,'duodécima':12,'decimotercera':13,'decimocuarta':14,'decimoquinta':15,'decimosexta':16,'decimoséptima':17,'decimoctava':18,'decimonovena':19,'vigésima':20,'única':1}
DISP = re.compile(r'^Disposici[oó]n\s+(adicional|transitoria|final|derogatoria)\s+([a-záéíóúñ]+)', re.I)
HEAD = re.compile(r'^Art(?:[ií]culo|\.)\s*(\d+)\s*(bis|ter|quater|quinquies)?\b\.?', re.I)

def indice_html(url):
    import html, urllib.request
    os.makedirs(os.path.join(os.path.dirname(__file__), '.cache'), exist_ok=True)
    ruta = os.path.join(os.path.dirname(__file__), '.cache', re.sub(r'\W+', '_', url)[-60:] + '.html')
    if not os.path.exists(ruta):
        open(ruta, 'wb').write(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=90).read())
    raw = open(ruta, encoding='latin-1').read()
    raw = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S | re.I)
    parrafos = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', p))).strip() for p in re.split(r'<P>', raw, flags=re.I)[1:]]
    arts, cur, k = {}, None, None
    for p in parrafos:
        m = re.match(r'^Art[ií]culo\s+(\d+)\s*(bis|ter)?\s*\.\s*-\s*(.*)$', p)
        if m:
            k = m.group(1) + (' ' + m.group(2) if m.group(2) else '')
            arts[k] = [f'Artículo {k}. {m.group(3)}'.strip()]
        elif re.match(r'^(Secci[oó]n|Subsecci[oó]n|CAP[IÍ]TULO|Cap[ií]tulo|T[IÍ]TULO|T[ií]tulo|Disposici[oó]n|DISPOSICI|ANEXO|Anexo)\b', p):
            k = None
        elif k and p:
            arts[k].append(p)
    return {n: '\n'.join(v) for n, v in arts.items()}

def indice_zgz(url):
    """Normativa de zaragoza.es: <p><strong>Art. N.</strong> …</p> seguido de listas <ol>/<ul>."""
    import html, urllib.request
    from html.parser import HTMLParser
    os.makedirs(os.path.join(os.path.dirname(__file__), '.cache'), exist_ok=True)
    ruta = os.path.join(os.path.dirname(__file__), '.cache', re.sub(r'\W+', '_', url)[-60:] + '.html')
    if not os.path.exists(ruta):
        open(ruta, 'wb').write(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=90).read())
    raw = open(ruta, encoding='utf8', errors='ignore').read()
    raw = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S | re.I)
    class P(HTMLParser):
        def __init__(self):
            super().__init__(); self.bloques = []; self.cur = None; self.pila = []; self.n = [0]
        def handle_starttag(self, tag, a):
            if tag in ('ol', 'ul'): self.pila.append(tag); self.n.append(0)
            if tag in ('p', 'li', 'h3', 'h4', 'h5'):
                self.cur = {'tag': tag, 'txt': '', 'lista': self.pila[-1] if self.pila else None}
                if tag == 'li': self.n[-1] += 1; self.cur['num'] = self.n[-1]
        def handle_endtag(self, tag):
            if tag in ('ol', 'ul') and self.pila: self.pila.pop(); self.n.pop()
            if tag in ('p', 'li', 'h3', 'h4', 'h5') and self.cur and self.cur['tag'] == tag:
                self.bloques.append(self.cur); self.cur = None
        def handle_data(self, d):
            if self.cur is not None: self.cur['txt'] += d
    pr = P(); pr.feed(raw)
    arts, k = {}, None
    for b in pr.bloques:
        t = re.sub(r'\s+', ' ', html.unescape(b['txt'])).strip()
        if not t: continue
        if b['tag'] in ('h3', 'h4', 'h5'): k = None; continue
        m = re.match(r'^Art\.?\s*(\d+)\s*(bis|ter)?\s*\.?\s*(.*)$', t)
        if m and b['tag'] == 'p':
            k = m.group(1) + (' ' + m.group(2) if m.group(2) else '')
            arts[k] = [f'Artículo {k}. {m.group(3)}'.strip()]
        elif k:
            if b['tag'] == 'li': t = (f"{b['num']}. " if b['lista'] == 'ol' else '• ') + t
            arts[k].append(t)
    return {n: '\n'.join(v) for n, v in arts.items()}

def indice(id_):
    if id_.startswith('zgz:'): return indice_zgz(id_[4:])
    if id_.startswith('http'): return indice_html(id_)
    bloques, orden = cargar(id_)
    arts = {}
    for k in orden:
        txt = bloques[k][1]
        md = DISP.match(txt.lstrip())
        if md and md.group(2).lower() in ORD:
            tipo = {'adicional':'DA','transitoria':'DT','final':'DF','derogatoria':'DD'}[md.group(1).lower()]
            lineas = [re.sub(r'\s+', ' ', l).strip() for l in txt.split('\n')]
            arts.setdefault(f'{tipo}{ORD[md.group(2).lower()]}', '\n'.join(l for l in lineas if l))
            continue
        m = HEAD.match(txt.lstrip())
        if not m: continue
        n = m.group(1) + (' ' + m.group(2).lower() if m.group(2) else '')
        lineas = [re.sub(r'\s+', ' ', l).strip() for l in txt.split('\n')]
        if lineas and re.match(r'^Art\.', lineas[0]): lineas[0] = re.sub(r'^Art\.\s*', 'Artículo ', lineas[0])
        arts[n] = '\n'.join(l for l in lineas if l)
    return arts

def pedidos():
    res = {}
    for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', 'data', 'tema[0-9][0-9].json')) ):
        for e in json.load(open(f))['epigrafes']:
            for a in e.get('articulos', []):
                lx, n = (a[0], a[1]) if isinstance(a, list) else (a['lx'], a['n'])
                res.setdefault(lx, set()).add(str(n))
    return res

def main():
    out, falta = {}, []
    for lx, ns in pedidos().items():
        if lx not in LEYES: print('ley sin definir:', lx); continue
        id_, nombre, corto = LEYES[lx]
        arts = indice(id_)
        sel = {}
        for n in sorted(ns, key=lambda x: ((0, int(re.match(r'\d+', x).group())) if re.match(r'\d', x) else (1, 0), x)):
            if n in arts: sel[n] = arts[n]
            else: falta.append(f'{lx}:{n}')
        out[lx] = {'nombre': nombre, 'corto': corto, 'id': id_, 'arts': sel}
    ruta = os.path.join(os.path.dirname(__file__), '..', 'data', 'leyes.json')
    json.dump(out, open(ruta, 'w'), ensure_ascii=False, indent=0)
    print({k: len(v['arts']) for k, v in out.items()}, f'· {os.path.getsize(ruta)//1024} KB')
    if falta: print('NO ENCONTRADOS:', falta)

if __name__ == '__main__': main()
