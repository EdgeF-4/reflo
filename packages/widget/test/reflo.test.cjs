'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'reflo.js'), 'utf8');

function loadWidget(options = {}) {
  const events = [];
  const errors = [];
  const listeners = {};
  const script = {
    dataset: {
      refloKey: 'public-key',
      refloApi: 'http://localhost:4000',
      refloAuto: 'false',
      ...(options.dataset || {}),
    },
  };
  const window = {
    location: { search: '', hostname: 'publisher.test' },
    localStorage: {
      getItem: () => 'stable-customer',
      setItem: () => {},
      ...(options.localStorage || {}),
    },
    dispatchEvent: (event) => events.push(event),
    console: { error: (message) => errors.push(message) },
  };
  const document = {
    currentScript: script,
    readyState: 'complete',
    getElementsByTagName: () => [script],
    querySelectorAll: () => [],
    addEventListener: (name, callback) => { listeners[name] = callback; },
  };
  class CustomEvent {
    constructor(name, init) { this.type = name; this.detail = init.detail; }
  }
  vm.runInNewContext(source, {
    window,
    document,
    fetch: options.fetch || (() => Promise.resolve({ ok: true, status: 202 })),
    URLSearchParams,
    CustomEvent,
    Promise,
    Math,
    Date,
  });
  return { window, events, errors };
}

test('tracking fetch rejection stays non-throwing but reports cause and recovery', async () => {
  const h = loadWidget({ fetch: () => Promise.reject(new Error('connection refused')) });
  const result = await h.window.reflo.track('click');
  assert.equal(result.ok, false);
  assert.match(result.error, /connection refused/);
  assert.match(result.error, /Next: confirm the API is reachable/);
  assert.equal(h.events[0].type, 'reflo:tracking-error');
  assert.match(h.errors[0], /connection refused/);
});

test('tracking HTTP refusal reports status, body, and exact correction', async () => {
  const h = loadWidget({
    fetch: () => Promise.resolve({
      ok: false,
      status: 403,
      text: () => Promise.resolve('source domain is not allowed'),
    }),
  });
  const result = await h.window.reflo.track('lead');
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /source domain is not allowed/);
  assert.match(result.error, /verify the public key and allowed domain/);
});

test('missing configuration returns an actionable result without fetching', async () => {
  let fetched = false;
  const h = loadWidget({
    dataset: { refloKey: '', refloApi: '' },
    fetch: () => { fetched = true; throw new Error('must not fetch'); },
  });
  const result = await h.window.reflo.track('click');
  assert.equal(fetched, false);
  assert.equal(result.ok, false);
  assert.match(result.error, /data-reflo-key or data-reflo-api is missing/);
  assert.match(result.error, /Next: set both data attributes/);
});

test('blocked identity storage reports fallback impact and recovery', () => {
  const h = loadWidget({
    localStorage: {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => {},
    },
  });
  assert.match(h.events[0].detail.message, /storage denied/);
  assert.match(h.events[0].detail.message, /allow first-party localStorage/);
});
