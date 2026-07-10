const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

const lines = [
  "// Not linked - show linking instructions",
  "    const linkUrl = `${process.env.FRONTEND_URL}/telegram-link?telegramId=${telegramId}`;",
  "    await safeSendMessage(this.bot, chatId,",
  "      'Welcome to SwimCoach\\\\! 🏊\\\\n\\\\n' +",
  "      'To use this bot, you need to link it to your SwimCoach account\\\\.\\\\n\\\\n' +",
  "      '1\\\\. Open SwimCoach on the web: \\\\{frontendUrl\\\\}\\\\n' +",
  "      '2\\\\. Go to Settings → Telegram\\\\n' +",
  "      '3\\\\. Click \"Link Telegram\" and enter your Telegram ID: \\\\`\\\\{telegramId\\\\}\\\\`\\\\n\\\\n' +",
  "      'Or use this direct link: \\\\{linkUrl\\\\}\\\\n\\\\n' +",
  "      'Once linked, you can:\\\\n' +",
  '      "\\\\u2022 /workout \\\\- Generate today\\\\\'s workout\\\\n" +',
  "      '\\\\u2022 /coach \\\\- Chat with your AI coach\\\\n' +",
  "      '\\\\u2022 /help \\\\- Show this help',",
  "      { frontendUrl: process.env.FRONTEND_URL, telegramId, linkUrl }",
  "    );"
];

const newBlock = lines.join('\n');

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