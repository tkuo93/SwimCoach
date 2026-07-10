const fs = require('fs');
const content = fs.readFileSync('SwimCoach-project/src/services/telegram-bot.js', 'utf8');
const idx = content.indexOf('Welcome to SwimCoach');
console.log('Welcome to:', JSON.stringify(content.slice(idx, idx+150)));