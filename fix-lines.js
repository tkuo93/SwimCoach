const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');

// Fix the welcome message - replace line by line
content = content.replace(
  "'Welcome to SwimCoach\\\\! 🏊\\n\\n' +",
  "'Welcome to SwimCoach\\\\\\\\! 🏊\\\\n\\\\n' +"
);

content = content.replace(
  "'To use this bot, you need to link it to your SwimCoach account\\\\.\\n\\n' +",
  "'To use this bot, you need to link it to your SwimCoach account\\\\\\\\.\\\\n\\\\n' +"
);

content = content.replace(
  "'1\\\\. Open SwimCoach on the web: {frontendUrl}\\n' +",
  "'1\\\\\\\\. Open SwimCoach on the web: \\\\\\\\{frontendUrl\\\\\\\\}\\\\n' +"
);

content = content.replace(
  "'2\\\\. Go to Settings → Telegram\\n' +",
  "'2\\\\\\\\. Go to Settings → Telegram\\\\n' +"
);

content = content.replace(
  "'3\\\\. Click \"Link Telegram\" and enter your Telegram ID: `{telegramId}`\\n\\n' +",
  "'3\\\\\\\\. Click \"Link Telegram\" and enter your Telegram ID: \\\\\\\\`\\\\\\\\{telegramId\\\\\\\\}\\\\\\\\`\\\\\\\\n\\\\\\\\n' +"
);

content = content.replace(
  "'Or use this direct link: {linkUrl}\\n\\n' +",
  "'Or use this direct link: \\\\\\\\{linkUrl\\\\\\\\}\\\\n\\\\n' +"
);

content = content.replace(
  "'Once linked, you can:\\n' +",
  "'Once linked, you can:\\\\\\\\n' +"
);

content = content.replace(
  "'\\\\u2022 /workout - Generate today\\\\'s workout\\n' +",
  "'\\\\\\\\u2022 /workout \\\\\\\\- Generate today\\\\\\\\'s workout\\\\\\\\n' +"
);

content = content.replace(
  "'\\\\u2022 /coach - Chat with your AI coach\\n' +",
  "'\\\\\\\\u2022 /coach \\\\\\\\- Chat with your AI coach\\\\\\\\n' +"
);

content = content.replace(
  "'\\\\u2022 /help - Show this help'",
  "'\\\\\\\\u2022 /help \\\\\\\\- Show this help'"
);

fs.writeFileSync('src/services/telegram-bot.js', content);
console.log('Done');