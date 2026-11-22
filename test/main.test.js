const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const OWNER = 111;
const SECRET = 'right-secret';

// A small stand-in for Apps Script, recording what the code does.
function simulate(options = {}) {
  const properties = {
    BOT_TOKEN: 'bot-token-value',
    WEBHOOK_SECRET: SECRET,
    OWNER_USER_ID: String(OWNER),
    SHEET_ID: 'sheet',
    ...options.properties,
  };
  const calls = { handled: [], sent: [], errors: [], lockReleases: 0 };

  const globals = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => (name in properties ? properties[name] : null),
        setProperty: (name, value) => {
          properties[name] = value;
        },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => options.lockAvailable !== false,
        releaseLock: () => {
          calls.lockReleases += 1;
        },
      }),
    },
    HtmlService: { createHtmlOutput: () => 'HTML_RESPONSE' },
    console: {
      error: (text) => calls.errors.push(text),
      log: () => {},
    },
    sendMessage_: (token, chatId, text) => {
      if (options.sendFails) {
        throw new Error('Telegram is down');
      }
      calls.sent.push({ chatId, text });
    },
    handleMessage_: (config, message) => {
      if (options.handlerFails) {
        throw new Error('Sheet is down');
      }
      calls.handled.push(message.text);
      return 'Saved ' + message.text;
    },
  };

  const { doPost } = new Function(...Object.keys(globals), source + '\nreturn { doPost };')(...Object.values(globals));
  return { doPost, calls, properties };
}

function request(update, secret = SECRET) {
  return { parameter: secret === null ? {} : { secret }, postData: { contents: JSON.stringify(update) } };
}

function update(id, text = '14 f', overrides = {}) {
  return {
    update_id: id,
    message: {
      text,
      from: { id: OWNER },
      chat: { id: OWNER, type: 'private' },
      ...overrides,
    },
  };
}

test('a valid message is handled once and gets one reply', () => {
  const { doPost, calls } = simulate();
  assert.equal(doPost(request(update(1))), 'HTML_RESPONSE');
  assert.deepEqual(calls.handled, ['14 f']);
  assert.deepEqual(calls.sent, [{ chatId: OWNER, text: 'Saved 14 f' }]);
  assert.equal(calls.lockReleases, 1);
});

test('a wrong or missing secret does nothing', () => {
  for (const secret of ['wrong', '', null]) {
    const { doPost, calls } = simulate();
    assert.equal(doPost(request(update(1), secret)), 'HTML_RESPONSE');
    assert.deepEqual(calls.handled, []);
    assert.deepEqual(calls.sent, []);
  }
});

test('nothing is accepted if the secret was never set', () => {
  const { doPost, calls } = simulate({ properties: { WEBHOOK_SECRET: '' } });
  doPost(request(update(1), ''));
  assert.deepEqual(calls.handled, []);
});

test('other senders and group chats get no reply', () => {
  const cases = [
    update(1, '14 f', { from: { id: 222 } }),
    update(2, '14 f', { chat: { id: -5, type: 'group' } }),
    update(3, '14 f', { from: undefined }),
    { update_id: 4 },
    { update_id: 5, edited_message: update(5).message },
  ];
  for (const item of cases) {
    const { doPost, calls } = simulate();
    assert.equal(doPost(request(item)), 'HTML_RESPONSE');
    assert.deepEqual(calls.handled, []);
    assert.deepEqual(calls.sent, []);
  }
});

test('a repeated delivery is ignored, which also protects /undo', () => {
  const { doPost, calls } = simulate();
  doPost(request(update(7, '/undo')));
  doPost(request(update(7, '/undo')));
  assert.equal(calls.handled.length, 1);
  assert.equal(calls.sent.length, 1);
  assert.equal(calls.lockReleases, 2);
});

test('update IDs are compared as a list, not by size', () => {
  const { doPost, calls } = simulate();
  doPost(request(update(500, 'first')));
  doPost(request(update(20, 'second')));
  doPost(request(update(500, 'first')));
  assert.deepEqual(calls.handled, ['first', 'second']);
});

test('only the latest 200 update IDs are kept, within the property size limit', () => {
  const { doPost, properties } = simulate();
  for (let id = 1000000000; id < 1000000250; id += 1) {
    doPost(request(update(id)));
  }
  const stored = JSON.parse(properties.PROCESSED_UPDATE_IDS);
  assert.equal(stored.length, 200);
  assert.equal(stored[stored.length - 1], 1000000249);
  assert.ok(properties.PROCESSED_UPDATE_IDS.length < 9 * 1024);
});

test('a damaged ID list does not stop the bot', () => {
  const { doPost, calls } = simulate({ properties: { PROCESSED_UPDATE_IDS: 'not json' } });
  doPost(request(update(1)));
  assert.equal(calls.handled.length, 1);
  assert.equal(calls.errors.length, 1);
});

test('without the lock, nothing is written and the reply asks you to resend', () => {
  const { doPost, calls } = simulate({ lockAvailable: false });
  assert.equal(doPost(request(update(1))), 'HTML_RESPONSE');
  assert.deepEqual(calls.handled, []);
  assert.match(calls.sent[0].text, /^Not saved.*resend this: 14 f$/);
  assert.equal(calls.lockReleases, 0);
});

test('a failed write replies Not saved, with no internal details', () => {
  const { doPost, calls } = simulate({ handlerFails: true });
  assert.equal(doPost(request(update(1))), 'HTML_RESPONSE');
  assert.match(calls.sent[0].text, /^Not saved.*resend this: 14 f$/);
  assert.doesNotMatch(calls.sent[0].text, /Sheet is down/);
  assert.match(calls.errors[0], /Sheet is down/);
  assert.equal(calls.lockReleases, 1);
});

test('a failed Telegram reply is logged, and a repeat does not write again', () => {
  const { doPost, calls } = simulate({ sendFails: true });
  assert.equal(doPost(request(update(1))), 'HTML_RESPONSE');
  doPost(request(update(1)));
  assert.equal(calls.handled.length, 1);
  assert.match(calls.errors[0], /Telegram is down/);
  assert.equal(calls.lockReleases, 2);
});

test('invalid requests still get a normal response', () => {
  const { doPost, calls } = simulate();
  assert.equal(doPost({ parameter: { secret: SECRET }, postData: { contents: 'not json' } }), 'HTML_RESPONSE');
  assert.equal(doPost({ parameter: { secret: SECRET } }), 'HTML_RESPONSE');
  assert.equal(doPost(undefined), 'HTML_RESPONSE');
  assert.deepEqual(calls.handled, []);
});

test('errors never log the secret or the token', () => {
  const { doPost, calls } = simulate();
  doPost({ parameter: { secret: SECRET }, postData: { contents: 'not json' } });
  const logged = calls.errors.join(' ');
  assert.doesNotMatch(logged, new RegExp(SECRET));
  assert.doesNotMatch(logged, /bot-token-value/);
});

test('a failure on a message with no text still replies Not saved', () => {
  const { doPost, calls } = simulate({ handlerFails: true });
  doPost(request(update(1, '14 f', { text: undefined })));
  assert.equal(calls.sent.length, 1);
  assert.match(calls.sent[0].text, /^Not saved/);
});

test('long messages are shortened in the Not saved reply', () => {
  const { doPost, calls } = simulate({ handlerFails: true });
  doPost(request(update(1, 'x'.repeat(5000))));
  assert.ok(calls.sent[0].text.length < 300);
});
