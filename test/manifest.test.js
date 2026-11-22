const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'appsscript.json'), 'utf8'),
);

test('web app runs as the owner and accepts requests without sign-in', () => {
  assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');
  assert.equal(manifest.webapp.access, 'ANYONE_ANONYMOUS');
});

test('script asks only for the permissions it needs', () => {
  assert.deepEqual(manifest.oauthScopes.sort(), [
    'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/spreadsheets',
  ]);
});
