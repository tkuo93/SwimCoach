const fs = require('fs');
const content = fs.readFileSync('SwimCoach-project/src/services/telegram-bot.js', 'utf8');
const idx = content.indexOf('Welcome back');
const slice = content.slice(idx, idx+200);
console.log('Length:', slice.length);
for (let i = 0; i < slice.length; i++) {
  const c = slice[i];
  const code = slice.charCodeAt(i);
  if (code > 127 || c === '\n' || c === '\r' || c === '\\' || c === '!') {
    console.log(i, code, JSON.stringify(c));
  }
}