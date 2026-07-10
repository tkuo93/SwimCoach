const fs = require('fs');
const content = fs.readFileSync('SwimCoach-project/src/services/telegram-bot.js', 'utf8');
const idx = content.indexOf("Generate today");
console.log('Generate today:', JSON.stringify(content.slice(idx, idx+80)));