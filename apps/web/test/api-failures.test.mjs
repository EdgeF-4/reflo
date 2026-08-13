import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIONABLE_ERROR_EVENT,
  api,
  clearActionableError,
  getLastActionableError,
  getToken,
  reportActionableError,
  setSession,
} from '../lib/api.ts';

class TestCustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init.detail;
  }
}

global.CustomEvent = TestCustomEvent;

function setWindow(overrides = {}) {
  const events = [];
  global.window = {
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    dispatchEvent: (event) => events.push(event),
    ...overrides,
  };
  return events;
}

test('blocked session storage is retained and dispatched with recovery', { concurrency: false }, () => {
  clearActionableError();
  const events = setWindow({
    localStorage: { getItem: () => { throw new Error('storage denied'); } },
  });
  assert.equal(getToken(), null);
  assert.match(getLastActionableError(), /storage denied.*Next: allow first-party browser storage/);
  assert.equal(events[0].type, ACTIONABLE_ERROR_EVENT);
});

test('notification transport failure remains actionable in the console', { concurrency: false }, () => {
  clearActionableError();
  const logged = [];
  const original = console.error;
  console.error = (message) => logged.push(message);
  setWindow({ dispatchEvent: () => { throw new Error('event blocked'); } });
  try {
    reportActionableError('Request failed. Next: retry.');
  } finally {
    console.error = original;
  }
  assert.match(logged[0], /event blocked.*Next: inspect the browser console/);
  assert.equal(getLastActionableError(), 'Request failed. Next: retry.');
});

test('request serialization failure names the invalid input recovery', { concurrency: false }, async () => {
  setWindow();
  const circular = {};
  circular.self = circular;
  await assert.rejects(
    api.post('/offers', circular),
    (error) => {
      assert.match(error.message, /Could not serialize/);
      assert.match(error.message, /Next: remove circular or unsupported values/);
      return true;
    },
  );
});

test('network failure preserves the cause and recovery', { concurrency: false }, async () => {
  setWindow();
  global.fetch = async () => { throw new Error('connection refused'); };
  await assert.rejects(
    api.get('/reports/summary'),
    (error) => {
      assert.match(error.message, /connection refused/);
      assert.match(error.message, /Next: confirm the Compose demo is running/);
      return true;
    },
  );
});

test('malformed successful API JSON is actionable', { concurrency: false }, async () => {
  setWindow();
  global.fetch = async () => new Response('{broken', { status: 200 });
  await assert.rejects(
    api.get('/reports/summary'),
    /returned invalid JSON:.*Next: inspect the API and reverse-proxy logs/,
  );
});

test('partial session write is rolled back and reports cleanup failure', { concurrency: false }, () => {
  clearActionableError();
  const removed = [];
  setWindow({
    localStorage: {
      setItem: (key) => {
        if (key === 'reflo_user') throw new Error('user write denied');
      },
      removeItem: (key) => {
        removed.push(key);
        if (key === 'reflo_user') throw new Error('cleanup denied');
      },
      getItem: () => null,
    },
  });
  assert.throws(
    () => setSession('token', { userId: 'u', tenantId: 't', role: 'admin', email: 'a@example.test' }),
    (error) => {
      assert.match(error.message, /user write denied/);
      assert.match(error.message, /cleanup denied/);
      assert.match(error.message, /Next: allow first-party browser storage/);
      return true;
    },
  );
  assert.deepEqual(removed, ['reflo_token', 'reflo_user']);
});

test('reporting cannot throw even when event and console transports fail', { concurrency: false }, () => {
  clearActionableError();
  const original = console.error;
  console.error = () => { throw new Error('console blocked'); };
  setWindow({ dispatchEvent: () => { throw new Error('event blocked'); } });
  try {
    assert.doesNotThrow(() => reportActionableError('Failure. Next: retry.'));
  } finally {
    console.error = original;
  }
  assert.equal(getLastActionableError(), 'Failure. Next: retry.');
});

test('successful login null response is rejected with recovery', { concurrency: false }, async () => {
  setWindow();
  global.fetch = async () => new Response('null', { status: 200 });
  await assert.rejects(
    api.login('northwind', 'admin@northwind.test', 'demo1234'),
    /login response did not contain.*Next: inspect POST \/auth\/login/,
  );
});

test('successful payout null response is rejected with recovery', { concurrency: false }, async () => {
  setWindow();
  global.fetch = async () => new Response('null', { status: 200 });
  await assert.rejects(
    api.runPayouts(),
    /payout response did not contain.*Next: inspect POST \/ledger\/payouts\/run/,
  );
});
