// Lovable's surgical owner-save / owner-bridge hooks (Graduation main 8b5e0a8) must survive every game build.
//   node --test tools/test-owner-hooks.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OWNER_HOOKS, applyOwnerHooks } from './owner-hooks.mjs';

const built = (() => {
  const out = join(mkdtempSync(join(tmpdir(), 'owner-hooks-')), 'index.html');
  execFileSync(process.execPath, ['tools/build-single.mjs', '.', out], { stdio: 'pipe' });
  return readFileSync(out, 'utf8');
})();

test('the built page carries the owner-save client version meta, once, right after the viewport', () => {
  assert.equal(built.split('<meta name="pawtastic-owner-save-client" content="2">').length - 1, 1);
  assert.ok(built.includes('viewport-fit=cover">\n<meta name="pawtastic-owner-save-client" content="2">\n<meta name="pawtastic-release" content="free-play">'));
});

test('every hook is in the built page exactly once, with Lovable\'s exact bytes', () => {
  for (const h of OWNER_HOOKS) {
    assert.equal(built.split(h.to).length - 1, 1, `${h.name}: in the page once`);
    assert.equal(built.includes(h.from), false, `${h.name}: the unhooked code is gone`);
  }
  for (const s of ['import("/owner-save-client.js")', 'import("/owner-bridge.js")', 'function ownerAnalyticsAllowed(){', 'snap.forceAccount||', 'accountStore(doc){', 'saveCall:(method,path,body)=>call(method,path,body)'])
    assert.ok(built.includes(s), s);
});

test('a hook whose anchor is missing or doubled fails the build instead of being dropped', () => {
  const h = OWNER_HOOKS[0];
  assert.throws(() => applyOwnerHooks('nothing to hook here'), /owner hook/);
  assert.throws(() => applyOwnerHooks(h.from + h.from), /owner hook/);
});

test('the bundle bindings the hooks use keep their exact names (no esbuild renames)', () => {
  for (const name of ['SESSION_KEY', 'MEASURE_KEY', 'STORAGE_KEYS']) {
    assert.match(built, new RegExp(`[,; ]${name}=`), `${name} is defined`);
    assert.doesNotMatch(built, new RegExp(`\\b${name}\\d+\\b`), `${name} was not renamed`);
  }
});
