import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invokeRCAAgent } from './rcaAgentClient';

test('invokeRCAAgent throws when runtime ARN is not configured', async () => {
  // Ensure env var is unset/empty before importing is not possible here because
  // the constant is resolved at module load time, but this matches default state.
  delete process.env.RCA_AGENT_RUNTIME_ARN;

  await assert.rejects(
    () =>
      invokeRCAAgent({
        prompt: 'test',
        orgId: 'org-1',
        sessionId: 'session-1',
      }),
    /RCA_AGENT_RUNTIME_ARN is not configured/
  );
});

