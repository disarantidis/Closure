var StyleDictionary = require('style-dictionary');

StyleDictionary.registerTransform({
  name: 'value/codeSyntax/android',
  type: 'value',
  matcher: function(token) {
    return token.codeSyntax && token.codeSyntax.ANDROID;
  },
  transformer: function(token) {
    return token.codeSyntax.ANDROID;
  }
});

module.exports = {
  source: ['design-tokens-extended.json'],
  platforms: {
    android: {
      transforms: ['attribute/cti', 'name/cti/camel', 'value/codeSyntax/android'],
      buildPath: 'build/android/',
      files: [{
        destination: 'Tokens.kt',
        format: 'android/resources'
      }]
    }
  }
};
