const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');

content = content.replace(
  'Welcome to SwimCoach\\! 🏊',
  'Welcome to SwimCoach\\\\! 🏊'
);

fs.writeFileSync('src/services/telegram-bot.js', content);
console.log('Done');