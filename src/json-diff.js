/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  DOCUMENT vs DOCUMENT — what differs between the JSON this file exports and
  the JSON sitting in the repo.

  THIS IS NOT import-diff.js, AND THE DIFFERENCE MATTERS. That one answers
  "what would happen to my Figma file if I applied this JSON", so it compiles
  the incoming document into a program and interprets it against the live
  variable graph — a projection, with every judgement call derive() has to
  make about how a file's shape maps onto collections and modes.

  This answers a smaller and much more direct question: the repo's file came
  out of this plugin in the first place, so both sides are the same kind of
  document, and the comparison is leaf against leaf with nothing inferred.
  No compile, no projection, no decisions to get wrong. What you get back is
  what would change in the repo if you pushed right now.

  THE TWO SIDES ARE NAMED, NOT ORDERED. "added" and "removed" mean nothing
  without remembering which argument came first, and that is exactly the kind
  of thing that reads correctly and renders backwards. So the report says
  onlyInFigma / onlyInRepo / changed{figma, repo} and a reader never has to
  hold the call signature in their head.

  WHAT IS A TOKEN. A node with `$value` (DTCG) or `value` (Tokens Studio's
  legacy shape). Everything above one is a group and everything beginning
  with `$` at group level is metadata — $metadata, $themes, $extensions,
  $figmaStructure. Those are deliberately NOT compared: they carry set order,
  theme wiring and the export's own build stamp, which differ between two
  exports of an identical file and would report a difference on every single
  comparison.

  FORMATS THAT CANNOT BE COMPARED ARE REFUSED, NOT GUESSED. Legacy and DTCG
  are the same tree with different leaf keys for most types — but not all:
  toDtcg turns a dimension's plain number into a { value, unit } composite,
  so comparing a legacy export against a DTCG one reports every dimension in
  the file as changed. That is not a difference, it is two notations. And a
  resolved export is a materialised cross-product with a different shape
  entirely. Both are detected up front and reported as a mismatch with the
  fix, rather than producing a diff that is technically correct and entirely
  useless.
*/

/* A leaf. Both spellings, because the plugin writes either. */
function isToken(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  return Object.prototype.hasOwnProperty.call(node, '$value') ||
         Object.prototype.hasOwnProperty.call(node, 'value');
}

/*
  A value, rendered so that two spellings of the same thing compare equal and
  two different things never do.

  ONLY NOTATION IS NORMALISED. "#FFFFFF" and "#ffffff" are one colour written
  twice, and 4 and "4" are one number written twice — a file that has been
  through another tool, or edited by hand, arrives spelled differently
  without having changed. Anything beyond that (rounding a number, resolving
  a reference) would be this function deciding two tokens are the same when
  they are not, which is the one thing a diff must never do.
*/
function renderValue(v) {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'object') {
    if (Array.isArray(v)) return '[' + v.map(renderValue).join(',') + ']';
    /* Key order is an artefact of how the object was built, not of what it
       says, so a composite is rendered through its sorted keys. */
    var keys = Object.keys(v).sort();
    return '{' + keys.map(function (k) { return k + ':' + renderValue(v[k]); }).join(',') + '}';
  }
  var s = String(v);
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s.toLowerCase();
  if (s !== '' && !isNaN(Number(s))) return String(Number(s));
  return s;
}

/* The token's own value, whichever spelling it carries. */
function tokenValue(node) {
  return Object.prototype.hasOwnProperty.call(node, '$value') ? node.$value : node.value;
}

/*
  IS THIS LEAF POINTING AT ANOTHER ONE?

  Judged on the RAW value, before rendering, because the rendered forms
  collide: a reference is written {core.blue.500} and renderValue writes a
  composite as {alpha:1,hex:#000} — both brace-wrapped, and telling them apart
  afterwards means a regex guessing at whether a brace is a path or an object.
  Here it is simply a fact about the value: a string carrying a brace.

  Math counts. '{core.base} * 1.5' is an expression built on a reference, so
  it moves when the thing it names moves, which is what this distinction is
  for.
*/
function isReference(raw) {
  return typeof raw === 'string' && raw.indexOf('{') !== -1;
}

/*
  WHAT KIND OF TOKEN THIS IS.

  A colour changing and a font-family changing are not the same kind of
  decision, and a report that files them together makes you sort them by eye.

  DECLARED FIRST, INHERITED SECOND, INFERRED LAST. DTCG lets a group carry a
  $type that its children take unless they say otherwise, so the walk passes
  the nearest ancestor's down; Tokens Studio's legacy shape writes `type` on
  the token itself. Only when neither says anything does this look at the
  value — and it says so by answering 'unknown' rather than guessing a name
  that would then be indistinguishable from a declared one.
*/
function declaredType(node) {
  if (Object.prototype.hasOwnProperty.call(node, '$type')) return node.$type;
  if (Object.prototype.hasOwnProperty.call(node, 'type')) return node.type;
  return null;
}

function inferType(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if ('hex' in raw || 'colorSpace' in raw || 'components' in raw) return 'color';
    if ('unit' in raw) return 'dimension';
    if ('fontFamily' in raw || 'fontSize' in raw) return 'typography';
    return 'composite';
  }
  if (Array.isArray(raw)) return 'composite';
  var s = String(raw);
  if (/^#[0-9a-fA-F]{3,8}$/.test(s) || /^rgba?\(/i.test(s)) return 'color';
  if (s !== '' && !isNaN(Number(s))) return 'number';
  return 'unknown';
}

/*
  Every leaf in the document, as path -> { value, ref, type }.

  Paths are dot-joined, which is how every reference in these files is
  already written ({core.blue.500}), so a path in this report can be pasted
  straight into a search of the source and found.
*/
function flatten(doc) {
  var out = new Map();
  (function walk(node, path, inherited) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (isToken(node)) {
      var raw = tokenValue(node);
      var t = declaredType(node) || inherited || inferType(raw);
      out.set(path.join('.'), { value: renderValue(raw), ref: isReference(raw), type: t });
      return;
    }
    /* A group's own $type is the default for everything under it, until one
       of them declares its own. */
    var groupType = declaredType(node) || inherited;
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      /* Metadata, not tokens — see the header. */
      if (keys[i].charAt(0) === '$') continue;
      walk(node[keys[i]], path.concat(keys[i]), groupType);
    }
  })(doc, [], null);
  return out;
}

/*
  THE TOP-LEVEL NAME A PATH IS UNDER.

  THE LEADING DOT IS PART OF THE NAME, not a separator. This codebase's whole
  convention is dot-prefixed collections — .core, .mode, .scheme, .white —
  and splitting at the first dot found put every one of them under the empty
  string: one nameless group holding most of the document, on the very files
  this page exists for.
*/
function rootOf(path) {
  var i = path.indexOf('.', path.charAt(0) === '.' ? 1 : 0);
  return i === -1 ? path : path.slice(0, i);
}

/* How many tokens a document holds. The same walk, so the number on the card
   and the number in the report can never disagree. */
function countTokens(doc) { return flatten(doc).size; }

/*
  Which of the three shapes this document is in.

  The export says so itself when it was made by a recent build
  ($extensions["com.closure"].format), and that is believed first because it
  is a statement rather than an inference. Older files, and files from other
  tools, are read off their own leaves instead.
*/
/*
  THE EXPORTER'S WORD FOR EACH SHAPE IS NOT THIS FILE'S WORD.

  stampExport writes $extensions["com.closure"].format from the UI's own
  output-format state, whose three values are 'legacy', 'themes' and
  'resolved' — 'themes' being what the DTCG switch has been called since it
  was a themes-only toggle. This module talks about 'dtcg', because that is
  what the format is.

  Passing the marker through untranslated meant every DTCG export this plugin
  has ever written identified as 'themes', matched no label, and was reported
  to the user as "an unrecognised shape" — the plugin failing to recognise its
  own output. It survived the unit tests because every fixture in them was
  hand-written with the word this module uses, and it survived the first
  browser run because the file in the repo predates the stamp entirely and so
  was read off its leaves instead.
*/
var MARKER_FORMAT = { legacy: 'legacy', dtcg: 'dtcg', themes: 'dtcg', resolved: 'resolved' };

function detectFormat(doc) {
  var ext = doc && doc.$extensions && doc.$extensions['com.closure'];
  /* A marker this file does not know is NOT believed — it falls through to
     the leaves, which are a fact about the document rather than a word about
     it. A future build naming a fourth shape should read as whatever it
     actually is, not as "unrecognised". */
  if (ext && ext.format && MARKER_FORMAT[ext.format]) return MARKER_FORMAT[ext.format];
  var found = null;
  (function walk(node) {
    if (found || !node || typeof node !== 'object' || Array.isArray(node)) return;
    if (isToken(node)) {
      found = Object.prototype.hasOwnProperty.call(node, '$value') ? 'dtcg' : 'legacy';
      return;
    }
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length && !found; i++) {
      if (keys[i].charAt(0) === '$') continue;
      walk(node[keys[i]]);
    }
  })(doc);
  return found || 'unknown';
}

/* legacy and dtcg are the same tree with different leaf keys for most types,
   but toDtcg rewrites a dimension's value into a composite — so they are
   only comparable against themselves. */
function formatsComparable(a, b) { return a === b; }

var FORMAT_LABEL = { legacy: 'Legacy JSON', dtcg: 'W3C DTCG', resolved: 'Resolved', unknown: 'an unrecognised shape' };
function formatLabel(f) { return FORMAT_LABEL[f] || FORMAT_LABEL.unknown; }

/*
  compare(figmaDoc, repoDoc) -> report

  `figmaDoc` is what this file exports right now — the exact bytes Download
  writes and Push sends. `repoDoc` is what is in the repository. Neither is
  modified.

  The report rolls up by TOP-LEVEL GROUP as well as listing leaves, because
  thirty thousand changed values is not a report, it is a wall — the group
  summary is what someone actually reads and the leaves are there to drill
  into.
*/
function compare(figmaDoc, repoDoc) {
  var figmaFormat = detectFormat(figmaDoc);
  var repoFormat = detectFormat(repoDoc);

  var report = {
    figmaFormat: figmaFormat,
    repoFormat: repoFormat,
    figmaFormatLabel: formatLabel(figmaFormat),
    repoFormatLabel: formatLabel(repoFormat),
    comparable: true,
    problem: null,
    onlyInFigma: [], onlyInRepo: [], changed: [], repointed: [],
    /* [{ type, count }] for the value changes, commonest first — a colour
       decision and a font-family decision are different acts and the page
       separates them. */
    changedByType: [],
    sameCount: 0,
    figmaTokens: 0, repoTokens: 0,
    groups: [],
    identical: false,
  };

  /*
    REFUSED UP FRONT, with the reason and the fix. A resolved export has had
    its references evaluated away, so its tree is a cross-product of modes
    rather than the document that produced it; and two different notations
    report every dimension as changed. Producing a diff in either case would
    be answering a question nobody asked.
  */
  if (figmaFormat === 'resolved' || repoFormat === 'resolved') {
    report.comparable = false;
    report.problem = {
      kind: 'resolved',
      message: (figmaFormat === 'resolved' ? 'This file is set to export the resolved shape' :
                                             'The repo holds a resolved export') +
               ', and a resolved document has had its references evaluated away — its tree is a ' +
               'cross-product of every mode rather than the document it came from, so comparing it ' +
               'leaf by leaf reports a rewrite of everything.',
      fix: 'Switch the output format to Legacy JSON or DTCG on both sides and compare those.',
    };
    return report;
  }
  var F = flatten(figmaDoc), R = flatten(repoDoc);
  report.figmaTokens = F.size;
  report.repoTokens = R.size;

  /*
    A SIDE WITH NO TOKENS IS NOT A DIFFERENCE, IT IS A MISSING DOCUMENT.

    Left to the leaf comparison below, an empty side comes out as "every token
    in the other one is only there" — which renders as thousands of deletions
    and reads as someone having wiped the file. It is the most alarming report
    this page can produce and it is never the true one.

    Both sides can reach it. The export side: the DTCG 'themes' shape emits one
    document per $themes entry, so a file with no themes defined converts to a
    document holding nothing but its own $extensions. The repo side: the file
    name field now offers every .json in the repo, so it is one click to point
    this at a package.json.
  */
  if (F.size === 0 || R.size === 0) {
    report.comparable = false;
    report.problem = F.size === 0 && R.size === 0 ? {
      kind: 'both-empty',
      message: 'Neither of these documents holds any design tokens.',
      fix: 'Check that the file name points at a token JSON.',
    } : F.size === 0 ? {
      kind: 'empty-figma',
      message: 'This file\'s export came out holding no tokens at all, while the repo\'s copy holds ' +
               R.size.toLocaleString() + '. That is an export that did not produce anything, not ' +
               R.size.toLocaleString() + ' deleted tokens.',
      fix: 'The DTCG "themes" shape writes one document per $themes entry, so a file with no themes ' +
           'defined exports an empty one — try Legacy JSON.',
    } : {
      kind: 'empty-repo',
      message: 'The file in the repo holds no design tokens. It parsed as JSON, but nothing in it is a ' +
               'token, so there is nothing to compare this file\'s ' + F.size.toLocaleString() +
               ' against.',
      fix: 'Pick a different file in the File name field — it lists every .json in the repo, ' +
           'including ones that are not token files.',
    };
    return report;
  }

  /*
    TWO DOCUMENTS THAT SHARE NO TOP-LEVEL NAME ARE NOT TWO VERSIONS OF ONE
    THING, and diffing them produces the same useless wall as an empty side:
    everything on both sides, unmatched.

    The case this exists for is REAL and is not a user error. The DTCG export
    has two shapes with different roots — 'sets' keys the document by token set
    (core, mode/light) and 'themes' keys it by theme (.core, .white) — so a
    repo file written by one and an export written by the other are both valid,
    both DTCG, and share nothing to line up. Detected by the symptom rather
    than by the marker, because the marker only arrived in recent builds and
    the files already in people's repos predate it.
  */
  var topOf = function (m) {
    var t = {};
    m.forEach(function (_v, path) { t[rootOf(path)] = 1; });
    return Object.keys(t);
  };
  /*
    AFTER THE EMPTINESS CHECK, NOT BEFORE IT.

    A document with no tokens in it has no format to detect, so detectFormat
    calls it 'unknown' — and read as a format mismatch that produced the
    instruction "Set the output format to an unrecognised shape", which is
    not a thing anyone can do. Emptiness is the more basic fact and is
    established first; by here both sides are known to hold tokens, so a
    disagreement about format is a real one.
  */
  if (!formatsComparable(figmaFormat, repoFormat)) {
    report.comparable = false;
    report.problem = {
      kind: 'format-mismatch',
      message: 'This file exports ' + formatLabel(figmaFormat) + ' and the repo holds ' +
               formatLabel(repoFormat) + '. Those are two notations for the same tokens — a ' +
               'dimension is a plain number in one and a { value, unit } composite in the other — ' +
               'so every dimension in the file would be reported as changed.',
      fix: 'Set the output format to ' + formatLabel(repoFormat) + ' to compare against this repo.',
    };
    return report;
  }

  var fTop = topOf(F), rTop = topOf(R);
  var shared = fTop.filter(function (k) { return rTop.indexOf(k) !== -1; });
  if (shared.length === 0) {
    report.comparable = false;
    report.problem = {
      kind: 'no-common-root',
      message: 'These two documents have nothing in common at the top level — this file exports ' +
               fTop.slice(0, 3).join(', ') + (fTop.length > 3 ? ', …' : '') +
               ' and the repo holds ' + rTop.slice(0, 3).join(', ') + (rTop.length > 3 ? ', …' : '') +
               '. Every token on both sides would be reported as unmatched, which says nothing.',
      fix: 'The DTCG export has two shapes — one keyed by token set, one keyed by theme — and a file ' +
           'written in one cannot be lined up against the other. Check that both were written the ' +
           'same way.',
    };
    return report;
  }

  var groupOf = rootOf;
  var groups = new Map();
  var bump = function (path, field) {
    var g = groupOf(path);
    if (!groups.has(g)) groups.set(g, { name: g, onlyInFigma: 0, onlyInRepo: 0, changed: 0, repointed: 0, same: 0 });
    groups.get(g)[field]++;
  };

  F.forEach(function (leaf, path) {
    if (!R.has(path)) { report.onlyInFigma.push({ path: path, value: leaf.value, type: leaf.type }); bump(path, 'onlyInFigma'); return; }
    var other = R.get(path);
    if (other.value === leaf.value) { report.sameCount++; bump(path, 'same'); return; }
    /*
      A REFERENCE THAT MOVED IS NOT A VALUE THAT CHANGED, and burying the
      second in the first is how a real report goes unread.

      Measured on two exports of one design system two months apart: 1,392
      differences, of which 1,090 were a single mechanical re-rooting —
      {section.white.basic.background} became {white.basic.background} when the
      section/* collections went away — and 147 were somebody actually
      choosing a different colour. Those 147 are the ones a person needs to
      look at, and one heading of 1,392 hid them completely.

      BOTH SIDES HAVE TO BE REFERENCES. A token that stopped pointing and now
      holds a literal — or started pointing when it did not before — has had
      its value changed in the way that matters, so it stays in `changed`.
    */
    var bucket = (leaf.ref && other.ref) ? 'repointed' : 'changed';
    /* The type comes from THIS side. Where the two disagree the token's kind
       itself changed, which is a change worth seeing under the new kind
       rather than the old one. */
    report[bucket].push({ path: path, figma: leaf.value, repo: other.value, type: leaf.type });
    bump(path, bucket);
  });
  R.forEach(function (leaf, path) {
    if (F.has(path)) return;
    report.onlyInRepo.push({ path: path, value: leaf.value, type: leaf.type });
    bump(path, 'onlyInRepo');
  });

  /* Sorted by how much there is to look at, so the group that changed most is
     the one at the top rather than whichever happened to be named first. */
  report.groups = Array.from(groups.values()).sort(function (a, b) {
    var da = a.onlyInFigma + a.onlyInRepo + a.changed + a.repointed;
    var db = b.onlyInFigma + b.onlyInRepo + b.changed + b.repointed;
    if (da !== db) return db - da;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  var typeCount = new Map();
  report.changed.forEach(function (c) {
    typeCount.set(c.type, (typeCount.get(c.type) || 0) + 1);
  });
  report.changedByType = Array.from(typeCount.entries())
    .map(function (e) { return { type: e[0], count: e[1] }; })
    .sort(function (a, b) { return b.count - a.count || (a.type < b.type ? -1 : 1); });

  report.identical = report.onlyInFigma.length === 0 &&
                     report.onlyInRepo.length === 0 &&
                     report.changed.length === 0 &&
                     report.repointed.length === 0;
  return report;
}

/*
  The whole report as text, for the clipboard. Not a rendering of the page —
  a page can only show so many rows before it stops being readable, and the
  reason to copy a report is to have the part the page elided.

  `limit` caps each list; 0 means every line.
*/
function format(report, opts) {
  opts = opts || {};
  var limit = opts.limit === undefined ? 0 : opts.limit;
  var out = [];
  var figma = opts.figmaLabel || 'this Figma file';
  var repo = opts.repoLabel || 'the repo';

  out.push('Comparing ' + figma + ' with ' + repo);
  if (!report.comparable) {
    out.push('');
    out.push('NOT COMPARABLE — ' + report.problem.message);
    out.push(report.problem.fix);
    return out.join('\n');
  }
  out.push(report.figmaTokens.toLocaleString() + ' tokens here · ' +
           report.repoTokens.toLocaleString() + ' in the repo');
  out.push('');
  if (report.identical) {
    out.push('Identical — every token matches.');
    return out.join('\n');
  }

  var list = function (title, rows, render) {
    if (!rows.length) return;
    out.push(title + ' (' + rows.length.toLocaleString() + ')');
    var shown = limit ? rows.slice(0, limit) : rows;
    shown.forEach(function (r) { out.push('  ' + render(r)); });
    if (limit && rows.length > limit) {
      out.push('  … and ' + (rows.length - limit).toLocaleString() + ' more');
    }
    out.push('');
  };

  /*
    THE SAME TWO KINDS THE PAGE SHOWS, in the same order and under the same
    names — a copied report that groups its findings differently from the
    screen they were copied off is a second, disagreeing document.

    Values first, because they are the decisions; architecture after, because
    it is the shape moving and it arrives in thousands.
  */
  var bothSides = function (r) { return r.path + '\n      repo:  ' + r.repo + '\n      here:  ' + r.figma; };
  var side = function (r) { return r.path + '  =  ' + r.value; };

  out.push('VALUES — someone chose differently');
  out.push('');
  list('  changed', report.changed, bothSides);

  out.push('ARCHITECTURE — what moved, was added, or was removed');
  out.push('');
  list('  only here — would be added to the repo', report.onlyInFigma, side);
  list('  only in the repo — no longer in this file', report.onlyInRepo, side);
  list('  pointing somewhere new — the same token, a different target',
       report.repointed, bothSides);

  out.push(report.sameCount.toLocaleString() + ' identical');
  return out.join('\n');
}

  var api = { compare, flatten, countTokens, detectFormat, formatLabel, renderValue, isToken, format };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomJsonDiff = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
