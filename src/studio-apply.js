/*
  SEND TO FIGMA and BRING FROM FIGMA, the part that needs neither a socket nor a Figma file.

  The Studio's two writing requests are each "move only what changed on ONE side since the last sync":

    apply  the tokens classed studio-ahead go INTO this Figma file;
    read   the tokens classed figma-changed go into a copy of the Studio's file, which the Studio then commits.

  Both are done on DOCUMENTS, because both sides are the same kind of document (the resolved export has the
  Studio's own token layout), and both rest on one move: take the token's node from one document and put it into
  the other. What differs is what comes after.

  READ stops there: the merged document is the reply, written the way the Studio's file is written.

  APPLY does not invent a second way of writing variables. The import page already knows how to turn a resolved
  document into variables (which sets are collections, which are modes, what is an alias), so the Figma file's own
  document, with the Studio's changes put into it, is handed to that same machinery, and the program it makes is cut
  down to the writes that matter. Two things keep it honest:

    NOISE CANCELLED. Reading a document back is not perfectly the identity (a value Figma stores a little
    differently, a name the architecture normalises). The Figma document is put through the same translation on its
    own, and any write it would make by itself is not counted as the Studio's: only what the Studio's changes ADD to
    that is written.

    NEVER A DELETE. The import adds and overwrites; a token the Studio removed stays in Figma, and is counted as
    skipped, so the Studio can say so.

  Dual-mode like json-diff.js. Needs the import modules; in the UI they are globals, in Node they are required.
*/
(function (global) {
function dep(name, file) {
  return (typeof require === 'function' && typeof module !== 'undefined') ? require(file) : global[name];
}
var Diff = dep('PomJsonDiff', './json-diff.js');
var Arch = dep('PomArchitectureRadd', './architecture-radd.js');
var Resolved = dep('PomImportResolved', './import-resolved.js');
var Derive = dep('PomImportDerive', './import-derive.js');
var Compile = dep('PomImportCompile', './import-compile.js');
var ImportDiff = dep('PomImportDiff', './import-diff.js');
var Filter = dep('PomImportFilter', './import-filter.js');

var STYLE_OP = /^create(Text|Effect|Grid)Style$/;

/* Every token of a document: name (dot-joined, as json-diff names it) -> { segs, node, group }. */
function tokensOf(doc) {
  var out = new Map();
  (function walk(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (Diff.isToken(node)) { out.set(path.join('.'), { segs: path.slice(), node: node }); return; }
    Object.keys(node).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      walk(node[k], path.concat(k));
    });
  })(doc, []);
  return out;
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/* Numbers read to three decimals, wherever they sit inside a value: what Figma stores as float32 must not be
   written into a file that never went through Figma. */
function roundDeep(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 1000) / 1000 : v;
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === 'object') {
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = roundDeep(v[k]); });
    return o;
  }
  return v;
}

function setAt(root, segs, node) {
  var at = root;
  for (var i = 0; i < segs.length - 1; i++) {
    if (!at[segs[i]] || typeof at[segs[i]] !== 'object') at[segs[i]] = {};
    at = at[segs[i]];
  }
  at[segs[segs.length - 1]] = node;
}
function removeAt(root, segs) {
  var chain = [root];
  for (var i = 0; i < segs.length - 1; i++) {
    var next = chain[chain.length - 1][segs[i]];
    if (!next || typeof next !== 'object') return;
    chain.push(next);
  }
  delete chain[chain.length - 1][segs[segs.length - 1]];
  /* A group left with nothing in it goes too, up to (not including) the root. */
  for (var j = chain.length - 1; j > 0; j--) {
    var keys = Object.keys(chain[j]).filter(function (k) { return k.charAt(0) !== '$'; });
    if (keys.length) break;
    delete chain[j - 1][segs[j - 1]];
  }
}

/*
  PUT THE TOKENS NAMED `names` FROM `source` INTO A COPY OF `base`.

  A token the base already has keeps its own node and takes the source's $value (and $type, when the source says
  one): the description, extensions and anything else the base wrote about it stay. A token the base lacks arrives
  as the source's whole node. A token the source lacks is removed from the base only when `removeMissing` is set.
  Returns { doc, put, added, removed, missing } where `missing` are names the source did not have (and were not
  removed).
*/
function merge(base, source, names, opts) {
  var doc = clone(base);
  var here = tokensOf(doc), there = tokensOf(source);
  var r = { doc: doc, put: 0, added: 0, removed: 0, missing: [] };
  names.forEach(function (name) {
    var s = there.get(name), b = here.get(name);
    if (!s) {
      if (opts && opts.removeMissing && b) { removeAt(doc, b.segs); r.removed++; }
      else r.missing.push(name);
      return;
    }
    var incoming = (opts && opts.round) ? roundDeep(s.node) : s.node;
    if (b) {
      var field = Object.prototype.hasOwnProperty.call(b.node, '$value') ? '$value' : 'value';
      b.node[field] = clone(Diff.isToken(incoming) ? (incoming.$value !== undefined ? incoming.$value : incoming.value) : incoming);
      if (incoming.$type !== undefined) b.node.$type = incoming.$type;
      r.put++;
    } else {
      setAt(doc, s.segs, clone(incoming));
      r.added++;
    }
  });
  return r;
}

/* The Studio's file with the figma-changed tokens taken from Figma, written as a file: two spaces, a final newline. */
function readText(studioDoc, figmaDoc, names) {
  var m = merge(studioDoc, figmaDoc, names, { removeMissing: true, round: true });
  return { text: JSON.stringify(m.doc, null, 2) + '\n', put: m.put, added: m.added, removed: m.removed };
}

/* A reply too big for one frame, as the Studio's ChunkAssembler joins it: the same id and type, each piece with
   chunk (from 0), chunks and data. Under the limit the reply is one message. */
function chunkReply(reply, limit, size) {
  var text = reply.text;
  if (typeof text !== 'string' || text.length <= limit) return [reply];
  var n = Math.ceil(text.length / size), out = [];
  for (var i = 0; i < n; i++) {
    var piece = {};
    Object.keys(reply).forEach(function (k) { if (k !== 'text') piece[k] = reply[k]; });
    piece.chunk = i; piece.chunks = n; piece.data = text.slice(i * size, (i + 1) * size);
    out.push(piece);
  }
  return out;
}

/* The import program of one document, or why it cannot be made. Styles are left alone: a variable sync never
   touches them. */
function programOf(doc) {
  var rec = Arch.recognise(doc);
  if (!rec.ok) return { ok: false, reason: rec.reason };
  var tr = Resolved.translate(doc);
  if (!tr.ok) return { ok: false, reason: tr.reason };
  var plan = Derive.derive(tr.ir, {});
  var compiled = Compile.compile(tr.ir, plan, { evaluateExpressions: true, collectionOrder: tr.collectionOrder });
  if (!compiled.ok) return { ok: false, reason: 'the document does not compile into variables' };
  compiled.program.ops = compiled.program.ops.filter(function (o) { return !STYLE_OP.test(o.op); });
  return { ok: true, program: compiled.program };
}

/*
  THE WRITE for an apply: figmaDoc is this file's resolved document, studioDoc the Studio's, names the tokens to
  move (classed studio-ahead), existing the file's collections as the extract has them.

  Returns { ok, reason? } or { ok, program, writes, moved, skipped }:
    program  what to send to the sandbox (cut down to the writes the Studio's changes cause);
    writes   how many values it sets;
    moved    tokens that are in the program's reach (put or added);
    skipped  names the Studio removed, which Figma keeps.
*/
function planApply(figmaDoc, studioDoc, names, existing) {
  var merged = merge(figmaDoc, studioDoc, names, { removeMissing: false });
  if (!merged.put && !merged.added) return { ok: true, program: { version: 1, ops: [] }, writes: 0, moved: 0, skipped: merged.missing };
  var withStudio = programOf(merged.doc);
  if (!withStudio.ok) return { ok: false, reason: 'The Studio\'s changes do not fit this file\'s structure: ' + withStudio.reason };
  var alone = programOf(figmaDoc);
  if (!alone.ok) return { ok: false, reason: 'This file\'s variables are not in the structure the Studio expects: ' + alone.reason };

  var report = ImportDiff.diff(existing || [], withStudio.program);
  var noise = ImportDiff.diff(existing || [], alone.program);
  var noisyAdded = {}, noisyChanged = {};
  noise.added.forEach(function (x) { noisyAdded[x.key] = String(x.value); });
  noise.changed.forEach(function (x) { noisyChanged[x.key] = String(x.to); });
  var real = {
    added: report.added.filter(function (x) { return noisyAdded[x.key] !== String(x.value); }),
    changed: report.changed.filter(function (x) { return noisyChanged[x.key] !== String(x.to); }),
  };
  var cut = Filter.filter(withStudio.program, real, { scope: 'all', flatten: true });
  return { ok: true, program: cut.program, writes: cut.stats.values, moved: merged.put + merged.added, skipped: merged.missing,
           created: cut.stats.variables };
}

var api = { tokensOf: tokensOf, merge: merge, readText: readText, chunkReply: chunkReply, programOf: programOf,
            planApply: planApply, roundDeep: roundDeep };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (global) global.PomStudioApply = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
