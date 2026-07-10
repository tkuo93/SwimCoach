const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  "today\\\\\\\\'s",
  "today\\\\'s"
);

fs.writeFileSync(path, content);
console.log('Done');