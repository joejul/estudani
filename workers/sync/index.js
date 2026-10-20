// EstuDani · sincronización del progreso (Cloudflare Worker + KV).
// Guarda un único JSON por dispositivo vinculado, bajo un identificador de 64 caracteres hexadecimales
// (el SHA-256 del código de sincronización: el servidor nunca ve el código). Quien conozca ese identificador
// puede leer y escribir ese progreso, y nada más: no hay listados ni otras rutas.
const MAX = 900 * 1024; // bytes máximos por progreso

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };
    const resp = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const m = new URL(req.url).pathname.match(/^\/sync\/([a-f0-9]{64})$/);
    if (!m) return resp({ ok: true, servicio: 'estudani-sync' });
    const clave = `p:${m[1]}`;

    if (req.method === 'GET') {
      const v = await env.STORE.get(clave);
      if (v === null) return resp({ vacio: true }, 404);
      return new Response(v, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    if (req.method === 'PUT') {
      const texto = await req.text();
      if (texto.length > MAX) return resp({ error: 'demasiado grande' }, 413);
      let o;
      try { o = JSON.parse(texto); } catch { return resp({ error: 'json no válido' }, 400); }
      if (!o || typeof o !== 'object' || !o.preguntas || !o.ajustes) return resp({ error: 'formato no válido' }, 400);
      await env.STORE.put(clave, texto);
      return resp({ ok: true, t: Date.now() });
    }
    return resp({ error: 'método no permitido' }, 405);
  },
};
