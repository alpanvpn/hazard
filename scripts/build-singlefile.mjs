import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const publicDir = path.join(root, 'public');
const soundsDir = path.join(publicDir, 'sounds');

// Locate compiled Tailwind + app CSS produced by `vite build`
const cssFile = fs
  .readdirSync(distAssetsDir)
  .find((f) => f.endsWith('.css'));

if (!cssFile) {
  throw new Error('Compiled CSS file not found in dist/assets. Run `npm run build` first.');
}

const compiledCss = fs.readFileSync(path.join(distAssetsDir, cssFile), 'utf8');
const workletCode = fs.readFileSync(path.join(publicDir, 'hazard-worklet.js'), 'utf8');
const metaJson = JSON.parse(fs.readFileSync(path.join(soundsDir, 'meta.json'), 'utf8'));
const svgIcon = fs.readFileSync(path.join(publicDir, 'icon.svg'), 'utf8');
const svgIconUri = `data:image/svg+xml;base64,${Buffer.from(svgIcon, 'utf8').toString('base64')}`;

const wavNames = ['wail', 'yelp', 'phaser', 'horn', 'tone', 'wolf'];
const wavBase64 = {};
for (const name of wavNames) {
  const wavBuf = fs.readFileSync(path.join(soundsDir, `${name}.wav`));
  wavBase64[name] = wavBuf.toString('base64');
}

const phraseIds = ['obochina', 'vpravo_stop', 'prizhatsa', 'strelyat', 'ostanavlivaemsya', 'voditel_stop'];
const phrasesBase64 = {};
for (const id of phraseIds) {
  const mp3Buf = fs.readFileSync(path.join(soundsDir, 'phrases', `${id}.mp3`));
  phrasesBase64[id] = mp3Buf.toString('base64');
}

const inlinePayload = JSON.stringify({
  workletCode,
  meta: metaJson,
  wavBase64,
  phrasesBase64,
}).replace(/<\/script>/gi, '<\\/script>');

// Bundle React App into a single classic IIFE script (works both via https:// and offline file://)
const bundled = await esbuild.build({
  stdin: {
    contents: `
      import { createRoot } from 'react-dom/client';
      import App from './src/App.tsx';
      createRoot(document.getElementById('root')).render(<App />);
    `,
    resolveDir: root,
    loader: 'tsx',
  },
  bundle: true,
  minify: true,
  legalComments: 'none',
  format: 'iife',
  target: ['es2020', 'safari15'],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  write: false,
});

const appJs = bundled.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
const safeCss = compiledCss.replace(/<\/style>/gi, '<\\/style>');

const singleHtml = `<!doctype html>
<html lang="ru" data-theme="hardware">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#030406" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Hazard 7007" />
    <title>Alpan Siren 7007</title>
    <meta name="description" content="Электронный пульт спецсигналов Hazard 7007 с работой поверх фоновой музыки." />
    <link rel="icon" type="image/svg+xml" href="${svgIconUri}" />
    <link rel="apple-touch-icon" href="${svgIconUri}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
    <style>${safeCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>window.__ALPAN_INLINE__=${inlinePayload};</script>
    <script>${appJs}</script>
  </body>
</html>
`;

fs.writeFileSync(path.join(publicDir, 'alpan-siren-7007-single.html'), singleHtml, 'utf8');
fs.writeFileSync(path.join(distDir, 'alpan-siren-7007-single.html'), singleHtml, 'utf8');
console.log(
  `Generated standalone single-file HTML (${(Buffer.byteLength(singleHtml, 'utf8') / 1024).toFixed(1)} KB)`
);
