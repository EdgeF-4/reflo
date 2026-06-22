#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadMcpConfig, RefloClient } from './client.js';

/**
 * Reflo MCP server. Exposes the program's tracking, attribution, ledger and
 * reporting surface as tools so an AI agent can answer questions about a
 * partner program and take a few guarded actions on it. It talks to the same
 * HTTP API a human dashboard uses, so it inherits RBAC, RLS and the audit log.
 */
const client = new RefloClient(loadMcpConfig());

const server = new McpServer({ name: 'reflo', version: '0.1.0' });

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

server.tool(
  'reflo_program_summary',
  'Program KPIs: outstanding liability, paid total, conversion and fraud counts.',
  {},
  async () => text(await client.get('/reports/summary')),
);

server.tool(
  'reflo_partner_leaderboard',
  'Partners ranked by settled and outstanding commission.',
  {},
  async () => text(await client.get('/reports/partners')),
);

server.tool(
  'reflo_ledger_entries',
  'List settlement-ledger entries, optionally filtered by state.',
  {
    state: z
      .enum(['pending', 'confirmed', 'payable', 'paid', 'reversed', 'clawed_back'])
      .optional()
      .describe('Filter by ledger state.'),
  },
  async ({ state }) => text(await client.get(`/ledger/entries${state ? `?state=${state}` : ''}`)),
);

server.tool(
  'reflo_fraud_assessments',
  'Recent fraud assessments, highest risk first, with the signals that fired.',
  {},
  async () => text(await client.get('/reports/fraud')),
);

server.tool(
  'reflo_partner_insights',
  'AI-assisted partner performance insights (deterministic without a model key).',
  {},
  async () => text(await client.get('/insights/partners')),
);

server.tool(
  'reflo_record_conversion',
  'Record a server-to-server conversion through the attribution and fraud pipeline.',
  {
    publicKey: z.string().describe('Tracking key public id.'),
    orderId: z.string(),
    amountCents: z.number().int().min(0),
    customerRef: z.string(),
    sourceSite: z.string().describe('Origin domain (must be allowed for the key).'),
    model: z
      .enum(['last_touch', 'first_touch', 'linear', 'position_based', 'time_decay'])
      .optional(),
  },
  async (args) => text(await client.post('/track/conversion', args)),
);

server.tool(
  'reflo_transition_ledger_entry',
  'Advance a ledger entry through the settlement state machine.',
  {
    entryId: z.string(),
    type: z.enum(['confirmed', 'marked_payable', 'paid', 'reversed', 'clawed_back']),
    reason: z.string().optional(),
  },
  async ({ entryId, type, reason }) =>
    text(await client.post(`/ledger/entries/${entryId}/transition`, { type, reason })),
);

server.tool(
  'reflo_run_payouts',
  'Settle every payable entry into a payout batch per partner.',
  {},
  async () => text(await client.post('/ledger/payouts/run', {})),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The server now serves tools over stdio until the host disconnects.
}

main().catch((err) => {
  console.error('reflo mcp failed:', err);
  process.exit(1);
});
