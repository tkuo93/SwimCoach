const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

// Fix the line - use double quotes to avoid escaping issues
content = content.replace(
  "'\\\\\\\\u2022 /workout \\\\\\\\- Generate today\\\\'s workout\\\\\\\\n' +",
  '"\\\\\\\\u2022 /workout \\\\\\\\- Generate today\\\\\\\\'s workout\\\\\\\\n" +'
);

fs.writeFileSync(path, content);
console.log('Done');