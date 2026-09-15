#!/usr/bin/env node
//
// dtcg-preview.js — run the DTCG conversion over an existing Token Studio export
// without opening Figma, so the format can be iterated on against real data.
//
//   node scripts/dtcg-preview.js tokens.json
//   node scripts/dtcg-preview.js tokens.json --shape themes -o dtcg.json
//   node scripts/dtcg-preview.js tokens.json --compare path/to/tokens_W3C.json
//
// `tokens.json` is whatever the plugin currently downloads/pushes (the Token
// Studio tree with its $themes / $metadata).
//
// --compare structurally diffs the 'partial' output against a real Tokens Studio
// DTCG export, to confirm it is a drop-in replacement for the file that
// config/normalize/build-dtcg.js consumes.
//
const fs = require('fs');
const path = require('path');
const { toDtcgFormat, validateDtcgClosure, TYPE_MAP } = require('../src/dtcg-format.js');

const SHAPES = ['partial', 'sets', 'themes'];

function parseArgs(argv) {
  const args = { shape: 'partial', out: null, input: null, compare: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--shape') args.shape = argv[++i];
    else if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--compare') args.compare = argv[++i];
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
    console.log('        OUTPUT (radd.tokens.json / a per-theme document) rather than');
    console.log('        its input. Compare against packages/radd/src/tokens_W3C.json');
    console.log('        instead — differences below are expected and not actionable.\n');
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error(
      'usage: node scripts/dtcg-preview.js <token-studio.json> [--shape partial|sets|themes]\n' +
      '                                    [-o out.json] [--compare tokens_W3C.json]'
    );
    process.exit(1);
  }
  if (!SHAPES.includes(args.shape)) {
    console.error(`unknown shape "${args.shape}" — expected one of ${SHAPES.join(', ')}`);
    process.exit(1);
  }

  const source = JSON.parse(fs.readFileSync(args.input, 'utf8'));
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
