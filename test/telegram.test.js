const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'telegram.js'), 'utf8');

function load(fetch) {
  return new Function('UrlFetchApp', source + '\nreturn { callTelegram_, sendMessage_ };')({ fetch });
}

const response = (body) => ({ getContentText: () => JSON.stringify(body) });

test('sends the message as JSON to the bot API', () => {
  let request;
  const { sendMessage_ } = load((url, options) => {
    request = { url, options };
    return response({ ok: true, result: { message_id: 1 } });
  });

  sendMessage_('abc', 42, 'Saved');
  assert.equal(request.url, 'https://api.telegram.org/botabc/sendMessage');
  assert.equal(request.options.method, 'post');
  assert.equal(request.options.muteHttpExceptions, true);
  assert.deepEqual(JSON.parse(request.options.payload), { chat_id: 42, text: 'Saved' });
});

test('a Telegram error is reported without the token', () => {
  const { callTelegram_ } = load(() => response({ ok: false, description: 'Bad Request' }));
  assert.throws(() => callTelegram_('secret-token', 'sendMessage', {}), (error) => {
    assert.match(error.message, /sendMessage failed: Bad Request/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test('a network error that quotes the URL has the token removed', () => {
  const { callTelegram_ } = load((url) => {
    throw new Error('Address unavailable: ' + url);
  });
  assert.throws(() => callTelegram_('secret-token', 'getMe', {}), (error) => {
    assert.doesNotMatch(error.message, /secret-token/);
    assert.match(error.message, /\[token\]/);
    return true;
  });
});
