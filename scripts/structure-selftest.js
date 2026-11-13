#!/usr/bin/env node
//
// structure-selftest.js — does the structure capture read a layered file correctly?
//
//   node scripts/structure-selftest.js
//
// A small synthetic file with the same shape as a real routed architecture
// (foundation -> scheme -> restrictions -> section -> card -> palette -> core),
// and nothing in the module knows those names: the layers, the routes and the
// counts have to come out of the aliases alone.
const S = require('../src/structure-capture.js');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.error('FAIL ' + label); } }
const alias = (id) => ({ type: 'VARIABLE_ALIAS', id });
const mode = (id, name) => ({ modeId: id, name });

const graph = [
  { id: 'c-core', name: '.core', hiddenFromPublishing: true, modes: [mode('m1', '.core')],
    variables: [{ id: 'v-white', name: 'core-colours/base/white', resolvedType: 'COLOR', valuesByMode: { m1: { r: 1, g: 1, b: 1, a: 1 } } },
                { id: 'v-w50', name: 'core-colours/neutral/light/50', resolvedType: 'COLOR', valuesByMode: { m1: { r: 0.9, g: 0.9, b: 0.9, a: 1 } } }] },
  { id: 'c-pal', name: '.white', hiddenFromPublishing: true, modes: [mode('m2', '.white')],
    variables: [{ id: 'v-pal', name: 'white/basic/text', resolvedType: 'COLOR', valuesByMode: { m2: alias('v-white') } },
                // ends in the same step as its primitive: shares a tail, but it lands in the primitives
                { id: 'v-pal2', name: 'white/shades/50', resolvedType: 'COLOR', valuesByMode: { m2: alias('v-w50') } }] },
  { id: 'c-card', name: '.card', hiddenFromPublishing: true, modes: [mode('m3', 'not-a-card'), mode('m4', 'neutral-card')],
    variables: [{ id: 'v-card', name: 'card/normal/white/basic/text', resolvedType: 'COLOR', valuesByMode: { m3: alias('v-pal'), m4: alias('v-pal') } }] },
  { id: 'c-sec', name: '.section', hiddenFromPublishing: true, modes: [mode('m5', 'normal'), mode('m6', 'subtle')],
    variables: [{ id: 'v-sec', name: 'section/white/basic/text', resolvedType: 'COLOR', valuesByMode: { m5: alias('v-card'), m6: alias('v-card') } }] },
  { id: 'c-res', name: '_restricted', hiddenFromPublishing: true, modes: [mode('m7', 'unrestricted')],
    variables: [{ id: 'v-res', name: 'restrictions/white/basic/text', resolvedType: 'COLOR', valuesByMode: { m7: alias('v-sec') } }] },
  { id: 'c-sch', name: '.scheme', hiddenFromPublishing: true, modes: [mode('m8', 'white'), mode('m9', 'neutral')],
    variables: [{ id: 'v-sch', name: 'scheme/basic/text', resolvedType: 'COLOR', valuesByMode: { m8: alias('v-res'), m9: alias('v-res') } }] },
  { id: 'c-fnd', name: 'foundation', hiddenFromPublishing: false, modes: [mode('m10', 'foundation')],
    variables: [
      { id: 'v-fnd', name: 'colours/basic/text', resolvedType: 'COLOR', valuesByMode: { m10: alias('v-sch') } },
      { id: 'v-num', name: 'spacing/4', resolvedType: 'FLOAT', valuesByMode: { m10: 4 } },
      { id: 'v-lib', name: 'colours/from-library', resolvedType: 'COLOR', valuesByMode: { m10: alias('not-in-this-file') } }
    ] }
];

const r0 = (from, to) => st.routes.find((x) => x.from.collection === from && x.to.collection === to);
const st = S.capture(graph, { fileName: 'Test', capturedAt: '2026-01-01T00:00:00.000Z' });

ok(st.format === 'radd-structure' && st.version === 3, 'format and version');
ok(st.file === 'Test' && st.capturedAt === '2026-01-01T00:00:00.000Z', 'file and time carried');
ok(st.totals.collections === 7 && st.totals.variables === 11, 'totals');
// white/text -> core/white share no tail: that is a binding, not a route
ok(!r0('.white', '.core') && st.bindings.length === 1 && st.bindings[0].from === '.white' && st.bindings[0].aliases === 2, 'a pointer into the primitives is a binding, whether or not the names end alike');
ok(st.totals.bindings === 2 && st.totals.routes === st.routes.length, 'totals count routes and bindings apart');
ok(st.layers.join('>') === 'foundation>.scheme>_restricted>.section>.card>.white>.core',
   'layers come out consumers first: ' + st.layers.join('>'));
ok(st.externalAliases === 1, 'an alias into a library is counted, not followed');

const fnd = st.collections.find((c) => c.name === 'foundation');
ok(fnd.aliases === 2 && fnd.literals === 1 && fnd.types.COLOR === 2 && fnd.types.FLOAT === 1, 'aliases, literals and types');
ok(fnd.groups.colours === 2 && fnd.groups.spacing === 1, 'top-level groups counted');
ok(st.collections.find((c) => c.name === '.card').modes.join() === 'not-a-card,neutral-card', 'modes in order');

const e = (from, to) => st.edges.find((x) => x.from === from && x.to === to);
ok(e('.card', '.white') && e('.card', '.white').aliases === 2, 'edge card -> palette counts both modes');
ok(e('.white', '.core') && e('.white', '.core').aliases === 2, 'edge palette -> core');

const r = (from, to) => st.routes.find((x) => x.from.collection === from && x.to.collection === to);
ok(r('.scheme', '_restricted').from.front === 'scheme' && r('.scheme', '_restricted').to.front === 'restrictions/white'
   && r('.scheme', '_restricted').modes.join() === 'neutral,white' && r('.scheme', '_restricted').aliases === 2,
   'scheme route: front rewritten, both modes');
ok(r('.card', '.white').from.front === 'card/normal/white' && r('.card', '.white').to.front === 'white', 'card route drops the section and tone');
ok(r('foundation', '.scheme').from.front === 'colours' && r('foundation', '.scheme').to.front === 'scheme', 'foundation route');

ok(JSON.stringify(S.capture(graph, {})) === JSON.stringify(S.capture(graph, {})), 'deterministic');
ok(S.capture([], {}).layers.length === 0 && S.capture([], {}).totals.variables === 0, 'empty file');
ok(S.summarise(st).layers.indexOf('→') !== -1, 'summary reads as a chain');

// --- which saved structure is this document's -----------------------------
const sigOf = (g) => S.signature(S.capture(g, {}));
const sigA = sigOf(graph);
const entry = (key, g, file) => { const sg = sigOf(g); return { key, sig: sg.id, items: sg.items, file }; };
const cur = { key: 'K-this', sig: sigA.id, items: sigA.items };

ok(S.match([entry('K-this', graph, 'self')], cur).kind === 'same-file', 'same collection ids: the same file');
ok(S.match([entry('K-other', graph, 'copy')], cur).kind === 'same-architecture', 'same layering, other ids: same architecture');
ok(S.match([entry('K-other', graph, 'copy')], cur).entry.file === 'copy', 'the match says which file');
ok(S.match([], cur).kind === 'new', 'nothing saved: new');

// a copy with different variable counts and ids is still the same architecture
const grown = JSON.parse(JSON.stringify(graph));
grown[6].variables.push({ id: 'v-x', name: 'colours/extra', resolvedType: 'COLOR', valuesByMode: { m10: alias('v-sch') } });
grown.forEach((c) => { c.id = c.id + '-x'; });
ok(sigOf(grown).id === sigA.id, 'signature ignores ids and counts');
ok(S.match([entry('K-grown', grown, 'grown')], cur).kind === 'same-architecture', 'a grown copy is the same architecture');

// one collection gone from eight: near, not the same
const eight = JSON.parse(JSON.stringify(graph));
eight.push({ id: 'c-x', name: '.extra', modes: [mode('mx', '.extra')], variables: [] });
const nine = sigOf(eight);
const m9 = S.match([{ key: 'K-n', sig: nine.id, items: nine.items, file: 'nine' }], cur);
ok(m9.kind === 'similar' && m9.score > 0.8 && m9.score < 1, 'one extra collection is similar, not the same: ' + m9.score);

// a different layering is not a match
const other = [{ id: 'o1', name: 'primitives', modes: [mode('a', 'a')], variables: [] },
               { id: 'o2', name: 'semantic', modes: [mode('b', 'light'), mode('c', 'dark')], variables: [] }];
ok(S.match([entry('K-o', other, 'other')], cur).kind === 'new', 'a different layering is new');

// a mode renamed is a different architecture
const renamed = JSON.parse(JSON.stringify(graph));
renamed[5].modes[1].name = 'grey';
ok(sigOf(renamed).id !== sigA.id, 'a renamed mode changes the signature');

// the exact file wins over a same-architecture one
ok(S.match([entry('K-other', graph, 'copy'), entry('K-this', graph, 'self')], cur).entry.file === 'self', 'same-file wins');

console.log('structure-capture: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
