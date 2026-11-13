#!/usr/bin/env node
/*
  structure-store-selftest.js — how the structure capture saves and recognises
  files, run from the built code.js against a stub of the Plugin API with an
  in-memory clientStorage.

  Pins: opening the same file twice reads the variables once; a second file with
  the same layering is recognised as the same architecture; only the newest few
  files keep their full structure while every file keeps its index line; a
  refused write (the quota) is survived; the first build's whole-structure keys
  are removed; other plugin keys are never touched.
*/
const assert = require('assert');
const fs = require('fs'), vm = require('vm'), path = require('path');
const built = path.join(__dirname, '..', 'code.js');
const src = fs.readFileSync(built, 'utf8');

const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });

/* A file with the same layering and its own ids. `n` makes each file distinct. */
function fileOf(tag, extraVars) {
  const col = (id, name, modes, vars) => ({ id: tag + id, name, modes: modes.map((m, i) => ({ modeId: tag + id + 'm' + i, name: m })),
    hiddenFromPublishing: false, variableIds: vars.map((v) => tag + v.id), _vars: vars });
  const cols = [
    col('core', '.core', ['.core'], [{ id: 'w', name: 'core/white', t: 'COLOR', val: { r: 1, g: 1, b: 1, a: 1 } }]),
    col('pal', '.white', ['.white'], [{ id: 'p', name: 'white/text', t: 'COLOR', val: alias(tag + 'w') }]),
    col('fnd', 'foundation', ['foundation'], [{ id: 'f', name: 'colours/text', t: 'COLOR', val: alias(tag + 'p') }]),
  ];
  for (let i = 0; i < (extraVars || 0); i++) cols[2]._vars.push({ id: 'x' + i, name: 'colours/extra' + i, t: 'COLOR', val: alias(tag + 'p') });
  cols[2].variableIds = cols[2]._vars.map((v) => tag + v.id);
  return cols;
}

async function open(file, store, opts) {
  opts = opts || {};
  const posted = [];
  let reads = 0;
  const quiet = () => {};
  const vars = [];
  file.forEach((c) => c._vars.forEach((v) => vars.push({ id: file[0].id.replace('core', '') + v.id, name: v.name,
    resolvedType: v.t, variableCollectionId: c.id, valuesByMode: { [c.modes[0].modeId]: v.val } })));
  const figma = {
    showUI: quiet, root: { name: opts.name || 'Stub' }, on: quiet, notify: quiet, currentPage: { selection: [] },
    clientStorage: {
      getAsync: async (k) => (k in store.data ? JSON.parse(store.data[k]) : undefined),
      setAsync: async (k, v) => {
        const text = JSON.stringify(v);
        const total = Object.keys(store.data).filter((x) => x !== k).reduce((n, x) => n + store.data[x].length, 0) + text.length;
        if (store.limit && total > store.limit) throw new Error('quota');
        store.data[k] = text;
      },
      deleteAsync: async (k) => { delete store.data[k]; },
      keysAsync: async () => Object.keys(store.data),
    },
    variables: {
      getLocalVariableCollectionsAsync: async () => file,
      getLocalVariablesAsync: async () => { reads++; return vars; },
    },
    ui: { onmessage: null, postMessage: (m) => { posted.push(m); } },
  };
  const ctx = { figma, __html__: '', Promise, JSON, Object, Array, Map, Set, String, Number, Math, parseFloat, parseInt,
                isNaN, isFinite, RegExp, Date, setTimeout, Error, Boolean, console: { log: quiet, warn: quiet, error: quiet } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  for (let i = 0; i < 100 && !posted.some((m) => m.type === 'structureCaptured'); i++) await new Promise((r) => setTimeout(r, 5));
  const msg = posted.filter((m) => m.type === 'structureCaptured').pop();
  return { msg: msg && JSON.parse(JSON.stringify(msg)), reads };
}

let passed = 0;
async function ok(name, fn) {
  try { await fn(); passed++; console.log('ok    ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
}
const index = (store) => JSON.parse(store.data['json-exporter-structure-index'] || '[]');

(async function () {
  await ok('a new file is captured and saved, and nothing is recognised yet', async () => {
    const store = { data: {} };
    const { msg } = await open(fileOf('a'), store, { name: 'File A' });
    assert.ok(msg.ok && msg.fresh);
    assert.strictEqual(msg.structure.totals.collections, 3);
    assert.strictEqual(msg.match.kind, 'new');
    assert.strictEqual(index(store).length, 1);
    assert.strictEqual(index(store)[0].full, true);
  });

  await ok('opening the same file again does not read the variables again', async () => {
    const store = { data: {} };
    await open(fileOf('a'), store, { name: 'File A' });
    const second = await open(fileOf('a'), store, { name: 'File A' });
    assert.strictEqual(second.reads, 0);
    assert.strictEqual(second.msg.fresh, false);
    assert.strictEqual(second.msg.structure.file, 'File A');
    assert.strictEqual(index(store).length, 1);
  });

  await ok('the same file with one more variable is read again', async () => {
    const store = { data: {} };
    await open(fileOf('a'), store, { name: 'File A' });
    const second = await open(fileOf('a', 1), store, { name: 'File A' });
    assert.strictEqual(second.reads, 1);
    assert.strictEqual(second.msg.fresh, true);
    assert.strictEqual(index(store).length, 1);
  });

  await ok('another file with the same layering is the same architecture, and names the first', async () => {
    const store = { data: {} };
    await open(fileOf('a'), store, { name: 'File A' });
    const { msg } = await open(fileOf('b'), store, { name: 'File B' });
    assert.strictEqual(msg.match.kind, 'same-architecture');
    assert.strictEqual(msg.match.file, 'File A');
    assert.strictEqual(msg.saved, 2);
  });

  await ok('only the newest few files keep their full structure; every file keeps its line', async () => {
    const store = { data: {} };
    for (const t of ['a', 'b', 'c', 'd', 'e']) {
      await open(fileOf(t), store, { name: 'File ' + t });
      await new Promise((r) => setTimeout(r, 3));
    }
    const idx = index(store);
    assert.strictEqual(idx.length, 5);
    assert.strictEqual(idx.filter((e) => e.full).length, 3);
    assert.strictEqual(Object.keys(store.data).filter((k) => k.indexOf('json-exporter-structure-full:') === 0).length, 3);
  });

  await ok('a refused write drops the other full structures and still saves this one', async () => {
    const store = { data: {} };
    await open(fileOf('a', 200), store, { name: 'File A' });
    const sizes = (pred) => Object.keys(store.data).filter(pred).reduce((n, k) => n + store.data[k].length, 0);
    const full = sizes((k) => k.indexOf('-full:') !== -1), everything = sizes(() => true);
    /* room for what is there plus a little, not for a second full structure beside it; dropping the first makes room */
    const line = store.data['json-exporter-structure-index'].length;
    store.limit = everything + Math.round(full * 0.5) + line + 50;
    const { msg } = await open(fileOf('b', 200), store, { name: 'File B' });
    assert.ok(msg.ok, msg.error);
    const idx = index(store);
    assert.strictEqual(idx.length, 2);
    assert.strictEqual(idx.filter((e) => e.full).length, 1);
    assert.strictEqual(idx.filter((e) => e.full)[0].file, 'File B');
  });

  await ok('a quota too small for even one structure keeps the index line only', async () => {
    const store = { data: {}, limit: 600 };
    const { msg } = await open(fileOf('a', 50), store, { name: 'File A' });
    assert.ok(msg.ok, msg.error);
    const idx = index(store);
    assert.strictEqual(idx.length, 1);
    assert.strictEqual(idx[0].full, false);
  });

  await ok('the first build\'s whole-structure keys are removed, and other keys are left alone', async () => {
    const store = { data: { 'json-exporter-structure:old|ids': '"x"', 'json-exporter-git-config': '{"a":1}',
                            'json-exporter-studio-baseline:f1': '{"b":2}' } };
    await open(fileOf('a'), store, { name: 'File A' });
    assert.strictEqual('json-exporter-structure:old|ids' in store.data, false);
    assert.strictEqual(store.data['json-exporter-git-config'], '{"a":1}');
    assert.strictEqual(store.data['json-exporter-studio-baseline:f1'], '{"b":2}');
  });

  await ok('the index is capped, and a file that falls out loses its bulk too', async () => {
    const store = { data: {} };
    for (let i = 0; i < 42; i++) {
      await open(fileOf('f' + i + '_'), store, { name: 'File ' + i });
      await new Promise((r) => setTimeout(r, 2));
    }
    assert.strictEqual(index(store).length, 40);
    assert.ok(Object.keys(store.data).filter((k) => k.indexOf('-full:') !== -1).length <= 3);
  });

  console.log(passed + ' passed');
})();
