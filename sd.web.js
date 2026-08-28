var StyleDictionary = require('style-dictionary');

StyleDictionary.registerTransform({
  name: 'value/codeSyntax/web',
  type: 'value',
  matcher: function(token) {
    return token.codeSyntax && token.codeSyntax.WEB;
  },
  transformer: function(token) {
    return token.codeSyntax.WEB;
  }
});

module.exports = {
  source: ['design-tokens-extended.json'],
  platforms: {
    web: {
      transforms: ['attribute/cti', 'name/cti/kebab', 'value/codeSyntax/web'],
      prefix: 'pillar',
      buildPath: 'build/web/',
      files: [{
        destination: 'tokens.css',
        format: 'css/variables'
      }]
    }
  }
};
