'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { RefloClient } = require('../dist/client.js');

const config = {
  apiUrl: 'http://reflo.invalid',
  tenantSlug: 'northwind',
  email: 'admin@northwind.test',
  password: 'demo1234',
};

function response(body, init = {}) {
  return new Response(body, { status: 200, ...init });
}

test('network rejection preserves the cause and exact recovery', { concurrency: false }, async () => {
  global.fetch = async () => { throw new Error('connection refused'); };
  await assert.rejects(
    new RefloClient(config).get('/reports/summary'),
    (error) => {
      assert.match(error.message, /connection refused/);
      assert.match(error.message, /Next: start the demo/);
      return true;
    },
  );
});

test('malformed successful login JSON is actionable', { concurrency: false }, async () => {
  global.fetch = async () => response('{not-json');
  await assert.rejects(
    new RefloClient(config).get('/reports/summary'),
    /login returned invalid JSON:.*Next: inspect the Reflo API/,
  );
});

test('successful login without a token is actionable', { concurrency: false }, async () => {
  global.fetch = async () => response('{}');
  await assert.rejects(
    new RefloClient(config).get('/reports/summary'),
    /was not an object containing a non-empty token.*Next: inspect POST \/auth\/login/,
  );
});

for (const invalid of ['null', '[]']) {
  test(`successful login body ${invalid} is actionable`, { concurrency: false }, async () => {
    global.fetch = async () => response(invalid);
    await assert.rejects(
      new RefloClient(config).get('/reports/summary'),
      /was not an object containing a non-empty token.*Next: inspect POST \/auth\/login/,
    );
  });
}

test('malformed successful tool response is actionable', { concurrency: false }, async () => {
  let call = 0;
  global.fetch = async () => {
    call += 1;
    return call === 1 ? response('{"token":"test-token"}') : response('{broken');
  };
  await assert.rejects(
    new RefloClient(config).get('/reports/summary'),
    /GET \/reports\/summary returned invalid JSON:.*Next: inspect the Reflo API/,
  );
});

test('HTTP body read failure preserves the read cause and recovery', { concurrency: false }, async () => {
  global.fetch = async () => ({
    ok: false,
    status: 502,
    text: async () => { throw new Error('body stream reset'); },
  });
  await assert.rejects(
    new RefloClient(config).get('/reports/summary'),
    /body stream reset.*Next: verify the configured account/,
  );
});

test('POST serialization failure names the invalid input recovery', { concurrency: false }, async () => {
  global.fetch = async () => response('{"token":"test-token"}');
  const circular = {};
  circular.self = circular;
  await assert.rejects(
    new RefloClient(config).post('/ledger/payouts/run', circular),
    (error) => {
      assert.match(error.message, /could not serialize POST \/ledger\/payouts\/run/);
      assert.match(error.message, /Next: remove circular or unsupported values/);
      return true;
    },
  );
});
