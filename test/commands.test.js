const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'src', name), 'utf8');
const source = [read('parser.js'), read('timezones.js'), read('commands.js')].join('\n');

const CODES = { f: 'Food & Drink', acc: 'Accommodation', atm: 'ATM fees' };

// Stands in for the sheet and Script Properties, which the tracker and settings tests cover.
function simulate(options = {}) {
  const settings = {
    country: '',
    city: '',
    currency: '',
    rate: null,
    timeZone: '',
    lastBotRow: null,
    categoryCodes: CODES,
    ...options.settings,
  };
  const properties = { ...options.properties };
  const calls = { rows: [], removed: [], errors: [], zones: [] };
  let nextRow = 191;
  const logRows = options.logRows ? options.logRows.slice() : [];

  const globals = {
    SpreadsheetApp: { openById: () => 'SPREADSHEET' },
    Utilities: {
      formatDate: (date, zone, pattern) => {
        calls.zones.push(zone);
        return date.toISOString().slice(0, pattern.length);
      },
    },
    readLogExpenses_: () => {
      if (options.readFails) {
        throw new Error('Log unreadable');
      }
      return logRows;
    },
    Session: { getScriptTimeZone: () => 'America/La_Paz' },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => (name in properties ? properties[name] : null),
        setProperty: (name, value) => {
          if (options.propertyWriteFails) {
            throw new Error('Properties are down');
          }
          properties[name] = value;
        },
        deleteProperty: (name) => {
          delete properties[name];
        },
      }),
    },
    console: { error: (text) => calls.errors.push(text) },
    readBotSettings_: () => ({ ...settings }),
    writeBotSettings_: (spreadsheet, changes) => Object.assign(settings, changes),
    readCurrencyOptions_: () => (options.currencyOptions === undefined ? ['EUR', 'BOB', 'PEN', 'COP'] : options.currencyOptions),
    addExpenseRow_: (spreadsheet, entry) => {
      if (options.writeFails) {
        throw new Error('Sheet is down');
      }
      calls.rows.push(entry);
      logRows.push({ day: entry.sentAt.toISOString().slice(0, 10), amount: entry.amount, currency: entry.currency, amountEur: entry.amount / entry.rate });
      return { row: nextRow++, amountEur: entry.amount / entry.rate };
    },
    removeExpenseRow_: (spreadsheet, row, cells) => {
      if (options.rowChanged) {
        return false;
      }
      calls.removed.push({ row, cells });
      return true;
    },
  };

  const { handleMessage_ } = new Function(...Object.keys(globals), source + '\nreturn { handleMessage_ };')(...Object.values(globals));
  const send = (text, date = 1793800000) => handleMessage_({ sheetId: 'sheet' }, { text, date });
  return { send, settings, properties, calls };
}

const ready = { country: 'Bolivia', city: 'Santa cruz', currency: 'BOB', rate: 13.3, timeZone: 'America/La_Paz' };

test('your example, from the three commands to the saved row', () => {
  const { send, settings, calls } = simulate();
  send('/country Bolivia');
  send('/city Santa cruz');
  send('/currency BOB 13,3');
  const reply = send('14 f');

  assert.equal(reply, 'Saved row 191: 14 BOB = 1,05 EUR, Food & Drink, Santa cruz, Bolivia\nToday: 14 BOB = 1,05 EUR (1 expense)');
  assert.equal(settings.rate, 13.3);
  assert.equal(settings.lastBotRow, 191);
  const row = calls.rows[0];
  assert.equal(row.country, 'Bolivia');
  assert.equal(row.city, 'Santa cruz');
  assert.equal(row.category, 'Food & Drink');
  assert.equal(row.amount, 14);
  assert.equal(row.currency, 'BOB');
  assert.equal(row.rate, 13.3);
  assert.equal(row.timeZone, 'America/La_Paz');
});

test('the date comes from when the message was sent', () => {
  const { send, calls } = simulate({ settings: ready });
  send('14 f', 1793800000);
  assert.equal(calls.rows[0].sentAt.getTime(), 1793800000000);
});

test('notes are saved and shown in the reply', () => {
  const { send, calls } = simulate({ settings: ready });
  assert.match(send('14 f lunch with Ana'), /\(note: lunch with Ana\)\nToday:/);
  assert.equal(calls.rows[0].notes, 'lunch with Ana');
});

test('an EUR expense shows one amount', () => {
  const { send } = simulate({ settings: { ...ready, currency: 'EUR', rate: 1 } });
  assert.equal(send('12,5 f'), 'Saved row 191: 12,50 EUR, Food & Drink, Santa cruz, Bolivia\nToday: 12,50 EUR (1 expense)');
});

test('nothing is saved until all settings are there, and the reply says what is missing', () => {
  const { send, calls } = simulate({ settings: { country: 'Bolivia' } });
  const reply = send('14 f');
  assert.match(reply, /^Not saved: set these first:/);
  assert.match(reply, /\/city/);
  assert.match(reply, /\/currency/);
  assert.doesNotMatch(reply, /\/country/);
  assert.deepEqual(calls.rows, []);
});

test('a message the parser rejects is not saved and says why', () => {
  const { send, calls } = simulate({ settings: ready });
  assert.equal(send('14 x'), 'Not saved: unknown category "x". Send /help for the codes.');
  assert.match(send('hello'), /^Not saved: I couldn't read "hello"/);
  assert.match(send('/nope'), /^Not saved: unknown command/);
  assert.deepEqual(calls.rows, []);
});

test('a message with no text, like a photo, gets a clear reply', () => {
  const { send, calls } = simulate({ settings: ready });
  assert.match(send(undefined), /^Not saved: I can only read text/);
  assert.deepEqual(calls.rows, []);
});

test('a failed sheet write reaches the caller, which replies Not saved', () => {
  const { send } = simulate({ settings: ready, writeFails: true });
  assert.throws(() => send('14 f'), /Sheet is down/);
});

test('a row that saved stays reported as saved if /undo cannot record it', () => {
  const { send, calls } = simulate({ settings: ready, propertyWriteFails: true });
  const reply = send('14 f');
  assert.match(reply, /^Saved row 191/);
  assert.match(reply, /\/undo can't remove this one/);
  assert.equal(calls.errors.length, 1);
  assert.match(send('/undo'), /^Nothing to undo/);
});

test('/country keeps the name as typed and sets the time zone', () => {
  const { send, settings } = simulate({ settings: { timeZone: 'America/Lima' } });
  const reply = send('/country Bolivia');
  assert.equal(settings.country, 'Bolivia');
  assert.equal(settings.timeZone, 'America/La_Paz');
  assert.equal(reply, 'Country: Bolivia. City: not set. Currency: not set. Update these if needed.');
});

test('time zones work with accents, any case and Spanish names', () => {
  for (const [name, zone] of [['México', 'America/Mexico_City'], ['PERÚ', 'America/Lima'], ['costa  rica', 'America/Costa_Rica'], ['Brasil', 'America/Sao_Paulo']]) {
    const { send, settings } = simulate();
    send('/country ' + name);
    assert.equal(settings.timeZone, zone, name);
  }
});

test('an unknown country keeps the last time zone and says so', () => {
  const { send, settings } = simulate({ settings: { timeZone: 'America/Lima' } });
  const reply = send('/country Atlantis');
  assert.equal(settings.country, 'Atlantis');
  assert.equal(settings.timeZone, 'America/Lima');
  assert.match(reply, /keep using America\/Lima/);
});

test('words like constructor are not treated as countries', () => {
  const { send, settings } = simulate({ settings: { timeZone: 'America/Lima' } });
  send('/country constructor');
  assert.equal(settings.timeZone, 'America/Lima');
});

test('with no time zone yet, dates use the script time zone', () => {
  const { send, calls } = simulate({ settings: { ...ready, timeZone: '' } });
  send('14 f');
  assert.equal(calls.rows[0].timeZone, 'America/La_Paz');
});

test('changing the country keeps the city, currency and rate, and shows them', () => {
  const { send, settings } = simulate({ settings: ready });
  const reply = send('/country Peru');
  assert.equal(settings.city, 'Santa cruz');
  assert.equal(settings.rate, 13.3);
  assert.equal(reply, 'Country: Peru. City: Santa cruz. Currency: BOB at 13,3. Update these if needed.');
});

test('/currency must be in the dropdown', () => {
  const { send, settings } = simulate({ settings: ready });
  assert.match(send('/currency XYZ 3'), /^Not saved: XYZ isn't in your Currency dropdown/);
  assert.equal(settings.currency, 'BOB');
  assert.match(send('/currency pen 3,81'), /Currency: PEN at 3,81/);
  assert.equal(settings.rate, 3.81);
});

test('/currency still works if the dropdown cannot be read', () => {
  const { send, settings } = simulate({ currencyOptions: null });
  send('/currency XYZ 3');
  assert.equal(settings.currency, 'XYZ');
});

test('/currency EUR sets the rate to 1', () => {
  const { send, settings } = simulate({ settings: ready });
  send('/currency EUR');
  assert.equal(settings.currency, 'EUR');
  assert.equal(settings.rate, 1);
});

test('/undo removes the last expense once', () => {
  const { send, settings, calls } = simulate({ settings: ready });
  send('14 f');
  assert.equal(send('/undo'), 'Removed row 191: 14 BOB, Food & Drink, Santa cruz, Bolivia');
  assert.deepEqual(calls.removed, [{ row: 191, cells: ['Bolivia', 'Santa cruz', 'Food & Drink', 14, 'BOB'] }]);
  assert.equal(settings.lastBotRow, '');
  assert.match(send('/undo'), /^Nothing to undo/);
  assert.equal(calls.removed.length, 1);
});

test('/undo with nothing recorded changes nothing', () => {
  const { send, calls } = simulate({ settings: ready, properties: { LAST_BOT_EXPENSE: 'not json' } });
  assert.match(send('/undo'), /^Nothing to undo/);
  assert.deepEqual(calls.removed, []);
  assert.equal(calls.errors.length, 1);
});

test('/undo leaves a row alone if it has changed', () => {
  const { send, settings } = simulate({ settings: ready, rowChanged: true });
  send('14 f');
  assert.match(send('/undo'), /^Not removed: row 191 no longer holds/);
  assert.equal(settings.lastBotRow, 191);
});

test('a failed expense can never let /undo remove the older row', () => {
  const { send, calls, properties } = simulate({ settings: ready });
  send('14 f');
  assert.ok(properties.LAST_BOT_EXPENSE);

  const failing = simulate({ settings: ready, writeFails: true, properties });
  assert.throws(() => failing.send('20 f'));
  assert.match(failing.send('/undo'), /^Nothing to undo/);
  assert.deepEqual(calls.removed, []);
  assert.deepEqual(failing.calls.removed, []);
});

test('/help and /start show the commands, settings and codes', () => {
  for (const command of ['/help', '/start']) {
    const { send } = simulate({ settings: ready });
    const reply = send(command);
    assert.match(reply, /\/currency <code> <rate>/);
    assert.match(reply, /\/undo/);
    assert.match(reply, /Country: Bolivia\. City: Santa cruz\. Currency: BOB at 13,3\./);
    assert.match(reply, /f = Food & Drink/);
    assert.match(reply, /atm = ATM fees/);
  }
});

const NOV_6 = Date.UTC(2026, 10, 6, 12) / 1000;
const expense = (day, amount, currency, amountEur, category = 'Food & Drink') => ({ day, amount, currency, amountEur, category });

test('/day totals only today, in local currency and EUR', () => {
  const logRows = [
    expense('2026-11-06', 14, 'BOB', 14 / 13.3),
    expense('2026-11-06', 20.5, 'BOB', 20.5 / 13.3),
    expense('2026-11-05', 100, 'BOB', 100 / 13.3),
    expense('2026-10-06', 100, 'BOB', 100 / 13.3),
  ];
  const { send } = simulate({ settings: ready, logRows });
  assert.equal(send('/day', NOV_6), 'Today, 2026-11-06 (2 expenses):\n34,5 BOB\nTotal: 2,59 EUR');
});

test('/month totals the whole month, with one line per currency', () => {
  const logRows = [
    expense('2026-11-01', 30, 'PEN', 7.5),
    expense('2026-11-06', 14, 'BOB', 1),
    expense('2026-11-06', 5, 'EUR', 5),
    expense('2026-11-30', 16, 'BOB', 1.2),
    expense('2026-10-31', 999, 'BOB', 75),
    expense('2025-11-06', 999, 'BOB', 75),
  ];
  const { send } = simulate({ settings: ready, logRows });
  assert.equal(send('/month', NOV_6), 'This month, 2026-11 (4 expenses):\n30 PEN\n30 BOB\n5 EUR\nTotal: 14,70 EUR\n\nBy category:\nFood & Drink: 14,70 EUR (100%)');
});

test('"today" follows the current time zone', () => {
  const { send, calls } = simulate({ settings: { ...ready, timeZone: 'America/Lima' } });
  send('/day', NOV_6);
  assert.deepEqual(calls.zones, ['America/Lima']);
});

test('/day and /month say so when nothing was spent', () => {
  const { send } = simulate({ settings: ready, logRows: [expense('2026-11-05', 1, 'BOB', 1)] });
  assert.equal(send('/day', NOV_6), 'Today, 2026-11-06: no expenses.');
  const empty = simulate({ settings: ready });
  assert.equal(empty.send('/month', NOV_6), 'This month, 2026-11: no expenses.');
});

test('/day works before any settings are set', () => {
  const { send } = simulate({ logRows: [expense('2026-11-06', 14, 'BOB', 1.05)] });
  assert.match(send('/day', NOV_6), /Total: 1,05 EUR/);
});

test('a single expense reads naturally, and EUR-only spending shows one amount', () => {
  const { send } = simulate({ settings: ready, logRows: [expense('2026-11-06', 12.5, 'EUR', 12.5)] });
  assert.equal(send('/day', NOV_6), 'Today, 2026-11-06 (1 expense):\nTotal: 12,50 EUR');
});

test('a row typed with only a EUR amount still counts, and is shown apart', () => {
  const logRows = [expense('2026-11-06', 14, 'BOB', 1), expense('2026-11-06', null, '', 45.95)];
  const { send } = simulate({ settings: ready, logRows });
  assert.equal(send('/day', NOV_6), 'Today, 2026-11-06 (2 expenses):\n14 BOB\n45,95 EUR with no local amount\nTotal: 46,95 EUR');
});

test('rows with no EUR amount are named, not silently lost', () => {
  const logRows = [expense('2026-11-06', 14, 'BOB', 1), expense('2026-11-06', 7, 'BOB', null)];
  const { send } = simulate({ settings: ready, logRows });
  assert.equal(send('/day', NOV_6), 'Today, 2026-11-06 (2 expenses):\n21 BOB\nTotal: 1,00 EUR\n1 row has no EUR amount, so the total leaves it out.');
});

test('adding decimals does not show rounding noise', () => {
  const logRows = [expense('2026-11-06', 0.1, 'BOB', 0), expense('2026-11-06', 0.2, 'BOB', 0)];
  const { send } = simulate({ settings: ready, logRows });
  assert.match(send('/day', NOV_6), /\n0,3 BOB\n/);
});

test('a currency named like a built-in word adds up normally', () => {
  const logRows = [expense('2026-11-06', 3, 'constructor', 1)];
  const { send } = simulate({ settings: ready, logRows });
  assert.match(send('/day', NOV_6), /\n3 constructor\n/);
});

test('/help lists the new commands', () => {
  const { send } = simulate({ settings: ready });
  const reply = send('/help');
  assert.match(reply, /\/day/);
  assert.match(reply, /\/month/);
});

test('the saved reply adds up today, including the new expense and earlier ones', () => {
  const logRows = [expense('2026-11-06', 20, 'BOB', 1.5), expense('2026-11-05', 100, 'BOB', 7.52)];
  const { send } = simulate({ settings: ready, logRows });
  const reply = send('14 f', NOV_6);
  assert.equal(reply.split('\n')[1], 'Today: 34 BOB = 2,55 EUR (2 expenses)');
});

test('the saved reply shows each currency when today has several', () => {
  const logRows = [expense('2026-11-06', 30, 'PEN', 7.5), expense('2026-11-06', null, '', 45.95), expense('2026-11-06', 7, 'BOB', null)];
  const { send } = simulate({ settings: ready, logRows });
  const reply = send('14 f', NOV_6);
  assert.equal(reply.split('\n')[1], 'Today: 30 PEN + 21 BOB + 45,95 EUR = 54,50 EUR (4 expenses, 1 without a EUR amount)');
});

test('today in the saved reply follows the current time zone', () => {
  const { send, calls } = simulate({ settings: { ...ready, timeZone: 'America/Lima' } });
  send('14 f', NOV_6);
  assert.deepEqual(calls.zones, ['America/Lima']);
});

test('if today cannot be added up, the expense is still reported as saved', () => {
  const { send, calls } = simulate({ settings: ready, readFails: true });
  const reply = send('14 f', NOV_6);
  assert.equal(reply, 'Saved row 191: 14 BOB = 1,05 EUR, Food & Drink, Santa cruz, Bolivia');
  assert.equal(calls.rows.length, 1);
  assert.match(calls.errors[0], /Log unreadable/);
});

test('an undo note and today both fit in the saved reply', () => {
  const { send } = simulate({ settings: ready, propertyWriteFails: true });
  const reply = send('14 f', NOV_6);
  assert.match(reply, /fix it in the sheet if needed\.\nToday: 14 BOB = 1,05 EUR \(1 expense\)$/);
});

test('/month lists each category in EUR, biggest first, with its share', () => {
  const logRows = [
    expense('2026-11-02', 100, 'BOB', 7.52, 'Food & Drink'),
    expense('2026-11-03', 650, 'BOB', 48.87, 'Accommodation'),
    expense('2026-11-04', 30000, 'CLP', 31.25, 'Accommodation'),
    expense('2026-11-05', 2000, 'CLP', 0.3, 'ATM fees'),
    expense('2026-11-06', 50, 'BOB', 3.76, 'Local Transport'),
  ];
  const { send } = simulate({ settings: ready, logRows });
  const reply = send('/month', NOV_6);
  assert.equal(reply.split('\n\n')[1], [
    'By category:',
    'Accommodation: 80,12 EUR (87%)',
    'Food & Drink: 7,52 EUR (8%)',
    'Local Transport: 3,76 EUR (4%)',
    'ATM fees: 0,30 EUR (<1%)',
  ].join('\n'));
});

test('/month puts rows with no category under their own line and leaves out rows with no EUR amount', () => {
  const logRows = [
    expense('2026-11-02', 10, 'BOB', 3, ''),
    expense('2026-11-03', 10, 'BOB', 1, 'Food & Drink'),
    expense('2026-11-04', 10, 'BOB', null, 'Accommodation'),
  ];
  const { send } = simulate({ settings: ready, logRows });
  const reply = send('/month', NOV_6);
  assert.match(reply, /By category:\nNo category: 3,00 EUR \(75%\)\nFood & Drink: 1,00 EUR \(25%\)$/);
  assert.doesNotMatch(reply, /Accommodation/);
});

test('/month with nothing spent has no category section, and /day never has one', () => {
  const empty = simulate({ settings: ready });
  assert.equal(empty.send('/month', NOV_6), 'This month, 2026-11: no expenses.');
  const { send } = simulate({ settings: ready, logRows: [expense('2026-11-06', 14, 'BOB', 1.05)] });
  assert.doesNotMatch(send('/day', NOV_6), /By category/);
});

test('saved replies stay unchanged by the category breakdown', () => {
  const { send } = simulate({ settings: ready });
  assert.doesNotMatch(send('14 f', NOV_6), /By category/);
});
