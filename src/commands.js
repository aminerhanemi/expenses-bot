const LAST_EXPENSE_PROPERTY = 'LAST_BOT_EXPENSE';

function handleMessage_(config, message) {
  if (!message.text) {
    return 'Not saved: I can only read text messages. Try: 14 f';
  }

  const spreadsheet = SpreadsheetApp.openById(config.sheetId);
  const settings = readBotSettings_(spreadsheet);
  const parsed = parseMessage_(message.text, settings.categoryCodes);

  if (parsed.type === 'error') {
    return 'Not saved: ' + parsed.error;
  }
  if (parsed.type === 'expense') {
    return saveExpense_(spreadsheet, settings, parsed, new Date(message.date * 1000));
  }

  switch (parsed.name) {
    case 'country':
      return setCountry_(spreadsheet, settings, parsed.value);
    case 'city':
      return updateSettings_(spreadsheet, settings, { city: parsed.value });
    case 'currency':
      return setCurrency_(spreadsheet, settings, parsed);
    case 'undo':
      return undoLastExpense_(spreadsheet);
    case 'day':
      return spendingReply_(spreadsheet, settings, message, 'Today', 'yyyy-MM-dd');
    case 'month':
      return spendingReply_(spreadsheet, settings, message, 'This month', 'yyyy-MM');
    default:
      return helpText_(settings);
  }
}

function saveExpense_(spreadsheet, settings, expense, sentAt) {
  const missing = missingSettings_(settings);
  if (missing.length) {
    return 'Not saved: set these first: ' + missing.join(', ');
  }

  const entry = {
    sentAt: sentAt,
    timeZone: currentTimeZone_(settings),
    country: settings.country,
    city: settings.city,
    category: expense.category,
    amount: expense.amount,
    currency: settings.currency,
    rate: settings.rate,
    notes: expense.notes,
  };

  // Forgotten first, so /undo can never remove an older row in place of this one.
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(LAST_EXPENSE_PROPERTY);
  const result = addExpenseRow_(spreadsheet, entry);

  let undoNote = '';
  try {
    props.setProperty(LAST_EXPENSE_PROPERTY, JSON.stringify({ row: result.row, cells: logEntryCells_(entry) }));
    writeBotSettings_(spreadsheet, { lastBotRow: result.row });
  } catch (error) {
    // The row is saved, so saying "Not saved" here would lead to a duplicate.
    console.error('Could not record row ' + result.row + ' for /undo: ' + error.message);
    undoNote = " /undo can't remove this one, so fix it in the sheet if needed.";
  }

  return 'Saved row ' + result.row + ': ' + expenseSummary_(entry, result.amountEur) + undoNote + todaySoFar_(spreadsheet, entry);
}

function missingSettings_(settings) {
  const missing = [];
  if (!settings.country) {
    missing.push('/country <name>');
  }
  if (!settings.city) {
    missing.push('/city <name>');
  }
  if (!settings.currency || settings.rate === null) {
    missing.push('/currency <code> <rate>');
  }
  return missing;
}

function currentTimeZone_(settings) {
  return settings.timeZone || Session.getScriptTimeZone();
}

function logEntryCells_(entry) {
  return [entry.country, entry.city, entry.category, entry.amount, entry.currency];
}

function expenseSummary_(entry, amountEur) {
  const local = formatNumber_(entry.amount) + ' ' + entry.currency;
  const amounts = entry.currency === 'EUR' ? formatEur_(amountEur) + ' EUR' : local + ' = ' + formatEur_(amountEur) + ' EUR';
  const note = entry.notes ? ' (note: ' + entry.notes + ')' : '';
  return amounts + ', ' + entry.category + ', ' + entry.city + ', ' + entry.country + note;
}

function setCountry_(spreadsheet, settings, country) {
  const timeZone = timeZoneForCountry_(country);
  if (timeZone) {
    return updateSettings_(spreadsheet, settings, { country: country, timeZone: timeZone });
  }
  return updateSettings_(spreadsheet, settings, { country: country })
    + "\nI don't know this country's time zone, so dates keep using " + currentTimeZone_(settings) + '.';
}

function setCurrency_(spreadsheet, settings, parsed) {
  const options = readCurrencyOptions_(spreadsheet);
  if (options && !options.includes(parsed.currency)) {
    return 'Not saved: ' + parsed.currency + " isn't in your Currency dropdown. Check the spelling, or add it to the dropdown in the sheet.";
  }
  return updateSettings_(spreadsheet, settings, { currency: parsed.currency, rate: parsed.rate });
}

// Each reply shows every setting, so old values can't carry over unnoticed.
function updateSettings_(spreadsheet, settings, changes) {
  writeBotSettings_(spreadsheet, changes);
  return settingsLine_(Object.assign({}, settings, changes)) + ' Update these if needed.';
}

function settingsLine_(settings) {
  const shown = (value) => value || 'not set';
  const currency = settings.currency && settings.rate !== null
    ? settings.currency + ' at ' + formatNumber_(settings.rate)
    : 'not set';
  return 'Country: ' + shown(settings.country) + '. City: ' + shown(settings.city) + '. Currency: ' + currency + '.';
}

function undoLastExpense_(spreadsheet) {
  const props = PropertiesService.getScriptProperties();
  const last = readLastExpense_(props);
  if (!last) {
    return 'Nothing to undo. /undo removes only the latest expense the bot added, and only once.';
  }
  if (!removeExpenseRow_(spreadsheet, last.row, last.cells)) {
    return 'Not removed: row ' + last.row + " no longer holds your last expense, so I left it alone. Please fix it in the sheet.";
  }

  props.deleteProperty(LAST_EXPENSE_PROPERTY);
  writeBotSettings_(spreadsheet, { lastBotRow: '' });
  const [country, city, category, amount, currency] = last.cells;
  return 'Removed row ' + last.row + ': ' + formatNumber_(amount) + ' ' + currency + ', ' + category + ', ' + city + ', ' + country;
}

function readLastExpense_(props) {
  try {
    return JSON.parse(props.getProperty(LAST_EXPENSE_PROPERTY) || 'null');
  } catch (error) {
    console.error('Could not read the last expense: ' + error.message);
    return null;
  }
}

function spendingReply_(spreadsheet, settings, message, label, periodFormat) {
  const period = Utilities.formatDate(new Date(message.date * 1000), currentTimeZone_(settings), periodFormat);
  return spendingSummary_(label + ', ' + period, rowsInPeriod_(spreadsheet, period));
}

function rowsInPeriod_(spreadsheet, period) {
  return readLogExpenses_(spreadsheet).filter((row) => row.day.startsWith(period));
}

// The expense is already saved, so a failure here leaves the line out rather than replying "Not saved".
function todaySoFar_(spreadsheet, entry) {
  try {
    const rows = rowsInPeriod_(spreadsheet, Utilities.formatDate(entry.sentAt, entry.timeZone, 'yyyy-MM-dd'));
    return rows.length ? '\n' + todayLine_(rows) : '';
  } catch (error) {
    console.error("Could not add up today's spending: " + error.message);
    return '';
  }
}

function todayLine_(rows) {
  const totals = spendingTotals_(rows);
  const parts = localAmounts_(totals);
  if (totals.noLocalEur !== 0) {
    parts.push(formatEur_(totals.noLocalEur) + ' EUR');
  }
  const eur = formatEur_(totals.totalEur) + ' EUR';
  const details = [rows.length === 1 ? '1 expense' : rows.length + ' expenses'];
  if (totals.missingEur > 0) {
    details.push(totals.missingEur + ' without a EUR amount');
  }
  return 'Today: ' + (parts.length ? parts.join(' + ') + ' = ' : '') + eur + ' (' + details.join(', ') + ')';
}

// Each currency gets its own line, since amounts in different currencies can't be added together.
function spendingSummary_(title, rows) {
  if (rows.length === 0) {
    return title + ': no expenses.';
  }

  const totals = spendingTotals_(rows);
  const lines = [title + ' (' + rows.length + (rows.length === 1 ? ' expense):' : ' expenses):')].concat(localAmounts_(totals));
  if (totals.noLocalEur !== 0) {
    lines.push(formatEur_(totals.noLocalEur) + ' EUR with no local amount');
  }
  lines.push('Total: ' + formatEur_(totals.totalEur) + ' EUR');
  if (totals.missingEur > 0) {
    lines.push(totals.missingEur === 1
      ? '1 row has no EUR amount, so the total leaves it out.'
      : totals.missingEur + ' rows have no EUR amount, so the total leaves them out.');
  }
  return lines.join('\n');
}

function spendingTotals_(rows) {
  const totals = { localTotals: new Map(), totalEur: 0, noLocalEur: 0, missingEur: 0 };
  rows.forEach((row) => {
    if (row.amountEur === null) {
      totals.missingEur += 1;
    } else {
      totals.totalEur += row.amountEur;
    }
    if (row.currency && row.amount !== null) {
      totals.localTotals.set(row.currency, (totals.localTotals.get(row.currency) || 0) + row.amount);
    } else if (row.amountEur !== null) {
      totals.noLocalEur += row.amountEur;
    }
  });
  return totals;
}

// Empty when everything was in EUR, since the EUR total already says it.
function localAmounts_(totals) {
  const onlyEur = totals.noLocalEur === 0 && totals.localTotals.size === 1 && totals.localTotals.has('EUR');
  if (onlyEur) {
    return [];
  }
  const amounts = [];
  totals.localTotals.forEach((total, currency) => {
    amounts.push(formatNumber_(Math.round(total * 100) / 100) + ' ' + currency);
  });
  return amounts;
}

function helpText_(settings) {
  const codes = Object.keys(settings.categoryCodes).map((code) => code + ' = ' + settings.categoryCodes[code]);
  return [
    'Send an expense as an amount and a code: 14 f',
    'Extra words go in Notes: 14 f lunch',
    '',
    '/country <name>',
    '/city <name>',
    '/currency <code> <rate>: the rate is for 1 EUR',
    '/undo: removes the last expense the bot added',
    '/day: shows what you spent today',
    '/month: shows what you spent this month',
    '/help: shows this message',
    '',
    settingsLine_(settings),
    '',
    'Category codes:',
  ].concat(codes).join('\n');
}

function formatNumber_(value) {
  return String(value).replace('.', ',');
}

function formatEur_(value) {
  return value.toFixed(2).replace('.', ',');
}
