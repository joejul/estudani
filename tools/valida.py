#!/usr/bin/env python3
"""Valida y registra temas.   python3 tools/valida.py 13 17      (o --todos)
Comprueba: opciones y respuesta, palabras clave dentro de la pregunta, ideas (hubs) existentes,
epígrafes enlazados, términos del glosario ([[id]]) y tipos de diagrama. Registra el tema en
data/temas.json y en sw.js si faltaba."""
import json, re, sys, os
R = os.path.join(os.path.dirname(__file__), '..')
D = lambda f: os.path.join(R, 'data', f)
glos = {g['id'] for g in json.load(open(D('glosario.json'), encoding='utf-8'))}
TIPOS = {'tiles', 'timeline', 'tarjetas', 'piramide', 'barras', 'contraste', 'anidado', 'flujo'}

def valida(n):
    f = f'tema{n:02d}'
    t = json.load(open(D(f + '.json'), encoding='utf-8'))
    v = json.load(open(D(f + '-visual.json'), encoding='utf-8'))
    largas = [q for q in t['preguntas'] if isinstance(q, dict)]
    if largas:  # T1 conserva preguntas en formato largo (prototipo): se comprueban solo opciones y respuesta
        for q in largas:
            if len(q['o']) != 3 or not 0 <= q['c'] < 3: print(f"T{n}: {q['id']}: debe tener 3 opciones"); return False
        t['preguntas'] = [q for q in t['preguntas'] if not isinstance(q, dict)]
        print(f'T{n}: {len(largas)} preguntas en formato largo (3 opciones OK)')
    err = []
    for g in v.get('glosario', []):
        glos.add(g[0] if isinstance(g, list) else g['id'])
    hubs = {h['id'] for h in v['hubs']}
    epis = {e['id'] for e in t['epigrafes']}
    nopt = set()
    fichas = {(a[0], str(a[1])) for e in t['epigrafes'] for a in e.get('articulos', [])}
    for i, q in enumerate(t['preguntas']):
        enun, o, c, e, ref, tr, hub, cl, ex = (q + [None] * 9)[:9]
        nopt.add(len(o))
        if not (len(o) in (3, 4) and isinstance(c, int) and 0 <= c < len(o)): err.append(f'P{i+1}: opciones/c')
        nueva = re.match(r'^([a-z0-9-]+) ((?:D[ATFD])?\d+(?: bis| ter)?)', str(ref))
        if nueva:
            if (nueva.group(1), nueva.group(2)) not in fichas: err.append(f'P{i+1}: sin ficha {ref}')
            if len(o) != 3: err.append(f'P{i+1}: debe tener 3 opciones')
            if len(set(x.strip().lower() for x in o)) != len(o): err.append(f'P{i+1}: opciones repetidas')
        elif hub not in hubs: err.append(f'P{i+1}: hub {hub}')
        if not e or not ref: err.append(f'P{i+1}: falta explicación/ref')
        for k in (cl or []):
            if k.lower() not in (enun + ' || ' + o[c]).lower(): err.append(f'P{i+1}: clave «{k}»')
    if largas:
        print(f'T{n}: {len(t["preguntas"])} preguntas nuevas →', 'OK' if not err else 'ERRORES: ' + '; '.join(err)); return not err
    for h in v['hubs']:
        if h['epi'] not in epis: err.append(f"hub {h['id']}: epi {h['epi']}")
        if sum(1 for p in h['pistas'] if p[0] != 't' and not (len(p) > 2 and p[2])) < 2: err.append(f"hub {h['id']}: pocas pistas")
        for c in h.get('confunde', []):
            if c not in hubs: err.append(f"hub {h['id']}: confunde {c}")
    for b in v['esquema']:
        if b['t'] not in TIPOS: err.append('diagrama ' + b['t'])
        if b.get('epi') and b['epi'] not in epis: err.append('diagrama epi ' + b['epi'])
    if len(v['mapaEpis']) != len(t['mapa']['ramas']): err.append('mapaEpis ≠ ramas')
    txt = open(D(f + '.json'), encoding='utf-8').read() + open(D(f + '-visual.json'), encoding='utf-8').read()
    for m in set(re.findall(r'\[\[([\w-]+)(?:\|[^\]]*)?\]\]', txt)):
        if m not in glos and m != 'glosario': err.append(f'glosario [[{m}]]')
    # registro
    ti = json.load(open(D('temas.json'), encoding='utf-8'))
    for x in ti['temas']:
        if x['n'] == n: x['archivo'] = f + '.json'; x['visual'] = f + '-visual.json'
    json.dump(ti, open(D('temas.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    sw = open(os.path.join(R, 'sw.js'), encoding='utf-8').read()
    if f + '.json' not in sw:
        sw = sw.replace("'data/tema12.json',", f"'data/{f}.json',\n  'data/{f}-visual.json',\n  'data/tema12.json',")
        open(os.path.join(R, 'sw.js'), 'w', encoding='utf-8').write(sw)
    nq = len(t['preguntas']); tr = sum(1 for q in t['preguntas'] if len(q) > 5 and q[5])
    print(f'T{n}: {nq} preguntas ({tr} trampa), {len(v["hubs"])} ideas, {len(v["esquema"])} diagramas, opciones {sorted(nopt)} →', 'OK' if not err else 'ERRORES: ' + '; '.join(err))
    return not err

a = sys.argv[1:]
ns = [int(x) for x in a if x.isdigit()]
if '--todos' in a:
    ns = sorted(int(m.group(1)) for fn in os.listdir(D('.')) if (m := re.match(r'tema(\d+)-visual\.json$', fn)))
sys.exit(0 if all(valida(n) for n in ns) else 1)
