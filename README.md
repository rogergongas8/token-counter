# Token Counter (sitio estático)

Contador de tokens y calculadora de coste de API. Todo corre en el navegador del visitante: no hay servidor, base de datos ni claves. Coste de alojamiento: 0 €.

## Archivos
- `index.html`, `style.css`, `app.js`: la web.
- `js/o200k.js`, `js/cl100k.js`: tokenizadores de OpenAI empaquetados (librería `gpt-tokenizer`, licencia MIT). Se cargan bajo demanda.
- `robots.txt`, `_headers`: SEO básico y caché (`_headers` lo usa Cloudflare Pages).
- `build/`: código fuente para regenerar los tokenizadores (`npm install` y luego los comandos de `esbuild`; ver abajo).

## Probar en local
```bash
cd token-counter-site
python3 -m http.server 8765
# abre http://localhost:8765
```
(Hace falta un servidor; abrir `index.html` con doble clic no funciona porque usa módulos de JavaScript.)

## Publicar gratis (elige una)
**Cloudflare Pages** (recomendado, sin límite de ancho de banda en el plan gratis):
1. Crea una cuenta en cloudflare.com y ve a Workers & Pages → Create → Pages → Upload assets.
2. Sube la carpeta `token-counter-site` (sin `build/node_modules`).
3. Te dará una URL tipo `tu-proyecto.pages.dev`.

**Vercel** o **Netlify**: arrastra la carpeta a su panel; ambos tienen plan gratuito.

Después:
- Registra la URL en **Google Search Console** y envía el sitemap.
- Activa **Cloudflare Web Analytics** (gratis, sin cookies) para medir visitas.
- Un dominio propio cuesta unos 10 €/año; es opcional.

## Actualizar precios
Los precios están en `app.js` (lista `MODELS`) con fecha 2026-11-09 y enlace a las páginas oficiales. Cuando cambien, edita esa lista y vuelve a publicar.

## Regenerar los tokenizadores
```bash
cd build
npm install
npx esbuild src/o200k.js --bundle --minify --format=esm --outfile=../js/o200k.js
npx esbuild src/cl100k.js --bundle --minify --format=esm --outfile=../js/cl100k.js
```

## Límites que conviene conocer
- Los recuentos de OpenAI son exactos solo para las codificaciones `o200k_base` y `cl100k_base`. No se ha podido confirmar qué codificación usa cada modelo más nuevo.
- El recuento de Claude es una **estimación** (el tokenizador de Anthropic no es público). Está indicado en la web.
- Los precios son los base por token; no incluyen caché, descuentos por lotes ni recargos regionales.
- No hay anuncios ni afiliados todavía. Añádelos solo cuando haya tráfico.

## Catálogo de modelos y precios (actualización automática)
- `scripts/update-models.mjs` descarga la lista pública de modelos de OpenRouter y genera `data/models.json`, las páginas estáticas `prices/*.html` y `sitemap.xml`. No escribe nada si no hay cambios.
- `.github/workflows/update-models.yml` lo ejecuta cada día (04:17 UTC) y también a mano desde la pestaña Actions de GitHub. Si hay cambios, hace commit y Vercel despliega solo.
- La web carga `data/models.json` al abrirse; si falla, muestra solo los modelos principales.
- Los precios del catálogo son los que lista OpenRouter y pueden diferir de los del proveedor. Los 8 modelos principales de `app.js` se copiaron de las páginas oficiales (2026-11-09) y esos hay que revisarlos a mano.

Probar en local: `node scripts/update-models.mjs` y `python3 -m http.server 8765`.
