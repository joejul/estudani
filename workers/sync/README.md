# Servicio de sincronización de EstuDani

Un Cloudflare Worker (código en `index.js`) que guarda el progreso de cada usuario en un KV, bajo un identificador
derivado del código de sincronización. Plan gratuito de Cloudflare: sobra de largo (el límite es de 1.000 escrituras al día).

## Desplegar desde el panel de Cloudflare (sin instalar nada)

1. <https://dash.cloudflare.com> → **Workers y Pages** → **Crear** → **Empezar con Hello World** → nombre `estudani-sync` → **Implementar**.
2. En el worker: **Editar código** → borra todo, pega el contenido de `index.js` → **Implementar**.
3. Menú **Almacenamiento y bases de datos** → **KV** → **Crear espacio de nombres** → nombre `estudani-progreso`.
4. Vuelve al worker → **Configuración** → **Enlaces** → **Agregar** → **Espacio de nombres KV** → nombre de variable **`STORE`** (exacto, en mayúsculas) → elige `estudani-progreso` → **Implementar**.
5. Abre la URL del worker (`https://estudani-sync.<tu-usuario>.workers.dev`). Debe responder `{"ok":true,"servicio":"estudani-sync"}`.
6. Esa URL es la que va en `js/config.js` (`SYNC_URL`), sin barra final.

Opcional: en **Configuración → Variables** añade `ALLOWED_ORIGIN` con la web de la app (por ejemplo `https://joejul.github.io`) para que solo ella pueda usar el servicio.

## Desplegar con la línea de comandos

```bash
cd workers/sync
npx wrangler kv namespace create STORE    # copia el id en wrangler.toml
npx wrangler deploy
```
