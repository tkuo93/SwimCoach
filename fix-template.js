const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

// The issue: template has \\n (literal) instead of \n (actual newline), and \\{key\\} instead of {key}
// safeSendMessage does: text.replace(new RegExp(`\\{${key}\\}`, 'g'), escaped)
// So template MUST have {key} not \{key\}

// Also: in JS string, \n = newline, \\n = literal backslash-n
// In source: '\n' = newline in string, '\\n' = literal \n in string

// We want actual newlines in the string sent to Telegram, so use \n in source (single backslash)
// We want {key} in string for replacement, so use {key} in source (no backslashes)

// But reserved chars like ! . - { } need \ in the FINAL string, so in source: \! \. \- \{ \}

const lines = [
  "// Not linked - show linking instructions",
  "    const linkUrl = `${process.env.FRONTEND_URL}/telegram-link?telegramId=${telegramId}`;",
  "    await safeSendMessage(this.bot, chatId,",
  "      'Welcome to SwimCoach\\! 🏊\n\n' +",
  "      'To use this bot, you need to link it to your SwimCoach account\\.\n\n' +",
  "      '1\\. Open SwimCoach on the web: {frontendUrl}\n' +",
  "      '2\\. Go to Settings → Telegram\n' +",
  "      '3\\. Click \"Link Telegram\" and enter your Telegram ID: `{telegramId}`\n\n' +",
  "      'Or use this direct link: {linkUrl}\n\n' +",
  "      'Once linked, you can:\n' +",
  '      "\\u2022 /workout \\- Generate today\\'s workout\n" +',
  "      '\\u2022 /coach \\- Chat with your AI coach\n' +",
  "      '\\u2022 /help \\- Show this help',",
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
}