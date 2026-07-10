const fs = require('fs');
const path = 'c:/Users/tkuo9/.claude/projects/SwimCoach/SwimCoach-project/src/services/telegram-bot.js';
let content = fs.readFileSync(path, 'utf8');

// The current state (from HEAD~1) has single backslashes
// We need to double them for MarkdownV2, except for the apostrophe line which needs double quotes

// First, escape all single backslashes to double in the template strings
// But be careful: only in the welcome message block

// Replace the entire block with properly escaped version
const oldBlock = `    // Not linked - show linking instructions
    const linkUrl = \`\${process.env.FRONTEND_URL}/telegram-link?telegramId=\${telegramId}\`;
    await safeSendMessage(this.bot, chatId,
      'Welcome to SwimCoach\\! 🏊\\n\\n' +
      'To use this bot, you need to link it to your SwimCoach account\\.\\n\\n' +
      '1\\. Open SwimCoach on the web: {frontendUrl}\\n' +
      '2\\. Go to Settings → Telegram\\n' +
      '3\\. Click "Link Telegram" and enter your Telegram ID: \`{telegramId}\`\\n\\n' +
      'Or use this direct link: {linkUrl}\\n\\n' +
      'Once linked, you can:\\n' +
      '\\u2022 /workout - Generate today\\'s workout\\n' +
      '\\u2022 /coach - Chat with your AI coach\\n' +
      '\\u2022 /help - Show this help',
      { frontendUrl: process.env.FRONTEND_URL, telegramId, linkUrl }
    );`;

const newBlock = `    // Not linked - show linking instructions
    const linkUrl = \`\${process.env.FRONTEND_URL}/telegram-link?telegramId=\${telegramId}\`;
    await safeSendMessage(this.bot, chatId,
      'Welcome to SwimCoach\\\\! 🏊\\\\n\\\\n' +
      'To use this bot, you need to link it to your SwimCoach account\\\\.\\\\n\\\\n' +
      '1\\\\. Open SwimCoach on the web: \\\\{frontendUrl\\\\}\\\\n' +
      '2\\\\. Go to Settings → Telegram\\\\n' +
      '3\\\\. Click "Link Telegram" and enter your Telegram ID: \\\\`\\\\{telegramId\\\\}\\\\`\\\\n\\\\n' +
      'Or use this direct link: \\\\{linkUrl\\\\}\\\\n\\\\n' +
      'Once linked, you can:\\\\n' +
      "\\\\u2022 /workout \\\\- Generate today\\\\'s workout\\\\n" +
      '\\\\u2022 /coach \\\\- Chat with your AI coach\\\\n' +
      '\\\\u2022 /help \\\\- Show this help',
      { frontendUrl: process.env.FRONTEND_URL, telegramId, linkUrl }
    );`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(path, content);
  console.log('Block replaced successfully');
} else {
  console.log('Old block not found!');
  // Debug: find the actual content
  const idx = content.indexOf('Not linked');
  if (idx >= 0) {
    console.log('Found at:', idx);
    console.log('Actual:', JSON.stringify(content.slice(idx, idx+500)));
  }
}