// Copies the shared core logic next to the Apps Script adapter so `clasp push` uploads it.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
for (const name of ['classifier.js', 'compliance.js', 'messages.js']) {
  const target = path.join(root, 'apps-script', `core_${name}`);
  fs.copyFileSync(path.join(root, 'src', 'core', name), target);
  console.log(`copied src/core/${name} -> apps-script/core_${name}`);
}
