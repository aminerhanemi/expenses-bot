const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Apps Script files share one global scope and have no modules, so the source is loaded directly.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'parser.js'), 'utf8');
const { DEFAULT_CATEGORY_CODES, parseAmount_, parseMessage_, parseRate_ } = new Function(
  source + '\nreturn { DEFAULT_CATEGORY_CODES, parseAmount_, parseMessage_, parseRate_ };',
)();

const parse = (text) => parseMessage_(text, DEFAULT_CATEGORY_CODES);

test('amounts accept a comma or a dot for decimals', () => {
  const cases = {
    14: 14,
    '13,5': 13.5,
    '13.5': 13.5,
    '974.25': 974.25,
    '0,50': 0.5,
    '1234': 1234,
    '1234,5': 1234.5,
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(parseAmount_(text), expected, text);
  }
});

test('three digits after a separator mark thousands', () => {
  const cases = {
    '12.500': 12500,
    '12,500': 12500,
    '1.234.567': 1234567,
    '1,234,567': 1234567,
    '1.234,50': 1234.5,
    '1,234.50': 1234.5,
  };
  for (const [text, expected] of Object.entries(cases)) {
    assert.equal(parseAmount_(text), expected, text);
  }
});

test('amounts that are invalid or could be read two ways are rejected', () => {
  const cases = ['0', '0,00', '-5', 'abc', '12.', ',5', '1.23.4', '1.234,567', '1234.567', '0.500', '1,2,3', '1e5', '14f', ''];
  for (const text of cases) {
    assert.equal(parseAmount_(text), null, JSON.stringify(text));
  }
});

test('rates accept a comma or a dot, and reject three decimals', () => {
  assert.equal(parseRate_('13,3'), 13.3);
  assert.equal(parseRate_('13.3'), 13.3);
  assert.equal(parseRate_('4500'), 4500);
  assert.equal(parseRate_('3,81'), 3.81);
  for (const text of ['4.500', '3,812', '1.234,5', '0', 'abc', '-3']) {
    assert.equal(parseRate_(text), null, text);
  }
});

test('your example expense is read correctly', () => {
  assert.deepEqual(parse('14 f'), { type: 'expense', amount: 14, category: 'Food & Drink', notes: '' });
});

test('every category code maps to its dropdown value, in any case', () => {
  const expected = {
    acc: 'Accommodation',
    f: 'Food & Drink',
    it: 'Intl/Intercity Transport',
    lt: 'Local Transport',
    act: 'Activities & Tours',
    v: 'Visas & Documents',
    i: 'Travel Insurance',
    h: 'Health & Vaccinations',
    g: 'Gear & Shopping',
    c: 'Connectivity (SIM/Data)',
    e: 'Emergency Fund',
    m: 'Misc/Other',
    atm: 'ATM fees',
  };
  assert.deepEqual(DEFAULT_CATEGORY_CODES, expected);
  for (const [code, category] of Object.entries(expected)) {
    assert.equal(parse('14 ' + code).category, category);
    assert.equal(parse('14 ' + code.toUpperCase()).category, category);
  }
});

test('extra words after the code go in Notes', () => {
  assert.equal(parse('14 f lunch at the market').notes, 'lunch at the market');
  assert.equal(parse('  14   f   lunch  ').notes, 'lunch');
});

test('expenses that cannot be read explain why', () => {
  assert.match(parse('14').error, /add a category code/);
  assert.match(parse('14 x').error, /unknown category "x"/);
  assert.match(parse('f 14').error, /"f" as an amount/);
  assert.match(parse('').error, /as an amount/);
  assert.equal(parse(null).type, 'error');
});

test('category words like constructor are not treated as codes', () => {
  assert.equal(parse('14 constructor').type, 'error');
});

test('/country and /city keep the name as typed', () => {
  assert.deepEqual(parse('/country Bolivia'), { type: 'command', name: 'country', value: 'Bolivia' });
  assert.deepEqual(parse('/city Santa cruz'), { type: 'command', name: 'city', value: 'Santa cruz' });
  assert.equal(parse('/COUNTRY Costa Rica').value, 'Costa Rica');
});

test('quotation marks around names and currencies are removed', () => {
  assert.equal(parse('/country "Bolivia"').value, 'Bolivia');
  assert.equal(parse('/city “Santa cruz”').value, 'Santa cruz');
  assert.equal(parse('/city «Santa cruz»').value, 'Santa cruz');
  assert.deepEqual(parse('/currency "BOB" "13,3"'), { type: 'command', name: 'currency', currency: 'BOB', rate: 13.3 });
});

test('/country and /city need a name', () => {
  assert.match(parse('/country').error, /add a name/);
  assert.match(parse('/city ""').error, /add a name/);
});

test('/currency reads the code and the rate', () => {
  assert.deepEqual(parse('/currency BOB 13,3'), { type: 'command', name: 'currency', currency: 'BOB', rate: 13.3 });
  assert.equal(parse('/currency bob 13.3').currency, 'BOB');
});

test('/currency EUR needs no rate', () => {
  assert.equal(parse('/currency EUR').rate, 1);
  assert.equal(parse('/currency eur 1').rate, 1);
  assert.match(parse('/currency EUR 2').error, /always 1/);
});

test('/currency rejects missing or unclear values', () => {
  assert.match(parse('/currency').error, /couldn't read that currency/);
  assert.match(parse('/currency BOB').error, /add the rate/);
  assert.match(parse('/currency BOB 4.500').error, /the rate "4.500"/);
  assert.match(parse('/currency BOB 0').error, /the rate "0"/);
  assert.match(parse('/currency BOLIVIANO 13').error, /couldn't read that currency/);
  assert.match(parse('/currency BOB 13 extra').error, /couldn't read that currency/);
});

test('/undo, /help and /start are recognized, and others are not', () => {
  assert.deepEqual(parse('/undo'), { type: 'command', name: 'undo' });
  assert.deepEqual(parse('/help'), { type: 'command', name: 'help' });
  assert.deepEqual(parse('/start'), { type: 'command', name: 'start' });
  assert.match(parse('/total').error, /unknown command "\/total"/);
  assert.match(parse('/').error, /unknown command/);
});

test('/day and /month are recognized, in any case and ignoring extra words', () => {
  for (const name of ['day', 'month']) {
    assert.deepEqual(parseMessage_('/' + name, {}), { type: 'command', name });
    assert.deepEqual(parseMessage_('/' + name.toUpperCase(), {}), { type: 'command', name });
    assert.deepEqual(parseMessage_('/' + name + ' please', {}), { type: 'command', name });
    assert.deepEqual(parseMessage_('/' + name + '@SomeBot', {}), { type: 'command', name });
  }
});
