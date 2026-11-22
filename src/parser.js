const DEFAULT_CATEGORY_CODES = {
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

// Returns { type: 'expense' | 'command', ... }, or { type: 'error', error } with the reason to show.
function parseMessage_(text, categoryCodes) {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('/')) {
    return parseCommand_(trimmed);
  }
  return parseExpense_(trimmed, categoryCodes);
}

function parseExpense_(text, categoryCodes) {
  const words = text.split(/\s+/);
  const amount = parseAmount_(words[0]);
  if (amount === null) {
    return parseError_('I couldn\'t read "' + words[0] + '" as an amount. Try: 14 f');
  }
  if (words.length < 2) {
    return parseError_('add a category code after the amount. Send /help for the codes.');
  }

  const code = words[1].toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(categoryCodes, code)) {
    return parseError_('unknown category "' + words[1] + '". Send /help for the codes.');
  }
  return { type: 'expense', amount: amount, category: categoryCodes[code], notes: words.slice(2).join(' ') };
}

function parseCommand_(text) {
  const match = text.match(/^\/([A-Za-z]+)(?:@\S+)?(?:\s+([\s\S]*))?$/);
  if (!match) {
    return parseError_('unknown command. Send /help for the commands.');
  }

  const name = match[1].toLowerCase();
  const argument = (match[2] || '').trim();
  switch (name) {
    case 'country':
    case 'city':
      return parseNameCommand_(name, argument);
    case 'currency':
      return parseCurrencyCommand_(argument);
    case 'undo':
    case 'day':
    case 'month':
    case 'help':
    case 'start':
      return { type: 'command', name: name };
    default:
      return parseError_('unknown command "/' + name + '". Send /help for the commands.');
  }
}

function parseNameCommand_(name, argument) {
  const value = stripQuotes_(argument);
  if (!value) {
    return parseError_('add a name after the command, like /' + name + (name === 'country' ? ' Bolivia' : ' Santa cruz'));
  }
  return { type: 'command', name: name, value: value };
}

function parseCurrencyCommand_(argument) {
  const example = 'Try: /currency BOB 13,3';
  const words = argument.split(/\s+/).map(stripQuotes_).filter(Boolean);
  if (words.length === 0 || words.length > 2 || !/^[A-Za-z]{3}$/.test(words[0])) {
    return parseError_('I couldn\'t read that currency. ' + example);
  }

  const currency = words[0].toUpperCase();
  if (currency === 'EUR') {
    if (words.length === 2 && parseRate_(words[1]) !== 1) {
      return parseError_('the rate for EUR is always 1. Try: /currency EUR');
    }
    return { type: 'command', name: 'currency', currency: currency, rate: 1 };
  }
  if (words.length < 2) {
    return parseError_('add the rate for 1 EUR. ' + example);
  }

  const rate = parseRate_(words[1]);
  if (rate === null) {
    return parseError_(
      'I couldn\'t read the rate "' + words[1] + '". Use no thousands separator and at most two decimals, like 4500 or 13,3.',
    );
  }
  return { type: 'command', name: 'currency', currency: currency, rate: rate };
}

// A separator followed by exactly three digits marks thousands, and any other last separator marks decimals.
// Returns null for anything that could be read two ways.
function parseAmount_(text) {
  if (!/^\d+(?:[.,]\d+)*$/.test(text)) {
    return null;
  }

  const groups = text.split(/[.,]/);
  const separators = text.match(/[.,]/g) || [];
  if (separators.length === 0) {
    return positiveNumber_(text);
  }

  const last = groups[groups.length - 1];
  const hasDecimals = last.length !== 3;
  const wholeGroups = hasDecimals ? groups.slice(0, -1) : groups;
  const thousandsSeparators = hasDecimals ? separators.slice(0, -1) : separators;

  if (new Set(thousandsSeparators).size > 1) {
    return null;
  }
  if (hasDecimals && thousandsSeparators.includes(separators[separators.length - 1])) {
    return null;
  }
  if (wholeGroups.length > 1) {
    const validGroups = /^[1-9]\d{0,2}$/.test(wholeGroups[0]) && wholeGroups.slice(1).every((group) => group.length === 3);
    if (!validGroups) {
      return null;
    }
  }
  return positiveNumber_(wholeGroups.join('') + (hasDecimals ? '.' + last : ''));
}

// Rates have no thousands separator, so three digits after a separator could mean either thing.
function parseRate_(text) {
  const match = text.match(/^(\d+)(?:[.,](\d+))?$/);
  if (!match || (match[2] && match[2].length === 3)) {
    return null;
  }
  return positiveNumber_(match[2] ? match[1] + '.' + match[2] : match[1]);
}

function positiveNumber_(text) {
  const number = Number(text);
  return number > 0 && Number.isFinite(number) ? number : null;
}

function stripQuotes_(text) {
  return text.replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, '');
}

function parseError_(error) {
  return { type: 'error', error: error };
}
