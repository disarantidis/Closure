/*
 * Example --config for `dtcg-preview.js --shape resolved`.
 *
 * emit-resolved.js derives every structural fact from the file: which
 * collection holds raw values, what the axes are, what order to nest them in,
 * which axes each token varies with, and which branches actually exist. None
 * of that belongs here.
 *
 * What a config supplies is VOCABULARY — the things that are true of one
 * design system and unknowable from its graph:
 *
 *   pin          axes to hold at one mode rather than branch over
 *   renameMode   what to call a mode in the output path
 *   renameToken  namespaces that are implied by the group and come off the leaf
 *   typeHints    semantic types a file's names carry but its metadata does not
 *   toDocument   optional: reshape the derived groups into a house layout
 *
 * Copy this file, edit it, and pass it with --config. Without one the emitter
 * still runs and reports the derived shape; you just get the file's own mode
 * names and no house layout.
 *
 * The values below are the RADD / ODS convention, and are what the derived
 * emitter was verified against.
 */
module.exports = {
  // '_restricted' is a permission layer; only its unrestricted reading is wanted,
  // so it is pinned rather than multiplied into every branch.
  pin: { _restricted: 'unrestricted' },

  renameMode: function (axis, mode) {
    var BREAKPOINTS = {
      'S Mobile': 'mobile',
      'M Tablet': 'tablet',
      'L Laptop': 'laptop',
      'XL Desktop': 'desktop',
      'XXL Large Desktop': 'large-desktop'
    };
    return BREAKPOINTS[mode] || mode;
  },

  // The colour and breakpoint namespaces restate the group a token already
  // sits in. 'elevation/' is kept because it distinguishes siblings within one.
  renameToken: function (name) {
    return name.replace(/^colours\//, '').replace(/^breakpoint\//, '');
  },

  /*
    The primitive collection carries no narrowing Figma scopes, and its names
    are the only thing saying a 'radius/' is a border radius. Consumption-layer
    variables do carry scopes, and emit-resolved.js propagates those down the
    alias edges, so this only has to cover what nothing consumes.
  */
  typeHints: function (name, resolvedType) {
    var ns = name.split('/')[0];
    if (/colour|color/i.test(name)) return 'color';
    if (resolvedType === 'COLOR') return 'color';
    if (ns === 'dimension' || /^viewport-/.test(ns)) return 'dimension';
    if (ns === 'font-family' || ns === 'fontFamilies') return 'fontFamilies';
    if (ns === 'fontWeights') return 'fontWeights';
    if (ns === 'spacing') return 'spacing';
    if (ns === 'sizing' || ns === 'strokes') return 'sizing';
    if (ns === 'radius') return 'borderRadius';
    /*
      These primitives feed shadow offsets and grid gaps, so their consumers
      carry EFFECT_FLOAT / GAP scopes and propagation would type them
      'dimension'. The house document calls the raw values plain numbers and
      only the composite parts dimensions. A hint outranks propagation, which
      is what makes stating that here enough.
    */
    if (ns === 'shadows' || ns === 'grids') return 'number';
    // A font size is a length. The kebab 'font-sizes/' namespace is already
    // caught above; the camel one a file may also carry is not, and without
    // this it falls through to Figma's FLOAT and ships as a bare number.
    if (ns === 'fontSize' || ns === 'fontSizes') return 'dimension';
    return null;
  },

  /*
    The house layout: { core, breakpoint.<mode>, mode.<mode>.<scheme> }.

    This is presentation, which is why it lives here and not in the emitter.
    Two conventions are applied that the graph does not state: a branch is
    named by its innermost colour choice (so scheme=secondary + palette=orchid
    reads 'orchid'), and a scheme that never routes through the light/dark
    switch is repeated under every mode rather than sitting outside them.

    `axes` names which derived axis plays which role. Point this at a file
    whose axes are named differently and only these three lines change.
  */
  axes: { breakpoint: '.breakpoint', mode: '.mode', scheme: '.scheme' },

  toDocument: function (res, helpers) {
    var axes = this.axes;
    var self = this;
    var out = {
      core: res.primitives[Object.keys(res.primitives)[0]] || {},
      breakpoint: {},
      mode: {}
    };
    var modeAxis = (res.axes.filter(function (a) { return a.name === axes.mode; })[0] || {});
    var allModes = modeAxis.modes || [];

    Object.keys(res.groups).forEach(function (key) {
      res.groups[key].branches.forEach(function (br) {
        var v = br.vector;

        if (v[axes.breakpoint] !== undefined) {
          var bp = self.renameMode(axes.breakpoint, v[axes.breakpoint]);
          out.breakpoint[bp] = helpers.merge(out.breakpoint[bp] || {}, br.tokens);
          return;
        }
        if (v[axes.scheme] === undefined) return;   // the static group

        var leaf = br.dependsOn
          .filter(function (n) { return n !== axes.mode; })
          .map(function (n) { return v[n]; })
          .pop();
        var modes = v[axes.mode] !== undefined ? [v[axes.mode]] : allModes;
        modes.forEach(function (m) {
          var mm = self.renameMode(axes.mode, m);
          out.mode[mm] = out.mode[mm] || {};
          out.mode[mm][leaf] = helpers.merge(out.mode[mm][leaf] || {}, br.tokens);
        });
      });
    });
    return out;
  }
};
