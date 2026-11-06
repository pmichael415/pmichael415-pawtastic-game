// Builds the game into one self-contained index.html (JS, CSS, fonts and logo inlined).
// Music stays in static/audio/*.mp3 next to the page. Usage: npm run build:single  (or: node tools/build-single.mjs . dist/index.html)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { applyOwnerHooks } from './owner-hooks.mjs';

const [gameDir, outFile] = process.argv.slice(2);
const work = mkdtempSync(join(tmpdir(), 'pawtastic-'));
cpSync(gameDir, work, { recursive: true });
// The logo is drawn by <img> and the share card: inline it so the page needs no image file.
const logo = 'data:image/png;base64,' + readFileSync(join(work, 'static/pawtastic-logo.png')).toString('base64');
const artPath = join(work, 'src/ui/art.js');
const art = readFileSync(artPath, 'utf8');
if (!art.includes("export const LOGO_SRC = 'static/pawtastic-logo.png';")) throw new Error('logo line not found');
writeFileSync(artPath, art.replace("export const LOGO_SRC = 'static/pawtastic-logo.png';", `export const LOGO_SRC = '${logo}';`));

const js = await build({
  entryPoints: [join(work, 'src/main.js')], bundle: true, format: 'esm', write: false,
  target: 'es2022', minifyWhitespace: true, minifySyntax: true, legalComments: 'none',
  // Server mode only (never runs on the public site): leave its lazy imports out of the bundle.
  external: ['./net/supabase-api.js', './net/http-test-api.js'], logLevel: 'warning',
});
const css = await build({
  entryPoints: [join(work, 'src/ui/styles.css')], bundle: true, write: false,
  loader: { '.woff2': 'dataurl' }, minify: true, logLevel: 'warning',
});
// Lovable's owner-save / owner-bridge hooks, spliced in verbatim (see tools/owner-hooks.mjs).
const jsText = applyOwnerHooks(js.outputFiles[0].text).replace(/<\/script/gi, '<\\/script');
const cssText = css.outputFiles[0].text.replace(/<\/style/gi, '<\\/style');

let html = readFileSync(join(work, 'index.html'), 'utf8');
const swap = (from, to) => { if (!html.includes(from)) throw new Error('missing: ' + from); html = html.replace(from, () => to); };
swap('<link rel="icon" type="image/png" href="static/pawtastic-logo.png">', `<link rel="icon" type="image/png" href="${logo}">`);
swap('<link rel="stylesheet" href="src/ui/styles.css">', `<style>${cssText}</style>`);
swap('<script type="module" src="src/main.js"></script>', `<script type="module">${jsText}</script>`);
writeFileSync(outFile, html);
console.log(`wrote ${outFile}: ${(html.length / 1024).toFixed(0)} KB`);
