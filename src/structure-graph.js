/*
  Dual-mode, exactly like src/structure-capture.js: module.exports when there is a
  require(), a global otherwise. One file runs in Node (the self-test), in the plugin
  sandbox (code.js, to encode) and in the plugin UI (to decode).

  THE FILE'S WHOLE VARIABLE GRAPH, WRITTEN SMALL ENOUGH TO CARRY INSIDE A JSON.

  src/structure-capture.js DESCRIBES a file's layering (which collection points into
  which, how a name changes on the way). That is not enough to rebuild the file: it has
  no values, no scopes, no descriptions, no order. This module RECORDS the file, and
  decode() gives back, exactly, what encode() was given:

      collections, their modes, hidden flag, order
      every variable: name, type, scopes, description, code syntax, order
      every cell: an alias to a named variable, or a literal value

  IT KNOWS NO COLLECTION NAME AND NO ARCHITECTURE. Nothing below says `.scheme` or
  `.card`. What makes it small is what the data itself shows:

    names     a variable name is `front/tail`. The tails (`basic/text`, `border/line`)
              repeat across collections and across fronts, so each is written ONCE
              (`tails`), and a collection says which tails each front has.
    aliases   a cell is, nearly always, "the same tail under another front of another
              collection" (`.scheme` neutral -> `_restricted`, front `restrictions/neutral`).
              Written once per (front, mode) as a RULE; the cells that do not follow it
              are listed one by one (`x`). A rule can be limited to the tails that do /
              do not contain one segment (`elevation`), which is how a layer that skips a
              step for one kind of token is told apart.
    the rest  a cell that follows no rule (a palette entry at its primitive) is a plain
              list of targets, by position — as many numbers as there are variables, and
              no more. A literal is its value.
    what each variable HAS  (type, scopes, description, code syntax) is written per group of
              variables that share it, never per variable. A description is stored as a
              template over the tail when the text contains it.

  LOSSLESS BY CONSTRUCTION: every cell that does not follow its rule is listed, so what is
  stored always expands to what the file had. The self-test compares the two, cell by cell,
  on the real graphs it can read.

  WHAT IT DOES NOT HOLD: variables of a library (an alias to a variable that is not in the
  file is counted in `external`, not written), and extended collections' inheritance.
*/
(function (global) {
  'use strict';

  var FORMAT = 'radd-graph';
  var VERSION = 1;

  function isAlias(v) {
    return !!v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS' && typeof v.id === 'string';
  }
  function isColor(v) {
    return !!v && typeof v === 'object' && typeof v.r === 'number' && typeof v.g === 'number' && typeof v.b === 'number';
  }

  /* ── numbers written as runs: [3,4,5,9] -> "3-5,9". Order is kept; a run is +1 steps. ── */
  function runs(list) {
    var out = [];
    var i = 0;
    while (i < list.length) {
      var j = i;
      while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
      out.push(j === i ? String(list[i]) : list[i] + '-' + list[j]);
      i = j + 1;
    }
    return out.join(',');
  }
  function unruns(text) {
    var out = [];
    if (text === '' || text === undefined || text === null) return out;
    var parts = String(text).split(',');
    for (var i = 0; i < parts.length; i++) {
      var d = parts[i].indexOf('-');
      if (d === -1) { out.push(Number(parts[i])); continue; }
      var a = Number(parts[i].slice(0, d));
      var b = Number(parts[i].slice(d + 1));
      for (var n = a; n <= b; n++) out.push(n);
    }
    return out;
  }

  function splitName(name, k) {
    var seg = String(name).split('/');
    var s = Math.min(k, seg.length - 1);
    return { front: seg.slice(0, s).join('/'), tail: seg.slice(s).join('/') };
  }
  function joinName(front, tail) {
    return front === '' ? tail : front + '/' + tail;
  }

  function compareNumbers(a, b) { return a - b; }

  /* ───────────────────────────── ENCODE ───────────────────────────── */

  /* The graph, flattened to what encoding needs. */
  function normalise(collections) {
    var where = {};
    var cols = collections.map(function (c, ci) {
      var vars = (c.variables || []).map(function (v, vi) {
        where[v.id] = { ci: ci, vi: vi };
        return { raw: v, name: String(v.name) };
      });
      return { raw: c, vars: vars };
    });
    return { cols: cols, where: where };
  }

  /* Which k (how many leading segments are the front) each collection uses. Chosen so that
     the tails are as shared as possible across collections: cost is the number of distinct
     fronts plus the tails nobody else has. Two rounds settle it. */
  function chooseK(cols) {
    var maxK = 6;
    var tailSets = cols.map(function (c) {
      var per = [];
      for (var k = 0; k <= maxK; k++) {
        var tails = {};
        var fronts = {};
        for (var i = 0; i < c.vars.length; i++) {
          var sp = splitName(c.vars[i].name, k);
          tails[sp.tail] = 1;
          fronts[sp.front] = 1;
        }
        per.push({ tails: tails, nTails: Object.keys(tails).length, nFronts: Object.keys(fronts).length });
      }
      return per;
    });
    var chosen = cols.map(function () { return 0; });
    function seed() {
      for (var ci = 0; ci < cols.length; ci++) {
        var best = 0;
        var bestCost = Infinity;
        for (var k = 0; k <= maxK; k++) {
          var cost = tailSets[ci][k].nTails + tailSets[ci][k].nFronts;
          if (cost < bestCost) { bestCost = cost; best = k; }
        }
        chosen[ci] = best;
      }
    }
    seed();
    for (var round = 0; round < 2; round++) {
      for (var ci = 0; ci < cols.length; ci++) {
        var others = {};
        for (var cj = 0; cj < cols.length; cj++) {
          if (cj === ci) continue;
          var t = tailSets[cj][chosen[cj]].tails;
          for (var key in t) others[key] = 1;
        }
        var best = chosen[ci];
        var bestCost = Infinity;
        for (var k = 0; k <= maxK; k++) {
          var own = tailSets[ci][k].tails;
          var fresh = 0;
          for (var tk in own) if (!others[tk]) fresh++;
          var cost = fresh + tailSets[ci][k].nFronts;
          if (cost < bestCost) { bestCost = cost; best = k; }
        }
        chosen[ci] = best;
      }
    }
    return chosen;
  }

  /* A set of variables of one collection (canonical positions), written as a cover:
     "*" when it is all of them, else [[frontIdx, ...], "tail runs"] groups that share the
     same tails. */
  function cover(col, positions) {
    if (positions.length === col.n) return '*';
    var byFront = {};
    positions.forEach(function (p) {
      var f = col.frontOfPos[p];
      if (!byFront[f]) byFront[f] = [];
      byFront[f].push(col.tailOfPos[p]);
    });
    var byText = {};
    var order = [];
    Object.keys(byFront).map(Number).sort(compareNumbers).forEach(function (f) {
      var text = runs(byFront[f].sort(compareNumbers));
      if (!byText[text]) { byText[text] = []; order.push(text); }
      byText[text].push(f);
    });
    return order.map(function (text) { return [byText[text], text]; });
  }

  function uncover(col, sel) {
    if (sel === '*') {
      var all = [];
      for (var i = 0; i < col.n; i++) all.push(i);
      return all;
    }
    var out = [];
    sel.forEach(function (g) {
      g[0].forEach(function (f) {
        unruns(g[1]).forEach(function (t) {
          var p = col.posOf[f + '|' + t];
          if (p !== undefined) out.push(p);
        });
      });
    });
    return out;
  }

  function sigOfCell(src, target, tails) {
    /* carry: the target is the same tail under another front; fixed: anything else */
    var name = target.name;
    if (name === src.tail) return 'C\u0001' + target.ci + '\u0001';
    var suffix = '/' + src.tail;
    if (name.length > suffix.length && name.slice(name.length - suffix.length) === suffix) {
      return 'C\u0001' + target.ci + '\u0001' + name.slice(0, name.length - suffix.length);
    }
    return 'F\u0001' + target.ci + '\u0001' + name;
  }

  function topSig(cells) {
    var count = {};
    var best = null;
    cells.forEach(function (c) {
      if (c.sig === null) return;
      count[c.sig] = (count[c.sig] || 0) + 1;
      if (best === null || count[c.sig] > count[best]) best = c.sig;
    });
    return best === null ? { sig: null, n: 0 } : { sig: best, n: count[best] };
  }

  function encode(collections, options) {
    var opts = options || {};
    var nm = normalise(collections);
    var segCache = {};
    var cols = nm.cols;
    var ks = chooseK(cols);
    /* a caller can pin how many leading segments are a collection's front (the self-test does, to exercise a rule
       limited to a segment); nothing in the plugin does */
    cols.forEach(function (c, i) { if (opts.k && opts.k[c.raw.name] !== undefined) ks[i] = opts.k[c.raw.name]; });

    /* tails, once for the whole file */
    var tailIndex = {};
    var tails = [];
    function tailId(t) {
      if (tailIndex[t] === undefined) { tailIndex[t] = tails.length; tails.push(t); }
      return tailIndex[t];
    }

    /* per collection: fronts, canonical order, positions */
    var info = cols.map(function (c, ci) {
      var k = ks[ci];
      var fronts = [];
      var frontIdx = {};
      var items = c.vars.map(function (v, vi) {
        var sp = splitName(v.name, k);
        if (frontIdx[sp.front] === undefined) { frontIdx[sp.front] = fronts.length; fronts.push(sp.front); }
        return { vi: vi, front: frontIdx[sp.front], tailText: sp.tail, tail: tailId(sp.tail), name: v.name };
      });
      return { k: k, fronts: fronts, items: items };
    });

    /* canonical order: by front (first-seen), then tail index */
    var meta = cols.map(function (c, ci) {
      var items = info[ci].items.slice();
      var canon = items.slice().sort(function (a, b) {
        return a.front !== b.front ? a.front - b.front : a.tail - b.tail;
      });
      var posOfVi = {};
      var frontOfPos = [];
      var tailOfPos = [];
      var posOf = {};
      canon.forEach(function (it, pos) {
        posOfVi[it.vi] = pos;
        frontOfPos.push(it.front);
        tailOfPos.push(it.tail);
        posOf[it.front + '|' + it.tail] = pos;
        it.pos = pos;
      });
      return { n: canon.length, canon: canon, posOfVi: posOfVi, frontOfPos: frontOfPos, tailOfPos: tailOfPos, posOf: posOf };
    });
    var base = [];
    var total = 0;
    meta.forEach(function (m) { base.push(total); total += m.n; });

    /* the cells of every variable, by mode name */
    var external = 0;
    var cellsOf = cols.map(function (c, ci) {
      var modeNames = {};
      (c.raw.modes || []).forEach(function (m) { modeNames[m.modeId] = m.name; });
      return info[ci].items.map(function (it) {
        var by = c.vars[it.vi].raw.valuesByMode || {};
        var out = {};
        Object.keys(by).forEach(function (mid) {
          var mode = modeNames[mid];
          if (mode === undefined) return;
          var val = by[mid];
          if (isAlias(val)) {
            var w = nm.where[val.id];
            if (!w) { external++; return; }
            out[mode] = { alias: { ci: w.ci, name: cols[w.ci].vars[w.vi].name, pos: base[w.ci] + meta[w.ci].posOfVi[w.vi] } };
          } else if (isColor(val)) {
            out[mode] = { lit: [val.r, val.g, val.b, val.a === undefined ? 1 : val.a] };
          } else {
            out[mode] = { lit: val };
          }
        });
        return out;
      });
    });

    var rules = [];
    var ruleIdx = {};
    function ruleId(sig) {
      if (ruleIdx[sig] === undefined) {
        var p = sig.split('\u0001');
        ruleIdx[sig] = rules.length;
        rules.push(p[0] === 'C' ? { k: 'c', c: Number(p[1]), f: p[2] } : { k: 'x', c: Number(p[1]), n: p[2] });
      }
      return ruleIdx[sig];
    }

    var outCols = cols.map(function (c, ci) {
      var m = meta[ci];
      var raw = c.raw;
      var entry = { name: String(raw.name), modes: (raw.modes || []).map(function (x) { return x.name; }) };
      var def = (raw.modes || []).filter(function (x) { return x.modeId === raw.defaultModeId; })[0];
      if (def) entry.defaultMode = def.name;
      if (raw.hiddenFromPublishing) entry.hidden = 1;
      entry.fronts = info[ci].fronts;
      entry.n = m.n;

      /* the variables: every front with its tails */
      var byFront = {};
      m.canon.forEach(function (it) {
        if (!byFront[it.front]) byFront[it.front] = [];
        byFront[it.front].push(it.tail);
      });
      var byText = {};
      var texts = [];
      Object.keys(byFront).map(Number).sort(compareNumbers).forEach(function (f) {
        var text = runs(byFront[f]);
        if (!byText[text]) { byText[text] = []; texts.push(text); }
        byText[text].push(f);
      });
      entry.vars = texts.map(function (t) { return [byText[t], t]; });

      /* the order the file had them in, when it is not the canonical one */
      var seq = [];
      var identity = true;
      info[ci].items.forEach(function (it, i) {
        seq.push(m.posOfVi[it.vi]);
        if (m.posOfVi[it.vi] !== i) identity = false;
      });
      if (!identity) entry.order = runs(seq);

      /* what each variable has */
      var typeBy = {}, typeOrder = [];
      var scopeBy = {}, scopeOrder = [];
      var descBy = {}, descOrder = [];
      var csBy = {}, csOrder = [];
      info[ci].items.forEach(function (it) {
        var v = c.vars[it.vi].raw;
        var pos = m.posOfVi[it.vi];
        var t = v.type || v.resolvedType || 'UNKNOWN';
        if (!typeBy[t]) { typeBy[t] = []; typeOrder.push(t); }
        typeBy[t].push(pos);
        var sc = JSON.stringify(v.scopes || []);
        if (!scopeBy[sc]) { scopeBy[sc] = []; scopeOrder.push(sc); }
        scopeBy[sc].push(pos);
        var d = v.description || '';
        if (d !== '') {
          var key;
          if (it.tailText !== '' && d.indexOf('{T}') === -1 && d.indexOf(it.tailText) !== -1) key = 'T' + d.split(it.tailText).join('{T}');
          else key = 'L' + d;
          if (!descBy[key]) { descBy[key] = []; descOrder.push(key); }
          descBy[key].push(pos);
        }
        var cs = v.codeSyntax;
        if (cs && Object.keys(cs).length) {
          var ck = JSON.stringify(cs);
          if (!csBy[ck]) { csBy[ck] = []; csOrder.push(ck); }
          csBy[ck].push(pos);
        }
      });
      entry.types = typeOrder.map(function (t) { return { v: t, s: cover(m, typeBy[t]) }; });
      entry.scopes = scopeOrder.map(function (k) { return { v: JSON.parse(k), s: cover(m, scopeBy[k]) }; });
      if (descOrder.length) {
        entry.descriptions = descOrder.map(function (k) {
          var g = { s: cover(m, descBy[k]) };
          if (k.charAt(0) === 'T') g.t = k.slice(1); else g.l = k.slice(1);
          return g;
        });
      }
      if (csOrder.length) entry.codeSyntax = csOrder.map(function (k) { return { v: JSON.parse(k), s: cover(m, csBy[k]) }; });

      entry.cells = encodeCells(ci, entry.modes, m, cellsOf[ci], info[ci], tailIndex);
      return entry;
    });

    function encodeCells(ci, modes, m, cells, inf, tIdx) {
      var out = [];
      /* the variables of each front, in canonical (tail) order */
      var frontPositions = {};
      m.canon.forEach(function (it) {
        if (!frontPositions[it.front]) frontPositions[it.front] = [];
        frontPositions[it.front].push(it);
      });
      var posToCells = {};
      inf.items.forEach(function (it, i) { posToCells[it.pos] = cells[i]; });

      var entries = [];
      Object.keys(frontPositions).map(Number).sort(compareNumbers).forEach(function (f) {
        var members = frontPositions[f];
        modes.forEach(function (mode, mi) {
          var group = members.map(function (it) {
            var cell = posToCells[it.pos][mode];
            var rec = { tail: it.tail, tailText: it.tailText, cell: cell, sig: null };
            if (cell && cell.alias) {
              rec.sig = sigOfCell({ tail: it.tailText }, { ci: cell.alias.ci, name: cell.alias.name });
            }
            return rec;
          });
          entries = entries.concat(encodeGroup(f, mi, group));
        });
      });

      /* modes with an identical entry are one entry */
      var merged = {};
      var order = [];
      entries.forEach(function (e) {
        var key = JSON.stringify([e.f, e.w, e.r, e.x, e.l, e.only, e.b, e.v, e.c]);
        if (!merged[key]) { merged[key] = e; e.m = []; order.push(key); }
        merged[key].m.push(e.mi);
        delete e.mi;
      });
      return order.map(function (k) {
        var e = merged[k];
        e.m = e.m.slice();
        return e;
      });
    }

    function present(g) { return g.cell !== undefined; }

    function encodeGroup(f, mi, group) {
      var have = group.filter(present);
      if (!have.length) return [];
      var allAlias = have.every(function (g) { return !!g.cell.alias; });
      var allLit = have.every(function (g) { return !g.cell.alias; });
      var complete = have.length === group.length;
      var top = topSig(have);
      var enough = top.n >= 2 && top.n * 2 >= have.length;
      if (!enough) {
        if (complete && allAlias) return [{ f: f, mi: mi, b: group.map(function (g) { return g.cell.alias.pos; }) }];
        if (complete && allLit) return [{ f: f, mi: mi, v: group.map(function (g) { return g.cell.lit; }) }];
        return [{ f: f, mi: mi, c: group.map(function (g) {
          if (!g.cell) return null;
          return g.cell.alias ? g.cell.alias.pos : [g.cell.lit];
        }) }];
      }
      /* a rule, perhaps limited to tails with / without one segment */
      var plain = explained(have, top.sig);
      var split = bestSplit(have, plain.n);
      if (split) {
        var parts = [];
        var ok = true;
        [1, 0].forEach(function (flag) {
          var part = have.filter(function (g) { return !!segmentsOf(g.tailText).has[split.seg] === (flag === 1); });
          if (!part.length) return;
          var t = topSig(part);
          if (t.sig === null) { ok = false; return; }
          var selected = group.filter(function (g) { return !!segmentsOf(g.tailText).has[split.seg] === (flag === 1); });
          var e = ruleEntry(f, mi, part, t.sig, selected.length);
          e.w = [split.seg, flag];
          parts.push(e);
        });
        if (ok) return parts;
      }
      return [ruleEntry(f, mi, have, top.sig, group.length)];
    }

    function explained(cells, sig) {
      var n = 0;
      cells.forEach(function (g) { if (g.sig === sig) n++; });
      return { n: n };
    }

    function segmentsOf(tailText) {
      if (!segCache[tailText]) {
        var has = {};
        tailText.split('/').forEach(function (s) { has[s] = true; });
        segCache[tailText] = { has: has };
      }
      return segCache[tailText];
    }

    /* The one segment whose presence splits the group into two parts that each follow a rule better
       than the whole follows one. Only worth it when it saves at least eight exceptions. */
    function bestSplit(have, plainN) {
      if (plainN === have.length) return null;
      if (have.length - plainN < 8) return null;
      var counts = {};
      have.forEach(function (g) {
        Object.keys(segmentsOf(g.tailText).has).forEach(function (s) { counts[s] = (counts[s] || 0) + 1; });
      });
      var best = null;
      Object.keys(counts).forEach(function (seg) {
        var n = counts[seg];
        if (n < 2 || n > have.length - 2) return;
        var a = have.filter(function (g) { return segmentsOf(g.tailText).has[seg]; });
        var b = have.filter(function (g) { return !segmentsOf(g.tailText).has[seg]; });
        var score = topSig(a).n + topSig(b).n;
        if (best === null || score > best.score) best = { seg: seg, score: score };
      });
      if (best === null || best.score - plainN < 8) return null;
      return best;
    }

    function ruleEntry(f, mi, part, sig, covered) {
      var e = { f: f, mi: mi, r: ruleId(sig) };
      var x = [];
      var l = [];
      part.forEach(function (g) {
        if (g.cell.alias) {
          if (g.sig !== sig) x.push(g.tail, g.cell.alias.pos);
        } else {
          l.push(g.tail, g.cell.lit);
        }
      });
      if (x.length) e.x = x;
      if (l.length) e.l = l;
      /* `only` names the exact tails when the entry does not cover everything its `w` selects */
      if (part.length !== covered) e.only = runs(part.map(function (g) { return g.tail; }));
      return e;
    }

    return {
      format: FORMAT,
      version: VERSION,
      tails: tails,
      rules: rules,
      collections: outCols,
      external: external
    };
  }

  /* ───────────────────────────── DECODE ───────────────────────────── */

  /*
    decode(structure) ->
      [{ name, modes:[mode name], defaultMode, hidden,
         variables:[{ name, type, scopes, description, codeSyntax,
                      values: { [mode]: { alias:{ collection, name } } | { literal: v } } }] }]
    in the order the file had.
  */
  function decode(structure) {
    var tails = structure.tails;
    var cols = structure.collections.map(function (c) {
      var col = { n: c.n, posOf: {}, frontOfPos: [], tailOfPos: [], names: [] };
      var pairs = [];
      c.vars.forEach(function (g) {
        g[0].forEach(function (f) {
          unruns(g[1]).forEach(function (t) { pairs.push([f, t]); });
        });
      });
      pairs.sort(function (x, y) { return x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]; });
      pairs.forEach(function (pt, pos) {
        col.posOf[pt[0] + '|' + pt[1]] = pos;
        col.frontOfPos[pos] = pt[0];
        col.tailOfPos[pos] = pt[1];
        col.names[pos] = joinName(c.fronts[pt[0]], tails[pt[1]]);
      });
      /* canonical order = front-major, which is the order the groups were written in only if
         fronts were listed ascending: they are, by construction */
      return col;
    });
    var base = [];
    var total = 0;
    cols.forEach(function (c) { base.push(total); total += c.n; });
    var byName = structure.collections.map(function (c, ci) {
      var map = {};
      cols[ci].names.forEach(function (n, p) { map[n] = p; });
      return map;
    });
    function atGlobal(g) {
      for (var ci = cols.length - 1; ci >= 0; ci--) {
        if (g >= base[ci]) return { ci: ci, pos: g - base[ci] };
      }
      return null;
    }

    var out = structure.collections.map(function (c, ci) {
      var col = cols[ci];
      var vars = [];
      for (var p = 0; p < col.n; p++) {
        vars.push({ name: col.names[p], type: 'UNKNOWN', scopes: [], description: '', codeSyntax: {}, values: {} });
      }
      c.types.forEach(function (g) { uncover(col, g.s).forEach(function (p) { vars[p].type = g.v; }); });
      c.scopes.forEach(function (g) { uncover(col, g.s).forEach(function (p) { vars[p].scopes = g.v.slice(); }); });
      (c.descriptions || []).forEach(function (g) {
        uncover(col, g.s).forEach(function (p) {
          vars[p].description = g.t !== undefined ? g.t.split('{T}').join(tails[col.tailOfPos[p]]) : g.l;
        });
      });
      (c.codeSyntax || []).forEach(function (g) {
        uncover(col, g.s).forEach(function (p) { vars[p].codeSyntax = JSON.parse(JSON.stringify(g.v)); });
      });

      function setCell(p, mode, cell) { vars[p].values[mode] = cell; }
      function aliasOf(globalPos) {
        var t = atGlobal(globalPos);
        return { alias: { collection: structure.collections[t.ci].name, name: cols[t.ci].names[t.pos] } };
      }
      function literalOf(v) {
        return { literal: Array.isArray(v) ? { r: v[0], g: v[1], b: v[2], a: v[3] } : v };
      }
      function fronts(f) {
        var list = [];
        for (var p = 0; p < col.n; p++) if (col.frontOfPos[p] === f) list.push(p);
        return list;
      }

      c.cells.forEach(function (e) {
        var members = fronts(e.f);
        c.modes.forEach(function (mode, mi) {
          if (e.m.indexOf(mi) === -1) return;
          if (e.b) {
            members.forEach(function (p, i) { setCell(p, mode, aliasOf(e.b[i])); });
            return;
          }
          if (e.v) {
            members.forEach(function (p, i) { setCell(p, mode, literalOf(e.v[i])); });
            return;
          }
          if (e.c) {
            members.forEach(function (p, i) {
              var x = e.c[i];
              if (x === null) return;
              setCell(p, mode, Array.isArray(x) ? literalOf(x[0]) : aliasOf(x));
            });
            return;
          }
          /* a rule */
          var rule = structure.rules[e.r];
          var only = null;
          if (e.only !== undefined) { only = {}; unruns(e.only).forEach(function (t) { only[t] = true; }); }
          members.forEach(function (p) {
            var t = col.tailOfPos[p];
            if (only && !only[t]) return;
            if (e.w) {
              var has = tails[t].split('/').indexOf(e.w[0]) !== -1;
              if ((e.w[1] === 1) !== has) return;
            }
            var targetName = rule.k === 'c' ? joinName(rule.f, tails[t]) : rule.n;
            setCell(p, mode, { alias: { collection: structure.collections[rule.c].name, name: targetName } });
          });
          var xs = e.x || [];
          for (var i = 0; i < xs.length; i += 2) {
            var pp = col.posOf[e.f + '|' + xs[i]];
            if (pp !== undefined) setCell(pp, mode, aliasOf(xs[i + 1]));
          }
          var ls = e.l || [];
          for (var j = 0; j < ls.length; j += 2) {
            var pl = col.posOf[e.f + '|' + ls[j]];
            if (pl !== undefined) setCell(pl, mode, literalOf(ls[j + 1]));
          }
        });
      });

      var ordered = vars;
      if (c.order !== undefined) {
        ordered = unruns(c.order).map(function (p) { return vars[p]; });
      }
      var res = { name: c.name, modes: c.modes.slice(), variables: ordered };
      if (c.defaultMode !== undefined) res.defaultMode = c.defaultMode;
      if (c.hidden) res.hidden = true;
      return res;
    });
    return out;
  }

  /* One line per cell and per attribute of a raw graph or a decoded one, sorted: what the self-test
     and the Figma-side script compare. Raw graphs and decoded ones give the same lines. */
  function fmt(x) {
    if (Array.isArray(x)) return 'rgba(' + x.join(',') + ')';
    if (x && typeof x === 'object' && 'r' in x) return 'rgba(' + [x.r, x.g, x.b, x.a === undefined ? 1 : x.a].join(',') + ')';
    return JSON.stringify(x);
  }
  function linesOfRaw(collections) {
    var by = {};
    collections.forEach(function (c) { (c.variables || []).forEach(function (v) { by[v.id] = { c: c, v: v }; }); });
    var lines = [];
    collections.forEach(function (c) {
      var modeName = {};
      (c.modes || []).forEach(function (m) { modeName[m.modeId] = m.name; });
      (c.variables || []).forEach(function (v) {
        lines.push([c.name, v.name, '*', 'meta', v.type || v.resolvedType, JSON.stringify((v.scopes || []).slice()),
                    v.description || '', JSON.stringify(v.codeSyntax || {})].join('|'));
        Object.keys(v.valuesByMode || {}).forEach(function (mid) {
          var x = v.valuesByMode[mid];
          var val;
          if (isAlias(x)) { var t = by[x.id]; if (!t) return; val = '@' + t.c.name + '::' + t.v.name; } else val = fmt(x);
          lines.push([c.name, v.name, modeName[mid], val].join('|'));
        });
      });
    });
    return lines.sort();
  }
  function linesOfDecoded(decoded) {
    var lines = [];
    decoded.forEach(function (c) {
      c.variables.forEach(function (v) {
        lines.push([c.name, v.name, '*', 'meta', v.type, JSON.stringify(v.scopes.slice()), v.description || '',
                    JSON.stringify(v.codeSyntax || {})].join('|'));
        Object.keys(v.values).forEach(function (mode) {
          var x = v.values[mode];
          lines.push([c.name, v.name, mode, x.alias ? '@' + x.alias.collection + '::' + x.alias.name : fmt(x.literal)].join('|'));
        });
      });
    });
    return lines.sort();
  }

  /* How big the record is, and how it breaks down: for the report and the self-test. */
  function measure(structure) {
    var parts = { tails: JSON.stringify(structure.tails).length, rules: JSON.stringify(structure.rules).length };
    var cells = 0, vars = 0, attrs = 0, binds = 0, lits = 0, rest = 0;
    structure.collections.forEach(function (c) {
      vars += JSON.stringify(c.vars).length + JSON.stringify(c.fronts).length + (c.order ? c.order.length : 0);
      attrs += JSON.stringify([c.types, c.scopes, c.descriptions || [], c.codeSyntax || []]).length;
      c.cells.forEach(function (e) {
        var n = JSON.stringify(e).length;
        if (e.b) binds += n; else if (e.v) lits += n; else cells += n;
      });
    });
    parts.variables = vars; parts.attributes = attrs; parts.ruleCells = cells; parts.bindings = binds; parts.literals = lits;
    parts.total = JSON.stringify(structure).length;
    return parts;
  }

  var api = { encode: encode, decode: decode, measure: measure, linesOfRaw: linesOfRaw, linesOfDecoded: linesOfDecoded,
              runs: runs, unruns: unruns, FORMAT: FORMAT, VERSION: VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomStructureGraph = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
