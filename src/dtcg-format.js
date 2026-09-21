/*
 * dtcg-format.js — DTCG (design-tokens.org) export format.
 *
 * The default 'partial' shape is a partial DTCG conversion, not strict W3C:
 * proprietary type names, composite shapes and embedded math survive it, and
 * build-dtcg.js downstream is what makes the result standards-conformant.
 *
 * EXPLORATORY. This is a pure post-transform over the Legacy JSON tree that
 * code.js already produces, so nothing in the existing export path changes:
 * same extraction, same normalization, same composites. Only the final
 * serialization differs.
 *
 *   Figma vars → transformToFinalFormat → Legacy JSON tree → [this file]
 *
 * Three output shapes:
 *
 *   'partial'  — a minimal rename of value/type/description; proprietary
 *                type names, composite shapes, embedded math and
 *                $themes/$metadata all stay put, for a downstream build step
 *                that finishes the conversion into strict, standards-only DTCG.
 *
 *   'sets'     — like 'partial' but with the strict type mapping and composite
 *                rewriting applied, and $themes/$metadata moved into
 *                $extensions. A preview of the strict form, per set.
 *
 *   'themes'   — one self-contained document per $themes entry, built by
 *                deep-merging that theme's non-disabled sets in tokenSetOrder
 *                (later sets win). Resolves its own {a.b.c} references.
 *
 * Runs in the plugin UI (inlined into ui.html by scripts/build-ui.js) and in Node
 * (scripts/dtcg-preview.js) from this one source.
 */
(function (global) {
  'use strict';

  var EXT = 'com.closure.legacyJson';

  // Legacy JSON type → DTCG $type. Anything absent here has no DTCG equivalent
  // and is passed through verbatim (and counted in the report) rather than
  // silently dropped or coerced to a type that would lie about the value.
  var TYPE_MAP = {
    color:            'color',
    spacing:          'dimension',
    sizing:           'dimension',
    borderRadius:     'dimension',
    borderWidth:      'dimension',
    dimension:        'dimension',
    fontSizes:        'dimension',
    letterSpacing:    'dimension',
    paragraphSpacing: 'dimension',
    paragraphIndent:  'dimension',
    fontFamilies:     'fontFamily',
    fontWeights:      'fontWeight',
    lineHeights:      'number',
    number:           'number',
    opacity:          'number',
    boxShadow:        'shadow',
    typography:       'typography'
  };

  // DTCG's typography composite has exactly these sub-values. Legacy JSON adds
  // textCase / textDecoration / paragraphSpacing / paragraphIndent, which move to
  // $extensions so $value stays spec-shaped without losing them.
  var TYPOGRAPHY_KEYS = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'];

  var META_KEYS = { '$themes': 1, '$metadata': 1 };

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  function isTokenNode(node) {
    return isObject(node) && Object.prototype.hasOwnProperty.call(node, 'value');
  }

  // A Legacy JSON math expression, e.g. '{dimension.1}*4'. DTCG has no
  // arithmetic, so these pass through verbatim and are reported — a consumer
  // needs a Legacy-JSON-compatible resolver to evaluate them.
  function isMathExpression(v) {
    return typeof v === 'string' && v.indexOf('{') !== -1 && /[*/+]/.test(v);
  }

  function deepMerge(target, source) {
    Object.keys(source).forEach(function (key) {
      var sv = source[key];
      if (isObject(sv) && !isTokenNode(sv) && isObject(target[key]) && !isTokenNode(target[key])) {
        deepMerge(target[key], sv);
      } else {
        target[key] = sv;
      }
    });
    return target;
  }

  function deepClone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // --- composite value conversion -------------------------------------------

  // Legacy JSON boxShadow → DTCG shadow. x/y become offsetX/offsetY, the
  // 'dropShadow' | 'innerShadow' discriminator becomes the `inset` flag.
  function toDtcgShadow(value) {
    if (Array.isArray(value)) {
      return value.map(toDtcgShadow);
    }
    if (!isObject(value)) return value; // a bare '{ref}' string
    var out = {};
    if (value.color !== undefined)  out.color   = value.color;
    if (value.x !== undefined)      out.offsetX = value.x;
    if (value.y !== undefined)      out.offsetY = value.y;
    if (value.blur !== undefined)   out.blur    = value.blur;
    if (value.spread !== undefined) out.spread  = value.spread;
    if (value.type === 'innerShadow') out.inset = true;
    return out;
  }

  // Legacy JSON dimension (spacing/sizing/borderRadius/borderWidth/dimension/
  // fontSizes/letterSpacing/paragraphSpacing/paragraphIndent — everything
  // TYPE_MAP maps to 'dimension') → DTCG's dimension composite, { value,
  // unit }. Figma's own float variables behind every one of these are raw
  // pixels, so unit is always 'px' — there is no per-token unit to read.
  //
  // A string containing '{' is a reference — a plain alias ('{dimension.1}')
  // or a math expression built on one ('1*{dimension.base}', see
  // isMathExpression above) — and stays exactly as it is: DTCG aliases are
  // valid as bare $value strings, and there is no arithmetic in DTCG to
  // resolve the math form into, so wrapping either in { value, unit } would
  // turn a real reference into a broken literal instead of leaving it as
  // the reference/math-expression report already surfaces it to be.
  // Resolves this kit's own dimension math layer to a number — from the
  // single documented shape ('5*{dimension.base}', code.js's own
  // "dimension.N -> N*{dimension.base} when divisible" comment) up through
  // a real small arithmetic grammar (+ - * / , parentheses, unary minus,
  // and the one function call a real export was found to use: roundTo),
  // because a real expression was found that needed it:
  // '(roundTo({breakpoint.stretch-grid.column-width} * 4) + {dimension.2})'.
  // `root` is the same tree convertTree is walking (a theme's merged sets,
  // or one set for 'sets' shape); every {path.to.token} reference is
  // relative to it, exactly as Legacy JSON already writes it, and resolves
  // recursively — a referenced token that is itself a math expression
  // resolves too — with a depth guard against a reference cycle. Returns
  // null on anything outside this grammar or any reference it can't fully
  // resolve, so the caller always has a safe "leave it as the original
  // string" fallback: this must never partially resolve or guess.
  function resolveDimensionRef(root, refPath, depth) {
    if (depth > 10) return null;
    var parts = refPath.split('.');
    var node = root;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== 'object') return null;
      node = node[parts[i]];
    }
    if (!isTokenNode(node)) return null;
    return resolveDimensionNumber(root, node.value, depth + 1);
  }

  function DimensionMathError(message) {
    this.message = message;
  }

  function tokenizeDimensionMath(src) {
    var tokens = [];
    var i = 0;
    while (i < src.length) {
      var c = src.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (c === '{') {
        var end = src.indexOf('}', i);
        if (end === -1) throw new DimensionMathError('unterminated reference');
        tokens.push({ type: 'ref', value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      if (/[\d.]/.test(c)) {
        var j = i;
        while (j < src.length && /[\d.]/.test(src.charAt(j))) j++;
        tokens.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
        i = j;
        continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        var k = i;
        while (k < src.length && /[a-zA-Z0-9_]/.test(src.charAt(k))) k++;
        tokens.push({ type: 'ident', value: src.slice(i, k) });
        i = k;
        continue;
      }
      if ('+-*/(),'.indexOf(c) !== -1) {
        tokens.push({ type: c });
        i++;
        continue;
      }
      throw new DimensionMathError('unexpected character: ' + c);
    }
    return tokens;
  }

  // Deliberately just the one function a real export was found to use —
  // not a general math-function library. roundTo(x) rounds to the nearest
  // integer; roundTo(x, n) rounds to n decimal places, matching the
  // conventional meaning of the name (Tokens Studio's own math layer).
  function callDimensionMathFn(name, args) {
    if (name === 'roundTo') {
      var x = args[0];
      var n = args.length > 1 ? args[1] : 0;
      var factor = Math.pow(10, n);
      return Math.round(x * factor) / factor;
    }
    throw new DimensionMathError('unsupported function: ' + name);
  }

  // A small recursive-descent parser that evaluates as it goes — this
  // grammar is small and only ever walked once per token, so building a
  // separate AST first would be pure overhead. Standard precedence:
  // + / - bind loosest, * // bind tighter, unary minus tightest before a
  // parenthesised group or a call.
  function parseDimensionMath(tokens, resolveRef) {
    var pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function expect(type) {
      var t = next();
      if (!t || t.type !== type) throw new DimensionMathError('expected ' + type);
      return t;
    }
    function parseExpression() {
      var value = parseTerm();
      while (peek() && (peek().type === '+' || peek().type === '-')) {
        var op = next().type;
        var rhs = parseTerm();
        value = op === '+' ? value + rhs : value - rhs;
      }
      return value;
    }
    function parseTerm() {
      var value = parseUnary();
      while (peek() && (peek().type === '*' || peek().type === '/')) {
        var op = next().type;
        var rhs = parseUnary();
        if (op === '/') {
          if (rhs === 0) throw new DimensionMathError('division by zero');
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      }
      return value;
    }
    function parseUnary() {
      if (peek() && peek().type === '-') { next(); return -parseUnary(); }
      if (peek() && peek().type === '+') { next(); return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      var t = peek();
      if (!t) throw new DimensionMathError('unexpected end of expression');
      if (t.type === 'num') { next(); return t.value; }
      if (t.type === 'ref') { next(); return resolveRef(t.value); }
      if (t.type === '(') {
        next();
        var v = parseExpression();
        expect(')');
        return v;
      }
      if (t.type === 'ident') {
        next();
        expect('(');
        var args = [parseExpression()];
        while (peek() && peek().type === ',') { next(); args.push(parseExpression()); }
        expect(')');
        return callDimensionMathFn(t.value, args);
      }
      throw new DimensionMathError('unexpected token: ' + t.type);
    }
    var result = parseExpression();
    if (pos !== tokens.length) throw new DimensionMathError('trailing input');
    return result;
  }

  // The one entry point into the grammar above: evaluate a Legacy JSON
  // dimension math expression to a number, or null if it isn't one / can't
  // be fully resolved. Catches everything, not just DimensionMathError —
  // one malformed or unexpected token must never crash the whole export,
  // only fail to resolve that one value.
  function evaluateDimensionMath(root, src, depth) {
    try {
      var tokens = tokenizeDimensionMath(src);
      return parseDimensionMath(tokens, function (refPath) {
        var v = resolveDimensionRef(root, refPath, depth);
        if (v === null) throw new DimensionMathError('unresolved reference: ' + refPath);
        return v;
      });
    } catch (e) {
      return null;
    }
  }

  function resolveDimensionNumber(root, value, depth) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    var trimmed = value.trim();
    if (/^-?[\d.]+$/.test(trimmed)) return parseFloat(trimmed); // a plain numeric literal
    // A referenced token can itself be a 'number'-type percentage literal
    // (line-heights.100 -> '100%') rather than a dimension — same % ->
    // /100 rule toDtcgNumber uses below, so a reference chain can freely
    // cross between dimension and number tokens.
    var pct = /^(-?[\d.]+)%$/.exec(trimmed);
    if (pct) return parseFloat(pct[1]) / 100;
    if (trimmed.indexOf('{') === -1) return null; // no reference — not a math expression at all
    return evaluateDimensionMath(root, trimmed, depth || 0);
  }

  function toDtcgDimension(value, root) {
    if (typeof value === 'string' && value.indexOf('{') !== -1) {
      var resolved = root ? resolveDimensionNumber(root, value, 0) : null;
      if (resolved === null) return value; // still can't be resolved — leave the reference as-is
      return { value: resolved, unit: 'px' };
    }
    var n = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(n)) return value; // not actually numeric — leave it rather than guess
    return { value: n, unit: 'px' };
  }

  // Legacy JSON 'number' (lineHeights/opacity/number — everything TYPE_MAP
  // maps to DTCG's plain 'number' type) is the one dimension-family type
  // that ISN'T a composite — DTCG just wants a real number. Legacy JSON
  // carries it three ways: a percentage string ('130%', Figma's own line-
  // height-as-percent convention — divide by 100 to match the reference
  // file's own 1.3), a plain numeric string ('24'), or the same math-
  // expression grammar dimension uses — e.g. a computed line-height,
  // '({breakpoint.typography.display.size} / 100) * {line-heights.100}' —
  // resolved with the exact same evaluator (resolveDimensionNumber, which
  // also knows how to read a referenced number token's own '%' literal).
  // A reference this can't fully resolve is left exactly as it is, same
  // convention as every other type here.
  function toDtcgNumber(value, root) {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return value;
    var trimmed = value.trim();
    if (trimmed.indexOf('{') !== -1) {
      var resolved = root ? resolveDimensionNumber(root, trimmed, 0) : null;
      return resolved === null ? value : resolved;
    }
    var pct = /^(-?[\d.]+)%$/.exec(trimmed);
    if (pct) return parseFloat(pct[1]) / 100;
    if (/^-?[\d.]+$/.test(trimmed)) return parseFloat(trimmed);
    return value; // not a recognised numeric shape — leave it rather than guess
  }

  // code.js's own formatValue() is what colors already look like by the time
  // this file sees them — never Figma's raw 0-1 float object, that's already
  // gone: '#RRGGBB' (uppercase, alpha 1) or 'rgba(r,g,b,a)' (alpha < 1, r/g/b
  // 0-255 ints). Parses either back into channels rather than re-deriving
  // them, so this stays a straight reshape with no precision loss beyond
  // what code.js already rounded to.
  function parseColorChannels(value) {
    if (typeof value !== 'string') return null;
    var hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(value);
    if (hex) {
      var h = hex[1];
      if (h.length === 3) h = h.replace(/./g, function (c) { return c + c; });
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
    var rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(value);
    if (rgba) {
      return {
        r: parseFloat(rgba[1]), g: parseFloat(rgba[2]), b: parseFloat(rgba[3]),
        a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1
      };
    }
    return null;
  }

  function round5(n) {
    return Math.round(n * 100000) / 100000;
  }

  // Legacy JSON color ('#RRGGBB' / 'rgba(r,g,b,a)') → DTCG's color
  // composite, { colorSpace, components, alpha, hex }. hex is always the
  // plain RRGGBB triplet, lowercase, with alpha carried separately — never
  // baked into an 8-digit hex, matching the composite's own shape. A
  // reference ('{ref}', same convention as toDtcgDimension above) stays a
  // string; a value that isn't a recognised color string is left alone
  // rather than guessed at.
  function toDtcgColor(value) {
    if (typeof value === 'string' && value.indexOf('{') !== -1) return value;
    var c = parseColorChannels(value);
    if (!c) return value;
    var hex = '#' + [c.r, c.g, c.b].map(function (n) {
      return Math.round(n).toString(16).padStart(2, '0');
    }).join('');
    return {
      colorSpace: 'srgb',
      components: [round5(c.r / 255), round5(c.g / 255), round5(c.b / 255)],
      alpha: round5(c.a),
      hex: hex
    };
  }

  // Legacy JSON typography → DTCG typography, plus the non-standard sub-values
  // split off for $extensions.
  function toDtcgTypography(value) {
    if (!isObject(value)) return { value: value, extra: null };
    var std = {};
    var extra = {};
    Object.keys(value).forEach(function (key) {
      if (TYPOGRAPHY_KEYS.indexOf(key) !== -1) std[key] = value[key];
      else extra[key] = value[key];
    });
    return { value: std, extra: Object.keys(extra).length ? extra : null };
  }

  // --- token conversion ------------------------------------------------------

  function convertToken(node, path, report, root) {
    var legacyType = node.type;
    var dtcgType = TYPE_MAP[legacyType];
    var out = {};
    var extra = null;

    if (dtcgType === undefined) {
      // No DTCG equivalent (text, textCase, textDecoration, boolean, asset, …).
      dtcgType = legacyType;
      if (legacyType !== undefined) {
        report.unmappedTypes[legacyType] = (report.unmappedTypes[legacyType] || 0) + 1;
      }
    } else {
      report.mappedTypes[legacyType] = (report.mappedTypes[legacyType] || 0) + 1;
    }

    var value = node.value;
    if (legacyType === 'boxShadow') {
      value = toDtcgShadow(value);
    } else if (legacyType === 'typography') {
      var split = toDtcgTypography(value);
      value = split.value;
      extra = split.extra;
    } else if (dtcgType === 'dimension') {
      /*
        A PERCENTAGE IS NOT A LENGTH, WHATEVER THE NAMESPACE SAYS.

        TYPE_MAP works per namespace: letterSpacing is a dimension, lineHeights
        is a number. That is right for the usual case and wrong for the value
        Figma actually stores here — letter spacing as a percentage of the font
        size. Sent down the dimension path, '-5%' lost its unit and came out as
        { value: -5, unit: 'px' }: a fixed −5px at every size, where −5% of a
        72px display is about −3.6px. Silent, and wrong by a different amount
        at every step of the type scale.

        lineHeights already had the rule — a '%' literal is a ratio, divided by
        100 — because its namespace maps to 'number'. It belongs to the VALUE,
        not the namespace, so a percentage takes it wherever it appears and the
        token is reported as the number it is.
      */
      if (typeof value === 'string' && /^\s*-?[\d.]+%\s*$/.test(value)) {
        dtcgType = 'number';
        value = toDtcgNumber(value, root);
      } else {
        value = toDtcgDimension(value, root);
      }
    } else if (dtcgType === 'color') {
      value = toDtcgColor(value);
    } else if (dtcgType === 'number') {
      value = toDtcgNumber(value, root);
    }

    // Only what's STILL a math expression after the dimension resolver above
    // had its try — a dimension it successfully resolved is now a { value,
    // unit } object, not a string, so it no longer needs flagging; anything
    // it couldn't (a reference outside this tree, a cycle, a shape other
    // than the documented one) still does.
    if (isMathExpression(value)) {
      report.mathExpressions.push({ path: path, value: value });
    }

    if (dtcgType !== undefined) out.$type = dtcgType;
    out.$value = value;
    // Figma's variable description, carried through by transformToFinalFormat
    // when includeDescriptions is set. DTCG has $description as a first-class field.
    if (node.description) {
      out.$description = node.description;
      report.describedCount++;
    }

    // Everything Legacy JSON carries that DTCG has no home for is preserved
    // under a vendor extension rather than dropped.
    var ext = {};
    if (legacyType !== undefined) ext.type = legacyType;
    if (node.codeSyntax) ext.codeSyntax = node.codeSyntax;
    if (extra) ext.typography = extra;
    Object.keys(node).forEach(function (key) {
      if (key === 'value' || key === 'type' || key === 'description' || key === 'codeSyntax') return;
      ext[key] = node[key];
    });
    if (Object.keys(ext).length) {
      out.$extensions = {};
      out.$extensions[EXT] = ext;
    }

    report.tokenCount++;
    return out;
  }

  // `root` defaults to `node` on the outermost call (one per theme/set) and
  // is threaded unchanged through every recursive call after that, so a
  // dimension token anywhere in the tree can resolve a '{path.from.root}'
  // reference against the same tree convertTree is already walking — see
  // toDtcgDimension/resolveDimensionNumber above.
  function convertTree(node, path, report, root) {
    if (root === undefined) root = node;
    if (isTokenNode(node)) return convertToken(node, path, report, root);
    if (!isObject(node)) return node;
    var out = {};
    Object.keys(node).forEach(function (key) {
      out[key] = convertTree(node[key], path ? path + '.' + key : key, report, root);
    });
    return out;
  }

  // --- "partial DTCG" ---------------------------------------------------------

  // This partial DTCG export is a minimal rename: value/type/description
  // become $value/$type/$description and nothing else changes — proprietary type
  // names (boxShadow, fontSizes, …), composite shapes, embedded math and
  // stringified values all stay, for a downstream build-dtcg.js step that
  // finishes the conversion into strict DTCG.
  //
  // Crucially $themes and $metadata stay at the document root in their native
  // form: build-dtcg.js resolves per theme and reads selectedTokenSets from them.
  var PARTIAL_RENAME = { value: '$value', type: '$type', description: '$description' };

  // A Figma description belongs to the variable, so every mode of that variable
  // carries the same text at the same token path — in different sets. Inline,
  // that is the single largest thing in the file (measured on the real export:
  // 9.45 MB of 18.7, 27,992 strings but only 6,635 distinct, 4.2x repetition).
  //
  // Emitting it once per variable cannot mean "only in one of those sets": a
  // theme merges one set per group, so every other theme would lose it. Instead
  // the single copy is hoisted to a root map keyed by the token path, which is
  // the same in every set — one entry per variable, resolvable from all of them.
  //
  // Precedence for a consumer: an inline $description on a token always wins
  // over the map. Two variables sharing a path with different text is the only
  // case that produces one, and it keeps that export lossless.
  var EXT_EXPORTER = 'com.closure.json-exporter';

  function toPartialToken(node, path, report, dedupe) {
    var out = {};
    // Only the token node's own keys are renamed. Composite values are copied by
    // reference, so the `type: 'dropShadow'` inside a boxShadow value is left alone.
    Object.keys(node).forEach(function (key) {
      if (key === 'description' && dedupe && node.description) {
        var seen = report.descriptions[path];
        if (seen === undefined) {
          report.descriptions[path] = node.description;
        } else if (seen !== node.description) {
          // Same path, different text: keep this one inline rather than let the
          // map silently answer for it.
          report.descriptionCollisions.push(path);
          out.$description = node.description;
        }
        return;
      }
      out[PARTIAL_RENAME[key] || key] = node[key];
    });
    report.tokenCount++;
    if (node.description) report.describedCount++;
    if (out.$type !== undefined) {
      report.sourceTypes[out.$type] = (report.sourceTypes[out.$type] || 0) + 1;
    }
    if (isMathExpression(node.value)) {
      report.mathExpressions.push({ path: path, value: node.value });
    }
    return out;
  }

  function toPartialTree(node, path, report, dedupe) {
    if (isTokenNode(node)) return toPartialToken(node, path, report, dedupe);
    if (!isObject(node)) return node;
    var out = {};
    Object.keys(node).forEach(function (key) {
      out[key] = toPartialTree(node[key], path ? path + '.' + key : key, report, dedupe);
    });
    return out;
  }

  // --- theme resolution ------------------------------------------------------

  // Merge one theme's sets into a single self-contained tree. Sets are
  // applied in tokenSetOrder and later sets win, so 'source' and
  // 'enabled' both contribute and only 'disabled' is skipped.
  function mergeThemeSets(legacyTokens, theme, tokenSetOrder) {
    var selected = theme.selectedTokenSets || {};
    var merged = {};
    tokenSetOrder.forEach(function (setName) {
      var state = selected[setName];
      if (!state || state === 'disabled') return;
      if (!legacyTokens[setName]) return;
      deepMerge(merged, deepClone(legacyTokens[setName]));
    });
    return merged;
  }

  function themeKey(theme) {
    return theme.group ? theme.group + '/' + theme.name : theme.name;
  }

  // --- public API ------------------------------------------------------------

  /**
   * Convert a Legacy JSON tree to DTCG.
   *
   * @param {object} legacyTokens  the Legacy JSON tree that code.js already produces (sets + $themes + $metadata)
   * @param {object} [options]
   * @param {'partial'|'sets'|'themes'} [options.shape='sets']
   * @param {boolean} [options.dedupeDescriptions=true]  'partial' only — hoist each
   *   description to the root map instead of repeating it on every mode's token.
   * @returns {{ tokens: object, report: object }}
   */
  function toDtcgFormat(legacyTokens, options) {
    options = options || {};
    var shape = options.shape || 'sets';

    var report = {
      shape: shape,
      tokenCount: 0,
      describedCount: 0,
      mappedTypes: {},
      unmappedTypes: {},
      sourceTypes: {},
      mathExpressions: [],
      descriptions: {},
      descriptionCollisions: [],
      sets: [],
      themes: []
    };

    var metadata = legacyTokens['$metadata'] || {};
    var themes = legacyTokens['$themes'] || [];
    var tokenSetOrder = metadata.tokenSetOrder || Object.keys(legacyTokens).filter(function (k) {
      return !META_KEYS[k];
    });

    var out = {};

    if (shape === 'partial') {
      // Opt out with { dedupeDescriptions: false } to inline every description
      // instead, for a consumer that cannot read the root map.
      var dedupe = options.dedupeDescriptions !== false;
      tokenSetOrder.forEach(function (setName) {
        if (!legacyTokens[setName]) return;
        out[setName] = toPartialTree(legacyTokens[setName], '', report, dedupe);
        report.sets.push(setName);
      });
      if (dedupe && Object.keys(report.descriptions).length) {
        out['$extensions'] = {};
        out['$extensions'][EXT_EXPORTER] = { descriptions: report.descriptions };
      }
      // Native, at the root, exactly where build-dtcg.js looks for them.
      if (legacyTokens['$themes']) out['$themes'] = legacyTokens['$themes'];
      if (legacyTokens['$metadata']) out['$metadata'] = legacyTokens['$metadata'];
      return { tokens: out, report: report };
    }

    if (shape === 'themes') {
      themes.forEach(function (theme) {
        var key = themeKey(theme);
        var merged = mergeThemeSets(legacyTokens, theme, tokenSetOrder);
        out[key] = convertTree(merged, '', report);
        report.themes.push(key);
      });
    } else {
      tokenSetOrder.forEach(function (setName) {
        if (!legacyTokens[setName]) return;
        out[setName] = convertTree(legacyTokens[setName], '', report);
        report.sets.push(setName);
      });
    }

    // Legacy JSON's own metadata has no DTCG equivalent; keep it at the document
    // root under the vendor extension so the export stays round-trippable.
    out['$extensions'] = {};
    out['$extensions'][EXT] = {
      tokenSetOrder: tokenSetOrder,
      themes: themes,
      shape: shape
    };

    return { tokens: out, report: report };
  }

  /**
   * Resolve every {a.b.c} reference in a DTCG tree against that same tree and
   * report the ones that dangle. Mirrors validateReferenceClosure in code.js,
   * but scoped per top-level document so the 'themes' shape is checked correctly.
   */
  function validateDtcgClosure(dtcgTokens) {
    var results = {};
    Object.keys(dtcgTokens).forEach(function (rootKey) {
      if (rootKey.charAt(0) === '$') return;
      var index = {};
      (function walk(node, path) {
        if (!isObject(node)) return;
        if (Object.prototype.hasOwnProperty.call(node, '$value')) {
          index[path] = true;
          return;
        }
        Object.keys(node).forEach(function (key) {
          if (key.charAt(0) === '$') return;
          walk(node[key], path ? path + '.' + key : key);
        });
      })(dtcgTokens[rootKey], '');

      var broken = [];
      var total = 0;
      (function walk(node, path) {
        if (!isObject(node)) return;
        if (Object.prototype.hasOwnProperty.call(node, '$value')) {
          var s = typeof node.$value === 'string' ? node.$value : JSON.stringify(node.$value);
          var matches = s.match(/\{[^{}]+\}/g) || [];
          matches.forEach(function (m) {
            var inner = m.slice(1, -1);
            if (inner.indexOf('"') !== -1 || inner.indexOf(':') !== -1) return;
            if (inner.indexOf('.') === -1) return;
            if (!/^[A-Za-z0-9_.\- ]+$/.test(inner)) return;
            total++;
            if (!index[inner]) broken.push({ from: path, ref: inner });
          });
          return;
        }
        Object.keys(node).forEach(function (key) {
          if (key.charAt(0) === '$') return;
          walk(node[key], path ? path + '.' + key : key);
        });
      })(dtcgTokens[rootKey], '');

      results[rootKey] = {
        ok: broken.length === 0,
        totalRefs: total,
        brokenCount: broken.length,
        sampleBroken: broken.slice(0, 10)
      };
    });
    return results;
  }

  var api = {
    toDtcgFormat: toDtcgFormat,
    validateDtcgClosure: validateDtcgClosure,
    TYPE_MAP: TYPE_MAP,
    EXTENSION_KEY: EXT
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // PomDtcg, not the pre-Closure-rebrand RaddDtcg this used to be: the UI
  // (ui.template.html's toDtcg()) reads window.PomDtcg.toDtcgFormat and has
  // ever since the rebrand, so that global name was always undefined —
  // window.PomDtcg.toDtcgFormat threw on every single 'transformed'
  // message, in the browser only (Node consumers all use module.exports
  // via require(), never this global, so the Node-side self-test/preview
  // scripts never caught it). That silently killed everything after it in
  // the same handler, including the accordion's own token/size Tags
  // (window.PomCollectionsAccordion.setSummary — see ui.template.html's
  // 'transformed' handler), which is what actually surfaced this: reported
  // from the real plugin as those tags being permanently missing. Checked
  // for other consumers of the old name first — none; safe to rename
  // outright rather than aliasing both.
  if (global) global.PomDtcg = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
