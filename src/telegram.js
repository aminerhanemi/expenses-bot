function callTelegram_(token, method, payload) {
  let response;
  try {
    response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (error) {
    // Network errors can quote the URL, which contains the token.
    throw new Error(String(error.message).split(token).join('[token]'));
  }

  const body = JSON.parse(response.getContentText());
  if (!body.ok) {
    throw new Error('Telegram ' + method + ' failed: ' + body.description);
  }
  return body.result;
}

function sendMessage_(token, chatId, text) {
  return callTelegram_(token, 'sendMessage', { chat_id: chatId, text: text });
}
