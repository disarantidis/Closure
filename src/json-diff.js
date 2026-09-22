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
  Every leaf in the document, as path -> rendered value.

  Paths are dot-joined, which is how every reference in these files is
  already written ({core.blue.500}), so a path in this report can be pasted
  straight into a search of the source and found.
*/
function flatten(doc) {
  var out = new Map();
  (function walk(node, path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    if (isToken(node)) {
      out.set(path.join('.'), renderValue(tokenValue(node)));
      return;
    }
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      /* Metadata, not tokens — see the header. */
      if (keys[i].charAt(0) === '$') continue;
      walk(node[keys[i]], path.concat(keys[i]));
    }
  })(doc, []);
  return out;
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
function detectFormat(doc) {
  var ext = doc && doc.$extensions && doc.$extensions['com.closure'];
  if (ext && ext.format) return ext.format === 'resolved' ? 'resolved' : ext.format;
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
    onlyInFigma: [], onlyInRepo: [], changed: [],
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

  var F = flatten(figmaDoc), R = flatten(repoDoc);
  report.figmaTokens = F.size;
  report.repoTokens = R.size;

  var groupOf = function (path) {
    var i = path.indexOf('.');
    return i === -1 ? path : path.slice(0, i);
  };
  var groups = new Map();
  var bump = function (path, field) {
    var g = groupOf(path);
    if (!groups.has(g)) groups.set(g, { name: g, onlyInFigma: 0, onlyInRepo: 0, changed: 0, same: 0 });
    groups.get(g)[field]++;
  };

  F.forEach(function (val, path) {
    if (!R.has(path)) { report.onlyInFigma.push({ path: path, value: val }); bump(path, 'onlyInFigma'); return; }
    var other = R.get(path);
    if (other === val) { report.sameCount++; bump(path, 'same'); return; }
    report.changed.push({ path: path, figma: val, repo: other });
    bump(path, 'changed');
  });
  R.forEach(function (val, path) {
    if (F.has(path)) return;
    report.onlyInRepo.push({ path: path, value: val });
    bump(path, 'onlyInRepo');
  });

  /* Sorted by how much there is to look at, so the group that changed most is
     the one at the top rather than whichever happened to be named first. */
  report.groups = Array.from(groups.values()).sort(function (a, b) {
    var da = a.onlyInFigma + a.onlyInRepo + a.changed;
    var db = b.onlyInFigma + b.onlyInRepo + b.changed;
    if (da !== db) return db - da;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  report.identical = report.onlyInFigma.length === 0 &&
                     report.onlyInRepo.length === 0 &&
                     report.changed.length === 0;
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

  list('ONLY HERE — would be added to the repo', report.onlyInFigma,
       function (r) { return r.path + '  =  ' + r.value; });
  list('ONLY IN THE REPO — no longer in this file', report.onlyInRepo,
       function (r) { return r.path + '  =  ' + r.value; });
  list('CHANGED', report.changed,
       function (r) { return r.path + '\n      repo:  ' + r.repo + '\n      here:  ' + r.figma; });

  out.push(report.sameCount.toLocaleString() + ' identical');
  return out.join('\n');
}

  var api = { compare, flatten, countTokens, detectFormat, formatLabel, renderValue, isToken, format };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomJsonDiff = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
