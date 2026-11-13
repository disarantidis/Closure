/*
  Dual-mode, exactly like src/resolve-architecture.js and src/dtcg-format.js:
  module.exports when there is a require(), a global otherwise. One file runs
  in Node (the suite and the CLI), in the plugin sandbox, and in the plugin UI
  — so all three paths run identical code rather than three copies of it.
*/
(function (global) {
/*
  RESOLVED -> IR. A Resolved export, turned back into the rows the import
  pipeline already understands.

  THE IMPORT PIPELINE HAS NEVER BEEN ABLE TO READ A RESOLVED EXPORT, and that
  was right: a resolved document has had its routing evaluated away, so
  measuring one reconstructs a different shape (one real file came back as 2
  collections where the source has 14). What measuring cannot do, KNOWING can —
  the architecture is regular, and src/architecture-radd.js holds its rules. So
  this reads only the LEAVES from the document and lays them back into the
  chain those rules describe:

    core          <- core.*
    palettes      <- the (mode, scheme) cells of the `mode` layer: .white is
                     mode.light.white, brand-dark is mode.dark.brand, a
                     secondary-light for each accent is mode.light.<accent> …
    _restricted   <- rules (nothing in the document says anything about it)
    .mode         <- rules, light/dark per scheme
    .scheme       <- rules, one mode per scheme
    .breakpoint   <- breakpoint.<bp>.*
    foundation    <- foundation.*, each token reading the layer named by its
                     { layer, path } extension
    layout        <- the columns tokens of foundation

  It does NOT decide anything the pipeline decides. It emits rows with a
  collection (group) and a mode (variant) already on them and a manifest that
  declares those, so derive() binds by declaration, compile() still enforces
  the ceilings and the open questions, and apply() writes exactly what it
  always has. Nothing downstream knows this module exists.

  WHAT IT DOES NOT DO: it never writes to a document, it never reads names
  from the file's $extensions beyond com.desquared.radd, and a document it
  does not recognise is REFUSED, not guessed at.
*/

  var A = (typeof require !== 'undefined')
    ? require('./architecture-radd.js')
    : global.PomArchitectureRadd;
  var O = (typeof require !== 'undefined')
    ? require('./architecture-ods.js')
    : global.PomArchitectureOds;
  var S = (typeof require !== 'undefined')
    ? require('./import-structure.js')
    : global.PomImportStructure;
  var C = A.C;
  var NS = 'com.desquared.radd';

  var slash = function (dotted) { return String(dotted).split('.').join('/'); };
  var dot = function (name) { return String(name).split('/').join('.'); };
  var isTok = function (n) { return n && typeof n === 'object' && '$value' in n; };
  var isRef = function (v) { return typeof v === 'string' && /^\{[^{}]+\}$/.test(v); };
  var isComposite = function (t) { return t.$type === 'shadow' || t.$type === 'typography'; };

  function flat(o, p, out) {
    p = p || []; out = out || {};
    Object.keys(o).forEach(function (k) {
      if (k.charAt(0) === '$') return;
      var v = o[k];
      if (isTok(v)) out[p.concat(k).join('.')] = v;
      else if (v && typeof v === 'object') flat(v, p.concat(k), out);
    });
    return out;
  }

  /*
    translate(doc) -> { ok: true, ir, report, collectionOrder }
                    | { ok: false, reason }
  */
  /* Which architecture reads this document, and whether it can be rebuilt:
     { ok, arch: 'radd' | 'ods' | 'structure', meta, declared } | { ok: false, reason }. */
  function recognise(doc) {
    var ods = O ? O.recognise(doc) : { ok: false, reason: 'not an ODS Foundations export' };
    if (ods.ok) return { ok: true, arch: 'ods', meta: ods.meta, declared: true };
    var radd = A.recognise(doc);
    if (radd.ok) return { ok: true, arch: 'radd', meta: radd.meta, declared: radd.declared };
    /* An export that says it is ODS is judged as ODS: its own reason is the useful one. */
    var d = doc && doc.$extensions && doc.$extensions[NS];
    var said = d && d.restore && d.restore.architecture;
    /* Neither has rules for it, but the export may carry the file's own structure record: rebuild from that. */
    var rec = S ? S.recognise(doc) : { ok: false };
    if (rec.ok) return { ok: true, arch: 'structure', meta: rec.meta, declared: true };
    if (S && S.recordOf(doc)) return { ok: false, reason: rec.reason };
    return { ok: false, reason: said && said.id === O.ID ? ods.reason : radd.reason };
  }

  function translate(doc, opts) {
    opts = opts || {};
    var rec = recognise(doc);
    if (!rec.ok) return { ok: false, reason: rec.reason };
    if (rec.arch === 'structure') return S.translate(doc, opts);
    var isOds = rec.arch === 'ods';
    var meta = rec.meta;
    var restore = meta.restore || {};
    var F = flat(doc);

    var synthSet = {};
    (restore.synthesized || []).forEach(function (p) { synthSet[p] = true; });
    var skipped = { composites: 0, synthesized: 0 };
    /*
      A SYNTHESISED SCALE IS ONLY SYNTHESISED IF NOTHING USES IT. The exporter
      writes core scales of its own (letterspacing, lineheights) for the
      composites to point at, and those are not variables of the file. But a
      document that went through another tool can have the same names as real
      tokens that other tokens reference — Tokens Studio's `core.letterspacing`
      is exactly that — and skipping them dropped every variable that pointed
      at them (the letter-spacing of all sixteen text styles, in two
      collections). So: a token by that name that a non-composite token
      references is a real token, whatever the name or the restore list says.
    */
    var referenced = {};
    Object.keys(F).forEach(function (p) {
      var t = F[p];
      if (isComposite(t) || !isRef(t.$value)) return;
      referenced[t.$value.slice(1, -1)] = true;
    });
    var usable = function (p, t) {
      if (isComposite(t)) { skipped.composites++; return false; }
      if ((synthSet[p] || (p.indexOf('core.') === 0 && A.SYNTHESIZED_CORE_GROUPS.indexOf(p.split('.')[1]) !== -1)) && !referenced[p]) {
        skipped.synthesized++; return false;
      }
      return true;
    };

    /* scopes: the document's own section wins, the table is the fallback */
    var scopeBy = {};
    (restore.scopes || []).forEach(function (g) {
      (g.paths || []).forEach(function (p) { scopeBy[p] = g.scopes || []; });
    });
    var scopeSource = { restore: 0, rules: 0 };
    /* the primitives' own scopes, which the document records for ODS (restore.coreScopes) */
    var coreScopeBy = {};
    (restore.coreScopes || []).forEach(function (g) {
      (g.paths || []).forEach(function (p) { coreScopeBy[p] = g.scopes || []; });
    });
    var scopesOf = function (col, name) {
      if (col === C.core) {
        var cs = coreScopeBy['core.' + dot(name).toLowerCase()];
        return cs ? cs.slice() : [];
      }
      if (col === C.foundation || col === C.layout) {
        var key = 'foundation.' + dot(name);
        if (scopeBy[key]) { scopeSource.restore++; return scopeBy[key].slice(); }
        var s = A.scopesFor(col, dot(name));
        if (s) scopeSource.rules++;
        return s || undefined;
      }
      return [];
    };

    /* a restore.links entry says a breakpoint cell is really a variable of
       another name — the foundation token that reads it names the cell */
    var rename = {};
    var linkMap = {};
    Object.keys(A.DEFAULT_LINKS).forEach(function (fp) { linkMap[fp] = A.DEFAULT_LINKS[fp]; });
    Object.keys(restore.links || {}).forEach(function (fp) { linkMap[fp] = restore.links[fp]; });
    Object.keys(linkMap).forEach(function (fp) {
      var t = F[fp], x = t && t.$extensions && t.$extensions[NS];
      if (x && x.layer === 'breakpoint') rename[x.path] = linkMap[fp];
    });
    var bpName = function (P) { return 'breakpoint/' + slash(rename[P] || P); };

    var bpKeys = Object.keys(doc.breakpoint || {});
    var plan = isOds ? odsPlan(meta, opts) : A.collectionsFor(meta, bpKeys, { without: opts.without });
    var modesOf = {};
    plan.forEach(function (c) { modesOf[c.name] = c.modes; });

    var rows = [];
    var counts = {};          // collection -> variable names written
    var seen = {};
    var missing = [];         // alias targets or palette cells the document does not carry
    var holes = [];           // variables with no value in some of their modes

    /* One variable, one row per mode, in the collection's own mode order — the
       first variable of a collection therefore introduces its modes in order,
       which is the order the collection is created with. */
    function variable(col, name, type, valueByMode, description) {
      var key = col + '\u0000' + name;
      if (seen[key]) return;
      seen[key] = true;
      counts[col] = (counts[col] || 0) + 1;
      var scopes = scopesOf(col, name);
      var hole = [];
      modesOf[col].forEach(function (mode) {
        var v = valueByMode[mode];
        if (v === undefined) { if (modesOf[col].length > 1) hole.push(mode); return; }
        var row = { group: col, variant: mode, set: col, path: dot(name), type: type,
                    value: v, description: description || '' };
        if (scopes) row.scopes = scopes;
        rows.push(row);
      });
      /* A variable that has a value in some modes and not in others. Figma
         gives every mode a value, so the ones left out get its own default. */
      if (hole.length && hole.length < modesOf[col].length) holes.push({ collection: col, name: name, modes: hole });
    }
    var ref = function (col, name) { return { ref: dot(col === C.core ? A.coreName(name) : name), refCol: col }; };
    var lit = function (t) { return { literal: t.$value }; };
    /* a leaf of the document: an alias into core, or a value of its own */
    var coreRef = function (v) { return v.slice(1, -1).replace(/^core\./, ''); };
    var leaf = function (t) { return isRef(t.$value) ? ref(C.core, slash(coreRef(t.$value))) : lit(t); };

    /* ── core ───────────────────────────────────────────────────────────── */
    var coreNames = {};
    var colourKey = function (v) {
      if (!v || typeof v !== 'object' || typeof v.hex !== 'string') return null;
      return v.hex.toLowerCase() + '@' + (v.alpha === undefined ? 1 : v.alpha);
    };
    var coreByColour = {};
    /*
      A NUMBER IS RELINKED BY ITS NAME AS WELL AS ITS VALUE. Colours are
      matched on the value alone because a hex is rarely a coincidence; a
      number often is (8 is a spacing, a size and a grid). So a number goes back
      to a core token only when the token's own name SAYS that number —
      `font-sizes/87-111` for 87.111, the comma or dash a name cannot hold
      written as a dash — and only for a number with a fractional part, which
      is where a design-system scale writes a value that is not a round step.
      Round numbers stay values.
    */
    var coreByNumber = {};
    var numberKey = function (t, name) {
      var v = t.$value;
      if (t.$type !== 'number' || typeof v !== 'number' || v % 1 === 0) return null;
      var last = name.split('/').pop().replace(/-/g, '.');
      return Math.abs(parseFloat(last) - v) < 1e-9 ? String(v) : null;
    };
    Object.keys(F).forEach(function (p) {
      if (p.indexOf('core.') !== 0 || !usable(p, F[p])) return;
      var name = A.coreName(slash(p.slice(5)));
      coreNames[name] = true;
      var ck = F[p].$type === 'color' ? colourKey(F[p].$value) : null;
      if (ck) (coreByColour[ck] = coreByColour[ck] || []).push(name);
      var nk = numberKey(F[p], name);
      if (nk) (coreByNumber[nk] = coreByNumber[nk] || []).push(name);
      var vb = {}; vb[C.core] = leaf(F[p]);
      variable(C.core, name, F[p].$type, vb, F[p].$description);
    });

    /*
      A COLOUR CELL THAT IS A VALUE, RELINKED TO THE CORE COLOUR THAT HOLDS IT.
      A document can carry a palette cell as a bare colour where the file it
      came from had an alias (Tokens Studio writes some that way). Written as it
      stands the cell becomes a literal, and the link to core is gone. Here it
      goes back to an alias when exactly ONE core colour has that value, hex and
      alpha. Two or more is a guess the document gives no way to settle, so the
      cell stays a literal and is named in the report. Only palette cells, only
      colours, and `relinkColours: false` turns it off.
    */
    var relink = { linked: 0, ambiguous: 0, none: 0, examples: [], ambiguousCells: [], noneCells: [], numbers: { linked: 0, ambiguous: 0 } };
    var cellName = '', curMode = 'light', curP = '';
    var siblingChoice = function (hits) {
      var tally = {};
      (meta.schemes || []).forEach(function (sch) {
        var t2 = cell[curMode + '|' + sch + '|' + curP];
        if (!t2 || !isRef(t2.$value)) return;
        var target = slash(coreRef(t2.$value));
        if (hits.indexOf(target) !== -1) tally[target] = (tally[target] || 0) + 1;
      });
      var names = Object.keys(tally);
      return names.length === 1 ? names[0] : null;
    };
    var paletteLeaf = function (t) {
      if (opts.relinkColours === false || t.$type !== 'color' || isRef(t.$value)) return leaf(t);
      var k = colourKey(t.$value), hits = k && coreByColour[k];
      if (!hits) { relink.none++; if (relink.noneCells.length < 12) relink.noneCells.push(cellName); return leaf(t); }
      if (hits.length > 1) {
        /* Several core colours have this value. The same cell in the OTHER
           schemes is already linked to one of them — they are built from the
           same palette — so that is the one this cell means. Only if the
           siblings agree on exactly one is it settled; otherwise it stays a
           value and is named. */
        var voted = siblingChoice(hits);
        if (voted) { relink.linked++; relink.bySibling = (relink.bySibling || 0) + 1; return ref(C.core, voted); }
        relink.ambiguous++;
        if (relink.ambiguousCells.length < 20) relink.ambiguousCells.push({ cell: cellName, value: t.$value.hex, candidates: hits.slice(0, 6) });
        return leaf(t);
      }
      relink.linked++;
      if (relink.examples.length < 5) relink.examples.push(hits[0]);
      return ref(C.core, hits[0]);
    };

    var numberLeaf = function (t, P) {
      if (opts.relinkColours === false || isRef(t.$value)) return leaf(t);
      var v = t.$value;
      if (t.$type !== 'number' || typeof v !== 'number' || v % 1 === 0) return leaf(t);
      var groups = A.NUMBER_LINKS[String(P).split('.').pop()];
      if (!groups) return leaf(t);
      var hits = (coreByNumber[String(v)] || []).filter(function (n) { return groups.indexOf(n.split('/')[0]) !== -1; });
      if (!hits.length) return leaf(t);
      if (hits.length > 1) { relink.numbers.ambiguous++; return leaf(t); }
      relink.numbers.linked++;
      return ref(C.core, hits[0]);
    };

    /* ── the (mode, scheme) cells ──────────────────────────────────────── */
    var cell = {}, pathsSeen = {}, paths = [];
    Object.keys(F).forEach(function (p) {
      if (p.indexOf('mode.') !== 0 || !usable(p, F[p])) return;
      var seg = p.split('.');
      var P = seg.slice(3).join('.');
      cell[seg[1] + '|' + seg[2] + '|' + P] = F[p];
      if (!pathsSeen[P]) { pathsSeen[P] = F[p]; paths.push(P); }
    });
    var accents = meta.accentSchemes || [];
    var isElev = function (P) { return P.indexOf('elevation.') === 0; };
    var palCell = function (pal, P, accent) {
      if (pal === 'white') return cell['light|white|' + P];
      if (pal === 'black') return cell['light|black|' + P];
      if (pal === 'brand-light') return cell['light|brand|' + P];
      if (pal === 'brand-dark') return cell['dark|brand|' + P];
      if (pal === 'secondary-light') return cell['light|' + accent + '|' + P];
      return cell['dark|' + accent + '|' + P];
    };
    var palName = function (pal, P) { return pal + '/' + slash(P); };
    var palettes = ['white', 'black', 'brand-light', 'brand-dark', 'secondary-light', 'secondary-dark'];
    var errorOk = !!coreNames[A.ERROR_COLOUR];

    (isOds ? [] : paths).forEach(function (P) {
      var type = pathsSeen[P].$type;
      var description = pathsSeen[P].$description;

      /* the palettes — the only place the cells' values are written */
      palettes.forEach(function (pal) {
        var owner = A.paletteCollection(pal);
        var vb = {}, any = false;
        if (owner === C.secondary) {
          accents.forEach(function (a) {
            var t = palCell(pal, P, a);
            if (t) { cellName = palName(pal, P) + ' (' + a + ')'; curMode = /dark$/.test(pal) ? 'dark' : 'light'; curP = P; vb[a] = paletteLeaf(t); any = true; } else missing.push(pal + ' ' + a + ' ' + P);
          });
        } else {
          var t = palCell(pal, P);
          if (t) { cellName = palName(pal, P); curMode = /dark$/.test(pal) ? 'dark' : 'light'; curP = P; vb[owner] = paletteLeaf(t); any = true; } else missing.push(pal + ' ' + P);
        }
        if (any) variable(owner, palName(pal, P), type, vb, description);
      });

      /* _restricted — colours only; elevation never passes through it */
      if (!isElev(P)) {
        Object.keys(A.PALETTE).forEach(function (s) {
          ['light', 'dark'].forEach(function (m) {
            var pal = A.PALETTE[s][m];
            var name = 'restrictions/' + palName(pal, P);
            var vb = {};
            A.RESTRICTED_MODES.forEach(function (rm) {
              if (A.keeps(pal, rm)) vb[rm] = ref(A.paletteCollection(pal), palName(pal, P));
              else if (errorOk) vb[rm] = ref(C.core, A.ERROR_COLOUR);
              else missing.push('core.' + dot(A.ERROR_COLOUR));
            });
            variable(C.restricted, name, type, vb);
          });
        });
      }

      /* .mode — light/dark for the four families */
      Object.keys(A.MODE_PREFIX).forEach(function (s) {
        var vb = {};
        ['light', 'dark'].forEach(function (m) {
          var pal = A.PALETTE[s][m];
          vb[m] = isElev(P)
            ? ref(A.paletteCollection(pal), palName(pal, P))
            : ref(C.restricted, 'restrictions/' + palName(pal, P));
        });
        variable(C.mode, A.MODE_PREFIX[s] + '/' + slash(P), type, vb);
      });

      /* .scheme — one mode per scheme */
      var svb = {};
      A.SCHEME_MODES.forEach(function (s) {
        if (A.MODE_PREFIX[s]) svb[s] = ref(C.mode, A.MODE_PREFIX[s] + '/' + slash(P));
        else svb[s] = isElev(P)
          ? ref(A.paletteCollection(s), palName(s, P))
          : ref(C.restricted, 'restrictions/' + palName(s, P));
      });
      variable(C.scheme, 'scheme/' + slash(P), type, svb);
    });

    /*
      THE ODS CHAIN. The same cells, laid back into the ODS layering (src/architecture-ods.js):
      the palettes (plain leaves from the cells, -subtle leaves from restore.subtle), then
      .card, .section, .mode, _restricted and .scheme, every alias computed by route().
    */
    if (isOds) chainOds();
    function chainOds() {
      var subtle = (meta.restore.subtle && meta.restore.subtle.leaves) || {};
      var anchors = ['white', 'black', 'magenta-light', 'magenta-dark', 'secondary-light', 'secondary-dark'];
      var families = ['white', 'black', 'magenta', 'secondary', 'neutral', 'inverted'];
      var cellOf = function (leaf, P, accent) {
        if (leaf === 'white') return cell['light|white|' + P];
        if (leaf === 'black') return cell['light|black|' + P];
        if (leaf === 'magenta-light') return cell['light|magenta|' + P];
        if (leaf === 'magenta-dark') return cell['dark|magenta|' + P];
        if (leaf === 'secondary-light') return cell['light|' + accent + '|' + P];
        return cell['dark|' + accent + '|' + P];
      };
      var target = function (r) {
        if (r.error) { if (!errorOk) missing.push('core.' + dot(A.ERROR_COLOUR)); return ref(C.core, A.ERROR_COLOUR); }
        return ref(r.collection, r.name);
      };
      var routed = function (col, name, modes) {
        var vb = {};
        modes.forEach(function (m) { vb[m] = target(O.route(col, name, m)); });
        return vb;
      };
      var subtleRef = function (col, name, mode) {
        var at = subtle[col] && subtle[col][name] && subtle[col][name][mode];
        if (!at) { missing.push(col + ' ' + name + ' (' + mode + ')'); return null; }
        var core = at.replace(/^core\./, '');
        if (!coreNames[A.coreName(slash(core))]) missing.push(at);
        return ref(C.core, slash(core));
      };
      paths.forEach(function (P) {
        var type = pathsSeen[P].$type;
        var description = pathsSeen[P].$description;
        var sp = slash(P);

        /* the palettes: plain leaf from the cells, -subtle leaf from the restore section */
        anchors.forEach(function (leaf) {
          var owner = O.collectionOfLeaf(leaf);
          var plain = {}, soft = {}, any = false, anySoft = false;
          var modes = owner === C.secondary ? accents : [owner];
          modes.forEach(function (m) {
            var t = cellOf(leaf, P, m);
            if (t) {
              cellName = leaf + '/' + sp + (owner === C.secondary ? ' (' + m + ')' : ''); curMode = /dark$/.test(leaf) ? 'dark' : 'light'; curP = P;
              plain[m] = paletteLeaf(t); any = true;
            } else missing.push(leaf + ' ' + m + ' ' + P);
            var sr = subtleRef(owner, leaf + '-subtle/' + sp, m);
            if (sr) { soft[m] = sr; anySoft = true; }
          });
          if (any) variable(owner, leaf + '/' + sp, type, plain, description);
          if (anySoft) variable(owner, leaf + '-subtle/' + sp, type, soft, description);
        });

        O.SECTION_MODES.forEach(function (e) {
          anchors.forEach(function (a) {
            var name = 'card/' + e + '/' + a + '/' + sp;
            variable(O.C.card, name, type, routed(O.C.card, name, O.CARD_MODES));
          });
        });
        anchors.forEach(function (a) {
          var name = 'section/' + a + '/' + sp;
          variable(O.C.section, name, type, routed(O.C.section, name, O.SECTION_MODES));
        });
        Object.keys(O.MODE_PALETTE).forEach(function (f) {
          var name = 'mode/' + f + '/' + sp;
          variable(C.mode, name, type, routed(C.mode, name, ['light', 'dark']));
        });
        if (!isElev(P)) {
          families.forEach(function (f) {
            var name = 'restrictions/' + f + '/' + sp;
            variable(C.restricted, name, type, routed(C.restricted, name, O.RESTRICTED_MODES));
          });
        }
        var sn = 'scheme/' + sp;
        variable(C.scheme, sn, type, routed(C.scheme, sn, O.SCHEME_MODES));
      });
    }

    /* ── breakpoint ─────────────────────────────────────────────────────── */
    var bpCells = {}, bpPaths = [];
    Object.keys(F).forEach(function (p) {
      if (p.indexOf('breakpoint.') !== 0 || !usable(p, F[p])) return;
      var seg = p.split('.');
      var P = seg.slice(2).join('.');
      if (!bpCells[P]) { bpCells[P] = {}; bpPaths.push(P); }
      bpCells[P][seg[1]] = F[p];
    });
    var bpHave = {};
    bpPaths.forEach(function (P) {
      var vb = {}, first = null;
      bpKeys.forEach(function (b) {
        var t = bpCells[P][b];
        if (t) { vb[A.breakpointMode(b)] = numberLeaf(t, P); first = first || t; }
      });
      if (!first) return;
      bpHave[bpName(P)] = true;
      variable(C.breakpoint, bpName(P), first.$type, vb, first.$description);
    });

    /*
      THE HOPS INSIDE .breakpoint (restore.hops, written by the ODS export): variables the
      document's cells do not carry because nothing in the consumption layer reads them, and
      the aliases that route through them. Put back as the file had them.
    */
    if (isOds) applyHops();
    function hopTarget(text, v) {
      if (v && typeof v === 'object' && 'value' in v) return { literal: v.value };
      var str = String(v);
      if (str.indexOf('core.') === 0) {
        var core = str.slice(5);
        if (!coreNames[A.coreName(slash(core))]) missing.push(str);
        return ref(C.core, slash(core));
      }
      var i = str.indexOf('::');
      return ref(str.slice(0, i), str.slice(i + 2));
    }
    function hopType(v) {
      if (typeof v === 'string' && v.indexOf('core.') === 0) {
        var t = F[v];
        return t ? t.$type : 'number';
      }
      return 'number';
    }
    function applyHops() {
      var hops = meta.restore.hops;
      if (!hops) return;
      Object.keys(hops.extras || {}).forEach(function (name) {
        var cells = hops.extras[name], vb = {}, type = null;
        Object.keys(cells).forEach(function (mode) {
          vb[mode] = hopTarget(name, cells[mode]);
          type = type || hopType(cells[mode]);
        });
        variable(C.breakpoint, name, type || 'number', vb);
      });
      Object.keys(hops.via || {}).forEach(function (name) {
        Object.keys(hops.via[name]).forEach(function (mode) {
          var hit = rows.filter(function (r) { return r.group === C.breakpoint && r.path === dot(name) && r.variant === mode; })[0];
          if (!hit) { missing.push('hop ' + name + ' (' + mode + ')'); return; }
          hit.value = ref(C.breakpoint, hops.via[name][mode]);
        });
      });
    }

    /* ── foundation and layout ─────────────────────────────────────────── */
    var schemeHave = {};
    paths.forEach(function (P) { schemeHave['scheme/' + slash(P)] = true; });
    Object.keys(F).forEach(function (p) {
      if (p.indexOf('foundation.') !== 0 || !usable(p, F[p])) return;
      var t = F[p];
      var rel = p.slice('foundation.'.length);
      var col = rel.indexOf('columns.') === 0 ? C.layout : C.foundation;
      var mode = col === C.layout ? A.LAYOUT_MODE : C.foundation;
      var x = t.$extensions && t.$extensions[NS];
      var v;
      if (!x) v = leaf(t);
      else if (x.layer === 'scheme') {
        var sn = 'scheme/' + slash(x.path);
        if (!schemeHave[sn]) missing.push(p + ' -> ' + sn);
        v = ref(C.scheme, sn);
      } else {
        var bn = bpName(x.path);
        if (!bpHave[bn]) missing.push(p + ' -> ' + bn);
        v = ref(C.breakpoint, bn);
      }
      var vb = {}; vb[mode] = v;
      variable(col, slash(rel), t.$type, vb, t.$description);
    });

    /* ── styles ────────────────────────────────────────────────────────────
       The file's text and effect styles, from the document's own record of them
       (restore.styles) when it has one, and from the composites otherwise. */
    var styles = buildStyles();
    function buildStyles() {
      var exists = function (col, name) { return !!seen[col + '\u0000' + name]; };
      var report = { source: null, text: 0, effect: 0, bindingsMissing: [] };
      var out = { text: [], effect: [], grid: [], report: report };
      var bind = function (full, where) {
        var i = String(full).indexOf('::');
        if (i === -1) return null;
        var b = { collection: full.slice(0, i), name: full.slice(i + 2) };
        if (!exists(b.collection, b.name)) { report.bindingsMissing.push(where + ' -> ' + full); return null; }
        return b;
      };
      var bindAll = function (m, where) {
        var o = {};
        Object.keys(m || {}).forEach(function (f) { var b = bind(m[f], where + '.' + f); if (b) o[f] = b; });
        return o;
      };

      /* a style, or a layer of one, as the document spells it -> as an import
         wants it: bound variables looked up by name, the rest copied */
      var layerFrom = function (x, name) {
        var o = {}; Object.keys(x).forEach(function (k) { o[k] = k === 'bound' ? bindAll(x.bound, name) : x[k]; });
        return o;
      };
      var textFrom = function (t) {
        return { name: t.name, description: t.description || '', fontName: t.fontName,
                 textCase: t.textCase, textDecoration: t.textDecoration, values: t.values,
                 bound: bindAll(t.bound, t.name) };
      };
      var effectFrom = function (e) {
        return { name: e.name, description: e.description || '',
                 effects: e.effects.map(function (x) { return layerFrom(x, e.name); }) };
      };
      var gridFrom = function (g) {
        return { name: g.name, description: g.description || '',
                 layoutGrids: g.layoutGrids.map(function (x) { return layerFrom(x, g.name); }) };
      };

      var rs = restore.styles;
      var legacy = rs && !rs.patches && ((rs.text && rs.text.length) || (rs.effect && rs.effect.length) || (rs.grid && rs.grid.length));
      if (legacy) {
        report.source = 'restore';
        /* A grid style exists here only if the document records one OR the
           architecture's own pattern is used (the else branch). */
        (rs.grid || []).forEach(function (g) { out.grid.push(gridFrom(g)); });
        (rs.text || []).forEach(function (t) { out.text.push(textFrom(t)); });
        (rs.effect || []).forEach(function (e) { out.effect.push(effectFrom(e)); });
      } else {
        fromComposites(out, report, exists);
        gridFromRules(out, exists);
        if (rs && rs.patches) {
          applyStylePatches(out, rs, bind, bindAll, report);
          report.source = 'rules+patches';
        }
      }
      report.text = out.text.length; report.effect = out.effect.length; report.grid = out.grid.length;
      return out;
    }

    /* A document with no record of its styles still carries a composite for
       each one in the consumption layer. They are derived from variables, so
       what comes back is what the CONVENTION says: names from the path, the
       font style from the weight, the decoration from the composite — which is
       why the three underlined Link styles come back without their underline.
       The grid style is not here at all. */
    function fromComposites(out, report, exists) {
      var defaults = meta.foundationDefaults || {};
      var num = function (v) {
        if (v && typeof v === 'object' && 'value' in v) return v.value;
        return v;
      };
      var coreLit = function (ref) {
        if (!isRef(ref)) return ref;
        var t = F['core.' + coreRef(ref)];
        return t ? num(t.$value) : undefined;
      };
      var title = function (seg) {
        return seg.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
      };
      var colour = function (v) {
        if (isRef(v)) { var t = F['core.' + coreRef(v)]; v = t && t.$value; }
        if (v && typeof v === 'object' && v.components) return v.components.concat([v.alpha === undefined ? 1 : v.alpha]);
        return null;
      };
      Object.keys(F).forEach(function (p) {
        var t = F[p];
        if (p.indexOf('foundation.') !== 0) return;
        var x = t.$extensions && t.$extensions[NS];
        var seg = p.split('.');
        if (t.$type === 'shadow' && x && x.layer === 'scheme') {
          var base = seg.slice(1, -1);                                   // elevation.level-0
          var name = base.map(function (g) { return A.ACRONYMS.indexOf(g) !== -1 ? g.toUpperCase() : g; }).join('/');
          var src = F['mode.' + (defaults.mode || 'light') + '.' + (defaults.scheme || 'neutral') + '.' + x.path];
          var v = src && src.$value;
          if (!v || typeof v !== 'object') return;
          var vb = {};
          [['color', 'colour'], ['offsetX', 'x'], ['offsetY', 'y'], ['radius', 'blur'], ['spread', 'spread']].forEach(function (pair) {
            var n = base.join('/') + '/' + pair[1];
            if (exists(C.foundation, n)) vb[pair[0]] = { collection: C.foundation, name: n };
          });
          out.effect.push({ name: name, description: '', effects: [{
            type: v.inset ? 'INNER_SHADOW' : 'DROP_SHADOW', visible: true, blendMode: 'NORMAL',
            color: colour(v.color) || [0, 0, 0, 0],
            offset: { x: num(v.offsetX) || 0, y: num(v.offsetY) || 0 },
            radius: num(v.blur) || 0, spread: num(v.spread) || 0, showShadowBehindNode: false, bound: vb }] });
          report.source = 'rules';
        }
        if (t.$type === 'typography' && x && x.layer === 'breakpoint' && seg.length === 4 && seg[1] === 'typography' && seg[2] === seg[3]) {
          var scale = seg[2];
          var bp = F['breakpoint.' + (defaults.breakpoint || bpKeys[0]) + '.' + x.path];
          var c = bp && bp.$value;
          if (!c || typeof c !== 'object') return;
          var ext = (bp.$extensions && bp.$extensions['com.tokens-studio']) || {};
          /* The numbers come from the VARIABLES the style is bound to, at the
             default breakpoint, not from the composite: a composite written by
             another tool can hold a ratio where the variable holds pixels
             (Studio's line height is 1 where the variable says 72). The
             composite is the fallback. */
          var of = function (leaf, fallback) {
            var v = valueAt(C.foundation, 'typography/' + scale + '/' + leaf);
            return v === undefined ? fallback : v;
          };
          var weight = of('weight', coreLit(c.fontWeight));
          var dec = scale.indexOf(A.UNDERLINED_PREFIX) === 0 ? 'underline' : String(ext.textDecoration || 'none').toLowerCase();
          var bound = {};
          [['fontFamily', 'font-family'], ['fontSize', 'size'], ['fontWeight', 'weight'], ['letterSpacing', 'letter-spacing'],
           ['lineHeight', 'line-height'], ['paragraphSpacing', 'paragraph-spacing'], ['paragraphIndent', 'paragraph-indent']].forEach(function (pair) {
            var n = 'typography/' + scale + '/' + pair[1];
            if (exists(C.foundation, n)) bound[pair[0]] = { collection: C.foundation, name: n };
          });
          out.text.push({ name: title(scale), description: '',
            fontName: { family: String(coreLit(c.fontFamily) || 'Inter'), style: typeof weight === 'number' && weight >= 600 ? 'Bold' : 'Medium' },
            textCase: 'ORIGINAL', textDecoration: dec === 'underline' ? 'UNDERLINE' : dec === 'strikethrough' ? 'STRIKETHROUGH' : 'NONE',
            values: { fontSize: of('size', coreLit(c.fontSize)), lineHeight: { unit: 'PIXELS', value: of('line-height', coreLit(c.lineHeight)) },
                      letterSpacing: { unit: 'PIXELS', value: of('letter-spacing', coreLit(c.letterSpacing)) || 0 },
                      paragraphSpacing: of('paragraph-spacing', coreLit(ext.paragraphSpacing)) || 0,
                      paragraphIndent: of('paragraph-indent', coreLit(ext.paragraphIndent)) || 0 },
            bound: bound });
          report.source = 'rules';
        }
      });
    }

    /* The value a bound variable holds at the default breakpoint, followed
       through its aliases — the number a grid field is written with, which
       Figma overrides with the variable anyway. */
    function valueAt(col, name) {
      var defaults = meta.foundationDefaults || {};
      var path = col === C.foundation ? 'foundation.' + dot(name)
        : 'breakpoint.' + (defaults.breakpoint || bpKeys[0]) + '.' + dot(String(name).replace(/^breakpoint\//, ''));
      for (var hop = 0; hop < 8; hop++) {
        var t = F[path];
        if (!t) return undefined;
        var v = t.$value;
        if (isRef(v)) { path = v.slice(1, -1); continue; }
        if (v && typeof v === 'object' && 'value' in v) return v.value;
        return typeof v === 'number' ? v : (typeof v === 'string' && !isNaN(parseFloat(v)) ? parseFloat(v) : undefined);
      }
      return undefined;
    }

    /* THE GRID STYLE, from the architecture's pattern: nothing in the tokens
       holds a pattern, an alignment or a colour, so those are the template's,
       and each field is bound to its variable where the file has one. */
    function gridFromRules(out, exists) {
      var spec = A.GRID_STYLE;
      var layers = [];
      spec.grids.forEach(function (g) {
        var bound = {}, any = false;
        Object.keys(g.bound).forEach(function (f) {
          var full = g.bound[f], i = full.indexOf('::');
          var col = full.slice(0, i), name = full.slice(i + 2);
          if (exists(col, name)) { bound[f] = { collection: col, name: name }; any = true; }
        });
        if (!any) return;
        var o = { pattern: 'COLUMNS', visible: true, bound: bound, alignment: g.alignment };
        ['count', 'gutterSize', 'offset', 'sectionSize'].forEach(function (f) {
          var b = bound[f];
          var v = b ? valueAt(b.collection, b.name) : undefined;
          if (v === undefined) v = g[f];
          if (v !== undefined || g.fields.indexOf(f) !== -1) o[f] = v === undefined ? 0 : v;
        });
        o.color = g.color.slice();
        layers.push(o);
      });
      if (layers.length) out.grid.push({ name: spec.name, description: '', layoutGrids: layers });
    }

    /* A style the document patches: what differs from the rules, field by
       field. A `bound` entry of null means the field is not bound; a style
       the rules do not make is in `added`, one the rules make and the file
       does not have is in `removed`. Everything the patch does not mention
       stays as the document's own tokens say it. */
    function applyStylePatches(out, rs, bind, bindAll, report) {
      ['text', 'effect', 'grid'].forEach(function (kind) {
        var patches = (rs.patches || {})[kind] || {};
        out[kind].forEach(function (style) {
          var p = patches[style.name];
          if (p) patchStyle(style, p, bind, bindAll);
        });
        var gone = ((rs.removed || {})[kind]) || [];
        if (gone.length) out[kind] = out[kind].filter(function (st) { return gone.indexOf(st.name) === -1; });
        (((rs.added || {})[kind]) || []).forEach(function (full) {
          if (kind === 'text') out.text.push({ name: full.name, description: full.description || '', fontName: full.fontName,
            textCase: full.textCase, textDecoration: full.textDecoration, values: full.values, bound: bindAll(full.bound, full.name) });
          else if (kind === 'effect') out.effect.push({ name: full.name, description: full.description || '',
            effects: full.effects.map(function (x) { return layerOf(x, full.name, bindAll); }) });
          else out.grid.push({ name: full.name, description: full.description || '',
            layoutGrids: full.layoutGrids.map(function (x) { return layerOf(x, full.name, bindAll); }) });
        });
      });
    }
    function layerOf(x, name, bindAll) {
      var o = {}; Object.keys(x).forEach(function (k) { o[k] = k === 'bound' ? bindAll(x.bound, name) : x[k]; });
      return o;
    }
    function patchStyle(style, p, bind, bindAll) {
      Object.keys(p).forEach(function (k) {
        if (k === 'bound') {
          style.bound = style.bound || {};
          Object.keys(p.bound).forEach(function (f) {
            if (p.bound[f] === null) { delete style.bound[f]; return; }
            var b = bind(p.bound[f], style.name + '.' + f);
            if (b) style.bound[f] = b;
          });
        } else if (k === 'values') {
          style.values = style.values || {};
          Object.keys(p.values).forEach(function (f) { style.values[f] = p.values[f]; });
        } else if (k === 'effects') {
          style.effects = p.effects.map(function (x) { return layerOf(x, style.name, bindAll); });
        } else if (k === 'layoutGrids') {
          style.layoutGrids = p.layoutGrids.map(function (x) { return layerOf(x, style.name, bindAll); });
        } else {
          style[k] = p[k];
        }
      });
    }

    /* The ODS layers' descriptions, expanded from their templates (restore.descriptions). The
       document's own cells decide nothing here: what the file had is what comes back. */
    if (isOds && restore.descriptions) {
      var descBy = {};
      Object.keys(restore.descriptions).forEach(function (col) {
        restore.descriptions[col].forEach(function (g) {
          g.n.forEach(function (name) {
            descBy[col + '\u0000' + dot(name)] = g.lit ? g.t : g.t.split('{P}').join(O.pathOf(col, name));
          });
        });
      });
      rows.forEach(function (r) {
        if (O.PREFIX_SEGMENTS[r.group] === undefined) return;
        var d = descBy[r.group + '\u0000' + String(r.path).toLowerCase()];
        r.description = d === undefined ? '' : d;
      });
    }

    /* ── manifest: the collections and modes, declared ─────────────────── */
    var present = plan.filter(function (c) { return counts[c.name]; });
    var manifest = {
      version: 1,
      collections: present.map(function (c) {
        return { figmaName: c.name, modes: c.modes.slice(), variables: counts[c.name] };
      })
    };
    var order = present.map(function (c) { return c.name; });

    var variables = 0;
    Object.keys(counts).forEach(function (k) { variables += counts[k]; });
    return {
      ok: true,
      ir: { source: 'resolved', rows: rows, sets: order.slice(), themes: null, manifest: manifest,
            styles: { text: styles.text, effect: styles.effect, grid: styles.grid } },
      collectionOrder: order,
      report: {
        architecture: isOds ? O.ID + ' v' + O.VERSION : A.ID + ' v' + A.VERSION,
        declared: rec.declared,
        collections: present.length,
        variables: variables,
        modeValues: rows.length,
        perCollection: counts,
        scopes: scopeSource,
        skipped: skipped,
        links: Object.keys(rename).length,
        styles: styles.report,
        relinked: relink,
        holes: holes,
        missing: missing
      }
    };
  }

  /* The ODS collections, in the order and with the modes the document's own record gives:
     a collection cannot be reordered once created, and the names are the file's. */
  function odsPlan(meta, opts) {
    return meta.restore.collections
      .filter(function (c) { return !(opts.without && opts.without[c.name]); })
      .map(function (c) { return { name: c.name, modes: c.modes.slice() }; });
  }

  var api = { translate: translate, recognise: recognise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.PomImportResolved = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
