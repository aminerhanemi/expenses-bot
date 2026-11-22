const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'settings.js'), 'utf8');
const asText_ = (value) => (value ? "'" + value : '');
const { parseBotSettings_, writeBotSettings_ } = new Function('asText_', source + '\nreturn { parseBotSettings_, writeBotSettings_ };')(asText_);

const settings = (overrides = {}) => [
  ['Country', overrides.country ?? 'Bolivia'],
  ['City', overrides.city ?? 'Santa cruz'],
  ['Currency', overrides.currency ?? 'BOB'],
  ['Rate (for 1 EUR)', overrides.rate ?? 13.3],
  ['Time zone', overrides.timeZone ?? 'America/La_Paz'],
  ['Last bot row', overrides.lastBotRow ?? 191],
];

test('reads the current settings', () => {
  const result = parseBotSettings_(settings(), []);
  assert.equal(result.country, 'Bolivia');
  assert.equal(result.city, 'Santa cruz');
  assert.equal(result.currency, 'BOB');
  assert.equal(result.rate, 13.3);
  assert.equal(result.timeZone, 'America/La_Paz');
  assert.equal(result.lastBotRow, 191);
});

test('blank settings read as empty, so the bot can ask for them', () => {
  const blank = { country: '', city: '', currency: '', rate: '', timeZone: '', lastBotRow: '' };
  const result = parseBotSettings_(settings(blank), []);
  assert.equal(result.country, '');
  assert.equal(result.city, '');
  assert.equal(result.currency, '');
  assert.equal(result.rate, null);
  assert.equal(result.lastBotRow, null);
});

test('a rate that is text, zero or negative is not used', () => {
  for (const rate of ['13,3', 0, -1]) {
    assert.equal(parseBotSettings_(settings({ rate }), []).rate, null, String(rate));
  }
});

test('values are trimmed', () => {
  assert.equal(parseBotSettings_(settings({ city: '  La Paz ' }), []).city, 'La Paz');
});

test('category codes ignore case and skip incomplete rows', () => {
  const rows = [
    ['F', 'Food & Drink'],
    [' acc ', ' Accommodation '],
    ['', ''],
    ['x', ''],
    ['', 'Misc/Other'],
  ];
  assert.deepEqual(parseBotSettings_(settings(), rows).categoryCodes, {
    f: 'Food & Drink',
    acc: 'Accommodation',
  });
});

test('text is written as text, while numbers and blanks stay as they are', () => {
  const written = {};
  const labels = settings().map((row) => [row[0]]);
  const sheet = {
    getRange: (row, column, rows) => ({
      getValues: () => (rows ? labels : []),
      setValue: (value) => {
        written[labels[row - 2][0]] = value;
      },
    }),
  };
  const spreadsheet = { getSheetByName: () => sheet };

  writeBotSettings_(spreadsheet, { city: '12/10', rate: 13.3, lastBotRow: '' });
  assert.deepEqual(written, { City: "'12/10", 'Rate (for 1 EUR)': 13.3, 'Last bot row': '' });
});

test('a settings row that is missing stops the write with a clear error', () => {
  const sheet = { getRange: () => ({ getValues: () => [['Country']] }) };
  assert.throws(() => writeBotSettings_({ getSheetByName: () => sheet }, { city: 'Lima' }), /"City" row/);
});
