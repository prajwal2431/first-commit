import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from '@aws-sdk/client-bedrock-agentcore';
import crypto from 'crypto';

export interface RCAAgentInvokeParams {
  prompt: string;
  orgId: string;
  sessionId: string;
  actorId?: string;
}

export interface RCAAgentResult {
  result: string;
  reasoning_log?: unknown;
  evidence?: unknown;
  recommendations?: unknown;
  raw?: string;
}

const REGION = process.env.RCA_AGENT_REGION || process.env.AWS_REGION;
const AGENT_RUNTIME_ARN = process.env.RCA_AGENT_RUNTIME_ARN;
const AGENT_RUNTIME_QUALIFIER = process.env.RCA_AGENT_RUNTIME_QUALIFIER;
const TIMEOUT_MS = Number(process.env.RCA_AGENT_TIMEOUT_MS || 30000);

if (!REGION) {
  // Fail fast on startup if region is not configured
  // eslint-disable-next-line no-console
  console.warn('[RCAagent] RCA_AGENT_REGION/AWS_REGION is not set. RCAagent client may fail at runtime.');
}

if (!AGENT_RUNTIME_ARN) {
  // eslint-disable-next-line no-console
  console.warn('[RCAagent] RCA_AGENT_RUNTIME_ARN is not set. RCAagent invocations will fail until configured.');
}

const client = new BedrockAgentCoreClient(
  REGION
    ? { region: REGION }
    : {}
);

function buildRuntimeSessionId(orgId: string, sessionId: string): string {
  const hash = crypto.createHash('sha256').update(`${orgId}:${sessionId}`).digest('hex');
  // sha256 hex is 64 chars, which satisfies 33+ char requirement and is stable per (orgId, sessionId)
  return hash;
}

export async function invokeRCAAgent(params: RCAAgentInvokeParams): Promise<RCAAgentResult> {
  if (!AGENT_RUNTIME_ARN) {
    throw new Error('RCA_AGENT_RUNTIME_ARN is not configured');
  }

  const { prompt, orgId, sessionId, actorId = 'chat' } = params;

  const payload = {
    prompt,
    thread_id: sessionId,
    actor_id: actorId,
  };

  const runtimeSessionId = buildRuntimeSessionId(orgId, sessionId);

  const input = {
    runtimeSessionId,
    agentRuntimeArn: AGENT_RUNTIME_ARN,
    qualifier: AGENT_RUNTIME_QUALIFIER,
    payload: new TextEncoder().encode(JSON.stringify(payload)),
  };

  const command = new InvokeAgentRuntimeCommand(input);

  const invokePromise = (async () => {
    const response = await client.send(command);
    const text = await response.response?.transformToString();

    if (!text) {
      return {
        result: 'Agent returned an empty response.',
        raw: '',
      };
    }

    try {
      const parsed = JSON.parse(text) as Partial<RCAAgentResult> | { result?: string };
      const resultText = (parsed as RCAAgentResult).result || text;
      return {
        result: resultText,
        reasoning_log: (parsed as RCAAgentResult).reasoning_log,
        evidence: (parsed as RCAAgentResult).evidence,
        recommendations: (parsed as RCAAgentResult).recommendations,
        raw: text,
      };
    } catch {
      return {
        result: text,
        raw: text,
      };
    }
  })();

  const timeoutPromise = new Promise<RCAAgentResult>((_, reject) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      reject(new Error('RCAagent invocation timed out'));
    }, TIMEOUT_MS);
  });

  return Promise.race([invokePromise, timeoutPromise]);
}

