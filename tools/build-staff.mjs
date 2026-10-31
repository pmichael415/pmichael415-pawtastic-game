// Builds the front desk's referral page into one self-contained HTML file.
// Usage: node tools/build-staff.mjs . dist/staff.html   (then copy to the Lovable repo as public/staff/index.html)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, outFile] = process.argv.slice(2);
const js = await build({
  entryPoints: [join(dir, 'src/staff/main.js')], bundle: true, format: 'esm', write: false,
  target: 'es2022', minifyWhitespace: true, minifySyntax: true, legalComments: 'none', logLevel: 'warning',
});
let html = readFileSync(join(dir, 'staff.html'), 'utf8');
const tag = '<script type="module" src="src/staff/main.js"></script>';
if (!html.includes(tag)) throw new Error('script tag not found');
html = html.replace(tag, () => `<script type="module">${js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
writeFileSync(outFile, html);
console.log(`wrote ${outFile}: ${(html.length / 1024).toFixed(0)} KB`);
