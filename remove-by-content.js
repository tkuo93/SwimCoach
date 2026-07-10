const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');

content = content.replace(
  "      '\\u2022 /help - Show this help',\n",
  ''
);

fs.writeFileSync('src/services/telegram-bot.js', content);
console.log('Done');