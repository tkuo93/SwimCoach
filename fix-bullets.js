const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

// Fix the two bullet lines - need double backslashes
content = content.replace(
  "      '\\\\u2022 /coach \\\\- Chat with your AI coach\\\\n' +",
  "      '\\\\\\\\u2022 /coach \\\\\\\\- Chat with your AI coach\\\\\\\\n' +"
);

content = content.replace(
  "      '\\\\u2022 /help \\\\- Show this help',",
  "      '\\\\\\\\u2022 /help \\\\\\\\- Show this help',"
);

fs.writeFileSync(path, content);
console.log('Done');