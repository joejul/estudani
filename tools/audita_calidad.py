#!/usr/bin/env python3
"""Auditoría de calidad de las preguntas activas (no `off`). Marca las que conviene revisar a mano.
  python3 tools/audita_calidad.py           # resumen
  python3 tools/audita_calidad.py -v        # lista los casos
Criterios: (1) formato; (2) la respuesta correcta se apoya en el texto del artículo citado; (3) distractores casi idénticos
a la correcta; (4) en las «INCORRECTA», que la frase falsa no esté literalmente en el artículo; (5) erratas típicas."""
import json, re, sys, os, unicodedata, difflib, collections
R = os.path.join(os.path.dirname(__file__), '..', 'data')
L = json.load(open(os.path.join(R, 'leyes.json'), encoding='utf-8'))
def norm(s): return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode())).strip()
STOP = set('para como sobre entre desde hasta cuando donde segun podra podran seran sera deberan tendra tendran cada estos estas esta este esos solo mismo misma otros otras todos todas puede pueden ambos articulo ley caso casos forma efectos plazo plazos'.split())
def pal(s): return {w for w in norm(s).split() if len(w) >= 5 and w not in STOP}
NUM = {'un':1,'una':1,'uno':1,'dos':2,'tres':3,'cuatro':4,'cinco':5,'seis':6,'siete':7,'ocho':8,'nueve':9,'diez':10,'once':11,'doce':12,'quince':15,'veinte':20,'treinta':30,'veintidos':22,'dieciseis':16,'dieciocho':18,'diecinueve':19,'cuarenta':40,'cincuenta':50,'sesenta':60,'setenta':70,'noventa':90,'cien':100,'catorce':14,'trece':13,'veinticuatro':24,'veinticinco':25}
def nums(s):
    t = norm(re.sub(r'(?<=\d)\.(?=\d{3})', '', s)); r = set(re.findall(r'\d+', t))
    for w, v in NUM.items():
        if re.search(r'\b' + w + r'\b', t): r.add(str(v))
    return r
def activa(q):
    return not ((isinstance(q, list) and len(q) > 8 and isinstance(q[8], dict) and q[8].get('off')) or (isinstance(q, dict) and q.get('off')))
def main():
    verb = '-v' in sys.argv
    cont = collections.Counter(); casos = collections.defaultdict(list); total = 0
    for n in range(1, 21):
        t = json.load(open(os.path.join(R, f'tema{n:02d}.json'), encoding='utf-8'))
        for i, q in enumerate(t['preguntas']):
            if not activa(q) or not isinstance(q, list): continue
            total += 1
            enun, o, c, e, ref = q[0], q[1], q[2], q[3], str(q[4]); ex = q[8] if len(q) > 8 and isinstance(q[8], dict) else {}
            ident = f'T{n}#{i+1}'
            def flag(k, msg): cont[k] += 1; casos[k].append((ident, ref, enun[-80:], msg))
            # (1) formato
            if len(o) != 3 or len({norm(x) for x in o}) != 3: flag('formato', 'opciones repetidas o no son 3')
            for txt in [enun] + o:
                if re.search(r'\S  \S| ,|[^.]\.\.[^.]|\bde el\b|\ba el\b', txt): flag('errata', 'espacio doble, coma suelta o «de el»: ' + txt[:50]); break
            if not e or len(e) < 25 or re.match(r'^Art\. [\w.ºª ]+\.$', e): flag('formato', 'explicación vacía o demasiado corta')
            # (3) distractores casi idénticos a la correcta
            generada = bool(ex.get('hard') or ex.get('neg'))   # las del test completo cambian una sola palabra a propósito
            for k, x in enumerate(o):
                if not generada and k != c and difflib.SequenceMatcher(None, norm(x), norm(o[c])).ratio() > 0.93 and nums(x) == nums(o[c]):
                    flag('distractor_igual', f'«{x[:60]}» ≈ correcta'); break
            m = re.match(r'^([a-z0-9-]+) ((?:D[ATFD])?\d+(?: bis| ter)?)', ref)
            if not m: continue
            art = L.get(m.group(1), {}).get('arts', {}).get(m.group(2), '')
            if not art: flag('sin_texto', 'el artículo no está en leyes.json'); continue
            A = pal(art); NA = nums(art)
            if ex.get('neg') and not ex.get('hard'):
                # frases verdaderas: 2 opciones; la falsa: la correcta. La falsa no debe estar literalmente en el artículo
                f = o[c]; w = pal(f)
                if w and len(w & A) / len(w) >= 0.97 and nums(f) <= NA and len(w) >= 6: flag('neg_falsa_sospechosa', 'la «falsa» coincide casi del todo con el artículo')
            elif not ex.get('hard'):
                w = pal(o[c]) | pal(enun.split(',', 1)[-1]); wc = pal(o[c])
                if wc and len(wc & A) / len(wc) < 0.45: flag('correcta_poco_apoyada', f'solo {round(100*len(wc & A)/len(wc))} % de las palabras de la correcta están en el artículo')
                nc = nums(o[c]) - nums(ref) - nums(enun)
                if nc and not nc <= NA: flag('cifra_no_en_articulo', f'cifras {sorted(nc)} no figuran en el artículo')
                # un distractor numérico que SÍ está en el artículo y la correcta no comparte número: posible doble respuesta
    print('preguntas activas:', total)
    for k, v in cont.most_common(): print(f'  {k}: {v}')
    json.dump({k: v for k, v in casos.items()}, open('/tmp/calidad.json', 'w'), ensure_ascii=False)
    if verb:
        for k, v in casos.items():
            print('\n##', k)
            for x in v[:60]: print('  ', x)
main()
