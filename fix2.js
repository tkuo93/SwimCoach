const fs = require('fs');
let content = fs.readFileSync('SwimCoach-project/src/services/telegram-bot.js', 'utf8');

// Fix welcome back - replace the literal ! with \!
content = content.replace(
  'Welcome back, {name}! 🏊',
  'Welcome back, {name}\\\\! 🏊'
);

// Fix today's in bullet point
content = content.replace(
  "Generate today's workout",
  "Generate today\\\\'s workout"
);

fs.writeFileSync('SwimCoach-project/src/services/telegram-bot.js', content);
console.log('Done');