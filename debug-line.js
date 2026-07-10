const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

const oldLine = '      "\\\\\\\\u2022 /workout \\\\\\\\- Generate today\\\\\\\\\'s workout\\\\\\\\n" +';
const newLine = '      "\\\\\\\\u2022 /workout \\\\\\\\- Generate today\\\\\\\\\'s workout\\\\\\\\n" +';

console.log('Old line found:', content.includes(oldLine));
// The issue is the oldLine in file now has no + at end of string part
// Let me check what's actually there
const lines = content.split('\n');
console.log('Line 224:', JSON.stringify(lines[223]));

fs.writeFileSync(path, content);
console.log('Done');