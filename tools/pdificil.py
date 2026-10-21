#!/usr/bin/env python3
"""Arma el «Test completo» de cada tema: 150 preguntas, todas de nivel alto (3), con al menos una por artículo.

Una pregunta es de nivel alto cuando su FORMATO obliga a leer con atención:
  · «señale la proposición INCORRECTA» (dos frases verdaderas del artículo y una falsa),
  · «tres frases iguales donde solo cambia una palabra o una cifra» (esa palabra decide si es verdadera),
  · preguntas de examen real (⭐) o ya clasificadas de nivel 3 con datos numéricos.
Las frases se construyen con el texto de las propias preguntas ya revisadas; las falsas solo cambian una cantidad
o una palabra clave por otra que invierte el sentido.

  python3 tools/pdificil.py            # muestra el resumen y no escribe nada
  python3 tools/pdificil.py --aplicar  # escribe tc:1 (test completo) y añade las preguntas nuevas
"""
import json, re, sys, os, collections, difflib, random, zlib, functools

R = os.path.join(os.path.dirname(__file__), '..', 'data')
L = json.load(open(os.path.join(R, 'leyes.json'), encoding='utf-8'))
OBJETIVO = 150

def nombre(lx): return L[lx]['nombre'].split(' (texto')[0]
def corto(lx): return L[lx].get('corto') or lx
def activa(q):
    return not ((isinstance(q, list) and len(q) > 8 and isinstance(q[8], dict) and q[8].get('off')) or (isinstance(q, dict) and q.get('off')))
def extra(q):
    if len(q) < 9: q.extend([None] * (9 - len(q)))
    if not isinstance(q[8], dict): q[8] = {}
    return q[8]
def cap(s): return s[0].upper() + s[1:] if s else s

# ---------- mayúscula inicial de una opción al unirla con el enunciado ----------
_cap = collections.Counter(); _low = collections.Counter()
def _corpus():
    for n in range(1, 21):
        t = json.load(open(os.path.join(R, f'tema{n:02d}.json'), encoding='utf-8'))
        for q in t['preguntas']:
            if isinstance(q, list):
                for x in [q[0]] + q[1]: yield x
for _tx in _corpus():
    for _m in re.finditer(r'(?<=[a-záéíóúñ,] )([A-Za-zÁÉÍÓÚáéíóúñ]+)', _tx):
        _w = _m.group(1)
        if _w.isupper() and len(_w) > 1: continue
        (_cap if _w[0].isupper() else _low)[_w.lower()] += 1
PROPIOS = {'Estado', 'Administración', 'Administraciones', 'Gobierno', 'Cortes', 'Pleno', 'Alcalde', 'Consejo', 'Ley', 'Leyes', 'Constitución', 'Congreso', 'Senado', 'Rey',
           'Presidente', 'Tribunal', 'Ayuntamiento', 'Comunidad', 'Comunidades', 'Zaragoza', 'Aragón', 'España', 'Unión', 'Junta', 'Diputación', 'Comarca', 'Municipio',
           'Municipios', 'Entidades', 'Entidad', 'Corporación', 'Corporaciones', 'Intervención', 'Secretaría', 'Instituto', 'Ministerio', 'Ministros', 'Ministro', 'Defensor',
           'Justicia', 'Boletín', 'Comisión', 'Oficina', 'Registro', 'Universidades', 'Universidad', 'Organismos', 'Organismo', 'Fundaciones', 'Consorcios', 'Agencias',
           'Mancomunidades', 'Diputaciones', 'Cabildos', 'Provincia', 'Provincias', 'Islas', 'Ciudad', 'Distrito', 'Distritos', 'Barrio', 'Barrios', 'Delegado', 'Tesorería',
           'Hacienda', 'Catastro', 'Parlamento', 'Cámara', 'Cámaras', 'Cortes', 'Diario', 'Real', 'Texto', 'Reglamento', 'Estatuto', 'Estatutos'}
def baja(opt):
    w = re.match(r'[A-Za-zÁÉÍÓÚáéíóúñ]+', opt)
    if not w: return opt
    w = w.group(0)
    if not w[0].isupper() or (len(w) > 1 and w[1].isupper()) or w in PROPIOS: return opt
    return w[0].lower() + opt[1:]

def cola(stem, lx):
    """Enunciado sin el «De acuerdo con el artículo X de la Ley Y,» inicial."""
    ult = ' '.join(nombre(lx).split()[-3:]).lower()
    i = stem.lower().find(ult)
    if i < 0: return None
    return re.sub(r'^[,\s]+', '', stem[i + len(ult):])

def frase(tail, opt):
    t = tail.rstrip(' :').rstrip()
    t = t[0].lower() + t[1:] if t and t[0].isupper() and not re.match(r'[A-Z]{2}', t) else t
    f = re.sub(r'\s+', ' ', t + ' ' + baja(opt)).strip().rstrip('.')
    return re.sub(r'\b(de|a) el\b', lambda m: {'de': 'del', 'a': 'al'}[m.group(1)], f)

LEYES_CORTAS = r'(?:LBRL|LPAC|LRJSP|LCSP|TREBEP|TRLRHL|CE|EAAr|LO 3/2007|LOREG|ROF|RBEL|RSCL|LGT|LPAP|TRLUA|TR/86|RBASO|Reglamento)'
def _cola_flexible(st):
    """Quita «De acuerdo con / Según / Conforme a el artículo X de la ley Y,» (nombre largo o corto) y devuelve el resto."""
    m = re.match(r'^(?:De acuerdo con|Según|Conforme a|Conforme al|En virtud d[eel]+)\s+(?:lo (?:establecido|previsto) en )?(?:el )?art(?:ículo|\.)\s*[\w.ºª)(]+(?:,? párrafo \w+,)?[^,]*?,\s+(?=[a-záéíóúñ¿])(.+)$', st, re.S)
    if not m: return None
    r = m.group(1)
    r = re.sub(r'^de \d{1,2} de [a-záéíóú]+,\s+', '', r)
    if re.match(r'^(?:del|de la|de los|de las|de Aragón|de [A-ZÁÉÍÓÚ]\w+), ', r) or re.match(r'^(?:del|de la|de los|de las) ', r):
        c = re.search(r', (?=(?:el|la|los|las|un|una|se|en|son|es|para|quien|cuando|si|corresponde|corresponden|podrá|podrán|serán|será|tendrá|tendrán|deberá|deberán|no)\b)', r[:260])
        if c: r = r[c.end():]
    return r

LEY_RX = [('lpac', r'39/2015|LPAC'), ('lrjsp', r'40/2015|LRJSP'), ('trlrhl', r'2/2004|Haciendas Locales|TRLRHL'), ('lbrl', r'7/1985|LBRL|Bases del R'),
          ('l7-1999', r'7/1999'), ('trebep', r'5/2015|TREBEP|Estatuto B[aá]sico'), ('ce', r'\bCE\b|Constituci'), ('lcsp', r'9/2017|LCSP'),
          ('l10-2017', r'10/2017'), ('eaar', r'Estatuto de Autonom|EAAr|5/2007'), ('lo3-2007', r'3/2007'), ('l4-2007', r'4/2007'),
          ('rbaso', r'347/2002|RBASO'), ('rdleg781', r'781/1986|TR/86'), ('urb', r'Urbanismo|1/2014|LUA'), ('rot', r'Reglamento (?:de )?[OÓ]rganos|ROT|Reglamento'),
          ('rb', r'1372/1986|RBEL'), ('l33-2003', r'33/2003|LPAP')]
def key_flex(q, fichas):
    k = clave_art(q)
    if k: return k
    ref = str(q[4]); m = re.search(r'(?:Arts?\.?|Artículos?)\s*(\d+(?: bis| ter)?)', ref)
    if not m: return None
    num = m.group(1)
    cands = [f for f in fichas if f[1] == num]
    if not cands: return None
    for lx, rx in LEY_RX:
        if re.search(rx, ref) and (lx, num) in cands: return (lx, num)
    return cands[0] if len(cands) == 1 else None

def info(n, i, q, fichas=()):
    """Datos de una pregunta reformulable como frase («enunciado + respuesta»); None si no se puede."""
    if not isinstance(q, list): return None
    ref = str(q[4]); st = q[0]; ok = q[1][q[2]]
    if re.search(r'\bNO\b|excepto|salvo que|INCORRECT|no se encuentra|¿|\?\s*$', st) or re.search(r'\bNO\b', ok): return None
    m = re.match(r'^([a-z0-9-]+) ((?:D[ATFD])?\d+(?: bis| ter)?)([\w.ºª]*)', ref)
    lx = m.group(1) if m else None
    r = None
    if m and lx in L and st.startswith('De acuerdo con el art'): r = cola(st, lx)
    if not r: r = _cola_flexible(st)
    if not r and st.rstrip().endswith(':') and not re.match(r'^(De acuerdo|Según|Conforme)', st): r = st      # frase a completar sin artículo
    if not r or len(r) < 14 or re.match(r'(también|además|asimismo|igualmente|así|pero|y |o )', r, re.I): return None
    r = r.rstrip(' :').rstrip()
    if r.endswith(','): return None
    if not m:
        k = key_flex(q, fichas)
        if k: lx, art, ap = k[0], k[1], ''
        else: lx, art, ap = None, None, ''
    else: art, ap = m.group(2), m.group(3).strip('.')
    return dict(n=n, i=i, lx=lx, art=art, ap=ap, tail=r, ok=ok,
                bads=[x for k, x in enumerate(q[1]) if k != q[2]], hub=q[6] if len(q) > 6 else '', ref=ref, q=q)

# ---------- cambios de UNA palabra o cifra que invierten el sentido ----------
UN = ['un', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'quince', 'veinte', 'treinta',
      'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'noventa', 'cien']
VAL = {'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11,
       'doce': 12, 'quince': 15, 'veinte': 20, 'treinta': 30, 'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60, 'setenta': 70, 'noventa': 90, 'cien': 100}
WORD = {v: k for k, v in VAL.items() if k != 'una'}
UNIT = r'(?:d[ií]as?(?: h[aá]biles| naturales)?|meses?|a[nñ]os?|semanas?|horas?|habitantes|por ciento|por 100|%|euros)'
FRACC = ['la mitad', 'un tercio', 'dos tercios', 'una cuarta parte', 'una quinta parte', 'una décima parte', 'tres quintos', 'tres cuartas partes']
SWAP = [(r'\bel Congreso de los Diputados\b', ['el Senado', 'el Gobierno']), (r'\bal Congreso\b', ['al Senado', 'al Gobierno']), (r'\bel Senado\b', ['el Congreso de los Diputados', 'el Gobierno']),
        (r'\bel Tribunal Constitucional\b', ['el Tribunal Supremo', 'el Consejo de Estado']), (r'\bel Consejo de Estado\b', ['el Tribunal Supremo', 'el Tribunal Constitucional']),
        (r'\bel Rey\b', ['el Presidente del Gobierno', 'el Presidente del Congreso']),
        (r'\bel Gobierno de Aragón\b', ['las Cortes de Aragón', 'el Justicia de Aragón']), (r'\blas Cortes de Aragón\b', ['el Gobierno de Aragón', 'el Justicia de Aragón']),
        (r'\bel Presidente\b', ['el Vicepresidente', 'el Secretario']), (r'\bel Secretario\b', ['el Interventor', 'el Presidente']), (r'\bel Interventor\b', ['el Secretario', 'el Tesorero']),
        (r'\bsuperior jerárquico\b', ['órgano que lo dictó', 'Pleno']), (r'\bórgano que dictó\b', ['superior jerárquico', 'Pleno']),
        (r'\bde oficio\b', ['a instancia de parte']), (r'\ba instancia de parte\b', ['de oficio']),(r'\bmayoría absoluta\b', ['mayoría simple', 'mayoría de tres quintos']), (r'\bmayoría simple\b', ['mayoría absoluta', 'mayoría de dos tercios']),
        (r'\bmayoría de dos tercios\b', ['mayoría absoluta', 'mayoría simple']), (r'\bmayoría de tres quintos\b', ['mayoría absoluta', 'mayoría simple']),
        (r'\bobligatori[oa]s?\b', ['potestativo', 'voluntario']), (r'\bpotestativ[oa]s?\b', ['obligatorio', 'automático']),
        (r'\bnulidad de pleno derecho\b', ['anulabilidad', 'mera irregularidad']),
        (r'\bsilencio positivo\b', ['silencio negativo', 'silencio presunto']), (r'\bsilencio negativo\b', ['silencio positivo', 'silencio presunto']),
        (r'\bal Pleno\b', ['al Alcalde', 'a la Junta de Gobierno Local']), (r'\bel Pleno\b', ['el Alcalde', 'la Junta de Gobierno Local']),
        (r'\bel Alcalde\b', ['el Pleno', 'la Junta de Gobierno Local']),
        (r'\bmínimo\b', ['máximo', 'medio']), (r'\bmáximo\b', ['mínimo', 'medio']),
        (r'\bpodrá\b', ['deberá', 'no podrá']), (r'\bdeberá\b', ['podrá', 'no deberá']), (r'\bpodrán\b', ['deberán', 'no podrán']), (r'\bdeberán\b', ['podrán', 'no deberán']),
        (r'\bBoletín Oficial del Estado\b', ['Boletín Oficial de la Provincia', 'Boletín Oficial de Aragón']),
        (r'\bBoletín Oficial de Aragón\b', ['Boletín Oficial del Estado', 'Boletín Oficial de la Provincia']),
        (r'\bBoletín Oficial de la Provincia\b', ['Boletín Oficial del Estado', 'Boletín Oficial de Aragón'])]

UNID = {'día': ('día', 'días', 'm'), 'mes': ('mes', 'meses', 'm'), 'año': ('año', 'años', 'm'), 'semana': ('semana', 'semanas', 'f'), 'hora': ('hora', 'horas', 'f')}
def _unidad_base(u):
    u = u.lower().replace('dia', 'día').replace('ano', 'año').replace('anos', 'años')
    for k in UNID:
        if u.startswith(k): return k
    return None

def forma_cantidad(v, palabra, unidad, adj, mayus):
    """«1 año», «una hora», «tres días hábiles»: número + unidad con el singular o plural que corresponda."""
    k = _unidad_base(unidad) if unidad else None
    if k:
        sing, plur, gen = UNID[k]
        txt_unidad = sing if v == 1 else plur
        if adj: txt_unidad += ' ' + (adj if v != 1 else adj.rstrip('s').replace('hábile', 'hábil').replace('naturale', 'natural'))
        if palabra:
            num = ('una' if gen == 'f' else 'un') if v == 1 else WORD.get(v)
        else: num = str(v)
        if not num: return None
        out = f'{num} {txt_unidad}'
    else:
        num = (WORD.get(v) if palabra else str(v))
        if not num: return None
        out = f'{num} {unidad}'.strip() if unidad else num
    return out[0].upper() + out[1:] if mayus else out

def cifras(s):
    """Cantidades con unidad: (inicio, fin, texto, valor, es_palabra, unidad, adjetivo); el tramo incluye la unidad."""
    out = []
    pat_u = r'(d[ií]as?|meses?|a[nñ]os?|semanas?|horas?)(\s+(?:h[aá]biles|naturales))?'
    for m in re.finditer(r'(?<![\d/.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s+' + pat_u, s):
        previo = s[max(0, m.start() - 18):m.start()].lower()
        if re.search(r'art[ií]culos?\s*$|apartado\s*$|ley\s*$|n\.º\s*$', previo): continue
        out.append((m.start(), m.end(), m.group(0), int(m.group(1).replace('.', '')), False, m.group(2), (m.group(3) or '').strip()))
    for m in re.finditer(r'\b(' + '|'.join(UN) + r')\s+' + pat_u, s, re.I):
        out.append((m.start(), m.end(), m.group(0), VAL[m.group(1).lower()], True, m.group(2), (m.group(3) or '').strip()))
    # cantidades sin unidad temporal (habitantes, por ciento, %, euros): se cambia solo la cifra
    for m in re.finditer(r'(?<![\d/.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?(?=\s*(?:habitantes|por ciento|por 100|%|euros))', s):
        previo = s[max(0, m.start() - 18):m.start()].lower()
        if re.search(r'art[ií]culos?\s*$|apartado\s*$|ley\s*$|n\.º\s*$', previo): continue
        out.append((m.start(), m.end(), m.group(0), int(m.group(1).replace('.', '')), False, None, ''))
    return out

def alternos_valores(v):
    base = [1, 2, 3, 5, 6, 10, 15, 20, 30, 60, 90, 12, 18, 24]
    return sorted([x for x in base if x != v], key=lambda x: abs(x - v))

def alternos_num(v, palabra):
    base = [1, 2, 3, 5, 6, 10, 15, 20, 30, 60, 90, 12, 18, 24]
    cands = sorted([x for x in base if x != v], key=lambda x: abs(x - v))
    alt = []
    for x in cands:
        if palabra:
            if x in WORD: alt.append(WORD[x])
        else: alt.append(str(x))
        if len(alt) >= 2: break
    return alt

SWAP += [(r'\bpor escrito\b', ['verbalmente', 'de forma tácita']), (r'\bdefinitiv[oa]s?\b', ['provisional', 'condicional']), (r'\bprovisional(?:es)?\b', ['definitivo', 'permanente']),
        (r'\bordinari[oa]s?\b', ['extraordinaria', 'excepcional']), (r'\bextraordinari[oa]s?\b', ['ordinaria', 'permanente']),
        (r'\bvoluntari[oa]s?\b', ['forzosa', 'automática']), (r'\bforzos[oa]s?\b', ['voluntaria', 'automática']),
        (r'\bprevi[oa]s?\b', ['posterior', 'simultánea']), (r'\bposterior\b', ['previa', 'simultánea']),
        (r'\bpersonas físicas\b', ['personas jurídicas', 'entidades públicas']), (r'\bpersonas jurídicas\b', ['personas físicas', 'entidades públicas']),
        (r'\brecurso de alzada\b', ['recurso de reposición', 'recurso extraordinario de revisión']), (r'\brecurso de reposición\b', ['recurso de alzada', 'recurso extraordinario de revisión']),
        (r'\bnulos\b', ['anulables', 'irregulares']), (r'\banulables\b', ['nulos de pleno derecho', 'irregulares']),
        (r'\bnulo de pleno derecho\b', ['anulable', 'irregular']), (r'\banulable\b', ['nulo de pleno derecho', 'irregular']),
        (r'\bnotificación\b', ['publicación', 'comunicación verbal']), (r'\bnotificará\b', ['publicará', 'comunicará verbalmente']),
        (r'\bregistro electrónico\b', ['registro civil', 'registro mercantil']),
        (r'\bAdministración General del Estado\b', ['Administración Local', 'Administración de la Comunidad Autónoma']),
        (r'\bsuspensión\b', ['revocación', 'anulación']), (r'\bcaducidad\b', ['prescripción', 'revocación']), (r'\bprescripción\b', ['caducidad', 'revocación']),
        ]

def fraccion(ok):
    out = []
    for f in FRACC:
        for m in re.finditer(r'\b' + f + r'\b', ok, re.I):
            alts = [x for x in FRACC if x != f][:6]
            alts = sorted(alts, key=lambda x: abs(len(x) - len(f)))[:2]
            out.append((m.start(), m.end(), m.group(0), [cap(a) if m.group(0)[0].isupper() else a for a in alts]))
    return out

def ajusta(orig, alt):
    """Hace concordar la alternativa (una sola palabra) con la palabra original en género y número."""
    if ' ' in alt or ' ' in orig: return alt
    o = orig.lower()
    plural = o.endswith('s') and not o.endswith(('is', 'us'))
    fem = o.rstrip('s').endswith('a')
    if alt.endswith('s'): return alt[0].upper() + alt[1:] if orig[0].isupper() else alt
    base = alt
    if alt.endswith(('o', 'a')): base = alt[:-1] + ('a' if fem else 'o')
    if plural: base += 'es' if base.endswith(('l', 'r', 'z', 'n')) else 's'
    return base[0].upper() + base[1:] if orig[0].isupper() else base

def _ok_alts(ok, alts):
    return all(re.search(r'\b' + re.escape(a) + r'\b', ok, re.I) is None for a in alts)

def _cambios_filtrados(ok):
    return [c for c in _cambios(ok) if _ok_alts(ok, c[3])]

def cambios(ok):
    """Lista de (ini, fin, original, [alt1, alt2]): cambios posibles de una sola palabra o cifra en la respuesta correcta."""
    return list(_cambios_cache(ok))

def _cambios(ok):
    res = fraccion(ok)
    for ini, fin, txt, v, pal, unidad, adj in cifras(ok):
        alts = []
        for x in alternos_valores(v):
            f = forma_cantidad(x, pal, unidad, adj, txt[0].isupper())
            if f and f.lower() != txt.lower(): alts.append(f)
            if len(alts) >= 2: break
        if len(alts) == 2: res.append((ini, fin, txt, alts))
    for pat, alts in SWAP:
        ms = list(re.finditer(pat, ok, re.I))
        if len(ms) != 1 or len(alts) < 2: continue
        if re.search(r'pod[rí]|deb[eé]r|\\bpodr', pat) and re.search(r'\bno\b|ning[uú]n|nunca|jam[aá]s', ok, re.I): continue   # «no podrá» ≈ «no deberá»: ambiguo
        m = ms[0]
        previo = re.findall(r'[\wáéíóúñ]+', ok[:m.start()])[-1:] or ['']
        if previo[0].lower() in ('solo', 'sólo', 'únicamente', 'exclusivamente', 'siempre', 'también', 'ya', 'además', 'nunca', 'que', 'se', 'lo', 'le', 'les') and any(x.startswith('no ') for x in alts[:2]): continue
        res.append((m.start(), m.end(), m.group(0), [ajusta(m.group(0), x) for x in alts[:2]]))
    return res

# ---------- generadores ----------
def gen_minimas(x):
    """«Tres frases iguales donde solo cambia una palabra o cifra»: devuelve preguntas (hasta 2 por pregunta de origen)."""
    out = []
    for ini, fin, orig, alts in cambios(x['ok'])[:2]:
        ok = x['ok']
        ops = [frase(x['tail'], ok)] + [frase(x['tail'], ok[:ini] + a + ok[fin:]) for a in alts]
        if len(set(ops)) < 3: continue
        a_ref = (x['art'] or '') + ('.' + x['ap'] if x['ap'] else '')
        enun = (f"De acuerdo con el artículo {a_ref} de {nombre(x['lx'])}, señale la opción correcta:" if x['lx'] and x['art'] and x['q'][0].startswith('De acuerdo con el art')
                else "Señale la opción correcta:")
        pos = zlib.crc32((enun + ops[0]).encode()) % 3
        o = ops[1:]; o.insert(pos, ops[0])
        cita = f"Art. {a_ref} · {corto(x['lx'])}: " if x['lx'] and x['art'] else ''
        exp = f"{cita}{cap(ops[0])}. Las otras dos frases cambian «{orig}» por «{alts[0]}» y «{alts[1]}»."
        out.append(dict(tipo='mp', q=[enun, o, pos, exp[:420], (f"{x['lx']} {a_ref}" if x['lx'] and x['art'] else x['ref']), 'Una sola palabra cambia el sentido', x['hub'], [],
                        {'nuevo': 1, 'dif': 3, 'hard': 'mp', 'src': f"t{x['n']:02d}-{x['i']+1:03d}"}],
                        cubre=({(x['lx'], x['art'])} if x['lx'] and x['art'] else set()), src={(x['n'], x['i'])}))
    return out


def gen_proposiciones(x):
    """La pregunta existente reescrita como tres proposiciones completas (opciones parecidas entre sí = nivel alto)."""
    ok = x['ok']
    if len(x['bads']) != 2 or not x['lx'] or not x['art']: return []
    ratios = [difflib.SequenceMatcher(None, ok.lower(), b.lower()).ratio() for b in x['bads']]
    if min(ratios) < 0.5 or min(len(ok), *(len(b) for b in x['bads'])) < 14: return []
    ops = [frase(x['tail'], ok)] + [frase(x['tail'], b) for b in x['bads']]
    if len(set(ops)) < 3: return []
    a_ref = x['art'] + ('.' + x['ap'] if x['ap'] else '')
    enun = f"De acuerdo con el artículo {a_ref} de {nombre(x['lx'])}, señale la proposición correcta:"
    pos = zlib.crc32((enun + ops[0]).encode()) % 3
    o = ops[1:]; o.insert(pos, ops[0])
    exp = f"Art. {a_ref} · {corto(x['lx'])}: {cap(ops[0])}."
    return [dict(tipo='mp', q=[enun, o, pos, exp[:420], f"{x['lx']} {a_ref}", 'Opciones casi idénticas', x['hub'], [],
                 {'nuevo': 1, 'dif': 3, 'hard': 'pos', 'src': f"t{x['n']:02d}-{x['i']+1:03d}"}],
                 cubre={(x['lx'], x['art'])}, src={(x['n'], x['i'], 'prop')})]


def gen_triada(x):
    """La afirmación correcta, su negación y la afirmación con otro dato: tres proposiciones casi idénticas sobre el mismo artículo."""
    if not x['lx'] or not x['art'] or len(x['bads']) != 2: return []
    ok = x['ok']; s_ok = frase(x['tail'], ok)
    cerca = sorted(x['bads'], key=lambda b: -difflib.SequenceMatcher(None, ok.lower(), b.lower()).ratio())
    neg_ok = negar(s_ok)
    ops = [s_ok, neg_ok, frase(x['tail'], cerca[0])] if neg_ok else [s_ok, frase(x['tail'], cerca[0]), frase(x['tail'], cerca[1])]
    if len(set(ops)) < 3 or min(len(o) for o in ops) < 30: return []
    a_ref = x['art'] + ('.' + x['ap'] if x['ap'] else '')
    enun = f"De acuerdo con el artículo {a_ref} de {nombre(x['lx'])}, señale la proposición correcta:"
    pos = zlib.crc32((enun + s_ok).encode()) % 3
    o = ops[1:]; o.insert(pos, ops[0])
    exp = f"Art. {a_ref} · {corto(x['lx'])}: {cap(s_ok)}."
    return [dict(tipo='mp', q=[enun, o, pos, exp[:420], f"{x['lx']} {a_ref}", 'La afirmación, su negación y otro dato', x['hub'], [],
                 {'nuevo': 1, 'dif': 3, 'hard': 'pos', 'src': f"t{x['n']:02d}-{x['i']+1:03d}"}],
                 cubre={(x['lx'], x['art'])}, src={(x['n'], x['i'], 'tri')})]

def gen_negativas(xs, n, cuantas, seed=1, maxuso=2):
    """«Señale la INCORRECTA»: dos frases verdaderas (respuestas correctas de otras preguntas) y una falsa (una opción incorrecta)."""
    rnd = random.Random(seed * 100 + n)
    por_art = collections.defaultdict(list); por_ley = collections.defaultdict(list)
    for x in xs: por_art[(x['lx'], x['art'])].append(x); por_ley[x['lx']].append(x)
    out = []; usos = collections.Counter(); falsas = set(); intentos = 0
    anclas = [k for k, v in por_art.items() if v]
    while len(out) < cuantas and intentos < 9000 and anclas:
        intentos += 1
        if intentos <= len(anclas) * 4:
            k = anclas[intentos % len(anclas)]
            c = rnd.choice(por_art[k])
            otros = [z for z in por_ley[c['lx']] if z is not c and (z['art'], z['ap']) != (c['art'], c['ap'])]
            if len(otros) < 2: continue
            a, b = rnd.sample(otros, 2)
            grupo = None
        else:
            k = [k for k, v in por_art.items() if len(v) >= 3]
            if intentos < 4000 and k: grupo = por_art[rnd.choice(k)]
            else: grupo = por_ley[rnd.choice(list(por_ley))]
            if len(grupo) < 3: continue
            a, b, c = rnd.sample(grupo, 3)
        if len({a['ok'], b['ok'], c['ok']}) < 3 or any(usos[z['i']] >= maxuso for z in (a, b, c)): continue
        if len({(z['art'], z['ap']) for z in (a, b, c)}) < 3: continue
        fal = rnd.choice(c['bads'])
        sa, sb, sc = frase(a['tail'], a['ok']), frase(b['tail'], b['ok']), frase(c['tail'], fal)
        if len({sa, sb, sc}) < 3 or sc.lower() in falsas: continue
        mismo = a['art'] == b['art'] == c['art']
        enun = (f"De acuerdo con el artículo {c['art']} de {nombre(c['lx'])}, señale la proposición INCORRECTA:" if mismo
                else f"En relación con lo establecido en {nombre(c['lx'])}, señale la proposición INCORRECTA:")
        pos = zlib.crc32((enun + sc).encode()) % 3
        ops = [sa, sb]; ops.insert(pos, sc)
        exp = f"La incorrecta es «{sc}». Lo correcto: {frase(c['tail'], c['ok'])}."
        out.append(dict(tipo='neg', q=[enun, ops, pos, exp[:420], f"{c['lx']} {c['art']}{('.' + c['ap']) if c['ap'] else ''}", 'Proposición negativa', c['hub'], [],
                        {'nuevo': 1, 'dif': 3, 'neg': 1, 'hard': 'neg'}],
                        cubre={(c['lx'], c['art'])}, src={(n, z['i']) for z in (a, b, c)}))
        falsas.add(sc.lower())
        for z in (a, b, c): usos[z['i']] += 1
    return out


# ---------- generadores desde el TEXTO LITERAL del artículo ----------
MALA_INICIO = re.compile(r'^(Dich[oa]s?|Est[ea]s?|Esto|Tales|Asimismo|Igualmente|También|Además|Así|Por (?:tanto|ello|lo tanto)|Todo ello|No obstante|Sin perjuicio|En (?:este|tal|dicho|estos|tales|los|las|todo|cualquier) |Los mismos|Las mismas|Lo dispuesto|Lo previsto|Cuando (?:se|lo) |Para ello|Si (?:se|lo|no) |Una vez|A estos efectos|A tal fin|A los efectos|De no|En caso)', re.I)
MALA_REF = re.compile(r'\b(anterior(?:es)?|siguientes?|mencionad[oa]s?|citad[oa]s?|presente (?:ley|artículo|apartado)|esta Ley|este artículo|este apartado|dicha|dicho|dichas|dichos|mismo|misma|aquél|aquélla|aquellos|aquellas|ellos|ellas|éstos|éstas|éste|ésta|ésa|ése|tal|tales)\b', re.I)
FORMULA = re.compile(r'[=Σ]|\b[A-Z]{1,4}[a-z]?[A-Z]?\d|\bPI[A-Z]|\bIE[a-z]?\b|\bPFC|\bITE[a-z]?\b|[A-Za-z]\([a-z]\)|\bsiendo\b|\bdonde\b')
VERBO_FINITO = re.compile(r'\b(es|son|será|serán|podrá|podrán|puede|pueden|deberá|deberán|debe|deben|corresponde|corresponden|tiene|tienen|tendrá|tendrán|está|están|estará|estarán|habrá|habrán|goza|gozan|gozarán|garantiza|garantizan|comprende|comprenden|incluye|incluyen|requiere|requieren|exige|exigen|exigirá|produce|producen|producirá|producirán|implica|implican|adopta|adoptará|adoptarán|constituye|constituyen|determina|determinan|establece|establecen|ejerce|ejercen|ejercerá|ejercerán|presta|prestan|prestará|prestarán|realiza|realizan|realizará|forman|forma|cesa|cesan|nombra|nombran|aprueba|aprueban|dictará|dictarán|publicará|publicarán|notificará|notificarán|resolverá|resolverán|iniciará|iniciarán|concede|concederá|se (?:aplica|aplicará|aplican|entiende|entenderá|entenderán|considera|considerará|consideran|establece|establecerá|determina|determinará|regirá|regirán|rige|rigen|produce|producirá|publicará|publicarán|notificará|resolverá|concederá|podrá|podrán|creará|crearán|crea|ajustará|ajustarán|llevará|llevarán|hará|harán|dictará|acordará|acordarán|declarará|declararán|ejercerá|ejercerán|computará|computarán|cuenta|contarán)|ostentan|ostenta|ponen fin|pone fin|surte|surten|surtirá|surtirán|constituirán)\b')
@functools.lru_cache(maxsize=None)
def _frases_ley(lx, art):
    txt = L[lx]['arts'].get(art, '')
    out = []
    lead = None
    def valida(sent):
        if not (60 <= len(sent) <= 270) or not sent[0].isupper(): return False
        if MALA_INICIO.match(sent) or MALA_REF.search(sent) or FORMULA.search(sent): return False
        if sent.count('(') != sent.count(')') or ';' in sent or '  ' in sent: return False
        return bool(VERBO_FINITO.search(sent[:160]))
    for ln in txt.split('\n')[1:]:
        ln = ln.strip()
        es_item = bool(re.match(r'^(?:[a-z]\)|\d+\.[º]|•|[-–])\s*', ln))
        ln = re.sub(r'^\s*(?:\d+\.[º]?|\d+[º.]|[a-z]\)|•|[-–])\s*', '', ln)
        if ln.endswith(':') and not es_item:
            lead = ln.rstrip(':').strip(); continue
        if es_item and lead:
            item = ln.rstrip(';.').strip()
            if item and not MALA_REF.search(item) and ';' not in item:
                it = item[0].lower() + item[1:] if not re.match(r'[A-Z]{2}', item) and item.split()[0] not in ('Estado', 'Administración', 'Administraciones', 'Gobierno', 'Cortes', 'Pleno', 'Alcalde', 'Consejo', 'Ley', 'Constitución') else item
                sent = f"{lead} {it}"
                if valida(sent): out.append(sent)
            continue
        if not es_item: lead = None
        for sent in re.split(r'(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])', ln):
            sent = sent.strip().rstrip('.').strip()
            if valida(sent): out.append(sent)
    return tuple(out)

def frases_ley(lx, art):
    return list(_frases_ley(lx, art))

@functools.lru_cache(maxsize=None)
def _cambios_cache(ok):
    return tuple(_cambios_filtrados(ok))

VERBOS = r'\b(es|son|será|serán|podrá|podrán|deberá|deberán|corresponde|corresponden|tiene|tienen|tendrá|tendrán|se rige|se regirá|estará|estarán|gozan|goza|garantiza|reconoce|procede|proceden|requiere|requerirá|exigirá|exige|concede|producirá|producen|produce|implica|supone|comprende|comprenden|incluye|prestará|prestarán|ejercerá|ejercen|ejerce)\b'
def negar(sent):
    """La misma frase con un «no» delante del primer verbo: si la original es verdadera, esta es falsa."""
    if re.search(r'\bno\b|\bning[uú]n[oa]?s?\b|\bnunca\b|\bjam[aá]s\b|\btampoco\b|\bsin\b|\bni\b', sent, re.I): return None
    m = re.search(VERBOS, sent)
    if not m or m.start() < 8: return None
    ini = m.start()
    prev = re.findall(r'[\wáéíóúñ]+', sent[:ini])[-1:] or ['']
    if prev[0].lower() in ('solo', 'sólo', 'únicamente', 'exclusivamente', 'siempre', 'también', 'ya', 'que'): return None
    if sent[:ini].endswith('se '): ini -= 3
    return sent[:ini] + 'no ' + sent[ini:]

def aplicar_cambio(sent, cb, k):
    ini, fin, orig, alts = cb
    return sent[:ini] + alts[k] + sent[fin:]

def gen_ley_minimas(lx, art, n, maxn=8):
    out = []
    for sent, cb in [(se, c) for se in frases_ley(lx, art) for c in cambios(se)[:2]]:
        ops = [sent, aplicar_cambio(sent, cb, 0), aplicar_cambio(sent, cb, 1)]
        if len(set(ops)) < 3: continue
        enun = f"De acuerdo con el artículo {art} de {nombre(lx)}, señale la opción correcta:"
        pos = zlib.crc32((enun + sent).encode()) % 3
        o = ops[1:]; o.insert(pos, ops[0])
        exp = f"Art. {art} · {corto(lx)}: {sent}. Las otras dos frases cambian «{cb[2]}» por «{cb[3][0]}» y «{cb[3][1]}»."
        out.append(dict(tipo='mp', q=[enun, o, pos, exp[:420], f"{lx} {art}", 'Una sola palabra cambia el sentido', '', [],
                        {'nuevo': 1, 'dif': 3, 'hard': 'mp'}], cubre={(lx, art)}, src={('s', sent, cb[2])}))
        if len(out) >= maxn: break
    return out

def _vecinas(fichas, k, ks, por_art):
    """Frases de los artículos de la misma ley que están a ≤3 puestos del artículo k en el temario."""
    i = fichas.index(k)
    return [(kk, ss) for j, kk in enumerate(fichas) if kk[0] == k[0] and abs(j - i) <= 3 and kk in por_art for ss in por_art[kk]]

def gen_ley_negativas(fichas, n, cuantas, seed=1):
    """«Señale la INCORRECTA» con frases literales: dos verdaderas del artículo (o de la misma ley) y una falsa
    (la misma frase con una palabra cambiada o con un «no»)."""
    rnd = random.Random(seed * 31 + n)
    por_art = {k: frases_ley(*k) for k in fichas}
    ks = [k for k in fichas if por_art[k]]
    out = []; uso = collections.Counter(); falsas_usadas = set(); intentos = 0
    while len(out) < cuantas and intentos < 25000 and ks:
        intentos += 1
        k = ks[intentos % len(ks)] if intentos <= len(ks) * 6 else rnd.choice(ks)   # primero se recorre cada artículo varias veces: cobertura
        ancla = (k, rnd.choice(por_art[k]))
        pool = [t for t in _vecinas(fichas, k, ks, por_art) if t != ancla]
        if len(pool) < 2: continue
        trio = [ancla] + rnd.sample(pool, 2)
        if len({ss for _, ss in trio}) < 3: continue
        falsa = None
        for idx, (kk, ss) in enumerate(trio):   # primero se intenta alterar la frase anclada: así la «ref» es el artículo que se quería cubrir
            cbs = cambios(ss)
            if cbs: cb = cbs[0]; falsa = aplicar_cambio(ss, cb, rnd.randrange(2)); motivo = f"cambia «{cb[2]}»"
            else:
                ng = negar(ss)
                if ng: falsa = ng; motivo = 'niega lo que dice la ley'
            if falsa: kf, sf = kk, ss; verdaderas = [t for j, t in enumerate(trio) if j != idx]; break
        if not falsa or falsa in falsas_usadas: continue
        if any(uso[ss] >= 4 for _, ss in trio): continue
        arts = {kk for kk, _ in trio}
        enun = (f"De acuerdo con el artículo {k[1]} de {nombre(k[0])}, señale la proposición INCORRECTA:" if len(arts) == 1
                else f"En relación con lo establecido en {nombre(k[0])}, señale la proposición INCORRECTA:")
        ops = [verdaderas[0][1], verdaderas[1][1]]; pos = zlib.crc32((enun + falsa).encode()) % 3; ops.insert(pos, falsa)
        exp = f"La incorrecta es «{falsa}»: {motivo}. Lo correcto: «{sf}»."
        out.append(dict(tipo='neg', q=[enun, ops, pos, exp[:420], f"{kf[0]} {kf[1]}", 'Proposición negativa', '', [],
                        {'nuevo': 1, 'dif': 3, 'neg': 1, 'hard': 'neg'}], cubre={kf}, src={('s', sf, 'neg')}))
        falsas_usadas.add(falsa)
        for _, ss in trio: uso[ss] += 1
    return out


def gen_ley_positivas(fichas, n, cuantas, seed=1):
    """«Señale la CORRECTA» con frases literales: una verdadera y dos falsas (palabra cambiada o con «no»)."""
    rnd = random.Random(seed * 53 + n)
    por_art = {k: frases_ley(*k) for k in fichas}
    ks = [k for k in fichas if por_art[k]]
    out = []; uso = collections.Counter(); falsas_usadas = set(); intentos = 0
    while len(out) < cuantas and intentos < 25000 and ks:
        intentos += 1
        k = ks[intentos % len(ks)] if intentos <= len(ks) * 6 else rnd.choice(ks)   # primero se recorre cada artículo varias veces: cobertura
        ancla = (k, rnd.choice(por_art[k]))
        pool = [t for t in _vecinas(fichas, k, ks, por_art) if t != ancla]
        if len(pool) < 2: continue
        trio = [ancla] + rnd.sample(pool, 2)
        if len({ss for _, ss in trio}) < 3 or any(uso[ss] >= 4 for _, ss in trio): continue
        verdadera = trio[0]; falsas = []; motivos = []
        for kk, ss in trio[1:]:
            cbs = cambios(ss)
            if cbs: cb = cbs[0]; f = aplicar_cambio(ss, cb, rnd.randrange(2)); motivos.append(f"«{ss}» (la otra frase cambia «{cb[2]}»)")
            else:
                f = negar(ss)
                if f: motivos.append(f"«{ss}» (la otra frase la niega)")
            if not f or f in falsas_usadas: break
            falsas.append(f)
        if len(falsas) != 2 or len(set(falsas)) < 2: continue
        arts = {kk for kk, _ in trio}
        enun = (f"De acuerdo con el artículo {k[1]} de {nombre(k[0])}, señale la proposición CORRECTA:" if len(arts) == 1
                else f"En relación con lo establecido en {nombre(k[0])}, señale la proposición CORRECTA:")
        pos = zlib.crc32((enun + verdadera[1]).encode()) % 3
        ops = list(falsas); ops.insert(pos, verdadera[1])
        exp = f"La correcta es «{verdadera[1]}». Las otras dos son falsas: lo correcto es " + ' y '.join(motivos[:2]) + '.'
        out.append(dict(tipo='pos', q=[enun, ops, pos, exp[:420], f"{verdadera[0][0]} {verdadera[0][1]}", 'Frases casi idénticas', '', [],
                        {'nuevo': 1, 'dif': 3, 'hard': 'pos'}], cubre={verdadera[0]}, src={('s', verdadera[1], 'pos')}))
        falsas_usadas.update(falsas)
        for _, ss in trio: uso[ss] += 1
    return out

# ---------- selección del test completo ----------
def puntos_existente(q):
    """Dureza de una pregunta ya existente: negativas y mínimas > examen real > nivel 3 por datos."""
    ex = q[8] if len(q) > 8 and isinstance(q[8], dict) else {}
    if ex.get('neg') or ex.get('hard') == 'neg': return 5
    if ex.get('hard') in ('mp', 'pos', 'man'): return 4
    if ex.get('z'): return 3
    if ex.get('dif') == 3: return 2
    return 0

def clave_art(q):
    m = re.match(r'^([a-z0-9-]+) ((?:D[ATFD])?\d+(?: bis| ter)?)', str(q[4]))
    return (m.group(1), m.group(2)) if m else None

def construir(n, aplicar=False, verbose=True):
    f = os.path.join(R, f'tema{n:02d}.json')
    t = json.load(open(f, encoding='utf-8'))
    t['preguntas'] = [q for q in t['preguntas'] if not (isinstance(q, list) and len(q) > 8 and isinstance(q[8], dict) and q[8].get('hard') in ('mp', 'neg', 'pos'))]
    P = t['preguntas']
    fichas = [(a[0], str(a[1])) for e in t['epigrafes'] for a in e.get('articulos', [])]
    # candidatas existentes (nivel alto) y generadas
    ex_c = []
    xs = []
    for i, q in enumerate(P):
        if not activa(q) or not isinstance(q, list): continue
        ex = extra(q)
        if ex.get('hard') in ('mp', 'neg', 'pos') and not ex.get('tc'): continue    # generadas en una pasada anterior que no se eligieron: ya están ocultas o se reutilizan
        k = key_flex(q, fichas)
        s = puntos_existente(q)
        if s >= 2 and k: ex_c.append(dict(tipo='ex', idx=i, puntos=s, cubre={k}, src={(n, i)}, q=q))
        x = info(n, i, q, fichas)
        if x: xs.append(x)
    gen = []
    for x in xs:
        gen += gen_minimas(x)
        gen += gen_proposiciones(x)
        gen += gen_triada(x)
    gen += gen_negativas([x for x in xs if x['lx'] and x['art']], n, 120)
    for lx_, art_ in fichas:
        if lx_ in L: gen += gen_ley_minimas(lx_, art_, n)
    gen += gen_ley_negativas([k for k in fichas if k[0] in L], n, 220)
    gen += gen_ley_positivas([k for k in fichas if k[0] in L], n, 220)
    for g in gen: g['puntos'] = 5 if g['tipo'] == 'neg' else 4
    vistos = set(); gen_unica = []
    for g in gen:
        clave = (g['q'][0], tuple(g['q'][1]))
        if clave in vistos: continue
        vistos.add(clave); gen_unica.append(g)
    gen = gen_unica
    cand = ex_c + gen
    # --- cobertura: al menos una por ficha (primero mínimas y existentes; las «INCORRECTA» solo si no hay otra) ---
    elegidas = []; cubiertas = set(); usadas_src = set()
    es_neg = lambda c: c['tipo'] == 'neg' or (c['tipo'] == 'ex' and c['puntos'] == 5)
    def elegir(c):
        elegidas.append(c); cubiertas.update(c['cubre']); usadas_src.update(c['src'])
    por_ficha = collections.defaultdict(list)
    for c in cand:
        for k in c['cubre']: por_ficha[k].append(c)
    rnd = random.Random(7 + n)
    for k in sorted(fichas, key=lambda k: len(por_ficha[k])):
        if k in cubiertas: continue
        ops = [c for c in por_ficha[k] if c not in elegidas and not (c['src'] & usadas_src)] or [c for c in por_ficha[k] if c not in elegidas]
        if not ops: continue
        unicas = [c for c in ops if not es_neg(c)]
        pool = unicas or ops
        pool.sort(key=lambda c: (-c['puntos'] if c['tipo'] == 'ex' else 0, rnd.random()))
        elegir(pool[0])
    sin = [k for k in fichas if k not in cubiertas]
    # --- relleno hasta 150: ~1/3 de «INCORRECTA», el resto mínimas y existentes de nivel alto ---
    def libres(tipo, neg_ok=None):
        l = [c for c in cand if c not in elegidas and c['tipo'] == tipo and not (c['src'] & usadas_src) and (neg_ok is None or es_neg(c) == neg_ok)]
        rnd.shuffle(l); return l
    n_neg = lambda: sum(1 for c in elegidas if es_neg(c))
    OBJ_NEG = 50
    for c in libres('neg') + libres('ex', True):
        if len(elegidas) >= OBJETIVO or n_neg() >= OBJ_NEG: break
        elegir(c)
    resto = libres('mp') + libres('pos') + libres('ex', False)
    rnd.shuffle(resto)
    for c in resto:
        if len(elegidas) >= OBJETIVO: break
        elegir(c)
    for c in libres('neg') + libres('ex', True):
        if len(elegidas) >= OBJETIVO: break
        elegir(c)
    # si aún faltan, se permite repetir fuente con otra formulación
    if len(elegidas) < OBJETIVO:
        for c in sorted([c for c in cand if c not in elegidas], key=lambda c: -c['puntos']):
            if len(elegidas) >= OBJETIVO: break
            elegidas.append(c)
    elegidas = elegidas[:OBJETIVO] if len(elegidas) > OBJETIVO and not sin else elegidas
    res = dict(n=n, fichas=len(fichas), elegidas=len(elegidas), sin_cubrir=sin,
               neg=sum(1 for c in elegidas if c['tipo'] == 'neg' or (c['tipo'] == 'ex' and c['puntos'] == 5)),
               mp=sum(1 for c in elegidas if c['tipo'] in ('mp', 'pos')), ex=sum(1 for c in elegidas if c['tipo'] == 'ex'),
               nuevas=sum(1 for c in elegidas if c['tipo'] in ('mp', 'neg', 'pos')), lista=elegidas)
    if aplicar:
        for q in P:
            if isinstance(q, list) and len(q) > 8 and isinstance(q[8], dict): q[8].pop('tc', None)
        elegidas_gen = [c for c in elegidas if c['tipo'] in ('mp', 'neg', 'pos')]
        # las generadas en una pasada anterior que ya no se eligen quedan ocultas
        for q in P:
            if isinstance(q, list) and len(q) > 8 and isinstance(q[8], dict) and q[8].get('hard') in ('mp', 'neg', 'pos') and not q[8].get('tc'): q[8]['off'] = 1
        for c in elegidas_gen:
            c['q'][1] = [cap(x) for x in c['q'][1]]
        for c in elegidas:
            if c['tipo'] == 'ex':
                ex = extra(c['q']); ex['tc'] = 1; ex['dif'] = 3
        for c in elegidas_gen:
            q = c['q']; q[8]['tc'] = 1
            if not any(isinstance(z, list) and z[0] == q[0] and z[1] == q[1] for z in P): P.append(q)
        json.dump(t, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return res

if __name__ == '__main__':
    aplicar = '--aplicar' in sys.argv
    solo = [int(a) for a in sys.argv[1:] if a.isdigit()]
    tot = collections.Counter()
    for n in (solo or range(1, 21)):
        r = construir(n, aplicar)
        print(f"T{n:>2}: fichas {r['fichas']:>3} | test completo {r['elegidas']:>3} (negativas {r['neg']}, mínimas {r['mp']}, existentes {r['ex']}, nuevas {r['nuevas']}) | sin cubrir: {len(r['sin_cubrir'])}",
              ('' if not r['sin_cubrir'] else r['sin_cubrir'][:6]))
