'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { closeStartupPool, failStartupAndClose } = require('../dist/startup-boundaries.js');

test('startup pool cleanup preserves preparation and close failures with recovery', async () => {
  const pool = { end: async () => { throw new Error('socket stuck'); } };
  await assert.rejects(
    closeStartupPool(pool, new Error('migration exploded')),
    (error) => {
      assert.match(error.message, /socket stuck/);
      assert.match(error.message, /migration exploded/);
      assert.match(error.message, /Next: inspect active database clients/);
      return true;
    },
  );
});

test('listen failure closes the partial app and names the next action', async () => {
  let closed = false;
  const app = { close: async () => { closed = true; } };
  await assert.rejects(
    failStartupAndClose(app, new Error('EADDRINUSE'), 4000),
    /EADDRINUSE.*Next: confirm the port is free/,
  );
  assert.equal(closed, true);
});

test('listen cleanup failure preserves both raw causes', async () => {
  const app = { close: async () => { throw new Error('close hook stuck'); } };
  await assert.rejects(
    failStartupAndClose(app, new Error('Redis refused'), 4000),
    (error) => {
      assert.match(error.message, /Redis refused/);
      assert.match(error.message, /close hook stuck/);
      assert.match(error.message, /Next: confirm the port is free/);
      return true;
    },
  );
});
