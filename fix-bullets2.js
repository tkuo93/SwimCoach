const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

// Fix bullets 2 and 3 - should be 2 backslashes in single-quoted strings
content = content.replace(
  "      '\\\\\\\\u2022 /coach \\\\\\\\- Chat with your AI coach\\\\\\\\n' +",
  "      '\\\\u2022 /coach \\\\- Chat with your AI coach\\\\n' +"
);

content = content.replace(
  "      '\\\\\\\\u2022 /help \\\\\\\\- Show this help',",
  "      '\\\\u2022 /help \\\\- Show this help',"
);

fs.writeFileSync(path, content);
console.log('Done');