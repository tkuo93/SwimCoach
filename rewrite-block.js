const fs = require('fs');
let content = fs.readFileSync('src/services/telegram-bot.js', 'utf8');
const lines = content.split('\n');

// Lines 217-229 (0-indexed: 216-228)
lines[216] = "      'Welcome to SwimCoach\\\\\\\\! 🏊\\\\n\\\\n' +";
lines[217] = "      'To use this bot, you need to link it to your SwimCoach account\\\\\\\\.\\\\n\\\\n' +";
lines[218] = "      '1\\\\\\\\. Open SwimCoach on the web: \\\\\\\\{frontendUrl\\\\\\\\}\\\\n' +";
lines[219] = "      '2\\\\\\\\. Go to Settings → Telegram\\\\n' +";
lines[220] = "      '3\\\\\\\\. Click \"Link Telegram\" and enter your Telegram ID: \\\\\\\\`\\\\\\\\{telegramId\\\\\\\\}\\\\\\\\`\\\\\\\\n\\\\\\\\n' +";
lines[221] = "      'Or use this direct link: \\\\\\\\{linkUrl\\\\\\\\}\\\\n\\\\n' +";
lines[222] = "      'Once linked, you can:\\\\\\\\n' +";
lines[223] = "      '\\\\\\\\u2022 /workout \\\\\\\\- Generate today\\\\\\\\'s workout\\\\\\\\n' +";
lines[224] = "      '\\\\\\\\u2022 /coach \\\\\\\\- Chat with your AI coach\\\\\\\\n' +";
lines[225] = "      '\\\\\\\\u2022 /help \\\\\\\\- Show this help',";

fs.writeFileSync('src/services/telegram-bot.js', lines.join('\n'));
console.log('Done');