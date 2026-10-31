// Bundles the Weekly Challenge engine (src/engine/challenge.js and the engine it uses) into one file
// for the Lovable server, which replays every submitted run to check its score.
// Usage: node tools/build-engine.mjs <lovable-repo>/src/lib/game/challenge-engine.js
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const [outFile] = process.argv.slice(2);
const js = await build({ entryPoints: ['src/engine/challenge.js'], bundle: true, format: 'esm', write: false, target: 'es2022', legalComments: 'none', logLevel: 'warning' });
writeFileSync(outFile, `// GENERATED from the game repo (pmichael415/pmichael415-pawtastic-game: src/engine/challenge.js) by
// tools/build-engine.mjs. Do not edit here: rebuild it from the game so the server replays runs exactly
// as the game plays them.
/* eslint-disable */
${js.outputFiles[0].text}`);
console.log(`wrote ${outFile}`);
