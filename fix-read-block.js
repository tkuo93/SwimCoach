const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

const newBlock = fs.readFileSync('/tmp/new-block.js', 'utf8');

const oldBlockStart = '// Not linked - show linking instructions';
const oldBlockEnd = '    );';
const startIdx = content.indexOf(oldBlockStart);
const endIdx = content.indexOf(oldBlockEnd, startIdx) + oldBlockEnd.length;

if (startIdx >= 0 && endIdx > startIdx) {
  content = content.slice(0, startIdx) + newBlock + content.slice(endIdx);
  fs.writeFileSync(path, content);
  console.log('Block replaced successfully');
} else {
  console.log('Block boundaries not found');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
}