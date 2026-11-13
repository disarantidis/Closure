/*
  Dual-mode, like the other modules: module.exports under Node, a global in the
  plugin UI.
*/
(function (global) {
  'use strict';

  /*
    WHAT IS WRONG WITH A RESOLVED DOCUMENT BEFORE IT IS IMPORTED.

    Not a comparison with another file — one document, read on its own. It looks
    for the shapes that, in the one real case measured (a Tokens Studio JSON
    against the Figma export it came from), accounted for what looked like
    import errors but was already in the file:

      flattened     a scheme whose colour cells are values where its sibling
                    schemes use references. Every scheme is built from the same
                    palette, so when one is written as hex and the rest are not,
                    the reference was lost on the way to this file
      broken        a reference to a token the document does not have
      modeHoles     a token that exists for some (mode, scheme) cells and not
                    others
      breakpointHoles  the same, across breakpoints

    Pure data in, pure data out; nothing here reads Figma.
  */

  function isRef(v) { return typeof v === 'string' && /^\{[^{}]+\}$/.test(v); }
  function isComposite(t) { return t.$type === 'shadow' || t.$type === 'typography'; }

  function flat(root) {
    var out = {};
    (function walk(o, p) {
      Object.keys(o).forEach(function (k) {
        if (k.charAt(0) === '$') return;
        var v = o[k];
        if (v && typeof v === 'object' && '$value' in v) out[p.concat(k).join('.')] = v;
        else if (v && typeof v === 'object') walk(v, p.concat(k));
      });
    })(root, []);
    return out;
  }

  function check(doc) {
    var F = flat(doc || {});
    var keys = Object.keys(F);

    /* ── schemes: how many colour cells are values ───────────────────────── */
    var by = {};
    keys.forEach(function (p) {
      var seg = p.split('.');
      if (seg[0] !== 'mode' || F[p].$type !== 'color') return;
      var s = seg[2];
      by[s] = by[s] || { scheme: s, cells: 0, literal: 0, examples: [] };
      by[s].cells++;
      if (!isRef(F[p].$value)) {
        by[s].literal++;
        if (by[s].examples.length < 3) by[s].examples.push(seg.slice(3).join('.') + ' (' + seg[1] + ')');
      }
    });
    var schemes = Object.keys(by).map(function (k) { return by[k]; });
    var clean = schemes.filter(function (s) { return s.literal === 0; }).length;
    /* flattened: some values here, while at least half of the schemes have none */
    var flattened = schemes.filter(function (s) { return s.literal > 0 && clean * 2 >= schemes.length - 1; });

    /* ── references that lead nowhere ────────────────────────────────────── */
    var broken = [];
    keys.forEach(function (p) {
      var t = F[p];
      if (isComposite(t) || !isRef(t.$value)) return;
      if (!(t.$value.slice(1, -1) in F)) broken.push({ token: p, target: t.$value });
    });

    /* ── a token missing from some cells ─────────────────────────────────── */
    var cellsOf = {}, allCells = {};
    var bpOf = {}, allBp = {};
    keys.forEach(function (p) {
      var seg = p.split('.');
      if (seg[0] === 'mode') {
        var path = seg.slice(3).join('.'), cell = seg[1] + '.' + seg[2];
        allCells[cell] = true;
        (cellsOf[path] = cellsOf[path] || {})[cell] = true;
      } else if (seg[0] === 'breakpoint') {
        var bp = seg[1], bpath = seg.slice(2).join('.');
        allBp[bp] = true;
        (bpOf[bpath] = bpOf[bpath] || {})[bp] = true;
      }
    });
    var cellList = Object.keys(allCells), bpList = Object.keys(allBp);
    var modeHoles = Object.keys(cellsOf).filter(function (p) { return Object.keys(cellsOf[p]).length < cellList.length; })
      .map(function (p) { return { token: p, missingIn: cellList.filter(function (c) { return !cellsOf[p][c]; }) }; });
    var breakpointHoles = Object.keys(bpOf).filter(function (p) { return Object.keys(bpOf[p]).length < bpList.length; })
      .map(function (p) { return { token: p, missingIn: bpList.filter(function (b) { return !bpOf[p][b]; }) }; });

    return { schemes: schemes, flattened: flattened, broken: broken, modeHoles: modeHoles, breakpointHoles: breakpointHoles,
             clean: !flattened.length && !broken.length && !modeHoles.length && !breakpointHoles.length };
  }

  var api = { check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomSourceQuality = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
