const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');

content = content.replace(
  'To use this bot, you need to link it to your SwimCoach account\\.\\n\\n',
  'To use this bot, you need to link it to your SwimCoach account\\\\.\\n\\n'
);

fs.writeFileSync('src/services/telegram-bot.js', content);
console.log('Done');