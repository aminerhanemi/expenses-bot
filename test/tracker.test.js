const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'tracker.js'), 'utf8');
const HEADERS = ['Date', 'Country', 'City', 'Category', 'Local Amount', 'Currency', 'Amount (EUR)', 'Notes'];
const COLUMNS = HEADERS.length;

// A small stand-in for the Budget Tracker tab: rows of cells, with formulas in column G.
function fakeTracker({ headerRow = 20, lastLogRow = 220, usedRows = 170, acceptedSeparator = ',', throwOnWrongSeparator = false, stretches = true } = {}) {
  const firstRow = headerRow + 1;
  const values = [];
  const formulas = [];
  const blank = () => Array(COLUMNS).fill('');
  for (let row = 0; row <= lastLogRow + 1; row += 1) {
    values.push(blank());
    formulas.push(blank());
  }
  values[headerRow] = HEADERS.slice();
  for (let row = firstRow; row < firstRow + usedRows; row += 1) {
    values[row] = ['old-date', 'Peru', 'Lima', 'Food & Drink', 10, 'PEN', 2.5, ''];
  }
  const totalRow = lastLogRow + 1;
  formulas[totalRow][6] = '=SUM(G' + firstRow + ':G' + lastLogRow + ')';
  values[totalRow][6] = 425;

  const state = { values, formulas, inserts: [], flushes: 0 };

  const evaluate = (row, formula) => {
    const match = /^=E(\d+)\/([\d.,]+)$/.exec(formula);
    const number = match[2];
    const usesOther = (acceptedSeparator === ',' && number.includes('.')) || (acceptedSeparator === '.' && number.includes(','));
    if (usesOther) {
      if (throwOnWrongSeparator) {
        throw new Error('Formula parse error');
      }
      return '#ERROR!';
    }
    return values[Number(match[1])][4] / Number(number.replace(',', '.'));
  };

  const makeRange = (row, column, rowCount, columnCount) => ({
    getValues: () => values.slice(row, row + rowCount).map((cells) => cells.slice(column - 1, column - 1 + columnCount)),
    getFormulas: () => formulas.slice(row, row + rowCount).map((cells) => cells.slice(column - 1, column - 1 + columnCount)),
    getValue: () => values[row][column - 1],
    getDataValidation: () => state.currencyRule,
    setValues: (rows) => {
      rows[0].forEach((value, index) => {
        if (state.rejectWrites) {
          throw new Error('Value is not in the dropdown');
        }
        values[row][column - 1 + index] = value;
        formulas[row][column - 1 + index] = '';
      });
    },
    setValue: (value) => {
      values[row][column - 1] = value;
      formulas[row][column - 1] = '';
    },
    setFormula: (formula) => {
      formulas[row][column - 1] = formula;
      values[row][column - 1] = evaluate(row, formula);
    },
    clearContent: () => {
      for (let index = 0; index < columnCount; index += 1) {
        values[row][column - 1 + index] = '';
        formulas[row][column - 1 + index] = '';
      }
    },
    copyTo: (target) => {
      const source = formulas[row].map((formula) => formula.replace(/E\d+/, 'E' + target.row));
      values[target.row] = values[row].slice();
      formulas[target.row] = source;
    },
    row,
  });

  const sheet = {
    getLastRow: () => values.length - 1,
    getRange: makeRange,
    insertRowsBefore: (before, count) => {
      state.inserts.push({ before, count });
      for (let index = 0; index < count; index += 1) {
        values.splice(before, 0, blank());
        formulas.splice(before, 0, blank());
      }
      formulas.forEach((cells) => {
        cells[6] = cells[6].replace(/E(\d+)/, (text, number) => 'E' + (Number(number) >= before ? Number(number) + count : number));
      });
      if (stretches) {
        const total = values.length - 1;
        formulas[total][6] = '=SUM(G' + firstRow + ':G' + (total - 1) + ')';
      }
    },
  };

  return { sheet, state };
}

function load(tracker) {
  const logged = [];
  const globals = {
    SpreadsheetApp: {
      flush: () => {
        tracker.state.flushes += 1;
      },
    },
    Utilities: {
      formatDate: (date, zone, pattern) => 'day-in-' + zone + '-' + pattern,
      parseDate: (day, zone, pattern) => day + '|sheet-' + zone + '|' + pattern,
    },
    console: { error: (text) => logged.push(text) },
  };
  const names = 'addExpenseRow_, removeExpenseRow_, readLogExpenses_, readCurrencyOptions_, findLogLayout_, eurFormulas_, isSameAmount_';
  const exported = new Function(...Object.keys(globals), source + '\nreturn { ' + names + ' };')(...Object.values(globals));
  return { ...exported, logged };
}

function spreadsheet(tracker) {
  return {
    getSheetByName: (name) => (name === 'Budget Tracker' ? tracker.sheet : null),
    getSpreadsheetTimeZone: () => 'America/Los_Angeles',
  };
}

const entry = (overrides = {}) => ({
  sentAt: new Date(0),
  timeZone: 'America/La_Paz',
  country: 'Bolivia',
  city: 'Santa cruz',
  category: 'Food & Drink',
  amount: 14,
  currency: 'BOB',
  rate: 13.3,
  notes: '',
  ...overrides,
});

test('the worked example lands on the next row with the right amount', () => {
  const tracker = fakeTracker();
  const { addExpenseRow_ } = load(tracker);
  const result = addExpenseRow_(spreadsheet(tracker), entry());

  assert.equal(result.row, 191);
  assert.ok(Math.abs(result.amountEur - 14 / 13.3) < 0.000001);
  const row = tracker.state.values[191];
  assert.deepEqual(row.slice(1, 6), ["'Bolivia", "'Santa cruz", 'Food & Drink', 14, 'BOB']);
  assert.equal(tracker.state.formulas[191][6], '=E191/13,3');
  assert.equal(row[7], '');
  assert.deepEqual(tracker.state.inserts, []);
});

test('the day comes from the current time zone and is stored in the sheet time zone', () => {
  const tracker = fakeTracker();
  const { addExpenseRow_ } = load(tracker);
  addExpenseRow_(spreadsheet(tracker), entry());
  assert.equal(tracker.state.values[191][0], 'day-in-America/La_Paz-yyyy-MM-dd|sheet-America/Los_Angeles|yyyy-MM-dd');
});

test('notes and names are stored as text, so they cannot become formulas', () => {
  const tracker = fakeTracker();
  const { addExpenseRow_ } = load(tracker);
  addExpenseRow_(spreadsheet(tracker), entry({ notes: '=1+1', city: '12/10' }));
  assert.equal(tracker.state.values[191][7], "'=1+1");
  assert.equal(tracker.state.values[191][2], "'12/10");
});

test('a sheet that only accepts a dot still gets a formula', () => {
  for (const throwOnWrongSeparator of [false, true]) {
    const tracker = fakeTracker({ acceptedSeparator: '.', throwOnWrongSeparator });
    const { addExpenseRow_ } = load(tracker);
    addExpenseRow_(spreadsheet(tracker), entry());
    assert.equal(tracker.state.formulas[191][6], '=E191/13.3');
    assert.ok(Math.abs(tracker.state.values[191][6] - 14 / 13.3) < 0.000001);
  }
});

test('a fixed number is written if no formula gives the right result', () => {
  const tracker = fakeTracker({ acceptedSeparator: 'none' });
  const { addExpenseRow_, logged } = load(tracker);
  // With no separator accepted, a rate with decimals fails both ways.
  const original = tracker.sheet.getRange;
  tracker.sheet.getRange = (row, column, rowCount, columnCount) => {
    const range = original(row, column, rowCount, columnCount);
    range.setFormula = (formula) => {
      tracker.state.formulas[row][column - 1] = formula;
      tracker.state.values[row][column - 1] = '#ERROR!';
    };
    return range;
  };
  addExpenseRow_(spreadsheet(tracker), entry());
  assert.equal(tracker.state.formulas[191][6], '');
  assert.ok(Math.abs(tracker.state.values[191][6] - 14 / 13.3) < 0.000001);
  assert.equal(logged.length, 1);
});

test('EUR expenses store just the amount', () => {
  const tracker = fakeTracker();
  const { addExpenseRow_ } = load(tracker);
  const result = addExpenseRow_(spreadsheet(tracker), entry({ currency: 'EUR', rate: 1, amount: 12.5 }));
  assert.equal(result.amountEur, 12.5);
  assert.equal(tracker.state.values[191][6], 12.5);
  assert.equal(tracker.state.formulas[191][6], '');
});

test('a whole-number rate needs no separator', () => {
  const { eurFormulas_ } = load(fakeTracker());
  assert.deepEqual(eurFormulas_(191, 13), ['=E191/13']);
  assert.deepEqual(eurFormulas_(191, 3.81), ['=E191/3,81', '=E191/3.81']);
});

test('a failed write leaves no half-written row', () => {
  const tracker = fakeTracker();
  const { addExpenseRow_ } = load(tracker);
  tracker.state.rejectWrites = true;
  assert.throws(() => addExpenseRow_(spreadsheet(tracker), entry()), /dropdown/);
  assert.deepEqual(tracker.state.values[191], Array(COLUMNS).fill(''));
});

test('exactly 20 empty rows is still enough room', () => {
  const tracker = fakeTracker({ usedRows: 180 });
  const { addExpenseRow_ } = load(tracker);
  assert.equal(addExpenseRow_(spreadsheet(tracker), entry()).row, 201);
  assert.deepEqual(tracker.state.inserts, []);
});

test('with 19 empty rows, 200 rows go above the last log row and the expense still fits', () => {
  const tracker = fakeTracker({ usedRows: 181 });
  const { addExpenseRow_ } = load(tracker);
  assert.equal(addExpenseRow_(spreadsheet(tracker), entry()).row, 202);
  assert.deepEqual(tracker.state.inserts, [{ before: 220, count: 200 }]);
  assert.equal(tracker.state.formulas[421][6], '=SUM(G21:G420)');
});

test('a full log grows and keeps its newest row in order', () => {
  const tracker = fakeTracker({ usedRows: 200 });
  tracker.state.values[220][7] = 'newest';
  tracker.state.formulas[220][6] = '=E220/4';
  const { addExpenseRow_ } = load(tracker);

  assert.equal(addExpenseRow_(spreadsheet(tracker), entry()).row, 221);
  assert.equal(tracker.state.values[220][7], 'newest');
  assert.equal(tracker.state.formulas[220][6], '=E220/4');
  assert.deepEqual(tracker.state.values[420], Array(COLUMNS).fill(''));
  assert.equal(tracker.state.formulas[420][6], '');
});

test('nothing is written if the total does not stretch', () => {
  const tracker = fakeTracker({ usedRows: 181, stretches: false });
  const { addExpenseRow_ } = load(tracker);
  assert.throws(() => addExpenseRow_(spreadsheet(tracker), entry()), /log total/);
  assert.deepEqual(tracker.state.values[202], Array(COLUMNS).fill(''));
});

test('the log is still found after a row is added above it', () => {
  const tracker = fakeTracker({ headerRow: 21, lastLogRow: 221 });
  const { addExpenseRow_ } = load(tracker);
  assert.equal(addExpenseRow_(spreadsheet(tracker), entry()).row, 192);
});

test('a row with no date still counts as used, so it is not overwritten', () => {
  const tracker = fakeTracker();
  tracker.state.values[191] = ['', '', '', '', '', '', 5, ''];
  const { addExpenseRow_ } = load(tracker);
  assert.equal(addExpenseRow_(spreadsheet(tracker), entry()).row, 192);
});

test('an empty log starts on its first row', () => {
  const { findLogLayout_ } = load(fakeTracker());
  const tracker = fakeTracker({ usedRows: 0 });
  const layout = findLogLayout_(tracker.state.values.slice(1), tracker.state.formulas.slice(1).map((row) => row[6]));
  assert.deepEqual(layout, { firstRow: 21, lastRow: 220, nextRow: 21 });
});

test('a missing tab, headers or total stops the write with a clear error', () => {
  const tracker = fakeTracker();
  const { addExpenseRow_, findLogLayout_ } = load(tracker);
  assert.throws(() => addExpenseRow_({ getSheetByName: () => null }, entry()), /tab is missing/);
  assert.throws(() => findLogLayout_([['Date']], ['']), /log headers/);
  const values = tracker.state.values.slice(1);
  const noTotal = values.map(() => '');
  assert.throws(() => findLogLayout_(values, noTotal), /log total/);
});

test('a SUM that does not cover the log is not taken for the total', () => {
  const tracker = fakeTracker();
  const { findLogLayout_ } = load(tracker);
  const values = tracker.state.values.slice(1);
  const formulas = tracker.state.formulas.slice(1).map((row) => row[6]);
  formulas[49] = '=SUM(G21:G30)';
  assert.equal(findLogLayout_(values, formulas).lastRow, 220);
});

test('undo clears a row only while it still holds the same expense', () => {
  const tracker = fakeTracker();
  const { removeExpenseRow_ } = load(tracker);
  const cells = ['Peru', 'Lima', 'Food & Drink', 10, 'PEN'];

  assert.equal(removeExpenseRow_(spreadsheet(tracker), 190, ['Peru', 'Lima', 'Food & Drink', 11, 'PEN']), false);
  assert.equal(tracker.state.values[190][1], 'Peru');

  assert.equal(removeExpenseRow_(spreadsheet(tracker), 190, cells), true);
  assert.deepEqual(tracker.state.values[190], Array(COLUMNS).fill(''));
});

test('undo never touches a row outside the log', () => {
  const tracker = fakeTracker();
  const { removeExpenseRow_ } = load(tracker);
  assert.equal(removeExpenseRow_(spreadsheet(tracker), 20, []), false);
  assert.equal(removeExpenseRow_(spreadsheet(tracker), 221, []), false);
  assert.equal(tracker.state.formulas[221][6], '=SUM(G21:G220)');
});

test('expenses are read with their day in the sheet time zone', () => {
  const tracker = fakeTracker({ usedRows: 0 });
  tracker.state.values[21] = [new Date(0), 'Peru', 'Lima', 'Food & Drink', 10, 'PEN', 2.5, ''];
  tracker.state.values[22] = [new Date(0), 'Peru', 'Cuzco', 'Accommodation', '', '', 45.95, ''];
  tracker.state.values[23] = ['not a date', 'Peru', 'Lima', 'Food & Drink', 10, 'PEN', 2.5, ''];
  tracker.state.values[24] = [new Date(0), 'Peru', 'Lima', 'Food & Drink', 10, 'PEN', '#ERROR!', ''];
  const { readLogExpenses_ } = load(tracker);
  const day = 'day-in-America/Los_Angeles-yyyy-MM-dd';
  assert.deepEqual(readLogExpenses_(spreadsheet(tracker)), [
    { day, amount: 10, currency: 'PEN', amountEur: 2.5 },
    { day, amount: null, currency: '', amountEur: 45.95 },
    { day, amount: 10, currency: 'PEN', amountEur: null },
  ]);
});

test('the total row and anything below the log are not read as expenses', () => {
  const tracker = fakeTracker({ usedRows: 200 });
  tracker.state.values[220][0] = new Date(0);
  tracker.state.values[221][0] = new Date(0);
  const { readLogExpenses_ } = load(tracker);
  assert.equal(readLogExpenses_(spreadsheet(tracker)).length, 1);
});

test('the currency list comes from the dropdown', () => {
  const tracker = fakeTracker();
  const { readCurrencyOptions_ } = load(tracker);
  tracker.state.currencyRule = { getCriteriaValues: () => [['EUR', 'BOB'], true] };
  assert.deepEqual(readCurrencyOptions_(spreadsheet(tracker)), ['EUR', 'BOB']);
});

test('a missing or range-based dropdown gives no list', () => {
  const tracker = fakeTracker();
  const { readCurrencyOptions_ } = load(tracker);
  tracker.state.currencyRule = null;
  assert.equal(readCurrencyOptions_(spreadsheet(tracker)), null);
  tracker.state.currencyRule = { getCriteriaValues: () => [{ range: true }, true] };
  assert.equal(readCurrencyOptions_(spreadsheet(tracker)), null);
});

test('amounts compare with a tolerance and text never matches', () => {
  const { isSameAmount_ } = load(fakeTracker());
  assert.equal(isSameAmount_(14 / 13.3, 1.0526315789), true);
  assert.equal(isSameAmount_(1.06, 1.05), false);
  assert.equal(isSameAmount_('#ERROR!', 1.05), false);
  assert.equal(isSameAmount_(1400000000.5, 1400000000), true);
});
