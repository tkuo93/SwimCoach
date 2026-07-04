const fs = require('fs');
const buf = fs.readFileSync('SwimCoach-project/public/index.html');
const html = buf.toString('utf8');
const scriptStart = html.indexOf('<script>') + 8;
const scriptEnd = html.indexOf('</script>');
const code = html.substring(scriptStart, scriptEnd);
const lines = code.split('\n');

// Check for BOM or hidden chars in first 15 lines
for (let i = 0; i < 15; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const code = line.charCodeAt(j);
    if (code > 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
      console.log('Hidden char at line', i+1, 'pos', j, ':', code);
    }
  }
}

// Check line 12 (esc) specifically
console.log('\nLine 12 char codes:');
const escLine = lines[11];
for (let i = 0; i < escLine.length; i++) {
  const c = escLine.charCodeAt(i);
  if (c === 39 || c === 34 || c === 123 || c === 125) {
    console.log('pos', i, ':', String.fromCharCode(c), c);
  }
}
