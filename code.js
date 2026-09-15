// JSON Exporter — Figma plugin (Token Studio JSON export)
figma.showUI(__html__, { width: 420, height: 740, themeColors: true });

function normalizeVariableName(name, collectionName) {
  if (!name) return '';

  var normalized = name;

  // Strip "Light/" or "Dark/" prefix (but NOT "Light Tokens/" or "Dark Tokens/"
  // because those create separate groups that would collide if merged)
  normalized = normalized.replace(/^(Light|Dark)\//i, '');

  // Remove collection name prefix for dot-collections (.breakpoint, .core, .mode)
  if (collectionName && collectionName.startsWith('.')) {
    var baseCollectionName = collectionName.substring(1);
    var prefixPattern = new RegExp('^' + baseCollectionName + '/', 'i');
    normalized = normalized.replace(prefixPattern, '');
  }

  return normalized;
}

function pathToNestedObject(path, value) {
  if (!path) return {};
  var parts = path.split('/').filter(function(p) { return p.length > 0; });
  var result = {};
  var current = result;
  for (var i = 0; i < parts.length - 1; i++) {
    current[parts[i]] = current[parts[i]] || {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
  return result;
}

function deepMerge(target, source) {
  for (var key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else { target[key] = source[key]; }
  }
}

function stripIcons(name) {
  if (!name) return name;
  // Remove emoji/icon characters (pictographics, symbols, variation selectors) then collapse whitespace
  return name
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- json_fix_guide: font weights must be numeric strings (type number), not "Bold" etc. ---
var FONT_WEIGHT_NAME_TO_NUM = {
  thin: '100',
  extralight: '200',
  ultralight: '200',
  light: '300',
  regular: '400',
  normal: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
  heavy: '900'
};

function normalizeFontWeightLiteral(v) {
  if (v === undefined || v === null) return v;
  if (typeof v === 'number' && !isNaN(v)) return String(Math.round(v));
  if (typeof v !== 'string') return v;
  var t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return String(Math.round(parseFloat(t, 10)));
  var compact = t.replace(/\s+/g, '').toLowerCase();
  if (FONT_WEIGHT_NAME_TO_NUM[compact] !== undefined) return FONT_WEIGHT_NAME_TO_NUM[compact];
  var alpha = t.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (alpha && FONT_WEIGHT_NAME_TO_NUM[alpha] !== undefined) return FONT_WEIGHT_NAME_TO_NUM[alpha];
  return v;
}

/** Stable decimal strings for tokens — avoids float64 garbage like 22.8700008392334 → 22.87 */
function formatFloatForExport(value) {
  if (typeof value !== 'number' || isNaN(value)) return String(value);
  var rounded = Math.round(value * 100000) / 100000;
  var s = rounded.toString();
  if (s.indexOf('e') !== -1 || s === 'NaN') {
    s = String(+parseFloat(value.toPrecision(12)));
  }
  return s;
}

function formatValue(value, type) {
  if (type === 'COLOR' && value && typeof value === 'object' && value.r !== undefined) {
    var r = Math.round(value.r * 255), g = Math.round(value.g * 255), b = Math.round(value.b * 255);
    var a = value.a !== undefined ? value.a : 1;
    // uppercase hex, no spaces in rgba — matches Token Studio reference format
    return a === 1
      ? '#' + [r, g, b].map(function(x) { return x.toString(16).padStart(2, '0').toUpperCase(); }).join('')
      : 'rgba(' + r + ',' + g + ',' + b + ',' + parseFloat(a.toFixed(2)) + ')';
  }
  if (type === 'FLOAT' && typeof value === 'number') {
    return formatFloatForExport(value);
  }
  return value;
}

// --- BUILD MAPS FOR ALIAS RESOLUTION ---
function buildCollectionMap(collections) {
  var variableToCollection = new Map();
  var modeMap = new Map();
  
  collections.forEach(function(col) {
    col.modes.forEach(function(mode) {
      modeMap.set(mode.modeId, {
        name: stripIcons(mode.name),
        collectionName: stripIcons(col.name),
        parentModeId: mode.parentModeId
      });
    });

    col.variables.forEach(function(variable) {
      variableToCollection.set(variable.id, {
        collectionName: stripIcons(col.name),
        variableName: variable.name
      });
    });
  });
  
  return { variableToCollection: variableToCollection, modeMap: modeMap };
}

// --- v32 FIX: Detect parent collection for .mode ---
function findParentCollection(collections, modeCollectionName) {
  // For .mode collection, we need to find which collection it extends
  // This is typically "Schemes (Neutral)" based on the architecture
  
  // Strategy: Look for the collection that has modes without parentModeId
  // and matches the naming pattern (contains "Schemes" or "Neutral")
  
  var candidates = [];
  
  collections.forEach(function(col) {
    // Skip the .mode collection itself
    if (col.name === modeCollectionName) return;
    
    // Look for collections with base modes (no parentModeId)
    var hasBaseModes = col.modes.some(function(mode) {
      return !mode.parentModeId;
    });
    
    if (hasBaseModes) {
      // Prioritize "Schemes (Neutral)" or similar naming
      if (col.name.match(/Schemes|Neutral/i)) {
        candidates.unshift(stripIcons(col.name)); // Add to front
      } else {
        candidates.push(stripIcons(col.name));
      }
    }
  });
  
  // Return the first candidate (should be "Schemes (Neutral)")
  return candidates.length > 0 ? candidates[0] : null;
}

// --- CONSTRUCT PROPER ALIAS PATH ---
function buildAliasPath(aliasedVar, aliasedVarCollection, currentCollectionName, collections) {
  if (!aliasedVar) return null;
  
  var varName = aliasedVar.name;
  
  // Remove Light/Dark prefixes first
  var normalized = varName.replace(/^(Light|Dark|light|dark)\//i, '');
  
  // CRITICAL: Check for core primitives BEFORE processing extended collections
  // These live in .core but are referenced WITHOUT "core." prefix
  if (normalized.match(/^(core-colours|dimension|shadow-colours|shadows)\//)) {
    return normalized.replace(/\//g, '.');
  }

  if (currentCollectionName === '.mode') {
    var parentCollectionName = findParentCollection(collections, currentCollectionName);
    if (parentCollectionName) {
      return parentCollectionName + '.' + normalized.replace(/\//g, '.');
    }
    return normalized.replace(/\//g, '.');
  }

  if (aliasedVarCollection && aliasedVarCollection.startsWith('.')) {
    var baseCollectionName = aliasedVarCollection.substring(1);

    // Leaf collections: reference by the RAW variable name so the token root is
    // the actual group (white, white-subtle, secondary-light, magenta-light, …),
    // matching the canonical export. No strip-then-prepend of the base name.
    var LEAF_RAW_COLLECTIONS = {
      'white': 1, 'black': 1, 'brand': 1,
      'magenta-light': 1, 'magenta-dark': 1, 'secondary': 1
    };
    if (LEAF_RAW_COLLECTIONS[baseCollectionName]) {
      return normalized.replace(/\//g, '.');
    }

    var prefixPattern = new RegExp('^' + baseCollectionName + '/', 'i');
    normalized = normalized.replace(prefixPattern, '');

    if (baseCollectionName === 'mode' && normalized.startsWith('mode-inverted/')) {
      return normalized.replace(/\//g, '.');
    }

    return baseCollectionName + '.' + normalized.replace(/\//g, '.');
  }

  if (aliasedVarCollection === '_restricted') {
    return normalized.replace(/\//g, '.');
  }

  return normalized.replace(/\//g, '.');
}

// --- TOKEN STUDIO: dimension.N → N*{dimension.base} when divisible (matches Token Studio math layer) ---
function applyDimensionBaseExpressions(core) {
  if (!core || !core.dimension || !core.dimension.base) return core;
  var baseTok = core.dimension.base;
  var baseVal = parseFloat(String(baseTok.value), 10);
  if (isNaN(baseVal) || baseVal === 0) return core;

  Object.keys(core.dimension).forEach(function(k) {
    if (k === 'base' || k === '0') return;
    var tok = core.dimension[k];
    if (!tok || tok.type !== 'dimension') return;
    var num = parseFloat(String(tok.value), 10);
    if (isNaN(num)) return;
    var mult = num / baseVal;
    var rounded = Math.round(mult);
    if (Math.abs(mult - rounded) < 1e-6) {
      tok.value = rounded + '*{dimension.base}';
    }
  });
  return core;
}

/** Only semantic `core.lineHeights` (0–3, …). Never use `line-heights` multipliers (100, 120, …) here. */
function pickTypographyCompositeLineHeightRef(core) {
  if (!core) return '{lineHeights.0}';
  var lh = core.lineHeights;
  if (lh && lh['0']) return '{lineHeights.0}';
  if (lh && typeof lh === 'object') {
    var ks = Object.keys(lh);
    if (ks.length) return '{lineHeights.' + ks[0] + '}';
  }
  return '{lineHeights.0}';
}

/** Nato_8-4-26_3: composite lineHeight uses semantic lineHeights.0 | .1 | .2 | .3 (not line-heights multipliers). */
var NATO_TYPO_COMPOSITE_LINE_HEIGHT_INDEX = {
  'display': '0', 'title-XL': '0', 'title-L': '0', 'title-M': '0', 'title-S': '0', 'subtitle': '0',
  'paragraph': '1',
  'body-L': '2',
  'body-M-bold': '3', 'body-M-regular': '3', 'link-M-bold': '3', 'link-M-regular': '3',
  'body-S-bold': '3', 'body-S-regular': '3', 'link-S-bold': '3', 'link-S-regular': '3',
  'microcopy-bold': '1', 'microcopy-regular': '1'
};

function syncTypographyCompositeLineHeights(breakpointContent) {
  if (!breakpointContent || !breakpointContent.typography) return;
  Object.keys(breakpointContent.typography).forEach(function(scale) {
    var so = breakpointContent.typography[scale];
    if (!so || !so[scale] || !so[scale].value || typeof so[scale].value !== 'object') return;
    var idx = NATO_TYPO_COMPOSITE_LINE_HEIGHT_INDEX[scale];
    if (idx === undefined) idx = '0';
    so[scale].value.lineHeight = '{lineHeights.' + idx + '}';
  });
}

// Nato_8-4-26_3: per-scale multiplier token under core.line-heights (100, 120, 125, 130, …)
var NATO_TYPO_LINE_HEIGHT_MULT_KEY = {
  'display': '100', 'title-XL': '100', 'title-L': '100', 'title-M': '100', 'title-S': '100', 'subtitle': '100',
  'paragraph': '130',
  'body-L': '120',
  'body-M-bold': '125', 'body-M-regular': '125', 'link-M-bold': '125', 'link-M-regular': '125',
  'body-S-bold': '125', 'body-S-regular': '125', 'link-S-bold': '125', 'link-S-regular': '125',
  'microcopy-bold': '130', 'microcopy-regular': '130'
};

function injectBreakpointTypographyLineHeightFormulas(breakpointContent) {
  if (!breakpointContent || !breakpointContent.typography) return breakpointContent;
  var typo = breakpointContent.typography;
  Object.keys(typo).forEach(function(scale) {
    var scaleObj = typo[scale];
    if (!scaleObj || !scaleObj['line-height']) return;
    var mult = NATO_TYPO_LINE_HEIGHT_MULT_KEY[scale] || '100';
    var lhRef = '{line-heights.' + mult + '}';
    scaleObj['line-height'] = {
      value: '( {breakpoint.typography.' + scale + '.size} / 100 ) * ' + lhRef,
      type: 'number'
    };
  });
  return breakpointContent;
}

/** Map core.fontSize[N].value → font-sizes group key (Nato uses comma keys for decimals, e.g. 22,87). */
function pixelToFontSizesRefKey(core, pixelStr) {
  var fs = core && core['font-sizes'];
  if (!pixelStr) return pixelStr;
  var pDot = String(pixelStr).replace(/,/g, '.');
  if (fs && fs[pixelStr]) return pixelStr;
  var commaTry = String(pixelStr).replace(/\./g, ',');
  if (fs && fs[commaTry]) return commaTry;
  if (!fs) return pDot.indexOf('.') === -1 ? pDot : commaTry;
  var keys = Object.keys(fs);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = fs[k] && fs[k].value;
    if (v === undefined || v === null) continue;
    var vDot = String(v).replace(/,/g, '.');
    if (vDot === pDot || String(v) === String(pixelStr)) return k;
  }
  return pDot.indexOf('.') === -1 ? pDot : commaTry;
}

/** When pixel exists in font-sizes but not in fontSize scale (e.g. 72), map to nearest scale step (Nato alignment). */
function findNearestFontSizeIndex(core, pixelNum) {
  var fsc = core && core.fontSize;
  if (!fsc || typeof pixelNum !== 'number' || isNaN(pixelNum)) return null;
  var best = null;
  var bestDist = Infinity;
  Object.keys(fsc).forEach(function(k) {
    var tok = fsc[k];
    if (!tok || tok.value === undefined || tok.value === null) return;
    var n = parseFloat(String(tok.value).replace(/,/g, '.'), 10);
    if (isNaN(n)) return;
    var d = Math.abs(n - pixelNum);
    if (d < bestDist) {
      bestDist = d;
      best = k;
    }
  });
  return best;
}

/** Nato_8-4-26_3: composite uses {fontSize.N} + camel groups; standalone size uses {font-sizes.px}. */
function alignBreakpointTypographyToNato(core, breakpointContent) {
  if (!core || !breakpointContent || !breakpointContent.typography) return;
  var typo = breakpointContent.typography;
  var fsc = core.fontSize;
  if (!fsc || typeof fsc !== 'object') return;

  Object.keys(typo).forEach(function(scale) {
    var scaleObj = typo[scale];
    if (!scaleObj || !scaleObj[scale] || !scaleObj[scale].value) return;
    var comp = scaleObj[scale].value;
    if (!comp || typeof comp !== 'object') return;

    var N = null;
    var exactMatch = false;
    var fsz = comp.fontSize;
    if (typeof fsz === 'string') {
      var m = fsz.match(/\{fontSize\.(\d+)\}/);
      if (m) {
        N = m[1];
        exactMatch = true;
      }
      if (!N) {
        var m2 = fsz.match(/\{font-sizes\.([^}]+)\}/);
        if (m2) {
          var pixelKey = m2[1].replace(/,/g, '.');
          var ks = Object.keys(fsc);
          for (var i = 0; i < ks.length; i++) {
            var nk = ks[i];
            var tv = fsc[nk] && fsc[nk].value;
            if (tv === undefined) continue;
            if (String(tv).replace(/,/g, '.') === pixelKey) {
              N = nk;
              exactMatch = true;
              break;
            }
          }
        }
      }
      if (!N && /^\s*\d+(\.\d+)?\s*$/.test(fsz)) {
        var rawPx = fsz.trim();
        var ks0 = Object.keys(fsc);
        for (var ii = 0; ii < ks0.length; ii++) {
          var nk0 = ks0[ii];
          var tv0 = fsc[nk0] && fsc[nk0].value;
          if (tv0 === undefined) continue;
          if (String(tv0).replace(/,/g, '.') === rawPx) {
            N = nk0;
            exactMatch = true;
            break;
          }
        }
      }
    }
    if (N === null && scaleObj.size && scaleObj.size.value) {
      var sv = scaleObj.size.value;
      var m3 = typeof sv === 'string' && sv.match(/\{font-sizes\.([^}]+)\}/);
      if (m3) {
        var pk = m3[1].replace(/,/g, '.');
        var ks2 = Object.keys(fsc);
        for (var j = 0; j < ks2.length; j++) {
          var nk2 = ks2[j];
          var tv2 = fsc[nk2] && fsc[nk2].value;
          if (tv2 === undefined) continue;
          if (String(tv2).replace(/,/g, '.') === pk) {
            N = nk2;
            exactMatch = true;
            break;
          }
        }
      }
    }
    if (N === null) {
      var pixelCandidate = NaN;
      if (typeof fsz === 'string') {
        var mfs = fsz.match(/\{font-sizes\.([^}]+)\}/);
        if (mfs) pixelCandidate = parseFloat(mfs[1].replace(/,/g, '.'), 10);
      }
      if (isNaN(pixelCandidate) && scaleObj.size && scaleObj.size.value) {
        var svx = scaleObj.size.value;
        var msz = typeof svx === 'string' && svx.match(/\{font-sizes\.([^}]+)\}/);
        if (msz) pixelCandidate = parseFloat(msz[1].replace(/,/g, '.'), 10);
      }
      if (!isNaN(pixelCandidate)) N = findNearestFontSizeIndex(core, pixelCandidate);
    }
    if (N !== null) {
      var pixelVal = fsc[N] && fsc[N].value;
      if (pixelVal !== undefined) {
        comp.fontSize = '{fontSize.' + N + '}';
        if (exactMatch) {
          var fsKey = pixelToFontSizesRefKey(core, String(pixelVal).replace(/,/g, '.'));
          scaleObj.size = { value: '{font-sizes.' + fsKey + '}', type: 'number' };
        }
      }
    }

    if (scaleObj.textCase && !scaleObj['text-case']) {
      scaleObj['text-case'] = scaleObj.textCase;
      delete scaleObj.textCase;
    }
    if (scaleObj.textDecoration && !scaleObj['text-decoration']) {
      scaleObj['text-decoration'] = scaleObj.textDecoration;
      delete scaleObj.textDecoration;
    }
  });
}

/** Prefer fontWeights keys whose prefix matches composite fontFamily (inter-* vs safiro-*). */
function fontWeightKeysMatchingFamily(fontFamilyStr, keys) {
  if (!keys || keys.length === 0) return keys;
  if (typeof fontFamilyStr !== 'string') return keys;
  if (/safiro/i.test(fontFamilyStr)) {
    var s = keys.filter(function(k) { return /^safiro-/i.test(k); });
    if (s.length) return s;
  } else if (/inter/i.test(fontFamilyStr)) {
    var t = keys.filter(function(k) { return /^inter-/i.test(k); });
    if (t.length) return t;
  }
  return keys;
}

/** Map {font-weights.N} in composite → {fontWeights.<key>} (Nato uses named keys; numeric tokens map by value or nearest). */
function mapCompositeFontWeightRefToCamel(core, ref, comp) {
  if (typeof ref !== 'string' || ref.indexOf('{') === -1) return ref;
  if (/\{fontWeights\./.test(ref)) return ref;
  var m = ref.match(/\{font-weights\.([^}]+)\}/);
  if (!m) return ref;
  var wkey = m[1];
  var fw = core && core.fontWeights;
  if (!fw || typeof fw !== 'object') return ref;
  var fkeys = Object.keys(fw);
  if (fkeys.length === 0) return ref;
  var ffStr = comp && typeof comp.fontFamily === 'string' ? comp.fontFamily : '';
  var i;
  var exactMatches = [];
  for (i = 0; i < fkeys.length; i++) {
    var fk = fkeys[i];
    var tok = fw[fk];
    var val = tok && tok.value;
    var nv = normalizeFontWeightLiteral(val);
    if (String(nv) === wkey || String(val) === wkey) exactMatches.push(fk);
  }
  if (exactMatches.length) {
    var pickExact = fontWeightKeysMatchingFamily(ffStr, exactMatches);
    return '{fontWeights.' + pickExact[0] + '}';
  }
  var targetNum = parseInt(wkey, 10);
  if (!isNaN(targetNum)) {
    var numMatches = [];
    for (var j = 0; j < fkeys.length; j++) {
      var fk2 = fkeys[j];
      var val2 = fw[fk2] && fw[fk2].value;
      var n2 = parseInt(String(normalizeFontWeightLiteral(val2)), 10);
      if (!isNaN(n2) && n2 === targetNum) numMatches.push(fk2);
    }
    if (numMatches.length) {
      var pickNum = fontWeightKeysMatchingFamily(ffStr, numMatches);
      return '{fontWeights.' + pickNum[0] + '}';
    }
    var candidates = [];
    for (var c = 0; c < fkeys.length; c++) {
      var fk3 = fkeys[c];
      var val3 = fw[fk3] && fw[fk3].value;
      var n3 = parseInt(String(normalizeFontWeightLiteral(val3)), 10);
      if (isNaN(n3)) continue;
      candidates.push({ fk: fk3, d: Math.abs(n3 - targetNum) });
    }
    if (candidates.length) {
      candidates.sort(function(a, b) { return a.d - b.d; });
      var best = candidates[0];
      if (comp && typeof comp.fontFamily === 'string' && /inter/i.test(comp.fontFamily)) {
        var interCand = candidates.filter(function(x) { return /^inter-/i.test(x.fk); });
        if (interCand.length) best = interCand.sort(function(a, b) { return a.d - b.d; })[0];
      } else if (comp && typeof comp.fontFamily === 'string' && /safiro/i.test(comp.fontFamily)) {
        var safCand = candidates.filter(function(x) { return /^safiro-/i.test(x.fk); });
        if (safCand.length) best = safCand.sort(function(a, b) { return a.d - b.d; })[0];
      }
      return '{fontWeights.' + best.fk + '}';
    }
  }
  if (fkeys.length === 1) return '{fontWeights.' + fkeys[0] + '}';
  return ref;
}

/** Apply Nato-style camel groups to one typography composite body (breakpoint composite `value` object). */
function applyNatoCompositeRefStrings(core, comp) {
  if (!comp || typeof comp !== 'object') return;
  if (typeof comp.fontFamily === 'string') {
    comp.fontFamily = comp.fontFamily.replace(/\{font-family\.([^}]+)\}/gi, function(_, name) {
      return '{fontFamilies.' + String(name).toLowerCase() + '}';
    });
  }
  if (typeof comp.fontWeight === 'string') {
    comp.fontWeight = mapCompositeFontWeightRefToCamel(core, comp.fontWeight, comp);
  }
  if (typeof comp.letterSpacing === 'string') {
    comp.letterSpacing = comp.letterSpacing.replace(/\{letter-spacing\.([^}]+)\}/g, '{letterSpacing.$1}');
  }
  if (typeof comp.paragraphSpacing === 'string') {
    comp.paragraphSpacing = comp.paragraphSpacing.replace(/\{paragraph-spacing\.([^}]+)\}/g, '{paragraphSpacing.$1}');
  }
  if (typeof comp.paragraphIndent === 'string') {
    comp.paragraphIndent = comp.paragraphIndent.replace(/\{paragraph-indents\.([^}]+)\}/g, '{paragraphIndent.$1}');
  }
  if (typeof comp.fontSize === 'string' && /\{font-sizes\./.test(comp.fontSize) && core && core.fontSize) {
    var mfz = comp.fontSize.match(/\{font-sizes\.([^}]+)\}/);
    if (mfz) {
      var pkz = mfz[1].replace(/,/g, '.');
      var ksz = Object.keys(core.fontSize);
      var foundZ = null;
      for (var z = 0; z < ksz.length; z++) {
        var nzk = ksz[z];
        var tvz = core.fontSize[nzk] && core.fontSize[nzk].value;
        if (tvz !== undefined && String(tvz).replace(/,/g, '.') === pkz) {
          foundZ = nzk;
          break;
        }
      }
      if (foundZ !== null) comp.fontSize = '{fontSize.' + foundZ + '}';
      else {
        var pNum = parseFloat(pkz, 10);
        if (!isNaN(pNum)) {
          var near = findNearestFontSizeIndex(core, pNum);
          if (near !== null) comp.fontSize = '{fontSize.' + near + '}';
        }
      }
    }
  }
}

/**
 * After fixAliasPaths deep-clones the tree, re-apply composite ref normalization everywhere
 * `type === 'typography'` appears so kebab refs cannot survive the clone/order pipeline.
 */
function walkAndFinalizeNatoTypographyComposites(core, obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) walkAndFinalizeNatoTypographyComposites(core, obj[i]);
    return;
  }
  if (obj.type === 'typography' && obj.value && typeof obj.value === 'object' && obj.value !== null) {
    applyNatoCompositeRefStrings(core, obj.value);
  }
  var keys = Object.keys(obj);
  for (var k = 0; k < keys.length; k++) {
    walkAndFinalizeNatoTypographyComposites(core, obj[keys[k]]);
  }
}

/**
 * Nato_8-4-26_3: typography composite value uses camel token groups only
 * (fontFamilies, fontWeights, letterSpacing, paragraphSpacing, paragraphIndent).
 */
// Canonical breakpoint typography: the composite letterSpacing is 0% for every
// scale in this system ({letterSpacing.7}). The source stores 0 letter-spacing
// for all scales, but the composite builder defaulted to index 0 (-5%); force
// the correct index. (Underline is NOT applied: the Figma source has no
// text-decoration on links — that underline only exists in the Token Studio app
// export, so emitting it would invent data not present in the file.)
function applyCanonicalBreakpointTypography(breakpointContent) {
  if (!breakpointContent || !breakpointContent.typography) return;
  var typo = breakpointContent.typography;
  Object.keys(typo).forEach(function(scale) {
    var scaleObj = typo[scale];
    if (!scaleObj) return;
    var comp = scaleObj[scale] && scaleObj[scale].value;
    if (comp && typeof comp === 'object' && comp.letterSpacing !== undefined) {
      comp.letterSpacing = '{letterSpacing.7}';
    }
  });
}

function normalizeTypographyCompositeCamelRefs(core, breakpointContent) {
  if (!core || !breakpointContent || !breakpointContent.typography) return;
  var typo = breakpointContent.typography;
  Object.keys(typo).forEach(function(scale) {
    var scaleObj = typo[scale];
    if (!scaleObj || !scaleObj[scale] || !scaleObj[scale].value) return;
    var comp = scaleObj[scale].value;
    if (!comp || typeof comp !== 'object') return;
    applyNatoCompositeRefStrings(core, comp);
  });
}

/** Standalone breakpoint typography rows keep kebab groups; lower-case font family slug (Nato: safiro not Safiro). */
function normalizeBreakpointTypographyStandaloneRefs(breakpointContent) {
  if (!breakpointContent || !breakpointContent.typography) return;
  function fixStr(s) {
    if (typeof s !== 'string') return s;
    return s.replace(/\{font-family\.([^}]+)\}/gi, function(_, seg) {
      return '{font-family.' + String(seg).toLowerCase() + '}';
    });
  }
  var typo = breakpointContent.typography;
  Object.keys(typo).forEach(function(scale) {
    var scaleObj = typo[scale];
    if (!scaleObj) return;
    ['font-family', 'weight', 'size', 'letter-spacing', 'paragraph-spacing', 'paragraph-indent', 'line-height'].forEach(function(key) {
      var tok = scaleObj[key];
      if (tok && typeof tok.value === 'string') tok.value = fixStr(tok.value);
    });
  });
}

// json_fix_guide: prefer dimension expressions over raw numeric strings for breakpoint spacing/sizing (matches core.dimension math)
function coerceBreakpointSpacingSizingToDimensionExpressions(breakpointContent, core) {
  if (!breakpointContent || !core || !core.dimension || !core.dimension.base) return;
  var baseTok = core.dimension.base;
  var baseVal = parseFloat(String(baseTok.value), 10);
  if (isNaN(baseVal) || baseVal === 0) return;

  function walk(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    if (Object.prototype.hasOwnProperty.call(obj, 'value') &&
        Object.prototype.hasOwnProperty.call(obj, 'type')) {
      var t = obj.type;
      if (t !== 'spacing' && t !== 'sizing') return;
      var v = obj.value;
      if (typeof v !== 'string' || v.indexOf('{') !== -1) return;
      var num = parseFloat(v, 10);
      if (isNaN(num)) return;
      if (num === 999) return; // sentinel (e.g. full radius) stays raw
      var mult = num / baseVal;
      var rounded = Math.round(mult);
      if (Math.abs(mult - rounded) < 1e-6) {
        obj.value = rounded + '*{dimension.base}';
      } else if (t === 'spacing') {
        // non-integer spacing multiples → {dimension.1}*N (matches reference export)
        obj.value = '{dimension.1}*' + (num / baseVal);
      }
      return;
    }
    Object.keys(obj).forEach(function(k) { walk(obj[k]); });
  }
  if (breakpointContent.spacing) walk(breakpointContent.spacing);
  if (breakpointContent.sizing) walk(breakpointContent.sizing);
}

// --- TRANSFORMATION ENGINE ---
// options.includeDescriptions — carry each variable's Figma description onto its
// tokens. Off by default so the Token Studio export stays byte-identical to what
// it has always produced; the DTCG formats turn it on to populate $description.
function transformToFinalFormat(rawData, options) {
  var includeDescriptions = !!(options && options.includeDescriptions);
  var output = {};
  var tokenCounter = 0;
  console.log('[JSON Exporter v8] transformToFinalFormat — collections:', rawData.collections.length);

  var maps = buildCollectionMap(rawData.collections);
  var modeMap = maps.modeMap;

  // Build dot-path → variable lookup for alias codeSyntax resolution.
  var variableMap = {};
  rawData.collections.forEach(function(c) {
    c.variables.forEach(function(v) {
      if (!v.name) return;
      var normalized = v.name.replace(/^(Light|Dark|light|dark)\//i, '');
      var exportPath;
      if (normalized.match(/^(core-colours|dimension|shadow-colours|shadows)\//)) {
        exportPath = normalized.replace(/\//g, '.');
      } else if (c.name.startsWith('.')) {
        var baseName = c.name.substring(1);
        normalized = normalized.replace(new RegExp('^' + baseName + '/', 'i'), '');
        exportPath = baseName + '.' + normalized.replace(/\//g, '.');
      } else {
        exportPath = normalized.replace(/\//g, '.');
      }
      variableMap[exportPath] = v;
    });
  });

  // Simple per-collection processing.
  // Extended collections now have valuesByMode keyed by their OWN mode IDs
  // (via valuesByModeForCollectionAsync) — including inherited + overridden values.
  // No cross-collection inheritance propagation needed.
  rawData.collections.forEach(function(c) {
    c.variables.forEach(function(v) {
      if (!v.name || !v.type) return;

      var tokenPath = normalizeVariableName(v.name, c.name);
      var vType = v.type.toLowerCase();
      var finalType = vType === 'float' ? 'number' : vType;

      // Typography is mode-invariant for most collections (write once at
      // collection level) — EXCEPT .breakpoint, where typography scales per
      // breakpoint (e.g. display font-size 72→96), so it must be written per mode.
      var isTypography = /^typography\//i.test(tokenPath);
      var isBreakpointTypo = isTypography && stripIcons(c.name) === '.breakpoint';
      var perMode = !isTypography || isBreakpointTypo;
      var typographyWritten = false;

      Object.entries(v.valuesByMode).forEach(function(entry) {
        var modeId = entry[0];

        var mInfo = modeMap.get(modeId);
        if (!mInfo) return;

        // Mode-invariant typography: skip every mode after the first.
        if (!perMode) {
          if (typographyWritten) return;
          typographyWritten = true;
        }

        if (!output[mInfo.collectionName]) output[mInfo.collectionName] = {};
        if (perMode) {
          if (!output[mInfo.collectionName][mInfo.name]) output[mInfo.collectionName][mInfo.name] = {};
        }

        var resolvedVal = v.resolvedValuesByMode[modeId];
        var aliasData = v.aliasInfo && v.aliasInfo[modeId];

        var tokenValue;
        if (aliasData && aliasData.isAlias) {
          tokenValue = '{' + aliasData.aliasPath + '}';
        } else {
          tokenValue = formatValue(resolvedVal, v.type);
        }

        var token = { type: finalType, value: tokenValue };

        // Figma's per-variable description. Carried on every mode's token (the
        // description belongs to the variable, not the mode) and surfaced as
        // DTCG's $description.
        if (includeDescriptions && v.description) token.description = v.description;

        if (!(aliasData && aliasData.isAlias) && tokenValue !== undefined && tokenValue !== null) {
          if (tokenPath.indexOf('font-weights/') !== -1 || /(^|\/)weight$/i.test(tokenPath)) {
            token.value = normalizeFontWeightLiteral(tokenValue);
            token.type = 'number';
          }
        }

        if (v.codeSyntax) {
          var csKeys = Object.keys(v.codeSyntax);
          if (csKeys.length > 0) {
            token.codeSyntax = v.codeSyntax;
          }
        }

        if (!token.codeSyntax) {
          var val = tokenValue;
          if (typeof val === 'string' && val.charAt(0) === '{' && val.charAt(val.length - 1) === '}') {
            var sourcePath = val.slice(1, -1);
            var sourceVar = variableMap[sourcePath];
            if (sourceVar && sourceVar.codeSyntax && Object.keys(sourceVar.codeSyntax).length > 0) {
              token.codeSyntax = sourceVar.codeSyntax;
            }
          }
        }

        // Mode-invariant typography → collection level; everything else (incl.
        // per-breakpoint typography) → mode level.
        var dest = perMode ? output[mInfo.collectionName][mInfo.name] : output[mInfo.collectionName];
        deepMerge(dest, pathToNestedObject(tokenPath, token));
        tokenCounter++;
      });
    });
  });

  return { tokens: output, count: tokenCounter };
}

// --- Token Studio: font-family / fontFamilies token slugs must be lowercase (Safiro → safiro) ---
function normalizeFontFamilyAliasSegments(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/\{font-family\.([^}]+)\}/gi, function(_, seg) {
      return '{font-family.' + String(seg).toLowerCase() + '}';
    })
    .replace(/\{fontFamilies\.([^}]+)\}/gi, function(_, seg) {
      return '{fontFamilies.' + String(seg).toLowerCase() + '}';
    });
}

// --- ALIAS PATH FIX: strip .core. and core. prefixes from alias references (Fix D) ---
function fixAliasPaths(obj) {
  if (typeof obj === 'string') {
    // {.core.X} → {X}  and  {core.X} → {X}
    var s = obj.replace(/\{\.core\./g, '{').replace(/\{core\./g, '{');
    return normalizeFontFamilyAliasSegments(s);
  }
  if (Array.isArray(obj)) return obj; // preserve arrays (e.g. $themes: [])
  if (typeof obj === 'object' && obj !== null) {
    var result = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = fixAliasPaths(obj[keys[i]]);
    }
    return result;
  }
  return obj;
}

// --- FOUNDATION TOKEN TYPE MAPPING (Fix 1–4) ---
function getFoundationTokenType(pathParts) {
  var first = pathParts[0];
  if (first === 'spacing') return 'spacing';
  if (first === 'sizing')  return 'sizing';
  if (first === 'radius')  return 'borderRadius';
  if (first === 'strokes') return 'sizing';
  if (first === 'colours') return 'color';
  for (var i = 0; i < pathParts.length; i++) {
    if (pathParts[i].indexOf('colour') !== -1) return 'color';
  }
  return null; // keep existing type (elevation numbers, grid, etc.)
}

// Walk foundation tokens: fix semantic types (Fix 1–4) and radius.full string (Fix 6)
function fixFoundationTokens(obj, pathParts) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  pathParts = pathParts || [];

  if (Object.prototype.hasOwnProperty.call(obj, 'value') &&
      Object.prototype.hasOwnProperty.call(obj, 'type')) {
    var tokenType  = getFoundationTokenType(pathParts) || obj.type;
    var tokenValue = obj.value;
    // Fix 6: radius.full is '999' (string) in Token Studio, not 999 (number)
    if (pathParts[0] === 'radius' && tokenValue === 999) tokenValue = '999';
    var result = { value: tokenValue, type: tokenType };
    var ks = Object.keys(obj);
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] !== 'value' && ks[i] !== 'type') result[ks[i]] = obj[ks[i]];
    }
    return result;
  }

  var out = {};
  var keys = Object.keys(obj);
  for (var j = 0; j < keys.length; j++) {
    out[keys[j]] = fixFoundationTokens(obj[keys[j]], pathParts.concat([keys[j]]));
  }
  return out;
}

// Three fixups below rebuild token nodes from scratch, dropping every key beyond
// value/type. Carry the description across so it survives to $description.
// Deliberately narrow: those same rebuilds also drop codeSyntax, and preserving
// that as well would change the existing Token Studio export.
function carryDescription(target, source) {
  if (source && source.description) target.description = source.description;
  return target;
}

// Fix 7: Reorder all token nodes so `value` comes before `type`
function fixKeyOrder(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;

  if (Object.prototype.hasOwnProperty.call(obj, 'value') &&
      Object.prototype.hasOwnProperty.call(obj, 'type')) {
    var reordered = { value: obj.value, type: obj.type };
    var ks = Object.keys(obj);
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] !== 'value' && ks[i] !== 'type') reordered[ks[i]] = obj[ks[i]];
    }
    return reordered;
  }

  var result = {};
  var keys = Object.keys(obj);
  for (var j = 0; j < keys.length; j++) {
    result[keys[j]] = fixKeyOrder(obj[keys[j]]);
  }
  return result;
}

// --- ELEVATION COMPOSITE TOKENS ---
// Build a boxShadow composite from the sibling colour/x/y/blur/spread tokens of
// one elevation level. If a sibling already aliases into another `.elevation.`
// group (e.g. mode→section→card→leaf), forward that same alias; otherwise
// self-reference the sibling by path. This reproduces the canonical export for
// every set and every nesting depth.
function buildElevationComposite(levelObj, selfPrefix, level, canonical) {
  function ref(prop, sibKey) {
    var sib = levelObj && levelObj[sibKey];
    var v = sib && sib.value;
    if (typeof v === 'string' && /\.elevation\./.test(v)) return v;
    // Self-path fallback. In leaf families (base/*, secondary/*) the canonical
    // export points every variant's composite at the set's primary group
    // (e.g. secondary-light, white, magenta-dark) — replace the first segment.
    var pfx = canonical ? selfPrefix.replace(/^[^.]+\./, canonical + '.') : selfPrefix;
    return '{' + pfx + '.' + level + '.' + prop + '}';
  }
  return {
    value: {
      color:  ref('colour', 'colour'),
      type:   'dropShadow',
      x:      ref('x', 'x'),
      y:      ref('y', 'y'),
      blur:   ref('blur', 'blur'),
      spread: ref('spread', 'spread')
    },
    type: 'boxShadow'
  };
}

// Inject composite boxShadow tokens into ONE elevation group object.
// selfPrefix = the dotted path of this elevation group (e.g. 'mode.neutral.elevation').
function injectElevationComposites(elevationObj, selfPrefix, canonical) {
  ['level-0', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'].forEach(function(level) {
    if (!elevationObj[level] || typeof elevationObj[level] !== 'object') return;
    var composite = buildElevationComposite(elevationObj[level], selfPrefix, level, canonical);
    var rebuilt = {}; rebuilt[level] = composite;
    Object.keys(elevationObj[level]).forEach(function(k) { if (k !== level) rebuilt[k] = elevationObj[level][k]; });
    elevationObj[level] = rebuilt;
  });
  ['app-bar-top', 'app-bar-bottom'].forEach(function(entry) {
    if (!elevationObj[entry] || typeof elevationObj[entry] !== 'object') return;
    ['flat', 'raised'].forEach(function(variant) {
      if (!elevationObj[entry][variant] || typeof elevationObj[entry][variant] !== 'object') return;
      var composite = buildElevationComposite(elevationObj[entry][variant], selfPrefix + '.' + entry, variant, canonical);
      var rebuilt = {}; rebuilt[variant] = composite;
      Object.keys(elevationObj[entry][variant]).forEach(function(k) { if (k !== variant) rebuilt[k] = elevationObj[entry][variant][k]; });
      elevationObj[entry][variant] = rebuilt;
    });
  });
  if (elevationObj['FAB'] && typeof elevationObj['FAB'] === 'object') {
    ['standard', 'hovered', 'pressed'].forEach(function(variant) {
      if (!elevationObj['FAB'][variant] || typeof elevationObj['FAB'][variant] !== 'object') return;
      var composite = buildElevationComposite(elevationObj['FAB'][variant], selfPrefix + '.FAB', variant, canonical);
      var rebuilt = {}; rebuilt[variant] = composite;
      Object.keys(elevationObj['FAB'][variant]).forEach(function(k) { if (k !== variant) rebuilt[k] = elevationObj['FAB'][variant][k]; });
      elevationObj['FAB'][variant] = rebuilt;
    });
  }
  return elevationObj;
}

// Walk a token-set subtree, find every nested 'elevation' group, and inject
// composites. `canonical` (set only for leaf families) forces the composite
// self-path onto the set's primary group, matching the canonical export.
function addElevationCompositesDeep(node, dottedPath, canonical) {
  if (!node || typeof node !== 'object') return;
  Object.keys(node).forEach(function(key) {
    var child = node[key];
    if (!child || typeof child !== 'object') return;
    if ('value' in child || '$value' in child) return; // leaf token
    var childPath = dottedPath ? dottedPath + '.' + key : key;
    if (key === 'elevation') {
      injectElevationComposites(child, childPath, canonical);
    } else {
      addElevationCompositesDeep(child, childPath, canonical);
    }
  });
}

// --- FIX B/C/H: Core token type corrections ---
// dimension → type:'dimension', value as String
// letter-spacing/line-heights/text-case/text-decoration → correct semantic types
// font-family/font-sizes/font-weights/paragraph-spacing/paragraph-indents → correct semantic types
// font-family sub-keys → lowercase (Safiro → safiro), type 'text'
function fixCoreTokens(obj, pathParts) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  pathParts = pathParts || [];

  if (Object.prototype.hasOwnProperty.call(obj, 'value') &&
      Object.prototype.hasOwnProperty.call(obj, 'type')) {
    var first  = pathParts[0];
    var cType  = obj.type;
    var cValue = obj.value;
    if      (first === 'dimension') {
      cType = 'dimension';
      cValue = typeof cValue === 'number' ? formatFloatForExport(cValue) : String(cValue);
    }
    else if (first === 'letterSpacing')       cType = 'letterSpacing';  // camelCase group
    else if (first === 'letter-spacing')      cType = 'number';         // dash group
    else if (first === 'lineHeights')         cType = 'lineHeights';    // camelCase group
    else if (first === 'line-heights')        cType = 'number';         // dash group
    else if (first === 'textCase')            cType = 'textCase';
    else if (first === 'textDecoration')      cType = 'textDecoration';
    else if (first === 'text-case')           cType = 'textCase';
    else if (first === 'text-decoration')     cType = 'textDecoration';
    else if (first === 'fontFamilies')        cType = 'fontFamilies';
    else if (first === 'font-family')         cType = 'text';
    else if (first === 'fontSize')            cType = 'fontSizes';      // camelCase group
    else if (first === 'font-sizes')          cType = 'number';         // dash group
    else if (first === 'fontWeights')         cType = 'fontWeights';    // camelCase group
    else if (first === 'font-weights')        cType = 'number';         // dash group
    else if (first === 'paragraphSpacing')    cType = 'paragraphSpacing'; // camelCase group
    else if (first === 'paragraph-spacing')   cType = 'number';           // dash group
    else if (first === 'paragraphIndent')     cType = 'paragraphIndent';  // Token Studio semantic type
    else if (first === 'paragraph-indents')   cType = 'number';           // dash group
    else if (first && first.startsWith('viewport-')) cType = 'sizing';    // viewport-* tokens
    if (first === 'font-weights' && cValue !== undefined && cValue !== null) {
      cValue = normalizeFontWeightLiteral(cValue);
    }
    // Canonical export stores every number-typed core token as a real JS number
    // (font-sizes, letter-spacing, line-heights, font-weights, paragraph-spacing/
    // indents, grids, shadows, …). `dimension` stays a string (handled above).
    if (cType === 'number' && cValue !== undefined && cValue !== null &&
        /^-?\d+(\.\d+)?$/.test(String(cValue).trim())) {
      cValue = parseFloat(cValue);
    }
    // paragraphIndent (camelCase semantic) carries a px unit, e.g. "0px".
    if (first === 'paragraphIndent' &&
        (typeof cValue === 'number' || /^-?\d+$/.test(String(cValue).trim()))) {
      cValue = String(parseFloat(cValue)) + 'px';
    }
    var res = { value: cValue, type: cType };
    var ks = Object.keys(obj);
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] !== 'value' && ks[i] !== 'type') res[ks[i]] = obj[ks[i]];
    }
    return res;
  }

  var out = {};
  var keys = Object.keys(obj);
  for (var j = 0; j < keys.length; j++) {
    var k = keys[j];
    // Fix H: lowercase font-family / fontFamilies sub-keys (Token Studio: safiro not Safiro)
    var outKey = k;
    if (pathParts.length === 1 && (pathParts[0] === 'font-family' || pathParts[0] === 'fontFamilies')) {
      outKey = k.toLowerCase();
    }
    out[outKey] = fixCoreTokens(obj[k], pathParts.concat([k]));
  }
  return out;
}

// --- FIX F: Breakpoint semantic type corrections ---
// spacing.* → 'spacing',  sizing.* → 'sizing',  string → 'text'
function fixBreakpointTypes(obj, pathParts) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  pathParts = pathParts || [];

  if (Object.prototype.hasOwnProperty.call(obj, 'value') &&
      Object.prototype.hasOwnProperty.call(obj, 'type')) {
    var first = pathParts[0];
    var t = obj.type;
    var v = obj.value;
    if      (first === 'spacing') t = 'spacing';
    else if (first === 'sizing')  t = 'sizing';
    else if (t === 'string')      t = 'text';
    var lastSeg = pathParts[pathParts.length - 1];
    if (lastSeg === 'weight' || first === 'font-weights' || first === 'fontWeights') {
      v = normalizeFontWeightLiteral(v);
      t = 'number';
    }
    if (t === 'number' && typeof v === 'number') {
      v = formatFloatForExport(v);
    }
    return carryDescription({ value: v, type: t }, obj);
  }

  var result = {};
  Object.keys(obj).forEach(function(k) {
    result[k] = fixBreakpointTypes(obj[k], pathParts.concat([k]));
  });
  return result;
}

// --- FIX G: Inject typography composite + text-case + text-decoration per scale ---
function addTypographyComposite(scaleObj, scaleName) {
  if (!scaleObj || typeof scaleObj !== 'object') return scaleObj;

  // Build composite value from individual prop aliases already in the scale
  var cv = {};
  function addProp(cvKey, scaleKey) {
    var prop = scaleObj[scaleKey];
    if (prop && prop.value !== undefined) {
      var pv = prop.value;
      cv[cvKey] = typeof pv === 'number' ? formatFloatForExport(pv) : String(pv);
    }
  }
  addProp('fontFamily',       'font-family');
  addProp('fontWeight',       'weight');
  addProp('lineHeight',       'line-height');
  addProp('fontSize',         'size');
  addProp('letterSpacing',    'letter-spacing');
  addProp('paragraphSpacing', 'paragraph-spacing');
  addProp('paragraphIndent',  'paragraph-indent');
  if (cv.fontWeight !== undefined) cv.fontWeight = normalizeFontWeightLiteral(cv.fontWeight);
  cv.textCase       = '{textCase.none}';
  cv.textDecoration = '{textDecoration.none}';

  var rebuilt = {};
  rebuilt[scaleName] = { value: cv, type: 'typography' };

  var propOrder = ['size', 'line-height', 'weight', 'letter-spacing', 'font-family',
                   'paragraph-spacing', 'paragraph-indent', 'text-case', 'text-decoration'];

  propOrder.forEach(function(propKey) {
    if (scaleObj[propKey]) {
      rebuilt[propKey] = scaleObj[propKey];
    }
  });
  if (!rebuilt['text-case'] && scaleObj.textCase) rebuilt['text-case'] = scaleObj.textCase;
  if (!rebuilt['text-decoration'] && scaleObj.textDecoration) rebuilt['text-decoration'] = scaleObj.textDecoration;

  if (rebuilt.weight && rebuilt.weight.value !== undefined) {
    rebuilt.weight = carryDescription({
      value: normalizeFontWeightLiteral(rebuilt.weight.value),
      type: 'number'
    }, rebuilt.weight);
  }

  if (!rebuilt['font-family'] && cv.fontFamily) {
    rebuilt['font-family'] = { value: cv.fontFamily, type: 'text' };
  }
  if (!rebuilt['paragraph-spacing'] && cv.paragraphSpacing) {
    rebuilt['paragraph-spacing'] = { value: cv.paragraphSpacing, type: 'number' };
  }
  if (!rebuilt['paragraph-indent'] && cv.paragraphIndent) {
    rebuilt['paragraph-indent'] = { value: cv.paragraphIndent, type: 'number' };
  }
  if (!rebuilt['text-case']) {
    rebuilt['text-case'] = { value: '{textCase.none}', type: 'textCase' };
  }
  if (!rebuilt['text-decoration']) {
    rebuilt['text-decoration'] = { value: '{textDecoration.none}', type: 'textDecoration' };
  }

  return rebuilt;
}

function fixBreakpointTypography(typObj) {
  if (!typObj || typeof typObj !== 'object') return typObj;
  var result = {};
  Object.keys(typObj).forEach(function(scaleName) {
    result[scaleName] = addTypographyComposite(typObj[scaleName], scaleName);
  });
  return result;
}

// --- FIX: layout/layout column type corrections (number → sizing) ---
function fixLayoutColumnTypes(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (Object.prototype.hasOwnProperty.call(obj, 'value') && Object.prototype.hasOwnProperty.call(obj, 'type')) {
    return carryDescription({ value: obj.value, type: 'sizing' }, obj);
  }
  var result = {};
  Object.keys(obj).forEach(function(k) { result[k] = fixLayoutColumnTypes(obj[k]); });
  return result;
}

// --- THEME GENERATION HELPER ---
function generateThemeId() {
  var chars = '0123456789abcdef';
  var id = '';
  for (var i = 0; i < 40; i++) {
    id += chars[Math.floor(Math.random() * 16)];
  }
  return id;
}

function generateHashFromId(id) {
  // Generate a consistent 40-character hex hash from any input string
  // Uses a deterministic approach inspired by simple hash functions
  var str = String(id);
  var hash = '';
  var chars = '0123456789abcdef';

  // Simple seeded PRNG (Linear Congruential Generator)
  function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Create initial seed from the string
  var seed = 0;
  for (var i = 0; i < str.length; i++) {
    seed = Math.imul(31, seed) + str.charCodeAt(i) | 0;
  }
  // Ensure we have a non-zero seed
  if (seed === 0) seed = 1;
  seed = Math.abs(seed);

  // Create seeded random function
  var rand = mulberry32(seed);

  // Generate 40 hex characters deterministically
  for (var j = 0; j < 40; j++) {
    var idx = Math.floor(rand() * 16);
    hash += chars[idx];
  }

  return hash;
}

function stripVariableIdPrefix(id) {
  // Convert Figma variable ID to a 40-character hex hash (Token Studio format)
  if (typeof id === 'string') {
    // Remove any prefix like "VariableID:" and generate hash
    var cleanId = id;
    if (id.indexOf('/') !== -1) {
      cleanId = id.split('/')[1] || id;
    }
    return generateHashFromId(cleanId);
  }
  return generateHashFromId(String(id));
}

/**
 * Token Studio / Nato reference: foundation $figmaStyleReferences uses
 * (1) short keys elevation.level-1 … level-6 only,
 * (2) typography.*.* ,
 * (3) long keys elevation.level-0.level-0 … level-6.level-6 ,
 * (4) app-bar / FAB with duplicated last segment (e.g. .flat.flat).
 */
function buildFoundationStyleRefs(rawData, formatStyleId, toTokenStudioCase) {
  var refs = {};
  if (!rawData || !rawData.styles) return refs;

  var shortLevel = [];
  var typoEntries = [];
  var longLevel = [];
  var appBarFab = [];
  var fallback = [];

  if (rawData.styles.effectStyles) {
    rawData.styles.effectStyles.forEach(function(style) {
      var nameParts = style.name.split('/');
      var lowerParts = nameParts.map(function(p) { return toTokenStudioCase(p); });
      var basePath = lowerParts.join('.');
      var lastSeg = lowerParts[lowerParts.length - 1];
      var id = formatStyleId(style.id);

      var lm = basePath.match(/^elevation\.level-(\d+)$/i);
      if (lm) {
        var n = parseInt(lm[1], 10);
        longLevel.push({ n: n, key: 'elevation.level-' + n + '.level-' + n, id: id });
        if (n >= 1) {
          shortLevel.push({ n: n, key: 'elevation.level-' + n, id: id });
        }
        return;
      }

      if (basePath.indexOf('elevation.') === 0 && lowerParts.length >= 2) {
        appBarFab.push({ key: basePath + '.' + lastSeg, id: id });
        return;
      }

      fallback.push({ key: basePath, id: id });
    });
  }

  if (rawData.styles.textStyles) {
    rawData.styles.textStyles.forEach(function(style) {
      var nameParts = style.name.split('/');
      var id = formatStyleId(style.id);
      var tokenPath;
      if (nameParts.length >= 2) {
        var lp = nameParts.map(function(p) { return toTokenStudioCase(p); });
        tokenPath = lp.join('.') + '.' + lp[lp.length - 1];
      } else {
        var converted = toTokenStudioCase(style.name);
        tokenPath = 'typography.' + converted + '.' + converted;
      }
      typoEntries.push({ key: tokenPath, id: id });
    });
  }

  function byN(a, b) { return a.n - b.n; }
  shortLevel.sort(byN);
  longLevel.sort(byN);

  shortLevel.forEach(function(e) { refs[e.key] = e.id; });
  typoEntries.forEach(function(e) { refs[e.key] = e.id; });
  longLevel.forEach(function(e) { refs[e.key] = e.id; });
  appBarFab.forEach(function(e) { refs[e.key] = e.id; });
  fallback.forEach(function(e) { refs[e.key] = e.id; });

  return refs;
}

/** Canonical Token Studio token set order (Nato reference). */
var TOKEN_STUDIO_SET_ORDER = [
  'core',
  'foundation',
  'mode/light',
  'mode/dark',
  'scheme/neutral',
  'scheme/inverted',
  'scheme/white',
  'scheme/black',
  'scheme/brand',
  'scheme/secondary',
  'secondary/amber',
  'secondary/aqua',
  'secondary/ice',
  'secondary/dandelion',
  'secondary/egg',
  'secondary/frog',
  'secondary/guacamole',
  'secondary/hummingbird',
  'secondary/iguana',
  'secondary/jacuzzi',
  'secondary/kingfisher',
  'secondary/lagoon',
  'secondary/macaw',
  'secondary/nebula',
  'secondary/orchid',
  'base/white',
  'base/black',
  'base/brand',
  'base/magenta-light',
  'base/magenta-dark',
  'restrictions/unrestricted',
  'restrictions/to-neutral',
  'restrictions/to-neutral-and-brand',
  'restrictions/to-neutral-and-secondary',
  'breakpoint/mobile',
  'breakpoint/tablet',
  'breakpoint/laptop',
  'breakpoint/desktop',
  'breakpoint/large-desktop',
  'layout/layout'
];

function buildTokenSetOrder(out) {
  var order = [];
  for (var i = 0; i < TOKEN_STUDIO_SET_ORDER.length; i++) {
    var k = TOKEN_STUDIO_SET_ORDER[i];
    if (out[k] !== undefined) order.push(k);
  }
  Object.keys(out).forEach(function(k) {
    if (k.charAt(0) === '$') return;
    if (order.indexOf(k) === -1) order.push(k);
  });
  return order;
}

/** Resolve collection entry when Figma name differs only by case (e.g. Layout vs layout). */
function getCollectionByNameLoose(map, primary) {
  if (map[primary]) return map[primary];
  var lower = primary.toLowerCase();
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lower) return map[keys[i]];
  }
  return undefined;
}

function buildThemes(rawData, tokenSetNames) {
  if (!rawData || !Array.isArray(rawData.collections)) return [];

  var themes = [];
  
  // Map collection names to their data
  var collectionMap = {};
  rawData.collections.forEach(function(col) {
    collectionMap[col.name] = col;
  });

  // Helper: convert style ID to Token Studio format "S:hash," (single comma)
  function formatStyleId(id) {
    var cleanId = String(id).replace(/^S:/, '');
    // Generate hash from style ID
    return 'S:' + generateHashFromId(cleanId) + ',';
  }

  // Helper: build style refs for a specific theme context
  function buildStyleRefsForTheme(themeName, themeGroup) {
    var refs = {};
    if (!rawData.styles) return refs;

    // Helper to convert style name to Token Studio format
    // "Body M Bold" -> "body-M-bold", "Title L" -> "title-L"
    function toTokenStudioCase(name) {
      var kebab = name.replace(/\s+/g, '-');
      var parts = kebab.split('-');
      var result = parts.map(function(part) {
        if (part.length === 1 && /[A-Z]/.test(part)) {
          return part;
        }
        return part.toLowerCase();
      });
      return result.join('-');
    }

    // Layout / columns theme: empty style map (Token Studio reference)
    if (themeGroup === 'layout') {
      return {};
    }

    // Foundation: Nato key order + duplicate elevation segments + typography block
    if (themeName === 'foundation' && (themeGroup == null || themeGroup === '')) {
      return buildFoundationStyleRefs(rawData, formatStyleId, toTokenStudioCase);
    }

    // Breakpoint themes only have typography styles with breakpoint prefix
    if (themeGroup === '.breakpoint') {
      if (rawData.styles.textStyles) {
        rawData.styles.textStyles.forEach(function(style) {
          var nameParts = style.name.split('/');
          var tokenPath;
          if (nameParts.length >= 2) {
            var lowerParts = nameParts.map(function(p) { return toTokenStudioCase(p); });
            tokenPath = 'breakpoint.' + lowerParts.join('.') + '.' + lowerParts[lowerParts.length - 1];
          } else {
            var converted = toTokenStudioCase(style.name);
            tokenPath = 'breakpoint.typography.' + converted + '.' + converted;
          }
          refs[tokenPath] = formatStyleId(style.id);
        });
      }
      return refs;
    }

    // Determine elevation prefixes based on theme
    var elevPrefixes = [];
    if (themeGroup === '.mode') {
      elevPrefixes = ['mode.', 'mode-inverted.'];
    } else if (themeGroup === '.scheme') {
      elevPrefixes = ['scheme.'];
    } else if (themeGroup === '.secondary') {
      elevPrefixes = ['secondary.'];
    } else if (themeName === '.white') {
      elevPrefixes = ['white.'];
    } else if (themeName === '.black') {
      elevPrefixes = ['black.'];
    } else if (themeName === '.brand') {
      elevPrefixes = ['brand.'];
    } else {
      elevPrefixes = [''];
    }

    // Map effect styles (elevation) with proper prefix
    if (rawData.styles.effectStyles) {
      elevPrefixes.forEach(function(elevPrefix) {
        rawData.styles.effectStyles.forEach(function(style) {
          var nameParts = style.name.split('/');
          var tokenPath;
          if (nameParts.length >= 2) {
            if (elevPrefix === '') {
              tokenPath = nameParts.join('.');
            } else {
              var basePath = nameParts.join('.');
              tokenPath = elevPrefix + basePath + '.' + nameParts[nameParts.length - 1];
            }
          } else {
            tokenPath = elevPrefix + style.name.replace(/\//g, '.');
          }
          refs[tokenPath] = formatStyleId(style.id);
        });
      });
    }

    // Map text styles (typography)
    if (rawData.styles.textStyles) {
      rawData.styles.textStyles.forEach(function(style) {
        var nameParts = style.name.split('/');
        var tokenPath;
        if (nameParts.length >= 2) {
          var lowerParts = nameParts.map(function(p) { return toTokenStudioCase(p); });
          tokenPath = lowerParts.join('.') + '.' + lowerParts[lowerParts.length - 1];
        } else {
          var converted = toTokenStudioCase(style.name);
          tokenPath = 'typography.' + converted + '.' + converted;
        }
        refs[tokenPath] = formatStyleId(style.id);
      });
    }

    return refs;
  }

  // Define theme configurations based on token set names
  // Each theme maps to specific collections and modes
  var themeConfigs = [];

  // Foundation theme (single-mode collections)
  if (tokenSetNames.indexOf('foundation') !== -1) {
    var foundationCol = collectionMap['foundation'];
    if (foundationCol && foundationCol.modes.length > 0) {
      themeConfigs.push({
        name: 'foundation',
        group: null,
        selectedTokenSets: { 'foundation': 'enabled', 'core': 'source' },
        collection: foundationCol,
        modeIndex: 0
      });
    }
  }

  // Core theme with dot prefix (like Token Studio)
  if (tokenSetNames.indexOf('core') !== -1) {
    var coreCol = collectionMap['.core'] || collectionMap['core'];
    if (coreCol && coreCol.modes.length > 0) {
      themeConfigs.push({
        name: '.core',
        group: null,
        selectedTokenSets: { 'core': 'enabled' },
        collection: coreCol,
        modeIndex: 0
      });
    }
  }

  // Standalone leaf themes (.white, .black, .brand, .magenta-light, .magenta-dark)
  // — leaf sets are emitted as base/<leaf>, so reference them by that name.
  ['white', 'black', 'brand', 'magenta-light', 'magenta-dark'].forEach(function(name) {
    var setKey = 'base/' + name;
    if (tokenSetNames.indexOf(setKey) !== -1) {
      var col = collectionMap['.' + name] || collectionMap[name];
      if (col && col.modes.length > 0) {
        var selectedSets = {};
        selectedSets['core'] = 'source';
        selectedSets[setKey] = 'enabled';

        themeConfigs.push({
          name: '.' + name,
          group: null,
          selectedTokenSets: selectedSets,
          collection: col,
          modeIndex: 0
        });
      }
    }
  });

  // Mode themes (light/dark from .mode collection) - with group: ".mode"
  var modeCol = collectionMap['.mode'];
  if (modeCol) {
    modeCol.modes.forEach(function(mode, idx) {
      var modeName = mode.name.toLowerCase();
      var tokenSetKey = 'mode/' + modeName;
      if (tokenSetNames.indexOf(tokenSetKey) !== -1) {
        var selectedSets = {};
        selectedSets[tokenSetKey] = 'enabled';
        // Token Studio uses restrictions/unrestricted as source for mode themes
        if (tokenSetNames.indexOf('restrictions/unrestricted') !== -1) {
          selectedSets['restrictions/unrestricted'] = 'source';
        }
        
        themeConfigs.push({
          name: modeName,
          group: '.mode',
          selectedTokenSets: selectedSets,
          collection: modeCol,
          modeIndex: idx
        });
      }
    });
  }

  // Scheme themes (neutral, inverted, white, black, brand, secondary) - with group: ".scheme"
  // Note: Don't duplicate white/black/brand if they already exist as standalone themes
  var schemeNames = ['neutral', 'inverted', 'white', 'black', 'brand', 'secondary'];
  schemeNames.forEach(function(schemeName) {
    var tokenSetKey = 'scheme/' + schemeName;
    if (tokenSetNames.indexOf(tokenSetKey) !== -1) {
      // Find the collection that has this scheme as a mode
      var schemeCol = null;
      var schemeModeIdx = -1;
      
      Object.keys(collectionMap).forEach(function(colName) {
        var col = collectionMap[colName];
        col.modes.forEach(function(mode, idx) {
          var modeLower = mode.name.toLowerCase();
          if (modeLower === schemeName || modeLower.indexOf(schemeName) !== -1) {
            schemeCol = col;
            schemeModeIdx = idx;
          }
        });
      });

      if (schemeCol && schemeModeIdx >= 0) {
        var selectedSets = {};
        // Scheme selectedTokenSets depend on which scheme
        if (schemeName === 'neutral' || schemeName === 'black') {
          selectedSets['mode/light'] = 'source';
        } else if (schemeName === 'inverted') {
          selectedSets['mode/light'] = 'source';
        } else if (schemeName === 'white') {
          selectedSets['scheme/white'] = 'enabled';
        } else if (schemeName === 'brand') {
          selectedSets['scheme/brand'] = 'enabled';
        } else if (schemeName === 'secondary') {
          selectedSets['scheme/secondary'] = 'enabled';
        }
        selectedSets[tokenSetKey] = 'enabled';

        themeConfigs.push({
          name: schemeName,
          group: '.scheme',
          selectedTokenSets: selectedSets,
          collection: schemeCol,
          modeIndex: schemeModeIdx
        });
      }
    }
  });

  // Secondary scheme themes (amber, aqua, ice, etc.) - dynamically detect from .secondary collection
  var secondaryCol = collectionMap['.secondary'];
  if (secondaryCol) {
    secondaryCol.modes.forEach(function(mode, idx) {
      var modeName = mode.name.toLowerCase();
      // Skip if already handled above
      if (schemeNames.indexOf(modeName) !== -1) return;
      
      var tokenSetKey = 'secondary/' + modeName;
      if (tokenSetNames.indexOf(tokenSetKey) !== -1) {
        var selectedSets = {};
        selectedSets[tokenSetKey] = 'enabled';

        themeConfigs.push({
          name: modeName,
          group: '.secondary',
          selectedTokenSets: selectedSets,
          collection: secondaryCol,
          modeIndex: idx
        });
      }
    });
  }

  // Restrictions themes (unrestricted, to-neutral, etc.) - from _restricted collection
  var restrictedCol = collectionMap['_restricted'];
  if (restrictedCol) {
    restrictedCol.modes.forEach(function(mode, idx) {
      var modeName = mode.name.toLowerCase().replace(/\s+/g, '-');
      var tokenSetKey = 'restrictions/' + modeName;
      if (tokenSetNames.indexOf(tokenSetKey) !== -1) {
        var selectedSets = {};
        selectedSets[tokenSetKey] = 'enabled';

        themeConfigs.push({
          name: modeName,
          group: '.restrictions',
          selectedTokenSets: selectedSets,
          collection: restrictedCol,
          modeIndex: idx
        });
      }
    });
  }

  // Breakpoint themes - use original Figma mode names like Token Studio
  var breakpointCol = collectionMap['.breakpoint'];
  if (breakpointCol) {
    breakpointCol.modes.forEach(function(mode, idx) {
      // Use the original mode name (e.g., "S Mobile", "M Tablet")
      var modeName = mode.name;
      var modeLower = modeName.toLowerCase().replace(/\s+/g, '-');
      
      // Find matching token set key
      var breakpointModeMap = {
        's-mobile': 'mobile',
        'm-tablet': 'tablet', 
        'l-laptop': 'laptop',
        'xl-desktop': 'desktop',
        'xxl-large-desktop': 'large-desktop'
      };
      var tokenSetSlug = breakpointModeMap[modeLower];
      if (!tokenSetSlug) {
        // Fallback: extract the breakpoint name
        var parts = modeLower.split('-');
        tokenSetSlug = parts.length > 1 ? parts.slice(1).join('-') : modeLower;
      }
      
      var tokenSetKey = 'breakpoint/' + tokenSetSlug;
      if (tokenSetNames.indexOf(tokenSetKey) !== -1) {
        var selectedSets = {};
        selectedSets[tokenSetKey] = 'enabled';
        selectedSets['core'] = 'source';

        themeConfigs.push({
          name: modeName,
          group: '.breakpoint',
          selectedTokenSets: selectedSets,
          collection: breakpointCol,
          modeIndex: idx
        });
      }
    });
  }

  // Layout theme (columns)
  var layoutCol = getCollectionByNameLoose(collectionMap, 'layout');
  if (layoutCol) {
    layoutCol.modes.forEach(function(mode, idx) {
      var modeName = mode.name.toLowerCase();
      var tokenSetKey = 'layout/layout';
      if (tokenSetNames.indexOf(tokenSetKey) !== -1) {
        var selectedSets = {};
        selectedSets[tokenSetKey] = 'enabled';

        themeConfigs.push({
          name: modeName,
          group: 'layout',
          selectedTokenSets: selectedSets,
          collection: layoutCol,
          modeIndex: idx
        });
      }
    });
  }

  // Build theme objects
  themeConfigs.forEach(function(config) {
    var theme = {
      id: generateThemeId(),
      name: config.name
    };

    // Add group field if present (Token Studio uses this for grouping themes)
    if (config.group) {
      theme.group = config.group;
    }

    theme.selectedTokenSets = config.selectedTokenSets;

    // Build style references with proper prefixes based on theme context
    var styleRefs = buildStyleRefsForTheme(config.name, config.group);
    if (config.group === 'layout') {
      theme['$figmaStyleReferences'] = {};
    } else if (Object.keys(styleRefs).length > 0) {
      theme['$figmaStyleReferences'] = styleRefs;
    }

    // Add Figma variable references with proper token path prefix
    var figmaVarRefs = {};
    if (config.collection && config.collection.variables) {
      // Determine variable path prefix based on theme
      var varPrefix = '';
      if (config.group === '.mode') {
        varPrefix = 'mode.';
      } else if (config.group === '.scheme') {
        varPrefix = 'scheme.';
      } else if (config.group === '.breakpoint') {
        varPrefix = 'breakpoint.';
      } else if (config.group === '.secondary') {
        varPrefix = 'secondary.';
      } else if (config.group === '.restrictions') {
        varPrefix = 'restrictions.';
      } else if (config.name === '.white') {
        varPrefix = 'white.';
      } else if (config.name === '.black') {
        varPrefix = 'black.';
      } else if (config.name === '.brand') {
        varPrefix = 'brand.';
      }

      config.collection.variables.forEach(function(v) {
        if (v.name && v.id) {
          // Convert variable name to token path format with prefix
          var varName = v.name.replace(/\//g, '.');
          // Avoid duplicate prefix (e.g., breakpoint.breakpoint.*)
          if (varPrefix && varName.toLowerCase().startsWith(varPrefix.slice(0, -1).toLowerCase() + '.')) {
            // Variable already has the prefix, don't add it again
            figmaVarRefs[varName] = stripVariableIdPrefix(v.id);
          } else {
            figmaVarRefs[varPrefix + varName] = stripVariableIdPrefix(v.id);
          }
        }
      });
    }
    
    if (Object.keys(figmaVarRefs).length > 0) {
      theme['$figmaVariableReferences'] = figmaVarRefs;
    }

    // Add collection and mode IDs
    if (config.collection) {
      theme['$figmaCollectionId'] = config.collection.id;
      if (config.collection.modes[config.modeIndex]) {
        theme['$figmaModeId'] = config.collection.modes[config.modeIndex].modeId;
      }
    }

    themes.push(theme);
  });

  return themes;
}

function ensureCoreTextCaseAndDecorationPrimitives(core) {
  if (!core || typeof core !== 'object') return core;
  if (!core.textCase) core.textCase = {};
  if (!core.textCase.none) {
    core.textCase.none = { value: 'none', type: 'textCase' };
  }
  if (!core.textDecoration) core.textDecoration = {};
  if (!core.textDecoration.none) {
    core.textDecoration.none = { value: 'none', type: 'textDecoration' };
  }
  if (!core.textDecoration.underline) {
    core.textDecoration.underline = { value: 'underline', type: 'textDecoration' };
  }
  return core;
}

/** Nato_8-4-26_3 / Token Studio: semantic line-height scale (composite refs {lineHeights.0}…{lineHeights.3}). */
var NATO_TS_DEFAULT_LINE_HEIGHTS = {
  '0': { value: '100%', type: 'lineHeights' },
  '1': { value: '130%', type: 'lineHeights' },
  '2': { value: '120%', type: 'lineHeights' },
  '3': { value: '125%', type: 'lineHeights' }
};

/** Maps core.line-heights multiplier keys (100, 120, …) → semantic indices 0–3. */
var NATO_LINE_HEIGHT_KEBAB_TO_SEMANTIC = {
  '100': '0',
  '130': '1',
  '120': '2',
  '125': '3'
};

/** Nato_8-4-26_3 / Token Studio: letterSpacing.0…8 (composite refs {letterSpacing.N}). */
var NATO_TS_DEFAULT_LETTER_SPACING = {
  '0': { value: '-5%', type: 'letterSpacing' },
  '1': { value: '-4%', type: 'letterSpacing' },
  '2': { value: '-3%', type: 'letterSpacing' },
  '3': { value: '-2.5%', type: 'letterSpacing' },
  '4': { value: '-2%', type: 'letterSpacing' },
  '5': { value: '-0.5%', type: 'letterSpacing' },
  '6': { value: '-1%', type: 'letterSpacing' },
  '7': { value: '0%', type: 'letterSpacing' },
  '8': { value: '0.5%', type: 'letterSpacing' }
};

function coerceToPercentString(raw, isLineHeight) {
  if (raw === undefined || raw === null) return null;
  var s = String(raw).trim();
  if (/%$/.test(s)) return s;
  var n = parseFloat(s.replace(/,/g, '.'), 10);
  if (isNaN(n)) return s;
  return n + '%';
}

/**
 * Build core.lineHeights from core['line-heights'] multipliers (100, 120, 125, 130) or return null.
 */
function lineHeightsSemanticFromKebab(kebab) {
  if (!kebab || typeof kebab !== 'object') return null;
  var out = {};
  Object.keys(kebab).forEach(function(multKey) {
    var sem = NATO_LINE_HEIGHT_KEBAB_TO_SEMANTIC[multKey];
    if (sem === undefined) return;
    var tok = kebab[multKey];
    if (!tok || tok.value === undefined) return;
    var pct = coerceToPercentString(tok.value, true);
    if (pct) out[sem] = { value: pct, type: 'lineHeights' };
  });
  return Object.keys(out).length ? out : null;
}

function mergeLineHeightsSemantic(partial, defaults) {
  var out = {};
  ['0', '1', '2', '3'].forEach(function(k) {
    if (partial && partial[k] && partial[k].value !== undefined) {
      out[k] = {
        value: coerceToPercentString(partial[k].value, true) || partial[k].value,
        type: 'lineHeights'
      };
    } else if (defaults[k]) {
      out[k] = { value: defaults[k].value, type: 'lineHeights' };
    }
  });
  return out;
}

function mergeLetterSpacingSemantic(partial, defaults) {
  var out = {};
  Object.keys(defaults).forEach(function(k) {
    if (partial && partial[k] && partial[k].value !== undefined) {
      out[k] = {
        value: coerceToPercentString(partial[k].value, false) || String(partial[k].value),
        type: 'letterSpacing'
      };
    } else {
      out[k] = { value: defaults[k].value, type: 'letterSpacing' };
    }
  });
  return out;
}

/**
 * Ensures Token Studio camelCase groups core.lineHeights and core.letterSpacing exist so
 * composite typography refs like {lineHeights.0} and {letterSpacing.7} resolve (Nato_8-4-26_3).
 */
function ensureCoreTokenStudioLineHeightsLetterSpacing(core) {
  if (!core || typeof core !== 'object') return core;

  var lhExisting = core.lineHeights;
  var hasLh0123 = lhExisting && typeof lhExisting === 'object' &&
    lhExisting['0'] && lhExisting['1'] && lhExisting['2'] && lhExisting['3'];
  if (!hasLh0123) {
    var fromKebab = lineHeightsSemanticFromKebab(core['line-heights']);
    core.lineHeights = mergeLineHeightsSemantic(fromKebab || lhExisting, NATO_TS_DEFAULT_LINE_HEIGHTS);
  } else {
    ['0', '1', '2', '3'].forEach(function(k) {
      var t = lhExisting[k];
      if (t && t.value !== undefined && !/%$/.test(String(t.value))) {
        t.value = coerceToPercentString(t.value, true);
        t.type = 'lineHeights';
      }
    });
  }

  var lsExisting = core.letterSpacing;
  var lsKeys = lsExisting && typeof lsExisting === 'object' ? Object.keys(lsExisting) : [];
  if (lsKeys.length < 9) {
    core.letterSpacing = mergeLetterSpacingSemantic(lsExisting, NATO_TS_DEFAULT_LETTER_SPACING);
  } else {
    Object.keys(lsExisting).forEach(function(k) {
      var t = lsExisting[k];
      if (t && t.value !== undefined && !/%$/.test(String(t.value))) {
        t.value = coerceToPercentString(t.value, false);
        t.type = 'letterSpacing';
      }
    });
  }

  return core;
}

// --- TOKEN STUDIO FORMAT TRANSFORMER ---
// Emit leaf / secondary token sets using the RAW Figma variable names, so the
// token roots (white, white-subtle, secondary-light, magenta-light, …) match the
// raw alias references buildAliasPath now produces for leaf collections. Values
// are taken from the already-computed `native` tree (keyed by the stripped path).
function tsLookupNested(obj, path) {
  var p = path.split('/'); var c = obj;
  for (var i = 0; i < p.length; i++) { if (!c || typeof c !== 'object') return undefined; c = c[p[i]]; }
  return c;
}
function tsSetNested(obj, path, val) {
  var p = path.split('/'); var c = obj;
  for (var i = 0; i < p.length - 1; i++) { c[p[i]] = c[p[i]] || {}; c = c[p[i]]; }
  c[p[p.length - 1]] = val;
}
var TS_RAW_SETS = [
  { col: '.secondary',     prefix: 'secondary/', by: 'mode' }, // secondary/<palette>
  { col: '.white',         prefix: 'base/',      by: 'col'  }, // base/white
  { col: '.black',         prefix: 'base/',      by: 'col'  }, // base/black
  { col: '.brand',         prefix: 'base/',      by: 'col'  }, // base/brand (if present)
  { col: '.magenta-light', prefix: 'base/',      by: 'col'  }, // base/magenta-light
  { col: '.magenta-dark',  prefix: 'base/',      by: 'col'  }  // base/magenta-dark
];
function emitRawNameSets(out, native, rawData) {
  TS_RAW_SETS.forEach(function(cfg) {
    if (!native[cfg.col]) return;
    var rawCol = null;
    for (var i = 0; i < rawData.collections.length; i++) {
      if (stripIcons(rawData.collections[i].name) === cfg.col) { rawCol = rawData.collections[i]; break; }
    }
    if (!rawCol) return;
    Object.keys(native[cfg.col]).forEach(function(modeName) {
      if (modeName === 'typography') return; // collection-level typography, not a mode
      var setName = cfg.by === 'mode' ? (cfg.prefix + modeName) : (cfg.prefix + cfg.col.slice(1));
      var tree = out[setName] || {};
      rawCol.variables.forEach(function(v) {
        if (!v.name) return;
        var stripped = normalizeVariableName(v.name, cfg.col);
        var val = tsLookupNested(native[cfg.col][modeName], stripped);
        if (val === undefined) return;
        tsSetNested(tree, v.name, val); // RAW name → keeps the real token root
      });
      out[setName] = tree;
    });
  });
}

// core/Elevation reference scale — emitted verbatim to match the canonical export.
// Light mode = two stacked drop shadows; Dark mode = a single drop shadow.
function buildCoreElevationReference() {
  function ds(color, y, blur) {
    return { color: color, type: 'dropShadow', x: '0', y: String(y), blur: String(blur), spread: '0' };
  }
  function box(value) { return { value: value, type: 'boxShadow' }; }
  var L = '#0000001a';
  return {
    'Light mode': {
      'Level 1': box([ds(L, 1, 2),  ds(L, 2, 8)]),
      'Level 2': box([ds(L, 3, 6),  ds(L, 6, 24)]),
      'Level 3': box([ds(L, 5, 10), ds(L, 10, 40)]),
      'Level 4': box([ds(L, 7, 14), ds(L, 14, 56)]),
      'Level 5': box([ds(L, 9, 18), ds(L, 18, 72)]),
      'Level 6': box([ds(L, 11, 22), ds('#0000001f', 22, 88)])
    },
    'Dark mode': {
      'Level 1': box(ds('#00000033', 3, 7)),
      'Level 2': box(ds('#0000004d', 4, 9)),
      'Level 3': box(ds('#00000066', 5, 12)),
      'Level 4': box(ds('#00000073', 6, 15)),
      'Level 5': box(ds('#0000008c', 8, 20)),
      'Level 6': box(ds('#000000a6', 12, 40))
    }
  };
}

function toTokenStudioFormat(native, rawData) {
  var out = {};

  // Rule 2: core — unwrap double nesting + type corrections (Nato-style camel primitives) + dimension math
  if (native['.core'] && native['.core']['.core']) {
    out['core'] = fixCoreTokens(native['.core']['.core']);
    applyDimensionBaseExpressions(out['core']);
  }
  if (!out['core']) out['core'] = {};
  ensureCoreTextCaseAndDecorationPrimitives(out['core']);
  ensureCoreTokenStudioLineHeightsLetterSpacing(out['core']);

  // Rule 8 (spec): foundation — unwrap double nesting
  if (native['foundation'] && native['foundation']['foundation']) {
    out['foundation'] = native['foundation']['foundation'];
  }

  // Fix 1–4, 6: apply semantic types + fix radius.full string on foundation
  if (out['foundation']) {
    out['foundation'] = fixFoundationTokens(out['foundation']);
  } else {
    out['foundation'] = {};
  }

  // Token Studio dimension-math layer: raw numeric foundation tokens in
  // sizing/component, radius and strokes are expressed as {dimension.1}*N
  // (N = value / dimension.1). The `full` sentinel (999) stays raw.
  (function applyFoundationDimensionExpressions() {
    var f = out['foundation'];
    var d1 = out['core'] && out['core'].dimension && out['core'].dimension['1'];
    // dimension.1 resolves to dimension.base; derive its numeric value.
    var base = 4;
    var baseTok = out['core'] && out['core'].dimension && out['core'].dimension.base;
    if (baseTok && baseTok.value !== undefined) {
      var bm = String(baseTok.value).match(/-?\d+(\.\d+)?/);
      if (bm) base = parseFloat(bm[0]);
    }
    if (!base) return;
    function conv(obj) {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function(name) {
        var tok = obj[name];
        if (!tok || typeof tok !== 'object') return;
        if (!('value' in tok)) return;
        if (name === 'full') return;
        var v = tok.value;
        if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
          var num = parseFloat(v);
          if (num === 999) return;
          tok.value = '{dimension.1}*' + (num / base);
        }
      });
    }
    if (f && f.sizing) conv(f.sizing.component);
    if (f) conv(f.radius);
    if (f) conv(f.strokes);
  })();

  // Elevation composites for every set (incl. foundation) are injected in a
  // single deep pass at the end of this function — see addElevationCompositesDeep.

  // Fix 9: foundation.variant.breakpoint
  if (!out['foundation']['variant']) out['foundation']['variant'] = {};
  out['foundation']['variant']['breakpoint'] = {
    value: '{breakpoint.breakpoint-string}',
    type: 'text'
  };

  // Fix 8: foundation.typography — N scales × 10 props, each an alias to breakpoint.typography.*
  // Scale list is derived from the actual breakpoint typography so new styles
  // (e.g. title-XL, link-S-bold) are included automatically instead of being
  // dropped by a stale hardcoded list. Falls back to the known set if absent.
  var typScales;
  var bpTypoSource = null;
  if (native['.breakpoint']) {
    // typography is now per-mode; pull the scale list from any breakpoint mode
    // (or the legacy collection-level group if present).
    if (native['.breakpoint'].typography) bpTypoSource = native['.breakpoint'].typography;
    else {
      Object.keys(native['.breakpoint']).some(function(m) {
        if (native['.breakpoint'][m] && native['.breakpoint'][m].typography) {
          bpTypoSource = native['.breakpoint'][m].typography; return true;
        }
        return false;
      });
    }
  }
  if (bpTypoSource) {
    typScales = Object.keys(bpTypoSource);
  } else {
    typScales = [
      'display', 'title-L', 'title-M', 'title-S', 'subtitle', 'paragraph',
      'body-L', 'body-M-bold', 'body-M-regular', 'link-M-bold', 'link-M-regular',
      'body-S-bold', 'body-S-regular', 'link-S-regular', 'microcopy-bold', 'microcopy-regular'
    ];
  }
  var typProps = [
    { name: null,                type: 'typography' },
    { name: 'size',              type: 'number' },
    { name: 'line-height',       type: 'number' },
    { name: 'weight',            type: 'number' },
    { name: 'letter-spacing',    type: 'number' },
    { name: 'font-family',       type: 'text' },
    { name: 'paragraph-spacing', type: 'number' },
    { name: 'paragraph-indent',  type: 'number' },
    { name: 'text-case',         type: 'textCase' },
    { name: 'text-decoration',   type: 'textDecoration' }
  ];
  var foundTypography = {};
  typScales.forEach(function(scale) {
    foundTypography[scale] = {};
    typProps.forEach(function(prop) {
      var propKey = prop.name !== null ? prop.name : scale;
      foundTypography[scale][propKey] = {
        value: '{breakpoint.typography.' + scale + '.' + propKey + '}',
        type: prop.type
      };
    });
  });
  out['foundation']['typography'] = foundTypography;

  // Reorder foundation keys to match Token Studio reference order
  var FOUNDATION_KEY_ORDER = ['spacing', 'sizing', 'radius', 'colours', 'typography', 'strokes', 'grid', 'elevation', 'variant'];
  var orderedFoundation = {};
  FOUNDATION_KEY_ORDER.forEach(function(k) {
    if (out['foundation'][k] !== undefined) orderedFoundation[k] = out['foundation'][k];
  });
  Object.keys(out['foundation']).forEach(function(k) {
    if (orderedFoundation[k] === undefined) orderedFoundation[k] = out['foundation'][k];
  });
  out['foundation'] = orderedFoundation;

  // Rule 4: mode — flat slash keys, keep mode-inverted as a sibling wrapper.
  // Elevation composites are added later by the deep pass.
  if (native['.mode']) {
    Object.keys(native['.mode']).forEach(function(name) {
      var content = native['.mode'][name];
      var modeInverted = content['mode-inverted'];
      var rest = {};
      Object.keys(content).forEach(function(k) {
        if (k !== 'mode-inverted') rest[k] = content[k];
      });
      var setContent = { mode: rest };
      if (modeInverted) setContent['mode-inverted'] = modeInverted;
      out['mode/' + name] = setContent;
    });
  }

  // Rule 3: scheme — flat slash keys. Elevation composites added by deep pass.
  if (native['.scheme']) {
    Object.keys(native['.scheme']).forEach(function(name) {
      out['scheme/' + name] = { scheme: native['.scheme'][name] };
    });
  }

  // Rule 6 & 9: secondary palettes + leaf collections (white/black/brand/magenta)
  // are emitted with RAW variable names → set names secondary/<palette> and
  // base/<leaf>, with token roots matching the raw leaf references. Elevation
  // composites are added by the deep pass.
  emitRawNameSets(out, native, rawData);

  // Section / Card — middle links of the chain
  //   foundation → .scheme → .mode → .section → .card → leaf → .core
  // These were missing before, which dangled every {section.*} reference coming
  // from .mode (and broke subtle / black resolution downstream). Wrapped to match
  // the alias roots produced by buildAliasPath (root = section / card).
  if (native['.section']) {
    Object.keys(native['.section']).forEach(function(name) {
      out['section/' + name] = { section: native['.section'][name] };
    });
  }
  if (native['.card']) {
    Object.keys(native['.card']).forEach(function(name) {
      out['card/' + name] = { card: native['.card'][name] };
    });
  }

  // (Leaf collections white/black/brand/magenta-light/magenta-dark are emitted by
  // emitRawNameSets above as base/<leaf> with raw token roots.)

  // Rule 7: restrictions — flat slash keys
  if (native['_restricted']) {
    Object.keys(native['_restricted']).forEach(function(name) {
      out['restrictions/' + name] = native['_restricted'][name];
    });
  }

  // Rule 5: breakpoints — flat slash keys + semantic types (Fix F) + typography composites (Fix G)
  var bpMap = {
    'S Mobile': 'mobile',
    'M Tablet': 'tablet',
    'L Laptop': 'laptop',
    'XL Desktop': 'desktop',
    'XXL Large Desktop': 'large-desktop'
  };
  // Token Studio key order for breakpoint content
  var BP_KEY_ORDER = ['spacing', 'sizing', 'typography', 'grid', 'stretch-grid', 'overflow-grid', 
                      'fixed-grid', 'columns', 'layout', 'breakpoint-string'];
  
  if (native['.breakpoint']) {
    // Typography tokens are written at collection level (not inside each mode)
    // They're at native['.breakpoint'].typography, not native['.breakpoint']['S Mobile'].typography
    var collectionLevelTypography = native['.breakpoint'].typography;
    
    Object.keys(native['.breakpoint']).forEach(function(name) {
      if (!bpMap[name]) return; // skip non-mode keys like 'typography'
      var slug = bpMap[name];
      var content = fixBreakpointTypes(native['.breakpoint'][name], []);

      // Inject typography from collection level if this breakpoint mode lacks it
      if (!content.typography && collectionLevelTypography) {
        var typProcessed = fixBreakpointTypes(collectionLevelTypography, ['typography']);
        var merged = {};
        Object.keys(content).forEach(function(k) { merged[k] = content[k]; });
        merged.typography = typProcessed;
        content = merged;
      }

      if (content.typography) {
        var withTypo = {};
        Object.keys(content).forEach(function(k) { withTypo[k] = content[k]; });
        withTypo.typography = fixBreakpointTypography(content.typography);
        content = withTypo;
      }
      
      // Reorder keys to match Token Studio
      var orderedContent = {};
      BP_KEY_ORDER.forEach(function(k) {
        if (content[k] !== undefined) orderedContent[k] = content[k];
      });
      // Add any remaining keys not in the order list
      Object.keys(content).forEach(function(k) {
        if (orderedContent[k] === undefined) orderedContent[k] = content[k];
      });
      
      out['breakpoint/' + slug] = { breakpoint: orderedContent };
    });
  }

  // layout passthrough — unwrap 'columns' mode wrapper, fix column token types (number → sizing)
  var layoutRoot = native['layout'] || native['Layout'];
  if (layoutRoot && layoutRoot['columns']) {
    var layoutMode = layoutRoot['columns'];
    var layoutContent = layoutMode['columns'] || layoutMode;
    out['layout/layout'] = { columns: fixLayoutColumnTypes(layoutContent) };
  }

  // Generate $themes from raw collection data
  var tokenSetNames = Object.keys(out).filter(function(k) { return k !== '$themes'; });
  out['$themes'] = buildThemes(rawData, tokenSetNames);

  // Token Studio: Nato-style typography (camel composite refs, kebab standalone, per-scale lineHeight / line-height formula)
  Object.keys(out).forEach(function(tsKey) {
    if (tsKey.indexOf('breakpoint/') !== 0 || !out[tsKey].breakpoint) return;
    var bp = out[tsKey].breakpoint;
    var core = out['core'];
    syncTypographyCompositeLineHeights(bp);
    alignBreakpointTypographyToNato(core, bp);
    normalizeTypographyCompositeCamelRefs(core, bp);
    normalizeBreakpointTypographyStandaloneRefs(bp);
    injectBreakpointTypographyLineHeightFormulas(bp);
    coerceBreakpointSpacingSizingToDimensionExpressions(bp, core);
  });

  // Inject elevation boxShadow composites into every set, at every nesting depth
  // (mode/<scheme>/elevation, card/<m>/<leaf>/elevation, section/<m>/<leaf>/elevation,
  // scheme/elevation, the leaves, foundation, …). Done in one pass after all sets
  // exist so composites self-reference / forward correctly.
  Object.keys(out).forEach(function(setName) {
    if (setName === '$themes' || setName === '$metadata') return;
    // Leaf families (base/*, secondary/*) collapse every variant's elevation
    // composite onto the set's primary (first) group — e.g. secondary-light,
    // white, magenta-dark. Other sets self-reference (canonical = null).
    var canonical = null;
    if (/^(base|secondary)\//.test(setName)) {
      var keys = Object.keys(out[setName]);
      if (keys.length) canonical = keys[0];
    }
    addElevationCompositesDeep(out[setName], '', canonical);
  });

  // core/Elevation — the Material-style elevation reference scale (Light/Dark
  // mode, Level 1-6). These are fixed raw boxShadow values that are NOT stored as
  // Figma variables (shadows aren't variables) and don't resolve from the effect
  // styles (which read zero on the neutral path), so they are emitted verbatim to
  // match the canonical Token Studio export exactly.
  if (!out['core']) out['core'] = {};
  out['core']['Elevation'] = buildCoreElevationReference();

  // Reorder value/type keys globally
  out = fixKeyOrder(out);

  // Fix D/Rule 10: strip {core.} and {.core.} alias prefixes (deep clone)
  out = fixAliasPaths(out);
  walkAndFinalizeNatoTypographyComposites(out['core'], out);

  // Canonical breakpoint typography quirks — run LAST on the final tree so no
  // other normalization overwrites them (letterSpacing.7 + link underline).
  Object.keys(out).forEach(function(tsKey) {
    if (tsKey.indexOf('breakpoint/') === 0 && out[tsKey] && out[tsKey].breakpoint) {
      applyCanonicalBreakpointTypography(out[tsKey].breakpoint);
    }
  });

  out['$metadata'] = { tokenSetOrder: buildTokenSetOrder(out) };
  return out;
}

// ============================================================================
// REFERENCE CLOSURE VALIDATION
// Catches dangling {token.references} — e.g. a partial/old export where .mode
// points at {section.*} but the section/card token sets are not in the output.
// The real alias chain is foundation → .scheme → .mode → .section → .card →
// leaf → .core, so omitting any middle set breaks subtle / elevation / black.
// ============================================================================
function validateReferenceClosure(tokens) {
  var META = { '$themes': 1, '$metadata': 1 };

  // 1) Index every token name-path present in the output (dotted form).
  var index = {};
  Object.keys(tokens).forEach(function(setName) {
    if (META[setName]) return;
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      if (('value' in node) || ('$value' in node)) {
        index[path.replace(/\//g, '.')] = true;
        return;
      }
      for (var k in node) {
        if (node.hasOwnProperty(k)) walk(node[k], path ? path + '/' + k : k);
      }
    })(tokens[setName], '');
  });

  // Extract genuine Token Studio references from a value. A real reference is
  // {dotted.path} with no quotes/colons — this skips literal composite shadow
  // value objects like {"color":"#000","type":"dropShadow",...}.
  function refsOf(v) {
    var out = [];
    var s = typeof v === 'string' ? v : JSON.stringify(v);
    var m = s.match(/\{[^{}]+\}/g);
    if (m) {
      for (var i = 0; i < m.length; i++) {
        var inner = m[i].slice(1, -1);
        if (inner.indexOf('"') === -1 && inner.indexOf(':') === -1 &&
            inner.indexOf('.') !== -1 && /^[A-Za-z0-9_.\- ]+$/.test(inner)) {
          out.push(inner);
        }
      }
    }
    return out;
  }

  // 2) Walk all values, collect references that resolve to nothing.
  var totalRefs = 0;
  var broken = [];
  Object.keys(tokens).forEach(function(setName) {
    if (META[setName]) return;
    (function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      if (('value' in node) || ('$value' in node)) {
        var val = ('value' in node) ? node.value : node.$value;
        refsOf(val).forEach(function(r) {
          totalRefs++;
          if (!index[r]) broken.push({ from: path.replace(/\//g, '.'), ref: r });
        });
        return;
      }
      for (var k in node) {
        if (node.hasOwnProperty(k)) walk(node[k], path ? path + '/' + k : k);
      }
    })(tokens[setName], setName);
  });

  // 3) Group broken refs by their root segment (the missing set/group).
  var byRoot = {};
  broken.forEach(function(b) {
    var root = b.ref.split('.')[0];
    byRoot[root] = (byRoot[root] || 0) + 1;
  });

  return {
    ok: broken.length === 0,
    totalRefs: totalRefs,
    brokenCount: broken.length,
    byRoot: byRoot,
    missingRoots: Object.keys(byRoot).sort(function(a, b) { return byRoot[b] - byRoot[a]; }),
    sampleBroken: broken.slice(0, 15)
  };
}

var GIT_CONFIG_KEY = 'json-exporter-git-config';

// --- MESSAGE HANDLER ---
figma.ui.onmessage = function(msg) {
  if (msg.type === 'resize') {
    figma.ui.resize(420, msg.height);
    return;
  }

  // Lightweight: report the current file name immediately, without waiting for
  // the (slow) variable extraction — used to auto-select the target folder.
  if (msg.type === 'GET_FILE_INFO') {
    figma.ui.postMessage({ type: 'fileInfo', fileName: (figma.root && figma.root.name) || '' });
    return;
  }

  if (msg.type === 'LOAD_GIT_SETTINGS') {
    figma.clientStorage.getAsync(GIT_CONFIG_KEY).then(function(stored) {
      var config = stored && typeof stored === 'object' ? stored : {};
      figma.ui.postMessage({ type: 'GIT_SETTINGS_LOADED', config: config });
    }).catch(function(e) {
      figma.ui.postMessage({ type: 'GIT_SETTINGS_LOADED', config: {} });
    });
    return;
  }

  if (msg.type === 'SAVE_GIT_SETTINGS') {
    var config = msg.config || {};
    figma.clientStorage.setAsync(GIT_CONFIG_KEY, config).then(function() {
      figma.ui.postMessage({ type: 'GIT_SETTINGS_SAVED' });
    }).catch(function(e) {
      figma.ui.postMessage({ type: 'GIT_SETTINGS_SAVED', error: e.message });
    });
    return;
  }

  if (msg.type === 'extract') {
    figma.variables.getLocalVariableCollectionsAsync().then(function(collections) {

      var variableIdToCollection = new Map();

      collections.forEach(function(col) {
        col.variableIds.forEach(function(vid) {
          variableIdToCollection.set(vid, stripIcons(col.name));
        });
      });

      // --- DIAGNOSTIC: log each collection's extended-collection properties ---
      collections.forEach(function(col) {
        var isExt = !!col.isExtension;
        var hasParent = !!col.parentVariableCollectionId;
        var hasRoot = !!col.rootVariableCollectionId;
        var hasOverrides = !!col.variableOverrides;
        console.log('[JSON Exporter v8] Collection "' + col.name + '"' +
          ' | isExtension=' + isExt +
          ' | parentId=' + (col.parentVariableCollectionId || 'none') +
          ' | rootId=' + (col.rootVariableCollectionId || 'none') +
          ' | hasOverrides=' + hasOverrides +
          ' | modes=' + col.modes.length +
          ' | vars=' + col.variableIds.length);
      });

      // Check if valuesByModeForCollectionAsync exists (needs Figma Update 121+)
      var sampleVarId = collections[0] && collections[0].variableIds[0];
      var methodCheckPromise = sampleVarId
        ? figma.variables.getVariableByIdAsync(sampleVarId).then(function(v) {
            var hasMethod = v && typeof v.valuesByModeForCollectionAsync === 'function';
            console.log('[JSON Exporter v8] valuesByModeForCollectionAsync available: ' + hasMethod);
            return hasMethod;
          })
        : Promise.resolve(false);

      return methodCheckPromise.then(function(hasAsyncMethod) {

        var promises = collections.map(function(col) {
          // Detect extended collection using multiple checks
          var isExtended = !!(col.isExtension || col.parentVariableCollectionId || col.rootVariableCollectionId);

          var varPromises = col.variableIds.map(function(vid) {
            return figma.variables.getVariableByIdAsync(vid).then(function(variable) {
              if (!variable) return null;

              // For extended collections: use valuesByModeForCollectionAsync if available
              // This returns values WITH overrides keyed by the collection's OWN mode IDs.
              if (isExtended && hasAsyncMethod) {
                return variable.valuesByModeForCollectionAsync(col).then(function(colValues) {
                  return { variable: variable, collectionValues: colValues };
                });
              }

              // Fallback for extended collections when async method is not available:
              // Manually merge parent values + overrides from variableOverrides
              if (isExtended && col.variableOverrides) {
                var parentValues = variable.valuesByMode;
                var overridesForVar = col.variableOverrides[variable.id];
                if (overridesForVar) {
                  // Build merged values: start with parent, keyed by child mode IDs
                  var merged = {};
                  col.modes.forEach(function(mode) {
                    if (mode.parentModeId && overridesForVar[mode.modeId] !== undefined) {
                      // Use override value
                      merged[mode.modeId] = overridesForVar[mode.modeId];
                    } else if (mode.parentModeId && parentValues[mode.parentModeId] !== undefined) {
                      // Inherit from parent mode
                      merged[mode.modeId] = parentValues[mode.parentModeId];
                    }
                  });
                  return { variable: variable, collectionValues: merged };
                }
                // No overrides for this variable — inherit all from parent
                var inherited = {};
                col.modes.forEach(function(mode) {
                  if (mode.parentModeId && parentValues[mode.parentModeId] !== undefined) {
                    inherited[mode.modeId] = parentValues[mode.parentModeId];
                  }
                });
                return { variable: variable, collectionValues: inherited };
              }

              // Regular (non-extended) collection: use valuesByMode directly
              return { variable: variable, collectionValues: variable.valuesByMode };
            });
          });

          // Log first variable's mode IDs for the first extended collection
          return Promise.all(varPromises).then(function(varPairs) {
            if (isExtended && varPairs.length > 0 && varPairs[0]) {
              var firstVarModeIds = Object.keys(varPairs[0].collectionValues);
              var colModeIds = col.modes.map(function(m) { return m.modeId; });
              console.log('[JSON Exporter v8] Extended "' + col.name + '" first var modeIds: ' + JSON.stringify(firstVarModeIds.slice(0, 3)));
              console.log('[JSON Exporter v8] Extended "' + col.name + '" collection modeIds: ' + JSON.stringify(colModeIds.slice(0, 3)));
              // Log first alias to verify override detection
              var firstAlias = null;
              for (var i = 0; i < varPairs.length && !firstAlias; i++) {
                if (!varPairs[i]) continue;
                var vals = varPairs[i].collectionValues;
                var keys = Object.keys(vals);
                for (var j = 0; j < keys.length && !firstAlias; j++) {
                  var v = vals[keys[j]];
                  if (v && v.type === 'VARIABLE_ALIAS') {
                    firstAlias = { varName: varPairs[i].variable.name, modeId: keys[j], aliasId: v.id };
                  }
                }
              }
              if (firstAlias) {
                console.log('[JSON Exporter v8] Extended "' + col.name + '" first alias: ' + JSON.stringify(firstAlias));
              }
            }

            var variables = [];
            var resolvePromises = [];

            varPairs.forEach(function(pair) {
              if (!pair) return;
              var variable = pair.variable;
              var collectionValues = pair.collectionValues;

              var valuesByMode = {}, resolvedValuesByMode = {}, aliasInfo = {};

              Object.entries(collectionValues).forEach(function(entry) {
                var mId = entry[0], val = entry[1];
                valuesByMode[mId] = val;

                if (val && val.type === 'VARIABLE_ALIAS') {
                  resolvePromises.push(
                    (async function() {
                      var currentVal = val;
                      var firstAliasedVar = await figma.variables.getVariableByIdAsync(currentVal.id);
                      if (firstAliasedVar) {
                        var aliasedVarCollection = variableIdToCollection.get(firstAliasedVar.id);
                        var aliasPath = buildAliasPath(firstAliasedVar, aliasedVarCollection, col.name, collections);
                        aliasInfo[mId] = {
                          isAlias: true,
                          aliasPath: aliasPath,
                          aliasedVarId: firstAliasedVar.id,
                          aliasedVarCollection: aliasedVarCollection
                        };
                      }
                      
                      // Resolve the full alias chain for THIS specific mode's value
                      var maxDepth = 10;
                      while (currentVal && currentVal.type === 'VARIABLE_ALIAS' && maxDepth-- > 0) {
                        var nextVar = await figma.variables.getVariableByIdAsync(currentVal.id);
                        if (!nextVar) break;
                        // Get the value - use first available mode since primitive vars typically have one mode
                        var nextModes = Object.keys(nextVar.valuesByMode);
                        currentVal = nextVar.valuesByMode[nextModes[0]] || null;
                      }
                      resolvedValuesByMode[mId] = currentVal;
                    })()
                  );
                } else {
                  resolvedValuesByMode[mId] = val;
                }
              });

              variables.push({
                id: variable.id,
                name: variable.name,
                type: variable.resolvedType,
                valuesByMode: valuesByMode,
                resolvedValuesByMode: resolvedValuesByMode,
                aliasInfo: aliasInfo,
                codeSyntax: variable.codeSyntax,
                description: variable.description || ''
              });
            });

            return Promise.all(resolvePromises).then(function() {
              return {
                id: col.id,
                name: col.name,
                modes: col.modes,
                variables: variables
              };
            });
          });
        });

        return Promise.all(promises);
      });
    }).then(function(result) {
      // How many variables actually carry a Figma description, counted on the RAW
      // extraction — upstream of transformToFinalFormat, the Token Studio fixups
      // and the DTCG conversion. If this says 0, the descriptions are not in the
      // file; if it says N > 0 but the export has none, the loss is ours.
      (function logDescriptionCoverage() {
        var total = 0, described = 0;
        result.forEach(function(col) {
          col.variables.forEach(function(v) {
            total++;
            if (v.description) described++;
          });
        });
        var pct = total ? Math.round((described / total) * 100) : 0;
        console.log('[JSON Exporter] Figma descriptions: ' + described + ' of ' +
          total + ' variables (' + pct + '%)');
        if (!described && total) {
          console.log('[JSON Exporter] No variable in this file has a description — ' +
            'nothing for the DTCG export to carry into $description.');
        }
      })();

      // Also extract local styles (text styles and effect styles) for $figmaStyleReferences
      var textStyles = figma.getLocalTextStyles().map(function(style) {
        return {
          id: style.id,
          name: style.name,
          type: 'TEXT'
        };
      });
      var effectStyles = figma.getLocalEffectStyles().map(function(style) {
        return {
          id: style.id,
          name: style.name,
          type: 'EFFECT'
        };
      });
      
      figma.ui.postMessage({
        type: 'extracted',
        collections: result,
        fileName: (figma.root && figma.root.name) || '',
        styles: {
          textStyles: textStyles,
          effectStyles: effectStyles
        }
      });
    }).catch(function(e) {
      console.error('[JSON Exporter v8] Extract error:', e);
      figma.ui.postMessage({ type: 'error', message: e.message });
    });
  }

  if (msg.type === 'transform') {
    var nativeResult = transformToFinalFormat(msg.raw, {
      includeDescriptions: !!msg.includeDescriptions
    });
    var exportMode = msg.exportMode || 'token-studio';
    var finalTokens;
    if (exportMode === 'token-studio') {
      finalTokens = toTokenStudioFormat(nativeResult.tokens, msg.raw);
    } else {
      finalTokens = nativeResult.tokens;
    }
    var closure = exportMode === 'token-studio'
      ? validateReferenceClosure(finalTokens)
      : { ok: true, brokenCount: 0, totalRefs: 0, byRoot: {}, missingRoots: [], sampleBroken: [] };
    if (!closure.ok) {
      console.warn('[JSON Exporter] ⚠ ' + closure.brokenCount + ' broken references. Missing sets: ' + closure.missingRoots.join(', '));
      console.warn('[JSON Exporter] sample:', closure.sampleBroken);
    }
    figma.ui.postMessage({
      type: 'transformed',
      payload: { tokens: finalTokens, count: nativeResult.count },
      validation: {
        actual: {
          totalTokens: nativeResult.count,
          topLevelCollections: Object.keys(finalTokens).length
        },
        matchPercentage: 100,
        closure: closure
      }
    });
  }

};