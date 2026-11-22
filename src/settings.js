const BOT_SETTINGS_SHEET = 'Bot Settings';

const SETTING_LABELS = {
  country: 'Country',
  city: 'City',
  currency: 'Currency',
  rate: 'Rate (for 1 EUR)',
  timeZone: 'Time zone',
  lastBotRow: 'Last bot row',
};

// Creates the tab the first time only, so later runs of setup keep your edits.
function ensureBotSettings_(spreadsheet) {
  if (spreadsheet.getSheetByName(BOT_SETTINGS_SHEET)) {
    return false;
  }

  const sheet = spreadsheet.insertSheet(BOT_SETTINGS_SHEET, spreadsheet.getNumSheets());
  const labels = Object.keys(SETTING_LABELS).map((key) => [SETTING_LABELS[key], '']);
  const codes = Object.keys(DEFAULT_CATEGORY_CODES).map((code) => [code, DEFAULT_CATEGORY_CODES[code]]);

  sheet.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
  sheet.getRange(2, 1, labels.length, 2).setValues(labels);
  sheet.getRange(1, 4, 1, 2).setValues([['Code', 'Category']]);
  sheet.getRange(2, 4, codes.length, 2).setNumberFormat('@').setValues(codes);
  sheet.getRange(labels.length + 3, 1).setValue('The bot updates column B. You can edit the codes in columns D and E.');

  sheet.getRange('1:1').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, 5);
  return true;
}

function readBotSettings_(spreadsheet) {
  const sheet = getBotSettingsSheet_(spreadsheet);
  const settingRows = sheet.getRange(2, 1, Object.keys(SETTING_LABELS).length, 2).getValues();
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const codeRows = sheet.getRange(2, 4, lastRow - 1, 2).getValues();
  return parseBotSettings_(settingRows, codeRows);
}

function parseBotSettings_(settingRows, codeRows) {
  const values = {};
  settingRows.forEach((row) => {
    values[row[0]] = row[1];
  });
  const text = (key) => String(values[SETTING_LABELS[key]] === undefined ? '' : values[SETTING_LABELS[key]]).trim();
  const positive = (key) => {
    const value = values[SETTING_LABELS[key]];
    return typeof value === 'number' && value > 0 ? value : null;
  };

  const categoryCodes = {};
  codeRows.forEach((row) => {
    const code = String(row[0]).trim().toLowerCase();
    const category = String(row[1]).trim();
    if (code && category) {
      categoryCodes[code] = category;
    }
  });

  return {
    country: text('country'),
    city: text('city'),
    currency: text('currency'),
    rate: positive('rate'),
    timeZone: text('timeZone'),
    lastBotRow: positive('lastBotRow'),
    categoryCodes: categoryCodes,
  };
}

function writeBotSettings_(spreadsheet, changes) {
  const sheet = getBotSettingsSheet_(spreadsheet);
  const labelCount = Object.keys(SETTING_LABELS).length;
  const labels = sheet.getRange(2, 1, labelCount, 1).getValues().map((row) => row[0]);

  Object.keys(changes).forEach((key) => {
    const index = labels.indexOf(SETTING_LABELS[key]);
    if (index === -1) {
      throw new Error('The ' + BOT_SETTINGS_SHEET + ' tab is missing its "' + SETTING_LABELS[key] + '" row.');
    }
    const value = changes[key];
    sheet.getRange(index + 2, 2).setValue(typeof value === 'string' ? asText_(value) : value);
  });
}

function getBotSettingsSheet_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(BOT_SETTINGS_SHEET);
  if (!sheet) {
    throw new Error('The ' + BOT_SETTINGS_SHEET + ' tab is missing. Run setup in the Apps Script editor.');
  }
  return sheet;
}
