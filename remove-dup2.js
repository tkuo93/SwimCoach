const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');
const lines = content.split('\n');

// Remove line 229 (0-indexed: 228)
lines.splice(228, 1);

fs.writeFileSync('src/services/telegram-bot.js', lines.join('\n'));
console.log('Done');