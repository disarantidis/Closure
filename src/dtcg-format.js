/*
 * dtcg-format.js — DTCG (design-tokens.org) export format.
 *
 * The default 'partial' shape is Tokens Studio's partial DTCG, not strict W3C:
 * proprietary type names, composite shapes and embedded math survive it, and
 * build-dtcg.js downstream is what makes the result standards-conformant.
 *
 * EXPLORATORY. This is a pure post-transform over the Token Studio tree that
 * code.js already produces (`toTokenStudioFormat`), so nothing in the existing
 * export path changes: same extraction, same normalization, same composites.
 * Only the final serialization differs.
 *
 *   Figma vars → transformToFinalFormat → toTokenStudioFormat → [this file]
 *
 * Three output shapes:
 *
 *   'partial'  — what Tokens Studio's own DTCG export produces, and what
 *                config/normalize/build-dtcg.js consumes downstream as
 *                packages/radd/src/tokens_W3C.json. A minimal rename of
 *                value/type/description; proprietary type names, composite
 *                shapes, embedded math and $themes/$metadata all stay put.
 *                This is the production target — build-dtcg.js finishes the
 *                conversion into strict, standards-only DTCG.
 *
 *   'sets'     — like 'partial' but with the strict type mapping and composite
 *                rewriting applied, and $themes/$metadata moved into
 *                $extensions. A preview of the strict form, per set.
 *
 *   'themes'   — one self-contained document per $themes entry, built by
 *                deep-merging that theme's non-disabled sets in tokenSetOrder
 *                (later sets win, matching Tokens Studio). Resolves its own
 *                {a.b.c} references.
 *
 * Runs in the plugin UI (inlined into ui.html by scripts/build-ui.js) and in Node
 * (scripts/dtcg-preview.js) from this one source.
 */
(function (global) {
  'use strict';

  var EXT = 'com.radd.tokenStudio';

  // Token Studio type → DTCG $type. Anything absent here has no DTCG equivalent
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

  // DTCG's typography composite has exactly these sub-values. Token Studio adds
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

  // A Token Studio math expression, e.g. '{dimension.1}*4'. DTCG has no
  // arithmetic, so these pass through verbatim and are reported — a consumer
  // needs a Token Studio-compatible resolver to evaluate them.
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

  // Token Studio boxShadow → DTCG shadow. x/y become offsetX/offsetY, the
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

  // Token Studio typography → DTCG typography, plus the non-standard sub-values
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

  function convertToken(node, path, report) {
    var tsType = node.type;
    var dtcgType = TYPE_MAP[tsType];
    var out = {};
    var extra = null;

    if (dtcgType === undefined) {
      // No DTCG equivalent (text, textCase, textDecoration, boolean, asset, …).
      dtcgType = tsType;
      if (tsType !== undefined) {
        report.unmappedTypes[tsType] = (report.unmappedTypes[tsType] || 0) + 1;
      }
    } else {
      report.mappedTypes[tsType] = (report.mappedTypes[tsType] || 0) + 1;
    }

    var value = node.value;
    if (tsType === 'boxShadow') {
      value = toDtcgShadow(value);
    } else if (tsType === 'typography') {
      var split = toDtcgTypography(value);
      value = split.value;
      extra = split.extra;
    }

    if (isMathExpression(node.value)) {
      report.mathExpressions.push({ path: path, value: node.value });
    }

    if (dtcgType !== undefined) out.$type = dtcgType;
    out.$value = value;
    // Figma's variable description, carried through by transformToFinalFormat
    // when includeDescriptions is set. DTCG has $description as a first-class field.
    if (node.description) {
      out.$description = node.description;
      report.describedCount++;
    }

    // Everything Token Studio carries that DTCG has no home for is preserved
    // under a vendor extension rather than dropped.
    var ext = {};
    if (tsType !== undefined) ext.type = tsType;
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

  function convertTree(node, path, report) {
    if (isTokenNode(node)) return convertToken(node, path, report);
    if (!isObject(node)) return node;
    var out = {};
    Object.keys(node).forEach(function (key) {
      out[key] = convertTree(node[key], path ? path + '.' + key : key, report);
    });
    return out;
  }

  // --- Tokens Studio "partial DTCG" ------------------------------------------

  // Tokens Studio's own DTCG export is a minimal rename: value/type/description
  // become $value/$type/$description and nothing else changes — proprietary type
  // names (boxShadow, fontSizes, …), composite shapes, embedded math and
  // stringified values all stay. That is what config/normalize/build-dtcg.js
  // consumes downstream (packages/radd/src/tokens_W3C.json), which finishes the
  // conversion into strict DTCG.
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
  var EXT_EXPORTER = 'com.desquared.radd.json-exporter';

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

  // Merge one theme's sets into a single self-contained tree. Token Studio
  // applies sets in tokenSetOrder and lets later sets win, so 'source' and
  // 'enabled' both contribute and only 'disabled' is skipped.
  function mergeThemeSets(tsTokens, theme, tokenSetOrder) {
    var selected = theme.selectedTokenSets || {};
    var merged = {};
    tokenSetOrder.forEach(function (setName) {
      var state = selected[setName];
      if (!state || state === 'disabled') return;
      if (!tsTokens[setName]) return;
      deepMerge(merged, deepClone(tsTokens[setName]));
    });
    return merged;
  }

  function themeKey(theme) {
    return theme.group ? theme.group + '/' + theme.name : theme.name;
  }

  // --- public API ------------------------------------------------------------

  /**
   * Convert a Token Studio tree to DTCG.
   *
   * @param {object} tsTokens  output of toTokenStudioFormat (sets + $themes + $metadata)
   * @param {object} [options]
   * @param {'partial'|'sets'|'themes'} [options.shape='sets']
   * @param {boolean} [options.dedupeDescriptions=true]  'partial' only — hoist each
   *   description to the root map instead of repeating it on every mode's token.
   * @returns {{ tokens: object, report: object }}
   */
  function toDtcgFormat(tsTokens, options) {
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

    var metadata = tsTokens['$metadata'] || {};
    var themes = tsTokens['$themes'] || [];
    var tokenSetOrder = metadata.tokenSetOrder || Object.keys(tsTokens).filter(function (k) {
      return !META_KEYS[k];
    });

    var out = {};

    if (shape === 'partial') {
      // Opt out with { dedupeDescriptions: false } to inline every description
      // instead, for a consumer that cannot read the root map.
      var dedupe = options.dedupeDescriptions !== false;
      tokenSetOrder.forEach(function (setName) {
        if (!tsTokens[setName]) return;
        out[setName] = toPartialTree(tsTokens[setName], '', report, dedupe);
        report.sets.push(setName);
      });
      if (dedupe && Object.keys(report.descriptions).length) {
        out['$extensions'] = {};
        out['$extensions'][EXT_EXPORTER] = { descriptions: report.descriptions };
      }
      // Native, at the root, exactly where build-dtcg.js looks for them.
      if (tsTokens['$themes']) out['$themes'] = tsTokens['$themes'];
      if (tsTokens['$metadata']) out['$metadata'] = tsTokens['$metadata'];
      return { tokens: out, report: report };
    }

    if (shape === 'themes') {
      themes.forEach(function (theme) {
        var key = themeKey(theme);
        var merged = mergeThemeSets(tsTokens, theme, tokenSetOrder);
        out[key] = convertTree(merged, '', report);
        report.themes.push(key);
      });
    } else {
      tokenSetOrder.forEach(function (setName) {
        if (!tsTokens[setName]) return;
        out[setName] = convertTree(tsTokens[setName], '', report);
        report.sets.push(setName);
      });
    }

    // Token Studio's own metadata has no DTCG equivalent; keep it at the document
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
  if (global) global.RaddDtcg = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
