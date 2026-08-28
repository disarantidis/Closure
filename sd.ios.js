var StyleDictionary = require('style-dictionary');

StyleDictionary.registerTransform({
  name: 'value/codeSyntax/ios',
  type: 'value',
  matcher: function(token) {
    return token.codeSyntax && token.codeSyntax.iOS;
  },
  transformer: function(token) {
    return token.codeSyntax.iOS;
  }
});

module.exports = {
  source: ['design-tokens-extended.json'],
  platforms: {
    ios: {
      transforms: ['attribute/cti', 'name/cti/camel', 'value/codeSyntax/ios'],
      buildPath: 'build/ios/',
      files: [{
        destination: 'Tokens.swift',
        format: 'ios-swift/enum.swift'
      }]
    }
  }
};
