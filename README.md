# Expenses bot

A Telegram bot that writes your travel expenses into a Google Sheet. You send it a short message like `14 f`, and it adds a row with the date, place, category, amount and its value in euros. It runs on Google Apps Script, which is free and needs no server.

Tell the bot where you are and the exchange rate once:

```text
/country Bolivia
/city Santa cruz
/currency BOB 13,3
```

Then send one message per expense, as an amount and a category code:

```text
14 f
```

The bot adds a row for 14 BOB of Food & Drink, which is 1,05 EUR, and replies:

```text
Saved row 2: 14 BOB = 1,05 EUR, Food & Drink, Santa cruz, Bolivia
Today: 14 BOB = 1,05 EUR (1 expense)
```

## What you can send

| Message | What it does |
|---|---|
| `14 f` | Adds an expense: the amount, then a category code |
| `14 f lunch with Ana` | Same, with the extra words saved as a note |
| `/country Peru` | Sets the country, and its time zone if the bot knows it |
| `/city Cusco` | Sets the city |
| `/currency PEN 3,81` | Sets the currency, and how much of it 1 euro buys |
| `/currency EUR` | Sets the currency to euros, which needs no rate |
| `/undo` | Removes the last expense the bot added |
| `/day` | Shows what you spent today |
| `/month` | Shows what you spent this calendar month |
| `/help` | Shows the commands, your current settings and the category codes |

**Category codes**

| Code | Category |
|---|---|
| `acc` | Accommodation |
| `f` | Food & Drink |
| `it` | Intl/Intercity Transport |
| `lt` | Local Transport |
| `act` | Activities & Tours |
| `v` | Visas & Documents |
| `i` | Travel Insurance |
| `h` | Health & Vaccinations |
| `g` | Gear & Shopping |
| `c` | Connectivity (SIM/Data) |
| `e` | Emergency Fund |
| `m` | Misc/Other |
| `atm` | ATM fees |

After setup, you can change these codes in the `Bot Settings` tab of your sheet.

**Amounts:** use a comma or a dot for decimals, so `13,5` and `13.5` are the same. A separator followed by exactly three digits is read as thousands, so `12.500` means twelve thousand five hundred. Totals are always in euros.

---

## Set it up for yourself

This takes about 30 minutes and needs no programming. You only need a Google account, the Telegram app, and a computer with a web browser. You'll copy and paste text, and click buttons in Google's websites.

Keep a blank note open while you go. You'll collect five values in it:

| Value | What it is |
|---|---|
| Bot token | Like a password for your bot. Keep it private |
| Your Telegram ID | A number that tells the bot who you are |
| Secret word | A random word you make up. Keep it private |
| Sheet ID | Tells the bot which spreadsheet to write to |
| Deployment ID | Your script's web address, so Telegram knows where to send your messages |

### Step 1: Create your bot in Telegram

1. In Telegram, search for **@BotFather**. It's Telegram's official tool for making bots, with a blue tick.
2. Open the chat and send `/newbot`.
3. When it asks for a name, send any name, such as `My Expenses`.
4. When it asks for a username, send one ending in `bot`, such as `jane_expenses_bot`. If it's taken, try another.
5. BotFather replies with a long code that looks like `123456789:AAH...`. That's your **bot token**. Copy it into your note.

Never share the bot token: anyone who has it can control your bot.

### Step 2: Find your Telegram ID

1. In Telegram, search for **@userinfobot** and open it. This is a separate tool, not made by Telegram.
2. Send it any message, such as `hi`.
3. It replies with your details. Copy the number next to **Id** into your note. That's **your Telegram ID**.

The bot will only ever answer this ID, so nobody else can write to your sheet.

### Step 3: Make up a secret word

Make up a random word of about 20 characters, using only letters and numbers, for example `k7Qm2Rz9Wx4Tn8Lp3Vb6`. Don't use that example; type your own. Copy it into your note as your **secret word**.

It stops strangers from sending fake messages to your bot.

### Step 4: Create your spreadsheet

1. Go to <https://sheets.new> to create a new Google Sheet. Give it any name, such as `Travel expenses`.
2. At the bottom left, double-click the tab called **Sheet1** and rename it to exactly `Budget Tracker`.
3. Click cell **A1** and type these eight headings into **A1** to **H1**, one per cell, spelled exactly like this:

   | A | B | C | D | E | F | G | H |
   |---|---|---|---|---|---|---|---|
   | Date | Country | City | Category | Local Amount | Currency | Amount (EUR) | Notes |

4. Click cell **G202** and type `=SUM(G2:G201)`, then press Enter. It shows `0`.
5. Look at the address bar of your browser. The web address looks like `https://docs.google.com/spreadsheets/d/1AbC...xyz/edit`. The part between `/d/` and `/edit` is your **Sheet ID**. Copy it into your note.

Rows 2 to 201 are where your expenses go, and G202 is their total in euros. You don't need to count rows later: when the space fills up, the bot adds 200 more rows by itself and stretches the total.

### Step 5: Create the script

1. Go to <https://script.google.com> and click **New project**.
2. At the top left, click **Untitled project**, and rename it to `Expenses bot`.
3. On the left, you'll see a file called **Code.gs**. Click it, select all the text inside, and delete it.

### Step 6: Copy the code into the script

You'll copy nine files from this project's [`src` folder](src) into the script. For each one, open the file on GitHub and click the **Copy raw file** button, which looks like two squares, at the top right of the file.

**First, the settings file:**

1. On the left of the script editor, click the **gear icon**, labelled **Project Settings**.
2. Tick **Show "appsscript.json" manifest file in editor**.
3. Click the **< >** icon, labelled **Editor**, to go back. A file called `appsscript.json` is now in the list.
4. Click `appsscript.json`, delete everything in it, and paste the contents of [`src/appsscript.json`](src/appsscript.json).

**Then the eight code files.** Reuse **Code.gs** for the first one: right-click it, choose **Rename**, and call it `main`. Paste [`src/main.js`](src/main.js) into it.

For each of the other seven files:

1. Click the **+** next to **Files**, then choose **Script**.
2. Type its name without `.js`, and press Enter. The editor adds `.gs` by itself.
3. Paste that file's contents into it.

| Name to type | Paste the contents of |
|---|---|
| `commands` | [`src/commands.js`](src/commands.js) |
| `parser` | [`src/parser.js`](src/parser.js) |
| `settings` | [`src/settings.js`](src/settings.js) |
| `setup` | [`src/setup.js`](src/setup.js) |
| `telegram` | [`src/telegram.js`](src/telegram.js) |
| `timezones` | [`src/timezones.js`](src/timezones.js) |
| `tracker` | [`src/tracker.js`](src/tracker.js) |

When you're done, click the **Save** icon, which looks like a floppy disk, above the code. The file names on the left should be `appsscript.json` plus the eight files above, with `.gs` at the end.

### Step 7: Publish the script so Telegram can reach it

1. At the top right, click **Deploy**, then **New deployment**.
2. Next to **Select type**, click the **gear icon** and choose **Web app**.
3. Fill in the form:
   - **Description:** anything, such as `First version`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**
4. Click **Deploy**.
5. Google asks you to authorize access. Click **Authorize access**, choose your Google account, and follow the step in **About the "unsafe" warning** below.
6. You'll then see a **Deployment ID**, a long code starting with `AKfycb`. Click **Copy**, paste it into your note as your **Deployment ID**, then click **Done**.

**About the "unsafe" warning:** Google shows "Google hasn't verified this app", because the script is yours rather than a published app. Click **Advanced**, then **Go to Expenses bot (unsafe)**, then **Allow**. This lets your own script edit your own spreadsheets and send messages to Telegram, and nobody else gets access.

"Anyone" means Telegram can deliver your messages to the script without signing in to Google. It doesn't give anyone access to your sheet: the script ignores every message without your secret word, or from a Telegram ID that isn't yours.

### Step 8: Enter your five values

1. Click the **gear icon**, labelled **Project Settings**, and scroll down to **Script Properties**.
2. Click **Add script property** five times, and fill in these names and values from your note. The names must be in capitals, exactly as shown:

   | Property | Value |
   |---|---|
   | `BOT_TOKEN` | Your bot token |
   | `OWNER_USER_ID` | Your Telegram ID |
   | `WEBHOOK_SECRET` | Your secret word |
   | `SHEET_ID` | Your Sheet ID |
   | `DEPLOYMENT_ID` | Your Deployment ID |

3. Click **Save script properties**.

Because these values live here and not in the code, the code can be shared without giving anyone your bot.

### Step 9: Connect the bot

1. Click the **< >** icon, labelled **Editor**, and open **setup.gs**.
2. Above the code, there's a menu showing a function name. Choose **setup** in it.
3. Click **Run**. If Google asks for permission again, allow it in the same way as in step 7.
4. The **Execution log** opens at the bottom. It should say:
   - `Bot: @` and your bot's username
   - `Spreadsheet:` and your sheet's name
   - `Bot Settings tab: created`
   - `Webhook registered. Send your bot a message to test it.`

Your sheet now has a new tab called **Bot Settings**, holding your settings and category codes.

### Step 10: Try it

In Telegram, open the chat with your bot, using the username you chose in step 1, and tap **Start**. You should get the list of commands. Then send, with your own values:

```text
/country Bolivia
/city Santa cruz
/currency BOB 13,3
14 f
```

The last reply should say `Saved row 2`, and the expense should appear in row 2 of your sheet. Send `/undo` if you want to remove it.

You're done, so you can delete your note now. If you need the values again, they're in Script Properties.

### If something doesn't work

| What happens | What to do |
|---|---|
| The bot doesn't reply at all | In the script editor, choose **checkWebhook** in the function menu, click **Run**, and read the log. Then check the five Script Properties for typos, and run **setup** again |
| `setup` says "Missing Script Properties" | One of the five names is missing or misspelled. They must be in capitals, as in step 8 |
| `setup` says `OWNER_USER_ID must contain digits only` | Your Telegram ID should be only a number, with no spaces |
| `setup` fails and mentions the token | The bot token was copied incompletely. Copy it again from BotFather |
| The bot replies "Not saved: something went wrong on my side" | Check the tab is called exactly `Budget Tracker`, the eight headings are spelled exactly as in step 4, and G202 still has the total. The **Executions** page, under the list icon on the left, shows the exact error |
| The bot replies "Not saved: set these first" | Send the commands the reply lists |

### Changing the code later

Changes don't reach your bot until you publish a new version:

1. Edit or paste the new code, then click **Save**.
2. Click **Deploy**, then **Manage deployments**.
3. Click the **pencil icon**, labelled **Edit**.
4. Under **Version**, choose **New version**, then click **Deploy**.

Don't use **New deployment** for this. It creates a different web address, and the bot would keep using the old one.

---

## For developers

The code is plain JavaScript for Google Apps Script, with tests that run on Node.js 20 or later.

```bash
npm install
```

```bash
npm test
```

You can also edit locally and upload with [clasp](https://github.com/google/clasp), Google's command line tool for Apps Script. [doc.md](doc.md) explains the architecture, each file, the clasp setup and how to maintain the project.

The bot token, webhook secret, Telegram user ID and spreadsheet ID belong in the script's Script Properties. Never add them to the code or this repository.

## License

MIT. See [LICENSE](LICENSE).
