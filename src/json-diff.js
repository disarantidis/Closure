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

/*
  IS THIS ONE VALUE, OR A BAG OF THEM?

  Not every object is a style. A DTCG colour is {alpha, colorSpace,
  components, hex} and a dimension is {value, unit} — single values that
  happen to be written as objects, and taking them apart is nonsense: the
  first attempt at decomposing composites split every colour into a
  `components` array and a `hex` string, decided those were two different
  kinds, and reported 760 colour changes as "mixed".

  A style is the rest: typography, shadow, anything whose parts are
  themselves tokens of their own kinds.
*/
function isSingleValue(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
  if ('hex' in raw || 'colorSpace' in raw || 'components' in raw) return true;
  if ('unit' in raw && 'value' in raw) return true;
  return false;
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

/* The RAW value at a path — the resolver needs the reference as written,
   not renderValue's rendering of it. */
function rawOf(doc, path) {
  var node = doc;
  var segs = path.split('.');
  /* A dot-prefixed root is one segment, not an empty one plus a name. */
  if (path.charAt(0) === '.') { segs = path.slice(1).split('.'); segs[0] = '.' + segs[0]; }
  for (var i = 0; i < segs.length && node; i++) node = node[segs[i]];
  return node && isToken(node) ? tokenValue(node) : null;
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
  WHAT A REFERENCE ACTUALLY POINTS AT.

  Needed for one question only: when one side aliases and the other holds a
  literal, are they saying the same thing? On two real exports of one system
  that was 252 of 1,060 "value changes" — Spar.json keeping
  {font-family.teleneo-var} where tokens_.json had inlined "TeleNeo Var",
  while both files define that alias as exactly "TeleNeo Var". Nobody changed
  anything; one export resolved its references and the other did not.

  ITS OWN SET FIRST, THEN THE OTHERS. This used to look only inside the
  reference's own top-level document, on the reasoning that a themes-shaped
  export is several self-contained documents in one file. That was true of the
  files it was written against, and it was true for a bad reason: the exporter
  was writing every inherited variable into every collection, so every
  reference happened to find its target at home. It cost 45% of a 40 MB file
  and made the same file impossible to import, and the export no longer does
  it — a variable is written where it lives, and a set now genuinely references
  tokens defined in another set.

  Which is how the layered formats always worked. Tokens Studio enables several
  sets at once and resolves across them in tokenSetOrder, later sets winning;
  the set order is right there in the document. So: the reference's own set
  first, so nothing that resolved locally can change its answer, then the other
  sets in reverse precedence so the one that would win is found first, then the
  document root for a file with no sets at all.

  Depth-capped, because a reference can point at a reference and a file can be
  wrong: a cycle would otherwise be an infinite loop rather than an unresolved
  value, and an unresolved value is a perfectly good answer here — it just
  means the two sides are not known to agree.
*/
/*
  The bases a reference is looked up against, in precedence order, cached per
  document. Cached because the fallback is no longer the exception: with the
  export writing each variable once, cross-set references are the ordinary
  case, and rebuilding this list per reference would be tens of thousands of
  rebuilds on a file of this size.
*/
var SEARCH_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
function searchOrder(doc) {
  if (SEARCH_CACHE && SEARCH_CACHE.has(doc)) return SEARCH_CACHE.get(doc);
  var declared = (doc.$metadata && doc.$metadata.tokenSetOrder) ||
                 (doc.$extensions && doc.$extensions['com.closure.legacyJson'] &&
                  doc.$extensions['com.closure.legacyJson'].tokenSetOrder) || null;
  var keys = Object.keys(doc).filter(function (k) {
    return k.charAt(0) !== '$' && doc[k] && typeof doc[k] === 'object';
  });
  var order;
  if (declared && declared.length) {
    /* A declared order may name sets under a different spelling than the
       top-level keys (".mode/light" vs "mode/light"), so it RANKS the keys the
       document actually has rather than replacing them. Anything it does not
       mention keeps its own position, after the ones it does. */
    var rank = {};
    for (var i = 0; i < declared.length; i++) {
      rank[declared[i]] = i;
      rank['.' + declared[i]] = i;
    }
    order = keys.slice().sort(function (a, b) {
      var ra = rank[a] === undefined ? declared.length + keys.indexOf(a) : rank[a];
      var rb = rank[b] === undefined ? declared.length + keys.indexOf(b) : rank[b];
      return ra - rb;
    });
  } else {
    order = keys;
  }
  order.reverse();                    // later wins, so look at the winner first
  var bases = order.map(function (k) { return doc[k]; });
  bases.push(doc);                    // a document with no sets at all
  var out = { keys: order, bases: bases };
  if (SEARCH_CACHE) SEARCH_CACHE.set(doc, out);
  return out;
}

/* Walk a dotted reference path from one base. Null when it does not land on a
   token there — which is the ordinary answer, not a failure. */
function lookIn(base, segs) {
  var node = base;
  for (var i = 0; i < segs.length && node; i++) node = node[segs[i]];
  if (!node || typeof node !== 'object' || !isToken(node)) return null;
  return tokenValue(node);
}

/* Where a reference lands, and in WHICH set — the set matters because the next
   hop of a chain resolves from there, not from where the chain started. */
function findRef(doc, root, path) {
  var segs = path.split('.');
  var v = lookIn(doc[root], segs);
  if (v !== null) return { value: v, root: root };
  var order = searchOrder(doc);
  for (var i = 0; i < order.bases.length; i++) {
    if (order.keys[i] === root) continue;         // already tried, and it missed
    v = lookIn(order.bases[i], segs);
    if (v !== null) return { value: v, root: order.keys[i] === undefined ? root : order.keys[i] };
  }
  return null;
}

function resolveRef(doc, root, ref, seen) {
  var m = /^\{([^}]+)\}$/.exec(String(ref));
  if (!m) return ref;
  if (!seen) seen = {};
  if (seen[ref] || Object.keys(seen).length > 8) return null;
  seen[ref] = 1;
  var hit = findRef(doc, root, m[1]);
  if (!hit) return null;
  return isReference(hit.value) ? resolveRef(doc, hit.root, hit.value, seen) : hit.value;
}

/*
  ONE CONCEPT, SPELLED TWICE.

  Both of the files this was built against carry font-family.teleneo-var AND
  fontFamilies.teleneo-var, holding the same string. The comparison never said
  a word about it, and could not: it is identical on both sides, so it sits in
  the 81,602 that match. It is still a defect — two names for one thing, and
  half the file pointing at each — and a comparison that has both documents
  open is in a position to notice.

  TWO TESTS, AND BOTH ARE NEEDED. Identical content alone is far too loose:
  letter-spacing, paragraph-spacing and paragraph-indents each hold a single
  token called `none` worth 0, which makes them identical and says nothing —
  they are three real concepts that happen to start at zero. So the names have
  to be the same WORD as well, under a normalisation that sees past casing,
  separators and plurals: font-family and fontFamilies both reduce to
  fontfamily, while paragraphIndent and paragraphSpacing stay apart.
*/
function normaliseName(name) {
  var n = String(name).toLowerCase().replace(/[^a-z]/g, '');
  if (/ies$/.test(n)) return n.replace(/ies$/, 'y');
  return n.replace(/s$/, '');
}

/*
  TWO REFERENCES TO WHAT IS ARGUABLY ONE NAME.

  Both sides have to be references, they have to be the same depth, and every
  segment has to normalise to the same word with at least one of them actually
  spelled differently — so {a.b} against {a.c} is not a match and
  {letter-spacing.0} against {letterSpacing.0} is.

  normaliseName is the same one the duplicate check uses, which matters: a
  pair flagged here is a pair that check would cluster, so the two findings
  agree by construction rather than by two sets of rules that drift.
*/
function sameWordDifferentSpelling(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a === b) return false;
  var m = /^\{(.+)\}$/.exec(a.trim()), n = /^\{(.+)\}$/.exec(b.trim());
  if (!m || !n) return false;
  var x = m[1].split('.'), y = n[1].split('.');
  if (x.length !== y.length) return false;
  for (var i = 0; i < x.length; i++) {
    var nx = normaliseName(x[i]), ny = normaliseName(y[i]);
    /*
      A SEGMENT WITH NO LETTERS IN IT IS COMPARED AS IT IS WRITTEN.

      normaliseName keeps letters and nothing else, so every numeric step in a
      scale — `0`, `100`, `950` — normalises to the empty string and would
      match every other one. That is how the first version of this missed the
      very pair it was written for: {letter-spacing.0} and {letterSpacing.0}
      agree on the word and the step, and the step normalised to nothing.
    */
    if (!nx || !ny) { if (x[i] !== y[i]) return false; continue; }
    if (nx !== ny) return false;
  }
  return true;
}

/* Is `name` a group — not a token — under `root` in this document? The
   question findDuplicateNames answers for one document, asked of the other. */
function hasGroup(doc, root, name) {
  var r = doc && doc[root];
  if (!r || typeof r !== 'object') return false;
  var g = r[name];
  return !!g && typeof g === 'object' && !isToken(g);
}

function findDuplicateNames(doc, side) {
  var out = [];
  if (!doc || typeof doc !== 'object') return out;
  Object.keys(doc).forEach(function (rootName) {
    if (rootName.charAt(0) === '$') return;
    var root = doc[rootName];
    if (!root || typeof root !== 'object') return;
    /* Leaf groups only — a group whose children are all tokens. Anything
       deeper is structure, and structure sharing a shape is not a duplicate
       name, it is a system with a shape. */
    var sigOf = new Map();
    Object.keys(root).forEach(function (groupName) {
      if (groupName.charAt(0) === '$') return;
      var group = root[groupName];
      if (!group || typeof group !== 'object' || isToken(group)) return;
      var parts = [];
      var keys = Object.keys(group);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].charAt(0) === '$') continue;
        var child = group[keys[i]];
        if (!isToken(child)) return;                   // not a leaf group
        parts.push(keys[i] + '=' + renderValue(tokenValue(child)));
      }
      if (!parts.length) return;
      sigOf.set(groupName, parts.sort().join('|'));
    });
    /*
      CLUSTERED BY THE NAME, AND ONLY THEN ASKED ABOUT THE CONTENT.

      It used to be the other way round: group by identical content first, and
      report the clusters whose names were one word spelled several ways. That
      only ever found the harmless case — an exporter writing the same group
      twice — and walked straight past the one that does damage.

      Measured on a real pair of 35,000-token exports: `letter-spacing` holds
      a plain `0` and `letterSpacing` holds `-5%`, in the same document, in the
      same root. Different contents, so the old check said nothing; and because
      they are different, every token pointing at one reads as changed against
      every token pointing at the other. It produced 100 rows of a comparison
      that had exactly one cause.

      So the content is no longer what forms the cluster — it is what the
      cluster is then asked about, and the answer goes out with the finding.
      `sameValues: false` is the serious one: not a name written twice, but one
      idea split in two.
    */
    var byWord = new Map();
    sigOf.forEach(function (sig, name) {
      var w = normaliseName(name);
      /* A name with no letters in it normalises to nothing, and two of those
         are not two spellings of one word — they are two names this check has
         no opinion about. */
      if (!w) return;
      if (!byWord.has(w)) byWord.set(w, []);
      byWord.get(w).push(name);
    });
    byWord.forEach(function (names) {
      if (names.length < 2) return;
      var sigs = names.map(function (n) { return sigOf.get(n); });
      var same = sigs.every(function (x) { return x === sigs[0]; });
      var counts = sigs.map(function (x) { return x.split('|').length; });
      out.push({
        side: side, root: rootName, names: names.slice().sort(),
        tokens: Math.max.apply(null, counts),
        sameValues: same,
      });
    });
  });
  return out;
}

/*
  COULD THE SIDE HOLDING A LITERAL HAVE POINTED INSTEAD?

  This is what turns "aliased one side" from a curiosity into a finding. If
  the token the other side references EXISTS in this document too, holding the
  same value, then the literal is a copy of something that was available to
  point at — the binding was lost rather than deliberately declined.

  Measured on the pair this was built against: tokens_.json still contains
  font-family.teleneo-var and not one token in the file references it, while
  Spar.json references it 280 times. The file is not a flattened export
  either — it carries 102,400 references overall, more than Spar's 90,870. So
  it is that one variable that came unbound, and every typography style in the
  file has the font name typed into it instead.

  IT IS A WARNING, NOT AN ERROR. Inlining can be deliberate. What makes it
  worth saying is the asymmetry: the variable is right there, unused.
*/
function bindableTarget(litDoc, root, ref, expected) {
  var m = /^\{([^}]+)\}$/.exec(String(ref));
  if (!m) return null;
  /* Across sets, on the same terms as resolveRef: the variable that is sitting
     there unused is just as unused when it lives in another set. */
  var hit = findRef(litDoc, root, m[1]);
  if (!hit) return null;
  var v = hit.value;
  /* The target may itself point somewhere; what matters is where it lands. */
  if (isReference(v)) v = resolveRef(litDoc, hit.root, v);
  if (v === null || renderValue(v) !== expected) return null;
  return m[1];
}

/*
  THE SAME TOKEN, SOMEWHERE ELSE.

  A path-keyed diff cannot see a rename: move a branch and every leaf under it
  is reported once as gone and once as arrived. On the pair this was built
  against that was 11,216 rows describing 5,608 tokens — a quarter of the
  whole report, saying twice over that one layer had been relocated.

  A MOVE IS ONLY CLAIMED WHEN A RULE EXPLAINS IT. Pairing on "same value, same
  leaf name" alone would marry unrelated tokens: hundreds of them are #ffffff
  and called `background`. So the rules come first — every candidate pair
  proposes a prefix substitution, those are counted, and only substitutions
  that explain EIGHT OR MORE tokens are believed. A rename is systematic by
  nature; a coincidence is not.

  Then each rule is applied exactly: the repo path is rewritten and the result
  has to exist on the other side with the same value. A rule that explains
  many tokens still does not get to guess about any single one.
*/
var MOVE_RULE_MIN = 8;
function detectMoves(report) {
  if (!report.onlyInFigma.length || !report.onlyInRepo.length) return;

  var figmaByPath = new Map();
  report.onlyInFigma.forEach(function (x) { figmaByPath.set(x.path, x); });

  /* Candidates indexed by what a moved token keeps: its value and its own
     name. Bounded, because a value like #ffffff under a name like `background`
     has hundreds of holders and this only needs enough of them to spot a
     rule. */
  var byKey = new Map();
  report.onlyInFigma.forEach(function (x) {
    var segs = x.path.split('.');
    var k = x.value + '|' + segs[segs.length - 1];
    if (!byKey.has(k)) byKey.set(k, []);
    var arr = byKey.get(k);
    if (arr.length < 12) arr.push(x.path);
  });

  var rules = new Map();
  report.onlyInRepo.forEach(function (x) {
    var segs = x.path.split('.');
    var cands = byKey.get(x.value + '|' + segs[segs.length - 1]);
    if (!cands) return;
    for (var i = 0; i < cands.length; i++) {
      var o = cands[i].split('.');
      /* How much of the tail the two share — the part a move leaves alone. */
      var n = 0;
      while (n < segs.length && n < o.length && segs[segs.length - 1 - n] === o[o.length - 1 - n]) n++;
      if (n === 0) continue;
      var rp = segs.slice(0, segs.length - n).join('.');
      var fp = o.slice(0, o.length - n).join('.');
      if (rp === fp) continue;
      var key = rp + '\u241f' + fp;
      rules.set(key, (rules.get(key) || 0) + 1);
    }
  });

  var strong = [];
  rules.forEach(function (n, key) {
    if (n < MOVE_RULE_MIN) return;
    var parts = key.split('\u241f');
    strong.push({ from: parts[0], to: parts[1] });
  });
  if (!strong.length) return;
  /* Longest prefix first, so the most specific rule that fits is the one
     applied — a general rule would otherwise claim tokens a precise one
     describes better. */
  strong.sort(function (a, b) { return b.from.length - a.from.length; });

  var movedFrom = new Set(), movedTo = new Set();
  report.moved = [];
  report.onlyInRepo.forEach(function (x) {
    if (movedFrom.has(x.path)) return;
    for (var i = 0; i < strong.length; i++) {
      var rule = strong[i];
      if (x.path.indexOf(rule.from) !== 0) continue;
      var target = rule.to + x.path.slice(rule.from.length);
      var hit = figmaByPath.get(target);
      if (!hit || hit.value !== x.value || movedTo.has(target)) continue;
      movedFrom.add(x.path);
      movedTo.add(target);
      report.moved.push({ path: target, from: x.path, value: x.value, type: hit.type });
      return;
    }
  });

  if (!report.moved.length) return;
  report.onlyInFigma = report.onlyInFigma.filter(function (x) { return !movedTo.has(x.path); });
  report.onlyInRepo = report.onlyInRepo.filter(function (x) { return !movedFrom.has(x.path); });
  /* The roll-up counts a move once, under where it landed — it is one event,
     and counting it in two collections would restate the double-count this
     exists to remove. */
  report.moved.forEach(function (m) {
    var g = rootOf(m.path);
    if (!report._groupIndex.has(g)) {
      report._groupIndex.set(g, { name: g, onlyInFigma: 0, onlyInRepo: 0, changed: 0,
                                  repointed: 0, aliased: 0, moved: 0, same: 0 });
    }
    report._groupIndex.get(g).moved++;
  });
}

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
    /* The changed rows collapsed by the change they share — see below. */
    changedPatterns: [],
    /* One side aliases what the other inlines, and they resolve to the same
       thing — a difference in how the file was written, not in what it says.
       Architecture, not a value: nobody decided anything. */
    aliased: [],
    /* The same token, same value, at a different path — one event a
       path-keyed diff would otherwise report twice, once as gone and once as
       arrived. */
    moved: [],
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
    if (!groups.has(g)) groups.set(g, { name: g, onlyInFigma: 0, onlyInRepo: 0, changed: 0, repointed: 0, aliased: 0, moved: 0, same: 0 });
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
    var bucket, aliasTarget = null, aliasSide = null;
    if (leaf.ref && other.ref) {
      /*
        A REFERENCE THAT MOVED AND LANDED ON A DIFFERENT VALUE IS A DECISION.

        Both sides pointing was treated as pure structure, and mostly it is —
        but "the token now resolves to a different colour" is a difference in
        what the file SAYS, however it came about. Measured on the pair this
        was built against: of 11,964 repoints, 7,669 land on the same value
        and 4,295 do not. Filing all of them as architecture hid 4,295 real
        differences; filing all of them as values would hide the re-rooting.
        So they are told apart by resolving both.

        Unresolvable stays structure: without a value on both sides there is
        nothing to claim a difference about.
      */
      var fv = resolveRef(figmaDoc, rootOf(path), rawOf(figmaDoc, path));
      var rv = resolveRef(repoDoc, rootOf(path), rawOf(repoDoc, path));
      bucket = (fv !== null && rv !== null && renderValue(fv) !== renderValue(rv))
        ? 'changed' : 'repointed';
      if (bucket === 'changed') leaf = { value: leaf.value, ref: leaf.ref, type: inferType(fv) };
    } else if (leaf.ref !== other.ref) {
      /*
        ONE SIDE POINTS AND THE OTHER HOLDS. Resolve the pointing one and ask
        whether they agree: if they do, the token's VALUE did not change and
        calling it a value change buries the ones that did. If they do not —
        or the reference does not resolve — it stays a value change, because
        then the two files genuinely say different things.
      */
      var root = rootOf(path);
      var resolved = leaf.ref
        ? resolveRef(figmaDoc, root, rawOf(figmaDoc, path))
        : resolveRef(repoDoc, root, rawOf(repoDoc, path));
      bucket = (resolved !== null && renderValue(resolved) === (leaf.ref ? other.value : leaf.value))
        ? 'aliased' : 'changed';
      if (bucket === 'aliased') {
        /* The side WITHOUT the reference is the one that could have had it. */
        var litDoc = leaf.ref ? repoDoc : figmaDoc;
        var theRef = leaf.ref ? rawOf(figmaDoc, path) : rawOf(repoDoc, path);
        aliasTarget = bindableTarget(litDoc, rootOf(path), theRef, renderValue(resolved));
        aliasSide = leaf.ref ? 'repo' : 'figma';
      }
    } else {
      /*
        A COMPOSITE IS NOT A TYPE. IT IS A STYLE MADE OF TYPED PARTS.

        "shadow" and "typography" are not kinds of token the way colour and
        number are — Figma's variable types are colour, number, string and
        boolean, and a shadow is a style built out of a colour and four
        numbers. Filing a shadow under a type called "shadow" invents a
        category and then hides, inside it, what actually moved.

        So a differing composite is judged by its PARTS. Every sub-value that
        differs is examined on its own, and the row is:

          repointed  every differing part is a reference on both sides,
                     pointing somewhere new — which is what the two shadows in
                     the pair this was built against actually are: five
                     sub-values, all of them {mode.neutral.…} becoming
                     {mode.secondary.…}. Not a value change at all.
          aliased    every differing part resolves to the same value
          changed    anything genuinely different, TYPED BY THE PARTS that
                     differ — a shadow whose blur moved is a number change,
                     not a "shadow change" — or 'mixed' when the parts that
                     moved are of more than one kind.

        One genuine difference makes the whole row a value change, which is
        the safe direction: a real change must never be filed as a non-change.
      */
      bucket = 'changed';
      var fRaw = rawOf(figmaDoc, path), rRaw = rawOf(repoDoc, path);
      if (fRaw && rRaw && !isSingleValue(fRaw) && !isSingleValue(rRaw)) {
        var rt = rootOf(path);
        var keys = Object.keys(fRaw).concat(Object.keys(rRaw));
        var seen = {};
        var allRefs = true, allAgree = true, sawOne = false;
        var partTypes = {};
        for (var ki = 0; ki < keys.length; ki++) {
          var k = keys[ki];
          if (k.charAt(0) === '$' || seen[k]) continue;
          seen[k] = 1;
          var fv = fRaw[k], rv = rRaw[k];
          if (renderValue(fv) === renderValue(rv)) continue;
          sawOne = true;
          if (!(isReference(fv) && isReference(rv))) allRefs = false;
          var fr = isReference(fv) ? resolveRef(figmaDoc, rt, fv) : fv;
          var rr = isReference(rv) ? resolveRef(repoDoc, rt, rv) : rv;
          if (fr === null || rr === null || renderValue(fr) !== renderValue(rr)) {
            allAgree = false;
            /* The part's own kind, read off the resolved value where there is
               one — a reference's type is the type of what it points at. */
            partTypes[inferType(fr === null ? fv : fr)] = 1;
          }
        }
        if (sawOne && allRefs) bucket = 'repointed';
        else if (sawOne && allAgree) {
          bucket = 'aliased';
          /* Any one sub-value that could have pointed and does not is enough
             to call the token unbound — it is the same lost link, wearing a
             composite. */
          for (var kj = 0; kj < keys.length && !aliasTarget; kj++) {
            var kk = keys[kj];
            if (kk.charAt(0) === '$') continue;
            var f2 = fRaw[kk], r2 = rRaw[kk];
            if (renderValue(f2) === renderValue(r2)) continue;
            if (isReference(f2) === isReference(r2)) continue;
            var refv = isReference(f2) ? f2 : r2;
            var litd = isReference(f2) ? repoDoc : figmaDoc;
            var land = resolveRef(isReference(f2) ? figmaDoc : repoDoc, rt, refv);
            if (land === null) continue;
            aliasTarget = bindableTarget(litd, rt, refv, renderValue(land));
            if (aliasTarget) aliasSide = isReference(f2) ? 'repo' : 'figma';
          }
        }
        else if (sawOne) {
          var names = Object.keys(partTypes);
          leaf = { value: leaf.value, ref: leaf.ref,
                   type: names.length === 1 ? names[0] : 'mixed' };
        }
      }
    }
    /* The type comes from THIS side. Where the two disagree the token's kind
       itself changed, which is a change worth seeing under the new kind
       rather than the old one. */
    var row = { path: path, figma: leaf.value, repo: other.value, type: leaf.type };
    if (aliasTarget) { row.bindable = aliasTarget; row.unboundSide = aliasSide; }
    report[bucket].push(row);
    bump(path, bucket);
  });
  R.forEach(function (leaf, path) {
    if (F.has(path)) return;
    report.onlyInRepo.push({ path: path, value: leaf.value, type: leaf.type });
    bump(path, 'onlyInRepo');
  });

  report._groupIndex = groups;
  detectMoves(report);
  delete report._groupIndex;

  /* Sorted by how much there is to look at, so the group that changed most is
     the one at the top rather than whichever happened to be named first. */
  report.groups = Array.from(groups.values()).sort(function (a, b) {
    var da = a.onlyInFigma + a.onlyInRepo + a.changed + a.repointed + a.aliased + a.moved;
    var db = b.onlyInFigma + b.onlyInRepo + b.changed + b.repointed + b.aliased + b.moved;
    if (da !== db) return db - da;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  /*
    The aliased rows where the variable was there to point at. Counted
    separately because it is the difference between "written differently" and
    "a link that used to exist and no longer does".
  */
  report.unbound = report.aliased.filter(function (x) { return !!x.bindable; });

  /* Not a difference between the two — a defect inside each, which only a
     reader with both files open would otherwise have to spot by eye. */
  /*
    COLLAPSED TO ONE FINDING PER SPELLING PAIR. A themes-shaped export is
    dozens of self-contained documents and the same duplicate sits in every
    one of them — 76 rows saying font-family and fontFamilies once each per
    document is not 76 findings, it is one, repeated. The document count is
    kept, because "in all 38" is part of what makes it worth fixing.
  */
  /*
    AND COLLAPSED ACROSS THE TWO SIDES AS WELL AS WITHIN EACH.

    Keyed by side, `font-sizes / fontSize` came out twice — once for the Figma
    file, once for the repo file — one above the other, the same two names with
    the same sentence under each. Thirteen rows for seven findings, and the
    repetition meant nothing until a reader noticed the two names above were
    the same two names.

    It is ONE finding with a `sides` list now: the split exists, and it exists
    in both files or in one of them. `differsIn` is kept apart from `sides`
    because the two questions come apart — a pair can be two spellings of one
    harmless name in one document and two spellings holding different values in
    the other, and flattening that into a single boolean would report the wrong
    one half the time.
  */
  var dupRaw = findDuplicateNames(figmaDoc, 'figma').concat(findDuplicateNames(repoDoc, 'repo'));
  var dupBy = new Map();
  dupRaw.forEach(function (d) {
    var k = d.root + '\u241f' + d.names.join('/');
    if (!dupBy.has(k)) {
      dupBy.set(k, { root: d.root, names: d.names, tokens: d.tokens,
                     sides: [], differsIn: [], has: {}, documents: 0 });
    }
    var e = dupBy.get(k);
    if (e.sides.indexOf(d.side) === -1) e.sides.push(d.side);
    if (!d.sameValues && e.differsIn.indexOf(d.side) === -1) e.differsIn.push(d.side);
    e.tokens = Math.max(e.tokens, d.tokens);
    e.documents++;
  });
  /*
    WHICH FILE SPELLS IT WHICH WAY.

    `sides` says where the SPLIT is — where one document holds both names at
    once — and that is not the same question as which name each document uses.
    The row that matters most here proves it: `letter-spacing` and
    `letterSpacing` are both in the Figma file and only `letterSpacing` is in
    the repo, which is the entire reason a hundred tokens read as changed. A
    `sides` list saying "this Figma file" cannot say that; it leaves the repo
    unmentioned, as though it had nothing to do with it.

    So each finding is asked of BOTH documents, for BOTH names, whether or not
    that document had a collision of its own. One of them almost always holds
    exactly one of the two, and that is the half of the sentence that was
    missing.
  */
  Array.from(dupBy.values()).forEach(function (e) {
    e.has = {
      figma: e.names.filter(function (n) { return hasGroup(figmaDoc, e.root, n); }),
      repo: e.names.filter(function (n) { return hasGroup(repoDoc, e.root, n); }),
    };
  });
  report.duplicateNames = Array.from(dupBy.values());

  /*
    CARRIED ONTO THE ROWS THAT SHOW IT.

    The two spellings were a note above the table, which is the right summary
    and the wrong place to act on: a reader looking at one row had to hold
    "font-family and fontFamilies are the same thing" in their head and apply
    it themselves. Every unbound row already names the variable it should have
    pointed at, so it can carry the other spelling of that variable too, and
    the finding lands on the line that demonstrates it.
  */
  var spellingOf = new Map();
  report.duplicateNames.forEach(function (d) {
    d.names.forEach(function (n) {
      spellingOf.set(n, d.names.filter(function (o) { return o !== n; }));
    });
  });
  report.unbound.forEach(function (row) {
    var group = String(row.bindable).split('.')[0];
    var others = spellingOf.get(group);
    if (others && others.length) { row.alsoSpelled = others; row.bindableGroup = group; }
  });

  /*
    ONE CHANGE, HOWEVER MANY TOKENS FOLLOW IT.

    A hundred tokens pointing at the same variable do not become a hundred
    findings when that variable is swapped for another — they are one edit,
    reported a hundred times. On a real pair of exports 500 changed rows came
    from 99 distinct (from, to) pairs, and 447 of those rows sat in a pair that
    repeated: 100 for one letter-spacing group, 100 for one font family.

    No inference here at all — two rows are the same change when both sides of
    them are identical strings. What the reader gets is the count, which is the
    part they were working out by scrolling.

    `sameNameDifferentSpelling` is the one guess, and it is a cheap one: both
    ends are references, and the names they point at normalise to the same
    word. That is the pair above — {letter-spacing.0} against {letterSpacing.0}
    — and on those 99 pairs it fired once, on that one, and nowhere else.
  */
  var patternBy = new Map();
  report.changed.forEach(function (c) {
    var k = String(c.figma) + '\u241f' + String(c.repo);
    if (!patternBy.has(k)) {
      patternBy.set(k, { figma: c.figma, repo: c.repo, type: c.type, count: 0, paths: [],
                         sameNameDifferentSpelling: sameWordDifferentSpelling(c.figma, c.repo) });
    }
    var p = patternBy.get(k);
    p.count++;
    if (p.paths.length < 3) p.paths.push(c.path);
  });
  report.changedPatterns = Array.from(patternBy.values())
    .filter(function (p) { return p.count > 1; })
    .sort(function (a, b) { return b.count - a.count; });

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
                     report.repointed.length === 0 &&
                     report.aliased.length === 0 &&
                     report.moved.length === 0;
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
  list('  same value, aliased one side — one file points at it, the other spells it out',
       report.aliased, bothSides);
  list('  the same token, somewhere else', report.moved,
       function (r) { return r.from + '\n        ->  ' + r.path; });

  out.push(report.sameCount.toLocaleString() + ' identical');
  return out.join('\n');
}

  /* findDuplicateNames is exported because it does not need a comparison: it
     is a reading of ONE document, and the export and import paths both have a
     document and nothing to compare it against. */
  var api = { compare, flatten, countTokens, detectFormat, formatLabel, renderValue, isToken, format,
              findDuplicateNames };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomJsonDiff = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
