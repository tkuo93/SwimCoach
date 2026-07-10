const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');

const oldWelcome = `    // Not linked - show linking instructions
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

const newWelcome = `    // Not linked - show linking instructions
    const linkUrl = \`\${process.env.FRONTEND_URL}/telegram-link?telegramId=\${telegramId}\`;
    await safeSendMessage(this.bot, chatId,
      'Welcome to SwimCoach\\\\! 🏊\\\\n\\\\n' +
      'To use this bot, you need to link it to your SwimCoach account\\\\.\\\\n\\\\n' +
      '1\\\\. Open SwimCoach on the web: \\\\{frontendUrl\\\\}\\\\n' +
      '2\\\\. Go to Settings → Telegram\\\\n' +
      '3\\\\. Click "Link Telegram" and enter your Telegram ID: \\\\`\\\\{telegramId\\\\}\\\\`\\\\n\\\\n' +
      'Or use this direct link: \\\\{linkUrl\\\\}\\\\n\\\\n' +
      'Once linked, you can:\\\\n' +
      '\\\\u2022 /workout \\\\- Generate today\\\\'s workout\\\\n' +
      '\\\\u2022 /coach \\\\- Chat with your AI coach\\\\n' +
      '\\\\u2022 /help \\\\- Show this help',
      { frontendUrl: process.env.FRONTEND_URL, telegramId, linkUrl }
    );`;

content = content.replace(oldWelcome, newWelcome);

fs.writeFileSync('src/services/telegram-bot.js', content);
console.log('Done');