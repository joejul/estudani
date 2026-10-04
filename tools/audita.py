#!/usr/bin/env python3
"""Audita el contenido contra el texto oficial del BOE.
  python3 tools/audita.py            # informe completo
  python3 tools/audita.py 12 13      # solo esos temas
Comprueba (1) que el artículo citado existe, (2) que las cifras/plazos de la respuesta y la explicación
aparecen en ese artículo y (3) que las palabras clave de la respuesta correcta están en el artículo.
Los falsos positivos son normales (paráfrasis): el informe sirve para revisar a mano lo dudoso."""
import sys, os, re, json, glob, unicodedata
sys.path.insert(0, os.path.dirname(__file__))
from boe import cargar
R = os.path.join(os.path.dirname(__file__), '..')
LEYES = {  # clave -> (id BOE, nombre)
 'CE': 'BOE-A-1978-31229', 'LOI': 'BOE-A-2007-6115', 'L4AR': 'BOE-A-2007-11593', 'EAAR': 'BOE-A-2007-8444',
 'L39': 'BOE-A-2015-10565', 'LCSP': 'BOE-A-2017-12902', 'LBRL': 'BOE-A-1985-5392', 'RDB': 'BOE-A-1986-17958',
 'L7AR': 'BOE-A-1999-10151', 'L33': 'BOE-A-2003-20254', 'TRLRHL': 'BOE-A-2004-4214', 'RD500': 'BOE-A-1990-9664',
 'L10': 'BOE-A-2018-1683', 'TREBEP': 'BOE-A-2015-11719', 'RD781': 'BOE-A-1986-9865', 'URB': 'BOA-d-2014-90410'}
PATRONES = [  # texto de la referencia -> clave de ley
 (r'LO 3/2007', 'LOI'), (r'Ley 4/2007', 'L4AR'), (r'EAAr|Estatuto', 'EAAR'), (r'Ley 39/2015', 'L39'), (r'LCSP', 'LCSP'),
 (r'LBRL', 'LBRL'), (r'RD 1372/1986', 'RDB'), (r'Ley 7/1999', 'L7AR'), (r'Ley 33/2003', 'L33'), (r'TRLRHL', 'TRLRHL'),
 (r'RD 500/1990', 'RD500'), (r'Ley 10/2017', 'L10'), (r'TREBEP', 'TREBEP'), (r'RDLeg 781/1986', 'RD781'),
 (r'Ley de Urbanismo', 'URB'), (r'\bCE\b|Constituci', 'CE')]
NO_VERIFICABLE = r'Decreto 347/2002|Plan de Igualdad|Reglamento .rganos|Ley 31/1995|Manual|Protocolo'
TEMA_LEYES = {1: ['CE'], 2: ['LOI', 'L4AR'], 3: ['EAAR'], 4: ['L39'], 5: ['L39'], 6: ['L39'], 7: ['L39'], 8: ['L39'],
 9: ['LCSP'], 10: ['LBRL', 'RDB', 'L7AR', 'L33'], 11: ['LBRL', 'L7AR'], 12: ['TRLRHL'], 13: ['TRLRHL', 'RD500', 'L10'],
 14: ['LBRL', 'L10'], 15: ['LBRL', 'L10'], 16: ['LBRL', 'L7AR', 'TRLRHL', 'L10'], 17: ['TREBEP'], 18: ['TREBEP'],
 19: ['TREBEP', 'RD781', 'LBRL'], 20: ['URB']}
_cache = {}
def ley(k):
    if k not in _cache: _cache[k] = cargar(LEYES[k])[0]
    return _cache[k]
def norm(s): return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')
NUM = {'un':1,'uno':1,'una':1,'dos':2,'tres':3,'cuatro':4,'cinco':5,'seis':6,'siete':7,'ocho':8,'nueve':9,'diez':10,'once':11,'doce':12,'quince':15,
 'dieciseis':16,'dieciocho':18,'veinte':20,'veinticinco':25,'treinta':30,'cuarenta':40,'cincuenta':50,'sesenta':60,'setenta':70,'noventa':90,'cien':100,'mil':1000}
def numeros(txt):
    t = norm(txt); out = set()
    for m in re.finditer(r'(?<![\w/.])(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)(?![\w/])', t): out.add(m.group(1).replace('.', '').replace(',', '.'))
    for w, n in NUM.items():
        if re.search(r'\b' + w + r'\b', t): out.add(str(n))
    return out
STOP = set('para como sobre entre desde hasta cuando donde segun esta este estos estas aquel cada todo todos otra otros mismo misma ser sido sera seran podra podran debe deben tiene tienen puede pueden respuesta correcta opcion ninguna siguientes siguiente cualquier articulo apartado entidad entidades local locales ley'.split())
def claves(txt): return {w for w in re.findall(r'[a-z]{6,}', norm(txt)) if w not in STOP}
def texto_art(k, n):
    b = ley(k); x = b.get(f'n{n}') or b.get(f'a{n}')
    return x[1] if x else None
def da_texto(k, ordinal):
    b = ley(k)
    for kk, (t, x) in b.items():
        if re.match(r'Disposición adicional ' + ordinal, x or ''): return x
    return None
def arts_de(ref):
    """Artículos citados en 'Art. 31.1', 'Arts. 21.1 y 42', 'Arts. 13-15', 'DA 2.ª.4' (ignora el nombre de la ley)."""
    refs = []
    for m in re.finditer(r'DA (\d)\.ª', ref): refs.append(('DA', {'1':'primera','2':'segunda','3':'tercera','4':'cuarta'}[m.group(1)]))
    m = re.search(r'Arts?\.\s*((?:\d{1,3}(?:\.\d+)?(?:\s*[-–]\s*\d{1,3})?(?:\s*(?:,|y|e)\s*)?)+)', ref)
    if m:
        for x in re.finditer(r'(\d{1,3})(?:\.\d+)?(?:\s*[-–]\s*(\d{1,3}))?', m.group(1)):
            a = int(x.group(1)); z = int(x.group(2) or a)
            if z - a < 12: refs += [('A', n) for n in range(a, z + 1)]
    return refs
def ley_de(ref, tema):
    for pat, k in PATRONES:
        if re.search(pat, ref): return k
    return None
def evalua(respuesta, extra, ref, tema, k=None):
    if re.search(NO_VERIFICABLE, ref): return ('NV', 'fuente no verificable en el BOE')
    k = k or ley_de(ref, tema)
    if not k: return ('SL', 'ley no reconocida en la referencia')
    textos = []
    for tipo, n in arts_de(ref):
        t = da_texto(k, n) if tipo == 'DA' else texto_art(k, n)
        if t is None: return ('FALTA', f'artículo {n} no existe en {k}')
        textos.append(t)
    if not textos: return ('SA', 'referencia sin artículo')
    art = norm(' '.join(textos))
    num_faltan = sorted(n for n in numeros(respuesta) if n not in numeros(art) and len(n) < 8)
    ck = claves(respuesta); score = (sum(1 for w in ck if w in art) / len(ck)) if ck else 1
    return ('OK' if not num_faltan and score >= .45 else 'REVISAR', f'cifras no halladas {num_faltan} · coincidencia {score:.0%}')
def preguntas(n):
    f = os.path.join(R, 'data', f'tema{n:02d}.json'); t = json.load(open(f, encoding='utf-8'))
    for i, q in enumerate(t['preguntas']):
        if isinstance(q, dict): yield f'T{n}-P{i+1}', q['o'][q['c']], q['e'], q['ref']
        else: yield f'T{n}-P{i+1}', q[1][q[2]], q[3], q[4]
def limpia(s): return re.sub(r'\*\*|\[\[[\w-]+\|?([^\]]*)\]\]', lambda m: m.group(1) if m.lastindex else '', s)
def filas(n):
    t = json.load(open(os.path.join(R, 'data', f'tema{n:02d}.json'), encoding='utf-8'))
    for e in t['epigrafes']:
        for b in e['bloques']:
            b = {'t': b[0], 'cols': b[1] if b[0] == 'tabla' else None, 'filas': b[2] if b[0] == 'tabla' else None} if isinstance(b, list) else b
            if b.get('t') != 'tabla': continue
            for fila in b['filas']:
                cab = limpia(fila[0]).strip()
                m = re.search(r'(?<![\d.])(\d{1,3})(?:\.\d+)?(?:\s*[-–]\s*(\d{1,3}))?', cab) if len(cab) < 70 else None
                if m and not re.search(r'\d{4}|€|%', cab): yield e['id'], cab, ' '.join(limpia(c) for c in fila)
def cadenas(n):
    t = json.load(open(os.path.join(R, 'data', f'tema{n:02d}.json'), encoding='utf-8'))
    for e in t['epigrafes']:
        for b in e['bloques']:
            if isinstance(b, list):
                tipo = b[0]; cont = b[1:]
            else:
                tipo = b.get('t'); cont = [b.get('x'), b.get('items'), b.get('filas')]
            def aplana(x):
                if x is None: return
                if isinstance(x, str): yield x
                else:
                    for y in x: yield from aplana(y)
            for c in aplana(cont): yield e['id'], limpia(c)

REF = re.compile(r'\b[Aa]rts?\.\s*(\d{1,3})(?:\.\d+)?(?:\s*[-–]\s*(\d{1,3}))?')
def frases_art(n):
    """Frases de la lección que citan un artículo: se comparan sus cifras con el texto de ese artículo."""
    for epi, txt in cadenas(n):
        for fr in re.split(r'(?<=[.;:])\s+(?=[A-ZÁÉÍÓÚ*¿])|\s·\s', txt):
            m = REF.search(fr)
            if not m: continue
            a = int(m.group(1)); z = int(m.group(2) or a)
            if z - a >= 12: continue
            limpio = REF.sub(' ', fr); limpio = re.sub(r'\d+/\d+|\bLey \d+|\bRD\s*\d+|\bLO\s*\d+|\(\d{1,3}(?:\.\d+)?\)|\b[Aa]rt[íi]culo\s+\d+', ' ', limpio)
            yield epi, fr, limpio, list(range(a, z + 1))

def main_frases(ns):
    out = []; ok = 0
    for n in ns:
        for epi, fr, limpio, arts in frases_art(n):
            nums = {x for x in numeros(limpio) if len(x) < 6}
            if not nums: continue
            hallado = False; detalle = ''
            for k in TEMA_LEYES.get(n, []):
                textos = [texto_art(k, a) for a in arts]
                if any(t is None for t in textos): continue
                have = numeros(norm(' '.join(textos)))
                falta = sorted(x for x in nums if x not in have)
                if not falta: hallado = True; break
                detalle = f'{k}: faltan {falta}'
            if hallado: ok += 1
            elif detalle: out.append(f'T{n}/{epi} art.{arts[0]}{"-"+str(arts[-1]) if len(arts)>1 else ""} · {detalle} · «{fr[:130]}»')
    print(f'FRASES con artículo y cifras: {ok} correctas, {len(out)} a revisar'); print('\n'.join(out))

def main():
    ns = [int(a) for a in sys.argv[1:] if a.isdigit()] or sorted(int(re.search(r'tema(\d+)\.json', f).group(1)) for f in glob.glob(os.path.join(R, 'data', 'tema[0-9][0-9].json')))
    tot = {}; rev = []
    for n in ns:
        for pid, resp, expl, ref in preguntas(n):
            est, det = evalua(resp, expl, ref, n)
            tot[est] = tot.get(est, 0) + 1
            if est in ('REVISAR', 'FALTA', 'SA', 'SL'): rev.append(f'[{est}] {pid} · {ref} · «{resp[:70]}» · {det}')
        # filas de tablas de la lección: se prueban contra cada ley candidata del tema y se queda la mejor
        for epi, cab, txt in filas(n):
            mejor = None
            for k in TEMA_LEYES.get(n, []):
                est, det = evalua(txt, '', 'Art. ' + re.sub(r'^Arts?\.?\s*', '', cab), n, k)
                if mejor is None or est == 'OK': mejor = (est, det, k)
                if est == 'OK': break
            if mejor:
                tot['fila-' + mejor[0]] = tot.get('fila-' + mejor[0], 0) + 1
                if mejor[0] in ('REVISAR', 'FALTA'): rev.append(f'[fila {mejor[0]}] T{n}/{epi} art. {cab} · {mejor[2]} · «{txt[:60]}» · {mejor[1]}')
    print(json.dumps(tot, ensure_ascii=False)); print(len(rev), 'a revisar'); print('\n'.join(rev))
if '--frases' in sys.argv:
    main_frases([int(a) for a in sys.argv[1:] if a.isdigit()] or list(range(1, 21)))
else:
    main()
