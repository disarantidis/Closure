#!/usr/bin/env node
/*
  structure-graph-selftest.js — the file's whole variable graph written into the Resolved export
  (src/structure-graph.js) and rebuilt from it (src/import-structure.js), for a layering the plugin has
  NO rules for.

  Three questions, each answered with data and not by eye:
    1  does decode(encode(graph)) give back every cell, attribute and the order, line for line?
    2  is the record small (a rule per front and mode, not a line per cell)?
    3  does the whole import (translate -> derive -> compile -> apply) rebuild a file whose lines are
       the original's?
  The graph is synthetic: four layers, two of them multi-mode, one skipping a layer for one kind of
  token, names with a dot, a hidden collection, mixed literal/alias cells, an alias to a library variable,
  an order that is not the canonical one. Nothing in it is named like RADD or ODS.

  If the real RADD graph is in ~/Downloads (RADD 2.2 Foundations … .graph.json) it is run through the
  same first two questions as well.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('../src/structure-graph.js');
const R = require('../src/import-resolved.js');
const { derive } = require('../src/import-derive.js');
const { compile } = require('../src/import-compile.js');
const { apply } = require('../src/import-apply.js');
const JD = require('../src/json-diff.js');
const E = require('../src/emit-resolved.js');
const D = require('../src/dtcg-format.js');

let failed = 0;
const ok = (n, c, extra) => { if (!c) { failed++; console.log('FAIL ' + n + (extra ? '  ' + extra : '')); } else console.log('ok   ' + n); };

/* ── a synthetic file: Raw -> Palette -> Tone -> Roles ───────────────────────────────────────── */
let seq = 0;
const vid = () => 'VariableID:' + ++seq;
const mk = (name, type, props) => Object.assign({ id: vid(), name, type, valuesByMode: {}, scopes: ['ALL_SCOPES'], description: '', codeSyntax: {} }, props || {});
const alias = (v) => ({ type: 'VARIABLE_ALIAS', id: v.id });
const colour = (i) => ({ r: (i % 7) / 7, g: (i % 5) / 5, b: (i % 3) / 3, a: i % 4 === 0 ? 0.5 : 1 });

const HUES = ['ash', 'sky', 'moss', 'rose'];
const STEPS = ['100', '500', '900'];
const GROUPS = ['text', 'fill', 'line'];
const TOKENS = ['primary', 'secondary', 'muted', 'accent'];
const SHADOWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => 'shadow/' + i);

function build() {
  seq = 0;
  const raw = { id: 'C1', name: 'Raw', defaultModeId: 'r0', modes: [{ modeId: 'r0', name: 'Raw' }], hiddenFromPublishing: true, variables: [] };
  const pal = { id: 'C2', name: 'Palette', defaultModeId: 'p0', modes: [{ modeId: 'p0', name: 'Palette' }], variables: [] };
  const tone = { id: 'C3', name: 'Tone', defaultModeId: 't0', modes: [{ modeId: 't0', name: 'day' }, { modeId: 't1', name: 'night' }], variables: [] };
  const role = { id: 'C4', name: 'Roles', defaultModeId: 'o0', modes: [{ modeId: 'o0', name: 'calm' }, { modeId: 'o1', name: 'bold' }], variables: [] };

  let n = 0;
  const rawColour = {};
  HUES.forEach((h) => STEPS.forEach((s) => {
    const v = mk('hue/' + h + '/' + s, 'COLOR', { scopes: ['ALL_FILLS'] });
    v.valuesByMode.r0 = colour(++n);
    if (h === 'ash') v.codeSyntax = { WEB: 'var(--ash-' + s + ')' };
    raw.variables.push(v); rawColour[h + '/' + s] = v;
  }));
  const rawSize = {};
  ['0.5', '1', '2'].forEach((s) => {
    const v = mk('size/' + s, 'FLOAT', { scopes: ['GAP', 'WIDTH_HEIGHT'] });
    v.valuesByMode.r0 = Number(s) * 8;
    raw.variables.push(v); rawSize[s] = v;
  });
  SHADOWS.forEach((s, i) => {
    const v = mk('size/' + s, 'FLOAT', { scopes: ['EFFECT_FLOAT'], description: 'Shadow ' + (i + 1) });
    v.valuesByMode.r0 = i * 4;
    raw.variables.push(v); rawSize[s] = v;
  });
  const flag = mk('flag/enabled', 'BOOLEAN', { scopes: [] }); flag.valuesByMode.r0 = true; raw.variables.push(flag);
  const fam = mk('font/family', 'STRING', { scopes: ['FONT_FAMILY'], description: 'Body face' }); fam.valuesByMode.r0 = 'Inter'; raw.variables.push(fam);

  /* Palette: one variable per hue and step, pointing at its raw colour (the names do not line up in front) */
  const palOf = {};
  HUES.forEach((h) => STEPS.forEach((s) => {
    const v = mk('p/' + h + '/' + s, 'COLOR', { scopes: ['ALL_FILLS'], description: 'Palette entry ' + h + '/' + s });
    v.valuesByMode.p0 = alias(rawColour[h + '/' + s]);
    pal.variables.push(v); palOf[h + '/' + s] = v;
  }));
  /* shadows live in Palette too, so the skip-a-layer rule has somewhere to go */
  /* Tone: calm/bold x group x token, day and night pick different hues */
  const toneOf = {};
  ['calm', 'bold'].forEach((tn, ti) => GROUPS.forEach((g, gi) => TOKENS.forEach((t, k) => {
    const v = mk('tone/' + tn + '/' + g + '/' + t, 'COLOR', { scopes: ['FRAME_FILL', 'TEXT_FILL'], description: 'Tone ' + tn + ' for ' + g + '/' + t });
    v.valuesByMode.t0 = alias(palOf[HUES[(gi + k) % 4] + '/' + STEPS[(ti + k) % 3]]);
    v.valuesByMode.t1 = alias(palOf[HUES[(gi + k + 1) % 4] + '/' + STEPS[(ti + k + 1) % 3]]);
    tone.variables.push(v); toneOf[tn + '/' + g + '/' + t] = v;
  })));
  /* one alias to a library variable: not in the file */
  tone.variables[0].valuesByMode.t1 = { type: 'VARIABLE_ALIAS', id: 'VariableID:library-ghost' };
  /* a non-canonical order: reverse the last third */
  const keep = tone.variables.slice(0, 16), tail = tone.variables.slice(16).reverse();
  tone.variables = keep.concat(tail);

  /* Roles: role/<group>/<token> -> tone/<mode>/<group>/<token>, and shadows straight to Raw (skips Tone) */
  let exc = 0;
  GROUPS.forEach((g) => TOKENS.forEach((t) => {
    const v = mk('role/' + g + '/' + t, 'COLOR', { scopes: ['ALL_FILLS'] });
    v.valuesByMode.o0 = alias(toneOf['calm/' + g + '/' + t]);
    v.valuesByMode.o1 = alias(toneOf['bold/' + g + '/' + t]);
    role.variables.push(v);
  }));
  /* three cells that do not follow the rule: one points elsewhere, one is a literal, one has no calm value */
  role.variables[1].valuesByMode.o1 = alias(toneOf['calm/fill/accent']); exc++;
  role.variables[2].valuesByMode.o0 = { r: 1, g: 0, b: 0, a: 1 }; exc++;
  delete role.variables[3].valuesByMode.o0; exc++;
  /* a fourth kind of exception: a COLOR cell whose literal is neither an alias nor a plain {r,g,b,a}
     — Figma's own "colour bound to one variable, opacity bound to another" shape, seen on a real file
     (Pomegranate Identity, 2026-11-13: 513 such cells). Stored byte-identical (structure-graph.js never
     interprets a literal); the IMPORT must skip writing it rather than refuse the whole file over it. */
  role.variables[5].valuesByMode.o1 = { color: alias(rawColour['ash/100']), opacity: alias(rawSize['0.5']) };
  const unwritableName = role.variables[5].name;
  SHADOWS.forEach((s) => {
    const v = mk('role/' + s, 'FLOAT', { scopes: ['EFFECT_FLOAT'] });
    v.valuesByMode.o0 = alias(rawSize[s]);
    v.valuesByMode.o1 = alias(rawSize[s]);
    role.variables.push(v);
  });
  /* descriptions: a template over the tail, and a literal that merely contains it */
  role.variables.forEach((v, i) => { if (i % 3 === 0) v.description = 'Use for ' + v.name.split('/').slice(1).join('/') + ' only'; });
  role.variables[4].description = 'kept as written {T}';

  /* Spacing: one front, two kinds of token (told apart only by a segment): `gap` follows Base, `elevation` follows Alt */
  const base = { id: 'C5', name: 'Base', defaultModeId: 'b0', modes: [{ modeId: 'b0', name: 'Base' }], variables: [] };
  const alt = { id: 'C6', name: 'Alt', defaultModeId: 'a0', modes: [{ modeId: 'a0', name: 'Alt' }], variables: [] };
  const spacing = { id: 'C7', name: 'Spacing', defaultModeId: 's0', modes: [{ modeId: 's0', name: 'compact' }, { modeId: 's1', name: 'roomy' }], variables: [] };
  for (let i = 1; i <= 12; i++) {
    const b = mk('b/gap/' + i, 'FLOAT'); b.valuesByMode.b0 = i * 2; base.variables.push(b);
    const e = mk('e/elevation/' + i, 'FLOAT'); e.valuesByMode.a0 = i; alt.variables.push(e);
    const sg = mk('sp/gap/' + i, 'FLOAT'); sg.valuesByMode.s0 = alias(b); sg.valuesByMode.s1 = alias(b); spacing.variables.push(sg);
    const se = mk('sp/elevation/' + i, 'FLOAT'); se.valuesByMode.s0 = alias(e); se.valuesByMode.s1 = alias(e); spacing.variables.push(se);
  }
  return { collections: [raw, pal, tone, role, base, alt, spacing], exceptions: exc, unwritableName: unwritableName };
}

/* ── 1. lossless ─────────────────────────────────────────────────────────────────────────────── */
const g = build();
const rec = G.encode(g.collections, { k: { Spacing: 1, Base: 1, Alt: 1 } });
const wire = JSON.parse(JSON.stringify(rec));
const before = G.linesOfRaw(g.collections);
const after = G.linesOfDecoded(G.decode(wire));
ok('every cell and attribute comes back (' + before.length + ' lines)', before.join('\n') === after.join('\n'),
   before.filter((l) => after.indexOf(l) === -1).slice(0, 3).join(' | '));
ok('an alias to a variable that is not in the file is counted, not written', rec.external === 1);
const dec = G.decode(wire);
const toneDec = dec.filter((c) => c.name === 'Tone')[0];
ok('the file\'s own order is kept (not the canonical one)', toneDec.variables.map((v) => v.name).join() === g.collections[2].variables.map((v) => v.name).join());
ok('the hidden flag and the default mode are kept', dec[0].hidden === true && dec[2].defaultMode === 'day');
ok('a name with a dot keeps it', dec[0].variables.some((v) => v.name === 'size/0.5'));

/* ── 2. small ────────────────────────────────────────────────────────────────────────────────── */
if (process.env.DEBUG) console.log(JSON.stringify(rec.collections[6].fronts), JSON.stringify(rec.collections[6].cells), JSON.stringify(rec.rules));
const m = G.measure(rec);
const rawSize = JSON.stringify(g.collections).length;
ok('the record is a small part of the graph (' + m.total + ' of ' + rawSize + ' bytes)', m.total * 3 < rawSize);
ok('few rules for the layers that follow one (' + rec.rules.length + ')', rec.rules.length <= 16);
const tone = rec.collections[2], roles = rec.collections[3];
const exceptionsWritten = roles.cells.reduce((n, e) => n + (e.x ? e.x.length / 2 : 0) + (e.l ? e.l.length / 2 : 0), 0);
ok('only the cells that follow no rule are listed one by one (' + exceptionsWritten + ')', exceptionsWritten <= g.exceptions);
ok('one front with two kinds of token is told apart by a segment, not by listing cells', rec.collections[6].cells.some((e) => e.w) && !rec.collections[6].cells.some((e) => e.x));
ok('tails are written once for the whole file', rec.tails.length === new Set(rec.tails).size);

/* ── 3. the whole import ─────────────────────────────────────────────────────────────────────── */
function documentOf(record) {
  return { $extensions: { 'com.desquared.radd': { restore: { structure: record } } } };
}
function mockFigma() {
  let n = 0;
  const made = [];
  const F = {
    variables: {
      createVariableCollection(name) {
        const col = { id: 'c' + ++n, name, vars: [], hiddenFromPublishing: false,
          modes: [{ modeId: 'm' + ++n, name: 'Mode 1' }],
          get defaultModeId() { return this.modes[0].modeId; },
          renameMode(id, nm) { this.modes.find((x) => x.modeId === id).name = nm; },
          addMode(nm) { const id = 'm' + ++n; this.modes.push({ modeId: id, name: nm }); return id; } };
        made.push(col); return col;
      },
      createVariable(name, col, type) {
        const v = { id: 'v' + ++n, name, resolvedType: type, description: '', scopes: ['ALL_SCOPES'], codeSyntax: {}, valuesByMode: {},
          setValueForMode(mid, val) { this.valuesByMode[mid] = val; },
          setVariableCodeSyntax(p, val) { this.codeSyntax[p] = val; } };
        col.vars.push(v); return v;
      },
      createVariableAlias(v) { return { type: 'VARIABLE_ALIAS', id: v.id }; }
    }
  };
  F.graph = () => made.map((c) => ({ id: c.id, name: c.name, hiddenFromPublishing: c.hiddenFromPublishing, defaultModeId: c.defaultModeId,
    modes: c.modes, variables: c.vars }));
  return F;
}

const doc = documentOf(wire);
const recog = R.recognise(doc);
ok('a document with only a structure record is recognised, as that', recog.ok && recog.arch === 'structure');
ok('and is a Resolved document to the rest of the plugin', JD.isResolvedDocument(doc));
const t = R.translate(doc);
ok('translates', t.ok, t.reason);
ok('the library alias is named, and the one unwritable cell, nothing else',
   t.report.external === 1 && t.report.missing.length === 1 && /not a plain color/.test(t.report.missing[0]),
   JSON.stringify(t.report.missing));
const plan = derive(t.ir, {});
const compiled = compile(t.ir, plan, { evaluateExpressions: true, collectionOrder: t.collectionOrder });
ok('compiles with no open question — the unwritable cell did not refuse the whole import',
   compiled.ok, JSON.stringify(compiled.refusals && compiled.refusals.slice(0, 2)));
const F = mockFigma();
const rep = apply(compiled.program, F, {});
ok('applies with no failure (' + rep.applied + ' operations)', rep.failed === 0, JSON.stringify(rep.errors.slice(0, 2)));
const rebuilt = F.graph();
const sameLines = G.linesOfRaw(rebuilt);
/* the library alias and the one unwritable cell have no counterpart in the rebuilt file: compare without them */
const wanted = before.filter((l) => !/\|night\|@\?$/.test(l) && l.indexOf('Roles|' + g.unwritableName + '|bold|') !== 0);
ok('the rebuilt file has the original\'s lines, collection by collection', wanted.join('\n') === sameLines.join('\n'),
   wanted.filter((l) => sameLines.indexOf(l) === -1).slice(0, 2).join(' | ') + ' // ' + sameLines.filter((l) => wanted.indexOf(l) === -1).slice(0, 2).join(' | '));
ok('collections in the file\'s order, with their modes', rebuilt.map((c) => c.name + ':' + c.modes.map((x) => x.name).join('+')).join() === 'Raw:Raw,Palette:Palette,Tone:day+night,Roles:calm+bold,Base:Base,Alt:Alt,Spacing:compact+roomy');
ok('the hidden flag is written', rebuilt[0].hiddenFromPublishing === true && rebuilt[1].hiddenFromPublishing === false);
ok('code syntax is written', rebuilt[0].variables.some((v) => v.codeSyntax && v.codeSyntax.WEB === 'var(--ash-100)'));

/* ── 4. through the exporter: the document Resolved export writes, not a hand-made one ─────────── */
function viaExport(collections, label) {
  const out = E.document(JSON.parse(JSON.stringify(collections)), { restore: true, hooks: { toDtcgFormat: D.toDtcgFormat } });
  const meta = out.document && out.document.$extensions && out.document.$extensions['com.desquared.radd'];
  ok(label + ': the export writes the structure record (' + out.shape + ' shape)', !!(meta && meta.restore && meta.restore.structure));
  ok(label + ': the exporter\'s document survives a JSON round trip and is a Resolved document', JD.isResolvedDocument(JSON.parse(JSON.stringify(out.document))));
  return JSON.parse(JSON.stringify(out.document));
}
const exported = viaExport(g.collections, 'synthetic third architecture');
const rec2 = R.recognise(exported);
ok('synthetic: the import reads it as a structure', rec2.ok && rec2.arch === 'structure', rec2.reason);
const t2 = R.translate(exported);
const c2 = compile(t2.ir, derive(t2.ir, {}), { evaluateExpressions: true, collectionOrder: t2.collectionOrder });
const F2 = mockFigma();
apply(c2.program, F2, {});
ok('synthetic: export -> import rebuilds the original\'s lines', G.linesOfRaw(F2.graph()).join('\n') === wanted.join('\n'));

/* a record this plugin cannot read is refused with its reason */
const newer = documentOf(Object.assign({}, wire, { version: 99 }));
const refused = R.translate(newer);
ok('a newer record is refused, with the reason', !refused.ok && /newer/.test(refused.reason));

/* ── the real RADD graph, when it is on this computer ──────────────────────────────────────── */
const real = path.join(os.homedir(), 'Downloads', 'RADD 2.2 Foundations (Light-Dark Fix).graph.json');
if (fs.existsSync(real)) {
  const raw = JSON.parse(fs.readFileSync(real, 'utf8'));
  const cols = Array.isArray(raw) ? raw : Object.keys(raw).map((k) => raw[k]);
  const r2 = JSON.parse(JSON.stringify(G.encode(cols)));
  const a = G.linesOfRaw(cols), b = G.linesOfDecoded(G.decode(r2));
  ok('the real RADD 2.2 graph round-trips, ' + a.length + ' lines (' + JSON.stringify(r2).length + ' bytes)', a.join('\n') === b.join('\n'));
  /* through the exporter and the whole import, as a layering the generic path reads (the built-in RADD rules
     still win for a document that has them: that is checked first) */
  const exp = JSON.parse(JSON.stringify(E.document(JSON.parse(JSON.stringify(cols)), { restore: true, hooks: { toDtcgFormat: D.toDtcgFormat } }).document));
  ok('real RADD export: the built-in RADD rules still read it as RADD', R.recognise(exp).ok && R.recognise(exp).arch === 'radd');
  const slimmed = require('../src/restore-slim.js').slim(exp).document;
  ok('real RADD export: slimming the restore section keeps the structure record whole',
     JSON.stringify(slimmed.$extensions['com.desquared.radd'].restore.structure) === JSON.stringify(exp.$extensions['com.desquared.radd'].restore.structure));
  const S = require('../src/import-structure.js');
  const tr = S.translate(exp);
  const WRITABLE = new Set(['ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL',
    'STROKE_COLOR', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT',
    'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT']);
  const want = JSON.parse(JSON.stringify(cols));
  want.forEach((c) => c.variables.forEach((v) => { v.scopes = (v.scopes || []).filter((x) => WRITABLE.has(x)); }));
  const cp = compile(tr.ir, derive(tr.ir, {}), { evaluateExpressions: true, collectionOrder: tr.collectionOrder });
  ok('real RADD graph: compiles from the structure record alone', tr.ok && cp.ok, JSON.stringify(cp.refusals && cp.refusals.slice(0, 2)));
  const FR = mockFigma();
  const ar = apply(cp.program, FR, {});
  ok('real RADD graph: export -> structure import rebuilds every line (' + a.length + ')', ar.failed === 0 && G.linesOfRaw(want).join('\n') === G.linesOfRaw(FR.graph()).join('\n'));
} else console.log('skip the real RADD graph (not in Downloads)');

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exitCode = failed ? 1 : 0;
