const TRACKER_SHEET = 'Budget Tracker';
const LOG_HEADERS = ['Date', 'Country', 'City', 'Category', 'Local Amount', 'Currency', 'Amount (EUR)', 'Notes'];
const LOG_COLUMNS = LOG_HEADERS.length;
const LOG_AMOUNT_COLUMN = LOG_HEADERS.indexOf('Amount (EUR)') + 1;
const MIN_EMPTY_LOG_ROWS = 20;
const LOG_GROWTH_ROWS = 200;

// Writes inside the log, because a row below it would be missing from every total.
function addExpenseRow_(spreadsheet, entry) {
  const tracker = getTrackerSheet_(spreadsheet);
  const row = growLogIfNeeded_(tracker, readLogLayout_(tracker)).nextRow;
  const range = tracker.getRange(row, 1, 1, LOG_COLUMNS);

  try {
    range.setValues([[
      logDate_(spreadsheet, entry),
      asText_(entry.country),
      asText_(entry.city),
      entry.category,
      entry.amount,
      entry.currency,
      '',
      asText_(entry.notes),
    ]]);
    const amountEur = writeAmountEur_(tracker.getRange(row, LOG_AMOUNT_COLUMN), row, entry);
    SpreadsheetApp.flush();
    return { row: row, amountEur: amountEur };
  } catch (error) {
    range.clearContent();
    throw error;
  }
}

// Only clears the row if it still holds that expense, since rows added or removed by hand change row numbers.
function removeExpenseRow_(spreadsheet, row, cells) {
  const tracker = getTrackerSheet_(spreadsheet);
  const log = readLogLayout_(tracker);
  if (row < log.firstRow || row > log.lastRow) {
    return false;
  }

  const range = tracker.getRange(row, 1, 1, LOG_COLUMNS);
  const current = range.getValues()[0].slice(LOG_HEADERS.indexOf('Country'), LOG_HEADERS.indexOf('Currency') + 1);
  if (JSON.stringify(current) !== JSON.stringify(cells)) {
    return false;
  }
  range.clearContent();
  SpreadsheetApp.flush();
  return true;
}

// Days are read in the sheet's time zone, since that's the day each cell shows. Rows with no real date are left out.
function readLogExpenses_(spreadsheet) {
  const tracker = getTrackerSheet_(spreadsheet);
  const log = readLogLayout_(tracker);
  const zone = spreadsheet.getSpreadsheetTimeZone();
  const column = (header) => LOG_HEADERS.indexOf(header);
  const numberOrNull = (value) => (typeof value === 'number' ? value : null);

  return tracker.getRange(log.firstRow, 1, log.lastRow - log.firstRow + 1, LOG_COLUMNS).getValues()
    .filter((row) => Object.prototype.toString.call(row[column('Date')]) === '[object Date]')
    .map((row) => ({
      day: Utilities.formatDate(row[column('Date')], zone, 'yyyy-MM-dd'),
      amount: numberOrNull(row[column('Local Amount')]),
      currency: String(row[column('Currency')]).trim(),
      category: String(row[column('Category')]).trim(),
      amountEur: numberOrNull(row[column('Amount (EUR)')]),
    }));
}

// Returns null if the dropdown can't be read as a list, so the check doesn't block you.
function readCurrencyOptions_(spreadsheet) {
  const tracker = getTrackerSheet_(spreadsheet);
  const column = LOG_HEADERS.indexOf('Currency') + 1;
  const rule = tracker.getRange(readLogLayout_(tracker).firstRow, column).getDataValidation();
  const options = rule ? rule.getCriteriaValues()[0] : null;
  return Array.isArray(options) ? options : null;
}

function getTrackerSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(TRACKER_SHEET);
  if (!sheet) {
    throw new Error('The ' + TRACKER_SHEET + ' tab is missing.');
  }
  return sheet;
}

function readLogLayout_(tracker) {
  const rowCount = tracker.getLastRow();
  const values = tracker.getRange(1, 1, rowCount, LOG_COLUMNS).getValues();
  const formulas = tracker.getRange(1, LOG_AMOUNT_COLUMN, rowCount, 1).getFormulas();
  return findLogLayout_(values, formulas.map((row) => row[0]));
}

// Finds the log by its headers and total, since a row added above it moves everything down.
function findLogLayout_(values, amountFormulas) {
  const headerIndex = values.findIndex((row) => LOG_HEADERS.every((header, column) => String(row[column]).trim() === header));
  if (headerIndex === -1) {
    throw new Error('Could not find the log headers in ' + TRACKER_SHEET + '.');
  }

  const firstRow = headerIndex + 2;
  const totalIndex = amountFormulas.findIndex((formula, index) => index >= firstRow && isLogTotal_(formula, firstRow, index));
  if (totalIndex === -1) {
    throw new Error('Could not find the log total in ' + TRACKER_SHEET + '.');
  }

  // An array index is one less than its row number, so totalIndex is also the last log row.
  const lastRow = totalIndex;
  let nextRow = firstRow;
  for (let row = lastRow; row >= firstRow; row -= 1) {
    if (values[row - 1].some((cell) => cell !== '')) {
      nextRow = row + 1;
      break;
    }
  }
  return { firstRow: firstRow, lastRow: lastRow, nextRow: nextRow };
}

function isLogTotal_(formula, firstRow, lastRow) {
  const match = /^=\s*SUM\(\s*\$?G\$?(\d+)\s*:\s*\$?G\$?(\d+)\s*\)$/i.exec(formula);
  return Boolean(match) && Number(match[1]) === firstRow && Number(match[2]) === lastRow;
}

function growLogIfNeeded_(tracker, log) {
  if (log.lastRow - log.nextRow + 1 >= MIN_EMPTY_LOG_ROWS) {
    return log;
  }

  // Inserting above the last row keeps the insert inside every range, so formulas and dropdowns stretch.
  tracker.insertRowsBefore(log.lastRow, LOG_GROWTH_ROWS);
  if (log.nextRow > log.lastRow) {
    // The log was full, so the insert pushed its newest row below the new ones.
    const pushedDown = tracker.getRange(log.lastRow + LOG_GROWTH_ROWS, 1, 1, LOG_COLUMNS);
    pushedDown.copyTo(tracker.getRange(log.lastRow, 1, 1, LOG_COLUMNS));
    pushedDown.clearContent();
  }
  SpreadsheetApp.flush();

  const grown = readLogLayout_(tracker);
  if (grown.lastRow !== log.lastRow + LOG_GROWTH_ROWS) {
    throw new Error('The log total did not stretch after adding rows.');
  }
  return grown;
}

// Stored in the sheet's time zone, so the cell shows the day the message was sent.
function logDate_(spreadsheet, entry) {
  const day = Utilities.formatDate(entry.sentAt, entry.timeZone, 'yyyy-MM-dd');
  return Utilities.parseDate(day, spreadsheet.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

// The leading apostrophe stops the sheet reading a note like "=1+1" or "12/10" as a formula or date.
function asText_(value) {
  return value ? "'" + value : '';
}

function writeAmountEur_(cell, row, entry) {
  const amountEur = entry.amount / entry.rate;
  if (entry.currency !== 'EUR') {
    if (eurFormulas_(row, entry.rate).some((formula) => tryEurFormula_(cell, formula, amountEur))) {
      return amountEur;
    }
    console.error('No formula worked for the rate on row ' + row + ', writing a fixed number.');
  }
  cell.setValue(amountEur);
  return amountEur;
}

// The decimal separator depends on the sheet's locale. The comma comes first because this sheet is fr_FR.
function eurFormulas_(row, rate) {
  const dotted = String(rate);
  const candidates = dotted.includes('.') ? [dotted.replace('.', ','), dotted] : [dotted];
  return candidates.map((text) => '=E' + row + '/' + text);
}

function tryEurFormula_(cell, formula, expected) {
  try {
    cell.setFormula(formula);
    SpreadsheetApp.flush();
    return isSameAmount_(cell.getValue(), expected);
  } catch (error) {
    return false;
  }
}

function isSameAmount_(value, expected) {
  return typeof value === 'number' && Math.abs(value - expected) <= 0.000001 * Math.max(1, Math.abs(expected));
}
