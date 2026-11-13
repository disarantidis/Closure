/*
  Dual-mode, like the other modules: module.exports under Node, a global in the
  plugin UI.
*/
(function (global) {
  'use strict';

  var R = (typeof require === 'function') ? require('./import-resolved.js') : global.PomImportResolved;
  var A = (typeof require === 'function') ? require('./architecture-radd.js') : global.PomArchitectureRadd;

  /*
    THE RESTORE SECTION, REDUCED TO WHAT THE RULES CANNOT SAY.

    The exporter writes a full record of the file's styles, scopes and links
    (emit-resolved.js, in the sandbox, where it has the file to read). That is
    more than an import needs: the architecture's rules (architecture-radd.js,
    import-resolved.js) already produce nearly all of it from the tokens. This
    runs on the finished document, in the UI where the rules are, and keeps only
    the DIFFERENCE:

      styles   per style, the fields that differ from what the rules make from
               THIS document — so a value the document has since changed is the
               document's, and the section never argues with it
      scopes   only the variables whose scopes are not the rule's
      links    only the renames that are not the architecture's own
      architecture

    Everything dropped is something the rules reproduce; round() checks that,
    by importing the slimmed document and comparing it with the full record.
  */

  function close(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-3;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      var ks = {}; Object.keys(a).forEach(function (k) { ks[k] = 1; }); Object.keys(b).forEach(function (k) { ks[k] = 1; });
      return Object.keys(ks).every(function (k) { return close(a[k], b[k]); });
    }
    return a === b;
  }

  /* a rules-made style, spelled the way the record spells it: bound variables
     as 'collection::name' */
  function asRecord(style) {
    var out = JSON.parse(JSON.stringify(style));
    var bound = function (m) {
      var o = {};
      Object.keys(m || {}).forEach(function (f) { o[f] = m[f].collection + '::' + m[f].name; });
      return o;
    };
    if (out.bound) out.bound = bound(out.bound);
    (out.effects || []).forEach(function (e) { e.bound = bound(e.bound); });
    (out.layoutGrids || []).forEach(function (g) { g.bound = bound(g.bound); });
    return out;
  }

  /* the fields of `have` that differ from `rule`; null when none */
  function patchOf(rule, have, kind) {
    var p = {}, any = false;
    ['description', 'fontName', 'textCase', 'textDecoration'].forEach(function (k) {
      if (kind !== 'text' && k !== 'description') return;
      if (!close(rule[k], have[k])) { p[k] = have[k]; any = true; }
    });
    if (kind === 'text') {
      var vals = {};
      Object.keys(have.values || {}).forEach(function (k) {
        if (!close((rule.values || {})[k], have.values[k])) vals[k] = have.values[k];
      });
      if (Object.keys(vals).length) { p.values = vals; any = true; }
      var b = {}, rb = rule.bound || {}, hb = have.bound || {};
      Object.keys(hb).forEach(function (f) { if (rb[f] !== hb[f]) b[f] = hb[f]; });
      Object.keys(rb).forEach(function (f) { if (!(f in hb)) b[f] = null; });
      if (Object.keys(b).length) { p.bound = b; any = true; }
    }
    if (kind === 'effect' && !close(rule.effects, have.effects)) { p.effects = have.effects; any = true; }
    if (kind === 'grid' && !close(rule.layoutGrids, have.layoutGrids)) { p.layoutGrids = have.layoutGrids; any = true; }
    return any ? p : null;
  }

  function sameSet(a, b) {
    var x = (a || []).slice().sort().join(','), y = (b || []).slice().sort().join(',');
    return x === y;
  }

  function slim(doc) {
    var meta = doc && doc.$extensions && doc.$extensions['com.desquared.radd'];
    var full = meta && meta.restore;
    if (!full) return { document: doc, slimmed: false };
    var bare = JSON.parse(JSON.stringify(doc));
    delete bare.$extensions['com.desquared.radd'].restore;
    var t = R.translate(bare);
    if (!t.ok) return { document: doc, slimmed: false, reason: 'the rules cannot read this document' };
    var rules = t.ir.styles;

    var next = {};
    if (full.architecture) next.architecture = full.architecture;
    /* The structure record is the file itself, not something the rules reproduce: kept whole. */
    if (full.structure) next.structure = full.structure;

    var patches = { text: {}, effect: {}, grid: {} }, added = { text: [], effect: [], grid: [] }, removed = { text: [], effect: [], grid: [] };
    var any = false;
    ['text', 'effect', 'grid'].forEach(function (kind) {
      var have = (full.styles || {})[kind] || [];
      var made = rules[kind].map(asRecord);
      have.forEach(function (h) {
        var r = made.filter(function (m) { return m.name === h.name; })[0];
        if (!r) { added[kind].push(h); any = true; return; }
        var p = patchOf(r, h, kind);
        if (p) { patches[kind][h.name] = p; any = true; }
      });
      made.forEach(function (m) {
        if (!have.some(function (h) { return h.name === m.name; })) { removed[kind].push(m.name); any = true; }
      });
    });
    if (any) {
      next.styles = { patches: patches };
      ['text', 'effect', 'grid'].forEach(function (k) {
        if (!added[k].length) return;
        next.styles.added = next.styles.added || {}; next.styles.added[k] = added[k];
      });
      ['text', 'effect', 'grid'].forEach(function (k) {
        if (!removed[k].length) return;
        next.styles.removed = next.styles.removed || {}; next.styles.removed[k] = removed[k];
      });
    }

    var scopes = [];
    (full.scopes || []).forEach(function (g) {
      var odd = (g.paths || []).filter(function (p) {
        var rule = A.scopesFor(A.C.foundation, p.replace(/^foundation\./, ''));
        return !rule || !sameSet(rule, g.scopes);
      });
      if (odd.length) scopes.push({ scopes: g.scopes, paths: odd });
    });
    if (scopes.length) next.scopes = scopes;

    var links = {};
    Object.keys(full.links || {}).forEach(function (k) {
      if (A.DEFAULT_LINKS[k] !== full.links[k]) links[k] = full.links[k];
    });
    if (Object.keys(links).length) next.links = links;

    var out = JSON.parse(JSON.stringify(doc));
    out.$extensions['com.desquared.radd'].restore = next;
    return { document: out, slimmed: true, before: JSON.stringify(full).length, after: JSON.stringify(next).length };
  }

  var api = { slim: slim };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomRestoreSlim = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
