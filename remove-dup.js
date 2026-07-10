const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');
const lines = content.split('\n');

// Remove duplicate line at 229 (0-indexed)
lines.splice(229, 1);

fs.writeFileSync('src/services/telegram-bot.js', lines.join('\n'));
console.log('Done');