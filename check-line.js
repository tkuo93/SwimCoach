const fs = require('fs');
const content = fs.readFileSync('SwimCoach-project/src/services/telegram-bot.js', 'utf8');
const lines = content.split('\n');
console.log('Line 215-225:');
for (let i = 214; i < 225; i++) {
  console.log(i+1, lines[i]);
}