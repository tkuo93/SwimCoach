const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

// Find and replace the exact line
const oldLine = "'\\\\u2022 /workout \\\\- Generate today\\\\'s workout\\\\n' +";
const newLine = '"\\\\u2022 /workout \\\\- Generate today\\\\\'s workout\\\\n" +';

content = content.replace(oldLine, newLine);

fs.writeFileSync(path, content);
console.log('Done');