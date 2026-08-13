'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { closeStartupPool, failStartupAndClose } = require('../dist/startup-boundaries.js');
const {
  cleanupFailures,
  releaseDatabaseClient,
} = require('../dist/db/failure-boundaries.js');
const { loadWidgetSource } = require('../dist/widget/widget-source.js');
const { BadRequestException } = require('@nestjs/common');
const { ActionableExceptionFilter } = require('../dist/core/actionable-exception.filter.js');
const { DbService } = require('../dist/db/db.service.js');
const { HealthController } = require('../dist/health/health.controller.js');

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

test('database client release preserves the operation and release failures', () => {
  const client = { release: () => { throw new Error('release exploded'); } };
  assert.throws(
    () => releaseDatabaseClient(client, 'tenant transaction', new Error('commit refused')),
    (error) => {
      assert.match(error.message, /release exploded/);
      assert.match(error.message, /commit refused/);
      assert.match(error.message, /Next: inspect checked-out database clients/);
      return true;
    },
  );
});

test('cleanup collects synchronous and asynchronous failures and still runs every step', async () => {
  let finalStepRan = false;
  const failures = await cleanupFailures([
    { name: 'sync close', run: () => { throw new Error('sync exploded'); } },
    { name: 'async close', run: async () => { throw new Error('async refused'); } },
    { name: 'final close', run: () => { finalStepRan = true; } },
  ]);
  assert.equal(finalStepRan, true);
  assert.deepEqual(failures, [
    'sync close: sync exploded',
    'async close: async refused',
  ]);
});

test('missing widget source fails startup with the exact packaging recovery', () => {
  assert.throws(
    () => loadWidgetSource(['/reflo-test/missing-widget.js']),
    /could not locate.*Next: package packages\/widget\/reflo\.js/,
  );
});

test('unreadable widget candidate preserves the filesystem cause and recovery', () => {
  assert.throws(
    () => loadWidgetSource(['/tmp']),
    (error) => {
      assert.match(error.message, /could not read the Reflo widget at \/tmp/);
      assert.match(error.message, /Next: make that file readable/);
      return true;
    },
  );
});

test('tenant transaction preserves work, rollback, and release failures', async () => {
  const service = Object.create(DbService.prototype);
  service.appPool = {
    connect: async () => ({
      query: async (sql) => {
        if (sql === 'ROLLBACK') throw new Error('rollback refused');
      },
      release: () => { throw new Error('release stuck'); },
    }),
  };
  await assert.rejects(
    service.runAs({ tenantId: 'tenant' }, async () => { throw new Error('work exploded'); }),
    (error) => {
      assert.match(error.message, /work exploded/);
      assert.match(error.message, /rollback refused/);
      assert.match(error.message, /release stuck/);
      assert.match(error.message, /Next: inspect checked-out database clients/);
      return true;
    },
  );
});

test('public 500 response is safe and its operator log preserves cause plus recovery', () => {
  const sent = {};
  const logs = [];
  const response = {
    status(code) { sent.status = code; return this; },
    json(body) { sent.body = body; },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) };
  const filter = new ActionableExceptionFilter();
  filter.logger = { error: (message) => logs.push(message) };
  filter.catch(new Error('database socket reset'), host);
  assert.equal(sent.status, 500);
  assert.match(sent.body.message, /Next:/);
  assert.match(sent.body.nextAction, /docker compose logs api/);
  assert.doesNotMatch(JSON.stringify(sent.body), /database socket reset/);
  assert.match(logs[0], /database socket reset/);
  assert.match(logs[0], /Next: inspect this cause/);
});

test('public validation response appends a concrete next action', () => {
  const sent = {};
  const response = {
    status(code) { sent.status = code; return this; },
    json(body) { sent.body = body; },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) };
  new ActionableExceptionFilter().catch(
    new BadRequestException(['amountCents must be an integer number']),
    host,
  );
  assert.equal(sent.status, 400);
  assert.match(sent.body.message, /amountCents must be an integer/);
  assert.match(sent.body.message, /Next: correct the named request fields/);
});

test('degraded health response logs raw database cause and returns recovery', async () => {
  const logs = [];
  const controller = new HealthController({
    runAdmin: async () => { throw new Error('connection terminated'); },
  });
  controller.logger = { error: (message) => logs.push(message) };
  const body = await controller.health();
  assert.equal(body.status, 'degraded');
  assert.match(body.nextAction, /docker compose logs db/);
  assert.match(logs[0], /connection terminated/);
  assert.match(logs[0], /Next:/);
});
