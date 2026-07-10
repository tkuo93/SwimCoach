const fs = require('fs');
const content = fs.readFileSync('SwimCoach-project/src/services/telegram-bot.js', 'utf8');
const idx = content.indexOf('need to link it to your SwimCoach account');
console.log('Account:', JSON.stringify(content.slice(idx, idx+80)));