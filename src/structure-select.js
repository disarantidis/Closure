/*
  Dual-mode, exactly like src/structure-capture.js: module.exports when there is a
  require(), a global otherwise. Runs in Node (the self-test) and in the plugin UI.

  WHICH SAVED STRUCTURE A JSON BELONGS TO.

  src/structure-capture.js saves, for every file the plugin has been opened in, a
  line per file: its layers, each with the modes it has. An import has no document
  to match against (it goes into an empty file), so the match is made from the JSON
  being imported: a Resolved export names its schemes, its accent schemes, its
  light/dark modes and its breakpoints, and each of those is the set of modes of
  one collection of the structure it came from.

  IT KNOWS NO COLLECTION NAME. A collection is recognised by the modes it has:
  the one that has every scheme is the scheme router, whatever it is called. So a
  structure with `.magenta-*` in place of `.brand-*`, or with extra layers
  (.section, .card), is judged by the same four questions.

  It only DESCRIBES the fit. Whether the import can then rebuild that
  architecture is src/architecture-radd.js's call (recognise); the two answers are
  shown side by side so a person is never told "rebuilt" when only "matched".

  Plain data in, plain data out.
*/
(function (global) {
  'use strict';

  /* "name[mode,mode]" -> { name, modes }, the form src/structure-capture.js signature() writes. */
  function parseItem(item) {
    var s = String(item);
    var i = s.lastIndexOf('[');
    if (i === -1 || s.charAt(s.length - 1) !== ']') return { name: s, modes: [] };
    var inner = s.slice(i + 1, -1);
    return { name: s.slice(0, i), modes: inner === '' ? [] : inner.split(',') };
  }

  /* "S Mobile" -> "mobile", "XXL Large Desktop" -> "large-desktop": the size code
     is dropped and the rest written the way a Resolved export keys it. */
  function breakpointKey(mode) {
    var words = String(mode).trim().split(/\s+/);
    if (words.length > 1 && /^[A-Z]{1,3}$/.test(words[0])) words.shift();
    return words.join('-').toLowerCase();
  }

  /* What a Resolved document says about itself, as four sets of mode names. */
  function profileOf(doc) {
    var meta = (doc && doc.$extensions && doc.$extensions['com.desquared.radd']) || {};
    var bp = doc && doc.breakpoint && typeof doc.breakpoint === 'object' ? Object.keys(doc.breakpoint) : [];
    return {
      schemes: (meta.schemes || []).slice(),
      accents: (meta.accentSchemes || []).slice(),
      modes: (meta.modes || []).slice(),
      breakpoints: bp.filter(function (k) { return k.charAt(0) !== '$'; })
    };
  }

  function has(have, want) {
    for (var i = 0; i < want.length; i++) if (have.indexOf(want[i]) === -1) return false;
    return true;
  }

  /* One saved structure against a profile: which of the four questions it answers. */
  function fit(items, profile) {
    var cols = (items || []).map(parseItem);
    var checks = [];
    function ask(label, want, test) {
      if (!want.length) return;
      var ok = cols.some(test);
      checks.push({ label: label, ok: ok });
    }
    ask('schemes', profile.schemes, function (c) { return has(c.modes, profile.schemes); });
    ask('accent schemes', profile.accents, function (c) { return has(c.modes, profile.accents); });
    ask('light/dark modes', profile.modes, function (c) {
      return c.modes.length === profile.modes.length && has(c.modes, profile.modes);
    });
    ask('breakpoints', profile.breakpoints, function (c) {
      return has(c.modes.map(breakpointKey), profile.breakpoints);
    });
    var passed = checks.filter(function (c) { return c.ok; }).length;
    return {
      score: checks.length ? passed / checks.length : 0,
      checks: checks,
      missing: checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.label; })
    };
  }

  /*
    `entries` are the saved lines: { file, items, layers, ... }.
    -> { kind: 'fits' | 'partial' | 'none', entry, score, missing }
    A structure FITS only when every question is answered. The best partial one is
    named, because "it has the schemes but not the accents" is worth saying; below
    half nothing is claimed.
  */
  function choose(entries, profile) {
    var best = null, bestFit = null;
    (entries || []).forEach(function (e) {
      var f = fit(e.items, profile);
      if (!bestFit || f.score > bestFit.score) { best = e; bestFit = f; }
    });
    if (!best || !bestFit.score || bestFit.score < 0.5) return { kind: 'none', entry: null, score: 0, missing: [] };
    return { kind: bestFit.score === 1 ? 'fits' : 'partial', entry: best, score: bestFit.score, missing: bestFit.missing };
  }

  var api = { profileOf: profileOf, fit: fit, choose: choose, parseItem: parseItem, breakpointKey: breakpointKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomStructureSelect = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
