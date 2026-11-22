const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'setup.js'), 'utf8');

function run(properties) {
  const calls = [];
  const globals = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => (name in properties ? properties[name] : null) }) },
    getConfig_: () => ({ botToken: 'token', webhookSecret: 'secret-1', ownerUserId: '111', sheetId: 'sheet' }),
    callTelegram_: (token, method, payload) => {
      calls.push({ method, payload });
      return { username: 'test_bot' };
    },
    SpreadsheetApp: { openById: () => ({ getName: () => 'Sheet' }) },
    ensureBotSettings_: () => false,
    BOT_SETTINGS_SHEET: 'Bot Settings',
    console: { log: () => {} },
  };
  const { setup } = new Function(...Object.keys(globals), source + '\nreturn { setup };')(...Object.values(globals));
  setup();
  return calls;
}

test('the webhook address comes from the DEPLOYMENT_ID property', () => {
  const calls = run({ DEPLOYMENT_ID: ' AKfycbNew123 ' });
  const webhook = calls.find((call) => call.method === 'setWebhook');
  assert.equal(webhook.payload.url, 'https://script.google.com/macros/s/AKfycbNew123/exec?secret=secret-1');
});

test('setup stops before contacting Telegram without a deployment ID', () => {
  assert.throws(() => run({}), /Missing Script Properties: DEPLOYMENT_ID/);
});

test('a deployment ID with other characters is refused', () => {
  assert.throws(() => run({ DEPLOYMENT_ID: 'AKfycb/../x' }), /DEPLOYMENT_ID may only contain/);
});

test('no deployment ID is written in the code', () => {
  assert.doesNotMatch(source, /AKfycb/);
});
