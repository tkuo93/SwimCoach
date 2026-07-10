const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

const lines = content.split('\n');

// Line 224 (0-indexed: 223)
lines[223] = "      '\\\\u2022 /workout \\\\- Generate today\\\\\\'s workout\\\\n' +";

fs.writeFileSync(path, lines.join('\n'));
console.log('Done');