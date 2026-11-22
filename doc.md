# Expenses bot: technical documentation

## What it does

This Telegram bot logs travel expenses to a Google Sheet. You set your location and exchange rate once, then send one short message per expense:

```text
/country Bolivia
/city Santa cruz
/currency BOB 13,3
14 f
```

The last message adds a row to the `Budget Tracker` tab for 14 BOB of Food & Drink, which is 1,05 EUR, and the bot replies:

```text
Saved row 194: 14 BOB = 1,05 EUR, Food & Drink, Santa cruz, Bolivia
Today: 34 BOB = 2,55 EUR (2 expenses)
```

The second line adds up everything logged for today so far, the new expense included.

The sheet's own formulas then update its totals. The bot only adds rows, and has one user: its owner.

| Message | What it does |
|---|---|
| `<amount> <code> [notes]` | Adds an expense, such as `14 f lunch`, and shows today's total |
| `/country <name>` | Sets the country and, if the country is known, the time zone |
| `/city <name>` | Sets the city |
| `/currency <code> <rate>` | Sets the currency and how much of it 1 EUR buys. EUR needs no rate |
| `/undo` | Removes the last expense the bot added, once |
| `/day` | Shows what you spent today: a total for each local currency, and one in EUR |
| `/month` | Shows the same for the current calendar month |
| `/help`, `/start` | Show the commands, current settings and category codes |

## Architecture

The bot is a Google Apps Script web app with no server or database of its own. Telegram calls it through a webhook each time you send a message.

```text
Your phone
    │ "14 f"
    ▼
Telegram servers
    │ HTTPS POST to the web app URL, with ?secret=... (the webhook)
    ▼
Google Apps Script web app
    ├── reads and writes ──► Google Sheet: Budget Tracker and Bot Settings tabs
    ├── reads and writes ──► Script Properties: secrets and small bot state
    └── sendMessage ───────► Telegram servers ──► your phone
```

**Why these choices**
- **Apps Script:** it's free, needs no hosting, and can already reach the sheet.
- **Webhook rather than polling:** the script runs only when a message arrives.
- **Secret in the URL:** Apps Script doesn't give `doPost` the request headers, so Telegram's secret header can't be read. A query parameter is the alternative.
- **`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`:** Telegram can't sign in to Google, so the URL must be public. The script runs as its owner, which is how it can open the sheet. The secret and the owner check are what protect it.

## Entry points

There are three, and all other functions are internal. Apps Script hides any function whose name ends in `_` from the editor's menu and from outside callers.

| Function | File | Called by | Purpose |
|---|---|---|---|
| `doPost(e)` | `src/main.js` | Telegram, through the web app URL | Handles every message. **Start reading here** |
| `setup()` | `src/setup.js` | You, from the Apps Script editor | Checks the configuration, creates `Bot Settings`, registers the webhook |
| `checkWebhook()` | `src/setup.js` | You, from the Apps Script editor | Logs the connection status and Telegram's last error |

## What happens to a message

```text
doPost(e)                                 main.js
└─ handleRequest_(e)
   ├─ secret in the URL is wrong?         stop, no reply
   ├─ isFromOwner_()? not you or a group  stop, no reply
   ├─ processUpdateOnce_()
   │  ├─ take the script lock             can't get it: "Not saved", ask to resend
   │  ├─ update ID already handled?       stop, no reply
   │  ├─ handleMessage_()                 commands.js
   │  │  ├─ readBotSettings_()            settings.js
   │  │  ├─ parseMessage_()               parser.js
   │  │  └─ one of:
   │  │     ├─ saveExpense_()
   │  │     │  ├─ addExpenseRow_()        tracker.js
   │  │     │  └─ todaySoFar_()           the "Today:" line
   │  │     ├─ setCountry_()              uses timezones.js
   │  │     ├─ updateSettings_()          /city
   │  │     ├─ setCurrency_()
   │  │     ├─ undoLastExpense_()
   │  │     ├─ spendingReply_()           /day and /month
   │  │     │  └─ readLogExpenses_()      tracker.js
   │  │     └─ helpText_()
   │  ├─ remember the update ID
   │  └─ release the lock
   └─ sendMessage_()                      telegram.js
```

`doPost` always returns a normal empty response, even after an error. Telegram retries a failed delivery, and retrying wouldn't fix most errors here, so the user gets a "Not saved" reply instead. The response uses `HtmlService` because `ContentService` answers with a redirect, which Telegram may treat as a failure.

## Files

### `src/`: the code that runs on Apps Script

All files share one global scope, with no imports. Functions can call each other across files, but a file shouldn't use another file's `const` while it loads, only inside a function.

| File | Role | Main functions |
|---|---|---|
| `main.js` | Web app entry point: security checks, lock, duplicate protection, error handling | `doPost`, `handleRequest_`, `isFromOwner_`, `processUpdateOnce_`, `getConfig_` |
| `commands.js` | Decides what each message does and writes the replies | `handleMessage_`, `saveExpense_`, `setCountry_`, `setCurrency_`, `undoLastExpense_`, `spendingReply_`, `helpText_` |
| `parser.js` | Turns message text into a structured result, with no Google calls. Holds the default category codes | `parseMessage_`, `parseExpense_`, `parseCommand_`, `parseAmount_`, `parseRate_` |
| `tracker.js` | Everything that touches the expense log: finding it, growing it, writing and removing rows | `addExpenseRow_`, `removeExpenseRow_`, `readLogExpenses_`, `readLogLayout_`, `growLogIfNeeded_`, `readCurrencyOptions_` |
| `settings.js` | Creates, reads and writes the `Bot Settings` tab | `ensureBotSettings_`, `readBotSettings_`, `writeBotSettings_` |
| `telegram.js` | Calls the Telegram API, and removes the token from error messages | `callTelegram_`, `sendMessage_` |
| `timezones.js` | Maps a country name to its main time zone | `timeZoneForCountry_` |
| `setup.js` | Functions you run by hand from the editor | `setup`, `checkWebhook` |
| `appsscript.json` | Apps Script manifest: time zone, permissions, web app access | |

### `test/`: tests that run on your computer

There is one test file per source file (`commands`, `main`, `parser`, `settings`, `telegram`, `tracker`), plus `manifest.test.js` for `appsscript.json`. `timezones.js` is tested through `commands.test.js`, and `setup.js` has no tests.

Node doesn't have Apps Script's services, so each test loads the source file with `new Function(...)` and passes in small fakes for `SpreadsheetApp`, `LockService` and the others. These fakes can't prove how Google Sheets really behaves, so changes to sheet handling also need a run on a test copy.

### Project root

| File | Role |
|---|---|
| `.clasp.json` | Links this folder to the Apps Script project. Holds the script ID, which isn't a secret |
| `package.json` | Test command, and `clasp` as a development tool |
| `README.md` | Short introduction |
| `.gitignore` | Keeps credentials and sheet exports out of Git |

## Where data lives

**Script Properties** (Apps Script editor > Project Settings). Never put these values in the code.

| Property | Set by | Contents |
|---|---|---|
| `BOT_TOKEN` | You | Token from Telegram's @BotFather |
| `WEBHOOK_SECRET` | You | Random string of letters, digits, `_` and `-` |
| `OWNER_USER_ID` | You | Your numeric Telegram user ID |
| `SHEET_ID` | You | The spreadsheet ID, from its URL |
| `DEPLOYMENT_ID` | You | The web app's deployment ID. `setup` builds the webhook URL from it. It's kept out of the code because it's the bot's public address |
| `PROCESSED_UPDATE_IDS` | Bot | The last 200 handled update IDs, for duplicate protection |
| `LAST_BOT_EXPENSE` | Bot | The row and contents of the last expense, for `/undo` |

**`Bot Settings` tab**, created once by `setup()` at the end of the spreadsheet, then never overwritten by it. Current settings are in columns A:B, and category codes are in columns D:E. You can edit both from your phone. `Last bot row` is for information only: `/undo` uses `LAST_BOT_EXPENSE`.

**`Budget Tracker` tab.** One row per expense, in this exact column order:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Date | Country | City | Category | Local Amount | Currency | Amount (EUR) | Notes |

## Behaviour worth knowing before you change it

**Finding the log.** Row numbers are never hardcoded, because a row added above the log moves it. `findLogLayout_` looks for the row holding the eight headers above, then for a total in column G of the form `=SUM(G<first log row>:G<row above the total>)`. If either is missing, nothing is written and the reply says "Not saved".

**Choosing the row.** A plain append would land below the total and be left out of every formula, so the bot writes to the row after the last row with anything in columns A to H. That also protects rows typed by hand.

**Growing the log.** With fewer than 20 empty rows left (`MIN_EMPTY_LOG_ROWS`), `growLogIfNeeded_` inserts 200 (`LOG_GROWTH_ROWS`) above the log's last row. Inserting inside the range is what makes formulas on all tabs and the dropdowns stretch. It then re-reads the layout and stops if the total didn't stretch.

**The EUR amount.** Column G is a formula such as `=E194/13,3`, so each row keeps its own rate and later rate changes don't affect it. Which decimal separator is valid depends on the sheet's locale, so `writeAmountEur_` tries a comma, then a dot, checks the result, and falls back to a fixed number. EUR expenses store the amount directly.

**Dates.** The day comes from the message's Telegram timestamp in the current time zone (from `/country`, otherwise the script's). It's stored as midnight in the sheet's time zone, so the cell shows that day and date-based formulas count it.

**Text.** Country, city and notes are written with a leading apostrophe (`asText_`), so a note like `12/10` or `=1+1` stays text instead of becoming a date or formula.

**Failed writes.** `addExpenseRow_` clears the row if anything fails, so the log never holds half an expense. Once a row is saved, a failure to record it for `/undo` still replies "Saved", because "Not saved" would lead to a duplicate. For the same reason, if today's total can't be worked out, the reply leaves out its "Today:" line instead of failing.

**`/undo`.** It clears the row only if columns B to F still match what the bot wrote, since a row added or removed by hand changes row numbers. It goes back one expense only.

**`/day`, `/month` and the "Today:" line.** These only read the sheet, and share the same adding up (`spendingTotals_`). They add up log rows whose date falls in the current day or calendar month, using the current time zone to decide what "today" is. `/month` uses calendar months on purpose, so its total differs from the Monthly Budget tab, whose periods run from the 17th to the 16th. Amounts in different currencies can't be added together, so each currency gets its own line, and the EUR total comes from column G, so it uses each row's own rate. Rows with no real date in column A can't be placed in a period and are left out, and a row with no EUR amount is counted in the reply's warning line rather than the total.

**Amounts.** A separator followed by exactly three digits means thousands, so `12.500` is 12,500. Anything that could be read two ways, such as `1234.567`, is rejected. A rate with exactly three decimals is rejected for the same reason.

**Security**
- A wrong secret, another sender or a group chat gets no reply and writes nothing.
- The token, secret and full webhook URL are never logged, and `callTelegram_` removes the token from error messages.
- The script's permissions are limited to spreadsheets and external requests.

## Set up your own copy

You need Node.js 20 or later, a Google account and a Telegram account.

**1. Prepare the spreadsheet.** It needs a `Budget Tracker` tab with:
- the eight headers above, in columns A to H
- empty log rows below them
- directly below those rows, the total in column G, such as `=SUM(G21:G220)`
- a dropdown on the Currency column, which `/currency` checks against (without one, any currency is accepted)
- a Category dropdown holding the same names as your category codes

Formulas that add up by category or date must read the log's whole range, so they stretch as it grows. Try everything on a copy first.

**2. Create the bot.** Message @BotFather on Telegram to get a token, and find your numeric user ID, for example with @userinfobot.

**3. Create the script.** Turn on the Apps Script API at <https://script.google.com/home/usersettings>, then:

```bash
npm install
```

```bash
npx clasp login
```

Delete the existing `.clasp.json`, then create your own project:

```bash
npx clasp create-script --title "Expenses bot" --type standalone --rootDir src
```

`clasp` may overwrite `src/appsscript.json` here. If it does, restore this project's version, because the web app settings are in it.

**4. Deploy.**

```bash
npx clasp push --force
```

```bash
npx clasp create-deployment --description "First version"
```

Keep the deployment ID it prints for the next step.

**5. Configure.** In the Apps Script editor, add `BOT_TOKEN`, `WEBHOOK_SECRET`, `OWNER_USER_ID`, `SHEET_ID` and `DEPLOYMENT_ID` to Script Properties.

**6. Connect.** In the editor, run `setup` and approve the permissions. Its log should name your bot and spreadsheet. Then send your bot `/help`.

## Maintaining it

### Change the code and release it

```bash
npm test
```

```bash
npx clasp push --force
```

```bash
npx clasp update-deployment <deployment ID> --description "What changed"
```

**A push alone doesn't change the live bot.** The web app runs a fixed deployed version, so nothing changes for Telegram until `update-deployment`. Keep the same deployment ID: `create-deployment` would make a new URL and leave the webhook on the old one. Functions run from the editor, like `setup`, use the latest pushed code straight away.

**Deleting a file:** `clasp push` may say "Script is already up to date" and leave the file on Apps Script if nothing else changed. To remove it, push along with a change to another file, then confirm in the editor.

### Common changes

| Task | What to do |
|---|---|
| Add or rename a category code | Edit columns D:E of `Bot Settings`. The category name must be in the Category dropdown, and needs a line in the category table, or it won't count in any table total |
| Add a currency | Add it to the Currency dropdown in the sheet |
| Add a country's time zone | Add it to `COUNTRY_TIME_ZONES` in `src/timezones.js`, in lowercase with no accents. Unknown countries still work, keeping the last time zone |
| Add a command | Add its name to `parseCommand_` in `src/parser.js`, a case in `handleMessage_` in `src/commands.js`, a line in `helpText_`, and tests |
| Change how the log grows | Change `MIN_EMPTY_LOG_ROWS` or `LOG_GROWTH_ROWS` in `src/tracker.js` |
| Change the home currency | EUR is built in: search for `EUR` in `src/`, including the `Amount (EUR)` header, and update the tests and sheet too |
| Move to another spreadsheet | Change `SHEET_ID`, then run `setup` |
| Move the bot to a new web address | Run `create-deployment`, put the new ID in `DEPLOYMENT_ID`, and run `setup`. Once the bot replies, remove the old one with `npx clasp delete-deployment <old ID>` |
| Replace the bot token or webhook secret | Change the property, then run `setup` to register the webhook again. A leaked token must also be revoked in @BotFather |

`DEFAULT_CATEGORY_CODES` in `src/parser.js` only fills a new `Bot Settings` tab. Changing it doesn't affect a tab that already exists.

### Test sheet changes safely

Make a copy of the spreadsheet, point `SHEET_ID` at it, and run `setup`. Send real messages, then point `SHEET_ID` back and run `setup` again. Local tests aren't enough for this kind of change, because inserting rows, formulas and locale behaviour only show up on a real sheet.

### Troubleshooting

Start with `checkWebhook` in the editor, then **Executions** in the left menu, which shows each run and its errors.

| Symptom | Likely cause | Fix |
|---|---|---|
| No reply at all | Webhook not set, or the secret changed without running `setup` | Run `checkWebhook`, then `setup` |
| No reply, and `checkWebhook` shows an error | Deployment problem | Read the last error, and check the deployment is still active |
| No reply from one account only | The sender doesn't match `OWNER_USER_ID` | Check the property |
| "Not saved: something went wrong on my side" | An error while handling the message | See **Executions**. Common causes are a renamed tab, a changed header or total, or a category not in the dropdown |
| "Not saved: set these first" | Settings are blank | Send the commands listed in the reply |
| The code change has no effect | Pushed but not deployed | Run `update-deployment` |
| Actual Spent differs from the log total | A category in the log has no line in the category table | Add the line, inside the table's `SUM` range |
| Pending updates shows 1 | A message was being handled when you checked | Check again with no message on its way |

## Known limits

- **One user:** the bot serves only `OWNER_USER_ID`.
- **`/undo`:** it goes back one expense. Older corrections are made in the sheet.
- **Edited messages:** editing a message in Telegram doesn't change the sheet.
- **Offline messages:** Telegram's timestamp is expected to be when it receives the message, so one written offline and sent after midnight may get the next day's date.
- **Duplicate protection:** it remembers the last 200 updates. Telegram keeps undelivered updates for at most 24 hours, so this is plenty at normal use.
- **Text only:** photos and other messages without text are rejected, including photos with captions.
