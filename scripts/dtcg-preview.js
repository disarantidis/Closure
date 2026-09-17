#!/usr/bin/env node
//
// dtcg-preview.js — run the DTCG conversion over an existing Legacy JSON export
// without opening Figma, so the format can be iterated on against real data.
//
//   node scripts/dtcg-preview.js tokens.json
//   node scripts/dtcg-preview.js tokens.json --shape themes -o dtcg.json
//   node scripts/dtcg-preview.js tokens.json --compare path/to/tokens_W3C.json
//   node scripts/dtcg-preview.js graph.json --shape resolved --config my.js
//
// `tokens.json` is whatever the plugin currently downloads/pushes (the Legacy
// JSON tree with its $themes / $metadata).
//
// --shape resolved is the exception: it takes a RAW VARIABLE GRAPH instead —
// the array of collections extractVariables() produces, each carrying its
// variables with valuesByMode and alias targets intact. The Legacy JSON cannot
// stand in for it, because the alias hops this shape resolves are exactly what
// that tree has already collapsed. See the note printed on a wrong input.
//
// --compare structurally diffs the 'partial' output against a reference DTCG
// export, to confirm it is a drop-in replacement for the file a downstream
// build-dtcg.js step consumes.
//
const fs = require('fs');
const path = require('path');
const { toDtcgFormat, validateDtcgClosure, TYPE_MAP } = require('../src/dtcg-format.js');

const SHAPES = ['partial', 'sets', 'themes', 'resolved'];

function parseArgs(argv) {
  const args = { shape: 'partial', out: null, input: null, compare: null, config: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shape') args.shape = argv[++i];
    else if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--compare') args.compare = argv[++i];
    else if (a === '--config') args.config = argv[++i];
    else if (!args.input) args.input = a;
  }
  return args;
}

// Walk a DTCG-ish tree and collect what its token nodes actually look like.
function profile(tree) {
  const p = { tokens: 0, described: 0, types: {}, nodeKeys: {}, roots: [], byPath: new Map() };
  Object.keys(tree).forEach((root) => {
    if (root.charAt(0) === '$') return;
    p.roots.push(root);
    (function walk(node, dotted) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return;
      if ('$value' in node || 'value' in node) {
        p.tokens++;
        p.byPath.set(dotted, node);
        Object.keys(node).forEach((k) => { p.nodeKeys[k] = (p.nodeKeys[k] || 0) + 1; });
        const t = node.$type !== undefined ? node.$type : node.type;
        if (t !== undefined) p.types[t] = (p.types[t] || 0) + 1;
        if (node.$description || node.description) p.described++;
        return;
      }
      Object.keys(node).forEach((k) => {
        if (k.charAt(0) === '$') return;
        walk(node[k], dotted ? dotted + '.' + k : k);
      });
    })(tree[root], root);
  });
  p.hasThemes = Array.isArray(tree.$themes);
  p.hasMetadata = !!tree.$metadata;
  return p;
}

function line(label, mine, theirs) {
  const same = mine === theirs;
  console.log(`  ${same ? ' ' : '!'} ${label.padEnd(28)} ${String(mine).padEnd(22)} ${theirs}`);
}

function compare(mineTree, theirsPath) {
  const theirsTree = JSON.parse(fs.readFileSync(theirsPath, 'utf8'));
  const a = profile(mineTree);
  const b = profile(theirsTree);

  console.log(`\n=== drop-in check against ${path.basename(theirsPath)} ===\n`);

  // The comparison target must be build-dtcg.js's INPUT (tokens_W3C.json), not
  // its output. A resolved bundle has no $themes and only standard $type values,
  // so every line below would differ by design and the report would be noise.
  if (!b.hasThemes) {
    console.log('  NOTE: this file has no $themes, so it looks like a build-dtcg.js');
    console.log('        OUTPUT (a per-theme document) rather than its input.');
    console.log('        Compare against that step\'s own input file instead —');
    console.log('        differences below are expected and not actionable.\n');
  }
  console.log(`    ${''.padEnd(28)} ${'plugin'.padEnd(22)} reference`);
  line('token nodes', a.tokens, b.tokens);
  line('with a description', a.described, b.described);
  line('top-level sets', a.roots.length, b.roots.length);
  line('$themes at root', a.hasThemes, b.hasThemes);
  line('$metadata at root', a.hasMetadata, b.hasMetadata);

  const keysA = Object.keys(a.nodeKeys).sort();
  const keysB = Object.keys(b.nodeKeys).sort();
  console.log('\n  token-node keys');
  console.log(`    plugin    : ${keysA.join(', ') || '(none)'}`);
  console.log(`    reference : ${keysB.join(', ') || '(none)'}`);
  const onlyA = keysA.filter((k) => !keysB.includes(k));
  const onlyB = keysB.filter((k) => !keysA.includes(k));
  if (onlyA.length) console.log(`    ! only in plugin    : ${onlyA.join(', ')}`);
  if (onlyB.length) console.log(`    ! only in reference : ${onlyB.join(', ')}`);
  if (!onlyA.length && !onlyB.length) console.log('    same vocabulary');

  const typesA = Object.keys(a.types).sort();
  const typesB = Object.keys(b.types).sort();
  const tOnlyA = typesA.filter((t) => !typesB.includes(t));
  const tOnlyB = typesB.filter((t) => !typesA.includes(t));
  console.log('\n  $type vocabulary');
  if (tOnlyA.length) console.log(`    ! only in plugin    : ${tOnlyA.join(', ')}`);
  if (tOnlyB.length) console.log(`    ! only in reference : ${tOnlyB.join(', ')}`);
  if (!tOnlyA.length && !tOnlyB.length) console.log(`    same (${typesA.length} types)`);

  const rOnlyA = a.roots.filter((r) => !b.roots.includes(r));
  const rOnlyB = b.roots.filter((r) => !a.roots.includes(r));
  if (rOnlyA.length) console.log(`\n  ! sets only in plugin    : ${rOnlyA.slice(0, 10).join(', ')}`);
  if (rOnlyB.length) console.log(`  ! sets only in reference : ${rOnlyB.slice(0, 10).join(', ')}`);

  // A token both sides define, printed side by side — the fastest way to spot a
  // key-name or value-shape difference that the counts above cannot show.
  const shared = [...a.byPath.keys()].find((k) => b.byPath.has(k));
  if (shared) {
    console.log(`\n  same token, both sides — ${shared}`);
    console.log('    plugin    : ' + JSON.stringify(a.byPath.get(shared)));
    console.log('    reference : ' + JSON.stringify(b.byPath.get(shared)));
  } else {
    console.log('\n  ! no token path is present in both files — paths may be normalized differently');
  }
}

/*
  code.js owns the raw-value formatting and the composite builders, and is a
  plugin sandbox file rather than a module. Rather than keep a second copy of
  formatValue/addTypographyComposite here, load it under a stubbed plugin API
  and borrow the functions — the same way the emitter expects to be fed them.
*/
function loadCodeJsHooks() {
  const vm = require('vm');
  const noop = () => {};
  const figma = {
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getVariableByIdAsync: async () => null
    },
    ui: { onmessage: null, postMessage: noop, resize: noop },
    showUI: noop, on: noop, closePlugin: noop,
    root: { name: 'dtcg-preview' }, currentPage: {},
    clientStorage: { getAsync: async () => null, setAsync: async () => {} }
  };
  const ctx = vm.createContext({
    figma, console, __html__: '', setTimeout, clearTimeout,
    Promise, JSON, Math, Object, Array, String, Number, Boolean, RegExp, Date,
    isNaN, parseFloat, parseInt
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'code.js'), 'utf8'), ctx, { filename: 'code.js' });
  return {
    formatValue: ctx.formatValue,
    formatFloatForExport: ctx.formatFloatForExport,
    addTypographyComposite: ctx.addTypographyComposite,
    addElevationCompositesDeep: ctx.addElevationCompositesDeep,
    toDtcgFormat
  };
}

function mergeTrees(a, b) {
  Object.keys(b).forEach((k) => {
    const av = a[k], bv = b[k];
    if (av && typeof av === 'object' && !('$value' in av) &&
        bv && typeof bv === 'object' && !('$value' in bv)) mergeTrees(av, bv);
    else a[k] = bv;
  });
  return a;
}

function countTokens(node) {
  let n = 0;
  (function walk(x) {
    if (!x || typeof x !== 'object') return;
    if ('$value' in x || 'value' in x) { n++; return; }
    Object.keys(x).forEach((k) => { if (k.charAt(0) !== '$') walk(x[k]); });
  })(node);
  return n;
}

function previewResolved(source, args) {
  if (!Array.isArray(source)) {
    console.error(
      'a resolved preview needs a RAW VARIABLE GRAPH, not a token tree.\n\n' +
      'Expected: a JSON array of collections, each\n' +
      '  { id, name, defaultModeId, modes: [{ modeId, name }],\n' +
      '    variables: [{ id, name, type, valuesByMode, scopes? }] }\n' +
      'with alias values left intact as { type: "VARIABLE_ALIAS", id }.\n\n' +
      'That is what extractVariables() returns in code.js. The Legacy JSON and\n' +
      'the DTCG export cannot stand in for it: both have already collapsed the\n' +
      'alias hops that this shape exists to resolve.'
    );
    process.exit(1);
  }

  const Emit = require('../src/emit-resolved.js');
  const config = args.config ? require(path.resolve(args.config)) : {};

  const res = Emit.emit(source, {
    hooks: loadCodeJsHooks(),
    pin: config.pin,
    renameMode: config.renameMode && config.renameMode.bind(config),
    renameToken: config.renameToken && config.renameToken.bind(config),
    typeHints: config.typeHints && config.typeHints.bind(config)
  });

  const cls = res.classification;
  console.log(`shape        resolved`);
  console.log(`config       ${args.config ? path.relative(process.cwd(), args.config) : '(none — derived names only)'}`);
  console.log(`collections  ${source.length}`);
  console.log(`primitive    ${cls.primitive.join(', ') || '(none)'}`);
  console.log(`routing      ${cls.intermediate.join(', ') || '(none)'}`);
  console.log(`axis order   ${res.axisOrder.join(' > ') || '(no axes)'}`);
  if (res.pinned && Object.keys(res.pinned).length) {
    console.log(`pinned       ${Object.entries(res.pinned).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  const naive = cls.axes.reduce((n, a) => n * a.modes.length, 1);
  console.log(`\nprimitives`);
  Object.keys(res.primitives).forEach((k) => {
    console.log(`  ${String(countTokens(res.primitives[k])).padStart(6)}  ${k}`);
  });

  let emitted = 0;
  console.log(`\ngroups — one per distinct dependency signature`);
  Object.keys(res.groups).forEach((key) => {
    const g = res.groups[key];
    const n = g.branches.reduce((a, b) => a + countTokens(b.tokens), 0);
    emitted += n;
    console.log(`  ${key}`);
    console.log(`    ${String(g.tokenCount).padStart(6)} tokens x ${g.branches.length} branches = ${n}`);
    const paths = g.branches.slice(0, 3).map((b) => b.path.join('/') || '(root)');
    console.log(`    paths  ${paths.join('   ')}${g.branches.length > 3 ? `   ... +${g.branches.length - 3}` : ''}`);
  });
  const branchTotal = Object.keys(res.groups).reduce((a, k) => a + res.groups[k].branches.length, 0);
  console.log(`\n${branchTotal} real branches` +
    (naive > 1 ? ` (a naive product of the ${cls.axes.length} axes would be ${naive})` : '') +
    `, ${emitted} tokens emitted`);

  // Ragged paths are the point, so say so when they occur rather than look wrong.
  const depths = new Set();
  Object.keys(res.groups).forEach((k) =>
    res.groups[k].branches.forEach((b) => depths.add(b.path.length)));
  if (depths.size > 1) {
    console.log(`branch paths vary in depth (${[...depths].sort((a, b) => a - b).join(', ')} segments) — ` +
      `a branch records only the questions its walk asked.`);
  }

  let document = null;
  if (config.toDocument) {
    document = config.toDocument(res, { merge: mergeTrees });
    console.log(`\nhouse layout from --config`);
    let kept = 0;
    Object.keys(document).forEach((k) => {
      const sub = document[k];
      const n = countTokens(sub);
      kept += n;
      const kids = sub && typeof sub === 'object' ? Object.keys(sub).filter((x) => x.charAt(0) !== '$') : [];
      const looksGrouped = kids.length && !('$value' in (sub[kids[0]] || {}));
      console.log(`  ${String(n).padStart(6)}  ${k}` +
        (looksGrouped ? `  (${kids.length}: ${kids.slice(0, 4).join(', ')}${kids.length > 4 ? ', …' : ''})` : ''));
    });

    /*
      A layout maps branches onto fixed nesting levels, so it can only carry
      the axes it has somewhere to put. Point one at a file with an axis it
      was not written for and the surplus branches collide on the same path
      and overwrite each other — silently, which is the failure this whole
      shape exists to avoid. Derived totals are the ground truth, so say when
      the layout could not hold them.
    */
    const derivedTotal = emitted + Object.keys(res.primitives)
      .reduce((a, k) => a + countTokens(res.primitives[k]), 0);
    if (kept < derivedTotal) {
      const axesInLayout = new Set(Object.values(config.axes || {}));
      const unplaced = cls.axes
        .map((a) => a.name)
        .filter((n) => !axesInLayout.has(n) && !(res.pinned || {})[n]);
      console.log(
        `\n  ! the layout kept ${kept} of ${derivedTotal} derived tokens ` +
        `(${derivedTotal - kept} collapsed onto paths already taken).`
      );
      if (unplaced.length) {
        console.log(`    it has no level for: ${unplaced.join(', ')}`);
        console.log(`    give those a place in toDocument, or pin them, or drop --config`);
        console.log(`    and take the derived shape, which carries every branch.`);
      }
    }
  }

  const outTree = document || { primitives: res.primitives, groups: res.groups };
  if (args.compare) compare(document || res.primitives, args.compare);

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(outTree, null, 2));
    const kb = (fs.statSync(args.out).size / 1024).toFixed(1);
    console.log(`\nwrote ${path.relative(process.cwd(), args.out)} (${kb} KB)` +
      (document ? '' : '  — derived shape; pass --config with a toDocument for a house layout'));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error(
      'usage: node scripts/dtcg-preview.js <legacy.json> [--shape partial|sets|themes]\n' +
      '                                    [-o out.json] [--compare tokens_W3C.json]\n' +
      '       node scripts/dtcg-preview.js <graph.json>  --shape resolved\n' +
      '                                    [--config resolved-config.js] [-o out.json]'
    );
    process.exit(1);
  }
  if (!SHAPES.includes(args.shape)) {
    console.error(`unknown shape "${args.shape}" — expected one of ${SHAPES.join(', ')}`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(args.input, 'utf8'));

  if (args.shape === 'resolved') {
    previewResolved(source, args);
    return;
  }

  const { tokens, report } = toDtcgFormat(source, { shape: args.shape });

  const roots = args.shape === 'themes' ? report.themes : report.sets;
  console.log(`shape        ${report.shape}`);
  console.log(`documents    ${roots.length}`);
  console.log(`tokens       ${report.tokenCount}`);
  const pct = report.tokenCount ? Math.round((report.describedCount / report.tokenCount) * 100) : 0;
  console.log(`$description ${report.describedCount} (${pct}% of tokens)`);

  if (args.shape === 'partial') {
    // No type mapping happens here by design — the downstream generator owns it.
    // Listing the source types shows how much work it is left to do.
    const src = Object.entries(report.sourceTypes).sort((a, b) => b[1] - a[1]);
    const nonStandard = src.filter(([t]) => !TYPE_MAP[t] || TYPE_MAP[t] !== t);
    console.log(`\nsource $type values passed through (${src.length})`);
    src.forEach(([t, n]) => {
      const target = TYPE_MAP[t];
      const note = target && target !== t ? ` → build-dtcg.js maps to ${target}` : (target ? '' : ' → no DTCG equivalent');
      console.log(`  ${String(n).padStart(6)}  ${t}${note}`);
    });
    console.log(`\n${nonStandard.length} of ${src.length} still need rewriting downstream.`);
    console.log(`math expressions passed through: ${report.mathExpressions.length}`);

    const mapped = Object.keys(report.descriptions).length;
    if (mapped) {
      console.log(`\ndescriptions: ${report.describedCount} tokens, ${mapped} distinct` +
        ` (${(report.describedCount / mapped).toFixed(1)}x repetition), hoisted to the root map`);
      if (report.descriptionCollisions.length) {
        console.log(`  ${report.descriptionCollisions.length} paths carry conflicting text and stayed inline:`);
        report.descriptionCollisions.slice(0, 5).forEach((p) => console.log(`    ${p}`));
      }
    }
  } else {
    const mapped = Object.entries(report.mappedTypes).sort((a, b) => b[1] - a[1]);
    console.log(`\nmapped types (${mapped.length})`);
    mapped.forEach(([t, n]) => console.log(`  ${String(n).padStart(6)}  ${t} → ${TYPE_MAP[t]}`));

    const unmapped = Object.entries(report.unmappedTypes).sort((a, b) => b[1] - a[1]);
    console.log(`\npassed through, no DTCG equivalent (${unmapped.length})`);
    if (!unmapped.length) console.log('  none');
    unmapped.forEach(([t, n]) => console.log(`  ${String(n).padStart(6)}  ${t}`));

    console.log(`\nmath expressions (not valid DTCG, preserved verbatim): ${report.mathExpressions.length}`);
    report.mathExpressions.slice(0, 5).forEach((m) => console.log(`  ${m.path} = ${m.value}`));

    const closure = validateDtcgClosure(tokens);
    console.log('\nreference closure per document');
    Object.entries(closure).forEach(([root, r]) => {
      const status = r.ok ? 'ok    ' : 'BROKEN';
      console.log(`  ${status} ${String(r.totalRefs).padStart(6)} refs  ${root}${r.ok ? '' : `  (${r.brokenCount} dangling)`}`);
      if (!r.ok) r.sampleBroken.slice(0, 3).forEach((b) => console.log(`           ${b.from} → {${b.ref}}`));
    });
  }

  if (args.compare) compare(tokens, args.compare);

  if (args.out) {
    fs.writeFileSync(args.out, JSON.stringify(tokens, null, 2));
    const kb = (fs.statSync(args.out).size / 1024).toFixed(1);
    console.log(`\nwrote ${path.relative(process.cwd(), args.out)} (${kb} KB)`);
  }
}

main();
