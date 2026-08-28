const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/dsara/Downloads/Pillar-Json-3-4-2026_13.json','utf8'));

console.log('Top level keys:', Object.keys(data).slice(0,20).join(', '));

// Count tokens with/without value
let missing = 0, present = 0;
let firstMissing = [];
let firstPresent = [];

function scan(obj, path) {
  if (obj && typeof obj === 'object') {
    const hasType = 'type' in obj;
    const hasValue = 'value' in obj;
    if (hasType) {
      if (hasValue) {
        present++;
        if (firstPresent.length < 2) firstPresent.push({ path, token: obj });
      } else {
        missing++;
        if (firstMissing.length < 5) firstMissing.push({ path, token: obj });
      }
      return;
    }
    for (const k of Object.keys(obj)) {
      scan(obj[k], path + '.' + k);
    }
  }
}
scan(data, '');

console.log('\nTokens WITH value:', present);
console.log('Tokens WITHOUT value:', missing);
console.log('\nFirst 5 MISSING value tokens:');
firstMissing.forEach(e => console.log(' ', e.path, '->', JSON.stringify(e.token)));
console.log('\nFirst 2 PRESENT value tokens:');
firstPresent.forEach(e => console.log(' ', e.path, '->', JSON.stringify(e.token)));

// Check structure of first 2 top-level keys
const topKeys = Object.keys(data);
topKeys.slice(0, 3).forEach(k => {
  const sub = data[k];
  const subKeys = Object.keys(sub);
  console.log('\nCollection:', k, '| modes:', subKeys.join(', '));
});
