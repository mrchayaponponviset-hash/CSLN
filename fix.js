const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'frontend', 'src', 'app', 'globals.css');
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');

const top = lines.slice(0, 679); // 0 to 678 (679 lines)
const bottom = lines.slice(739); // from line 740 to the end

const newBlock = [
  '/* ===== Premium Scrollbar - Clean ===== */',
  '.premium-scrollbar::-webkit-scrollbar {',
  '  width: 14px !important;',
  '  height: 14px !important;',
  '}',
  '',
  '.premium-scrollbar::-webkit-scrollbar-track {',
  '  background: transparent !important;',
  '  border-radius: 100px !important;',
  '  margin-block: 6px !important;',
  '}',
  '',
  '.premium-scrollbar::-webkit-scrollbar-thumb {',
  '  background-color: var(--color-primary) !important;',
  '  border-radius: 100px !important;',
  '}',
  '',
  '.premium-scrollbar::-webkit-scrollbar-thumb:hover {',
  '  background-color: #8A8BFF !important;',
  '}',
  '',
  '/* Firefox Support */',
  '.premium-scrollbar {',
  '  scrollbar-width: thin;',
  '  scrollbar-color: var(--color-primary) transparent;',
  '}'
];

const newLines = [...top, ...newBlock, ...bottom];
fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
console.log('Fixed globals.css successfully!');
