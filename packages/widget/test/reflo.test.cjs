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
    location: options.location || { search: '', hostname: 'publisher.test' },
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
    readyState: options.readyState || 'complete',
    getElementsByTagName: () => [script],
    querySelectorAll: options.querySelectorAll || (() => []),
    addEventListener: options.documentAddEventListener || ((name, callback) => { listeners[name] = callback; }),
  };
  if (options.currentScriptError) {
    Object.defineProperty(document, 'currentScript', {
      get: () => { throw new Error(options.currentScriptError); },
    });
  }
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

test('synchronous fetch failure cannot break the host page', async () => {
  const h = loadWidget({ fetch: () => { throw new Error('fetch unavailable'); } });
  const result = await h.window.reflo.track('click');
  assert.equal(result.ok, false);
  assert.match(result.error, /fetch unavailable/);
  assert.match(result.error, /Next: confirm browser fetch support/);
});

test('payload serialization failure cannot break the host page', async () => {
  const h = loadWidget();
  const result = await h.window.reflo.track('click', { customerRef: 1n });
  assert.equal(result.ok, false);
  assert.match(result.error, /serialize a BigInt/);
  assert.match(result.error, /Next: pass a serializable string customerRef/);
});

test('blocked location access cannot break the host page', async () => {
  const location = { search: '' };
  Object.defineProperty(location, 'hostname', {
    get: () => { throw new Error('location denied'); },
  });
  const h = loadWidget({ location });
  const result = await h.window.reflo.track('click');
  assert.equal(result.ok, false);
  assert.match(result.error, /location denied/);
  assert.match(result.error, /Next: allow access to window.location/);
});

test('bootstrap document accessor failure is contained and actionable', async () => {
  const h = loadWidget({ currentScriptError: 'currentScript denied' });
  const result = await h.window.reflo.track('click');
  assert.equal(result.ok, false);
  assert.match(h.events[0].detail.message, /currentScript denied/);
  assert.match(h.events[0].detail.message, /Next: restore normal script and document access/);
});

test('automatic form discovery failure is contained and actionable', () => {
  const h = loadWidget({
    dataset: { refloAuto: 'true' },
    querySelectorAll: () => { throw new Error('selector denied'); },
  });
  assert.match(
    h.events.find((event) => /selector denied/.test(event.detail.message)).detail.message,
    /Next: restore document query access/,
  );
});

test('document readiness listener failure is contained and actionable', () => {
  const h = loadWidget({
    dataset: { refloAuto: 'true' },
    readyState: 'loading',
    documentAddEventListener: () => { throw new Error('listener denied'); },
  });
  h.window.location.search = '';
  assert.match(
    h.events.find((event) => /listener denied/.test(event.detail.message)).detail.message,
    /Next: disable data-reflo-auto/,
  );
});
