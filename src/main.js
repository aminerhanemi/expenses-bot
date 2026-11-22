const PROCESSED_IDS_PROPERTY = 'PROCESSED_UPDATE_IDS';
const PROCESSED_IDS_LIMIT = 200;
const LOCK_WAIT_MS = 30000;
const ORIGINAL_TEXT_LIMIT = 200;

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  const read = (name) => (props.getProperty(name) || '').trim();
  return {
    botToken: read('BOT_TOKEN'),
    webhookSecret: read('WEBHOOK_SECRET'),
    ownerUserId: read('OWNER_USER_ID'),
    sheetId: read('SHEET_ID'),
  };
}

function doPost(e) {
  try {
    handleRequest_(e);
  } catch (error) {
    console.error('Request failed: ' + error.message);
  }
  // HtmlService, because ContentService responses redirect and Telegram may treat that as a failure.
  return HtmlService.createHtmlOutput('');
}

function handleRequest_(e) {
  const config = getConfig_();
  if (!config.webhookSecret || e.parameter.secret !== config.webhookSecret) {
    return;
  }

  const update = JSON.parse(e.postData.contents);
  const message = update.message;
  if (!isFromOwner_(message, config)) {
    return;
  }

  const reply = processUpdateOnce_(config, update.update_id, message);
  if (reply !== null) {
    sendMessage_(config.botToken, message.chat.id, reply);
  }
}

function isFromOwner_(message, config) {
  return Boolean(message && message.from && message.chat)
    && String(message.from.id) === config.ownerUserId
    && message.chat.type === 'private';
}

// Telegram can deliver the same update twice, so each ID runs once. Returns null for a repeat.
function processUpdateOnce_(config, updateId, message) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    console.error('Could not get the lock for update ' + updateId);
    return notSavedReply_(message.text || '');
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const processed = readProcessedIds_(props);
    if (processed.includes(updateId)) {
      return null;
    }

    let reply;
    try {
      reply = handleMessage_(config, message);
    } catch (error) {
      console.error('Update ' + updateId + ' failed: ' + error.message);
      reply = notSavedReply_(message.text || '');
    }

    const updated = processed.concat(updateId).slice(-PROCESSED_IDS_LIMIT);
    props.setProperty(PROCESSED_IDS_PROPERTY, JSON.stringify(updated));
    return reply;
  } finally {
    lock.releaseLock();
  }
}

function readProcessedIds_(props) {
  try {
    const ids = JSON.parse(props.getProperty(PROCESSED_IDS_PROPERTY) || '[]');
    return Array.isArray(ids) ? ids : [];
  } catch (error) {
    console.error('Could not read the processed update IDs: ' + error.message);
    return [];
  }
}

function notSavedReply_(text) {
  return 'Not saved: something went wrong on my side. Please resend this: ' + text.slice(0, ORIGINAL_TEXT_LIMIT);
}
