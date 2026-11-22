# Expenses bot

A Telegram bot that logs travel expenses to the Budget Tracker tab of a Google Sheet. It runs on Google Apps Script, so there is no server to maintain.

Send the bot your location and exchange rate once, then one short message per expense:

```text
/country Bolivia
/city Santa cruz
/currency BOB 13,3
14 f
```

The last message adds a row for 14 BOB of Food & Drink, which is 1,05 EUR.

`/undo` removes the last expense the bot added, `/day` and `/month` show what you spent today and this month, and `/help` shows the settings and category codes. The codes can be changed in the Bot Settings tab.

To check the connection to Telegram, run `checkWebhook` from the Apps Script editor.

## Project layout

- `src/`: the code pushed to Apps Script
- `test/`: tests that run on your computer

## Run the tests

Requires Node.js 20 or later.

```bash
npm test
```

## Secrets

The bot token, webhook secret, Telegram user ID and spreadsheet ID are stored in the Apps Script project's Script Properties. Never add them to this repository.
