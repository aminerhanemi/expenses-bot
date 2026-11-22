// Run from the Apps Script editor. Checks the Script Properties, then connects the bot to Telegram.
function setup() {
  const config = getConfig_();
  // Kept out of the code, since it's the bot's web address and the code is public.
  const deploymentId = (PropertiesService.getScriptProperties().getProperty('DEPLOYMENT_ID') || '').trim();
  const missing = [
    ['BOT_TOKEN', config.botToken],
    ['WEBHOOK_SECRET', config.webhookSecret],
    ['OWNER_USER_ID', config.ownerUserId],
    ['SHEET_ID', config.sheetId],
    ['DEPLOYMENT_ID', deploymentId],
  ].filter((entry) => !entry[1]).map((entry) => entry[0]);
  if (missing.length) {
    throw new Error('Missing Script Properties: ' + missing.join(', '));
  }
  if (!/^\d+$/.test(config.ownerUserId)) {
    throw new Error('OWNER_USER_ID must contain digits only');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(config.webhookSecret)) {
    throw new Error('WEBHOOK_SECRET may only contain letters, digits, _ and -');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(deploymentId)) {
    throw new Error('DEPLOYMENT_ID may only contain letters, digits, _ and -');
  }

  const bot = callTelegram_(config.botToken, 'getMe', {});
  console.log('Bot: @' + bot.username);
  const spreadsheet = SpreadsheetApp.openById(config.sheetId);
  console.log('Spreadsheet: ' + spreadsheet.getName());
  const created = ensureBotSettings_(spreadsheet);
  console.log(BOT_SETTINGS_SHEET + ' tab: ' + (created ? 'created' : 'already there, left unchanged'));

  const url = 'https://script.google.com/macros/s/' + deploymentId + '/exec?secret=' + config.webhookSecret;
  callTelegram_(config.botToken, 'setWebhook', {
    url: url,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  console.log('Webhook registered. Send your bot a message to test it.');
}

// Run from the Apps Script editor, with no message on its way, to check the connection to Telegram.
function checkWebhook() {
  const info = callTelegram_(getConfig_().botToken, 'getWebhookInfo', {});
  console.log('Webhook set: ' + (info.url ? 'yes' : 'no'));
  console.log('Pending updates: ' + info.pending_update_count);
  console.log('Allowed updates: ' + JSON.stringify(info.allowed_updates || []));
  console.log('Last error: ' + (info.last_error_date
    ? new Date(info.last_error_date * 1000).toISOString() + ': ' + info.last_error_message
    : 'none'));
}
