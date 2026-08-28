const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/dsara/Downloads/Pillar-Json-3-4-2026_5.json', 'utf8'));

function getPaths(obj) {
  const result = {};
  function walk(o, p) {
    if (!o || typeof o !== 'object') return;
    if (o.type && 'value' in o) { result[p] = o.value; return; }
    Object.entries(o).forEach(([k, v]) => walk(v, p + '/' + k));
  }
  walk(obj, '');
  return result;
}

// Compare every Extended Collection / every mode vs NBG Individual
const extCols = ['GFM Individual', 'GFM Premium', 'NBG Premium', 'NBG Private', 'NBG Corporate', 'NBG Business'];
const modes = ['Neutral', 'White', 'Black', 'Inverted', 'Brand'];

console.log('=== EXTENDED COLLECTIONS: differences vs NBG Individual ===');
extCols.forEach(col => {
  if (!data[col]) { console.log(col + ': MISSING'); return; }
  let totalDiffs = 0;
  modes.forEach(mode => {
    const nbg = getPaths(data['NBG Individual'] && data['NBG Individual'][mode]);
    const ext = getPaths(data[col] && data[col][mode]);
    let diffs = 0;
    Object.keys(ext).forEach(path => {
      if (ext[path] !== nbg[path]) diffs++;
    });
    if (diffs > 0) totalDiffs += diffs;
    console.log(col + ' / ' + mode + ': ' + diffs + ' differences from NBG Individual');
  });
  console.log('  → ' + col + ' total diffs: ' + totalDiffs + '\n');
});

// Check NBG Individual hardcoded values count
console.log('=== NBG Individual / Neutral: value breakdown ===');
const nbgNeutral = data['NBG Individual']['Neutral'];
let aliases = 0, hardcoded = 0;
function scan(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (obj.type && 'value' in obj) {
    if (typeof obj.value === 'string' && obj.value.startsWith('{')) aliases++;
    else hardcoded++;
    return;
  }
  Object.values(obj).forEach(scan);
}
scan(nbgNeutral);
console.log('NBG Individual / Neutral: ' + aliases + ' aliases, ' + hardcoded + ' hardcoded');
