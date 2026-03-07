import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IAnalysisSession, AnalysisStep } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

export function createSessionId(): string {
  return uuidv4();
}

export async function getAnalysisSession(organizationId: string, sessionId: string): Promise<IAnalysisSession | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TableNames.analysisSessions,
      Key: { organizationId, sessionId },
    })
  );
  const out = res as { Item?: IAnalysisSession };
  return out.Item ?? null;
}

export async function getAnalysisSessionById(sessionId: string): Promise<IAnalysisSession | null> {
  // We don't have a GSI on sessionId; callers must pass orgId. For findById(sessionId) we need to scan or have a global secondary index.
  // The runAnalysis and routes use organizationId + sessionId. So getAnalysisSession(orgId, sessionId) is the primary.
  return null;
}

export async function listAnalysisSessionsByOrg(
  organizationId: string,
  limit: number
): Promise<IAnalysisSession[]> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: TableNames.analysisSessions,
      KeyConditionExpression: 'organizationId = :org',
      ExpressionAttributeValues: { ':org': organizationId },
      Limit: limit,
    })
  );
  const items = (res.Items ?? []) as IAnalysisSession[];
  items.sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  return items;
}

export async function createAnalysisSession(
  input: Omit<IAnalysisSession, 'sessionId' | 'startedAt' | 'steps' | 'messages'> & { steps?: AnalysisStep[]; messages?: IAnalysisSession['messages'] }
): Promise<IAnalysisSession> {
  const sessionId = createSessionId();
  const startedAt = new Date().toISOString();
  const item: IAnalysisSession = {
    ...input,
    steps: input.steps ?? [],
    messages: input.messages ?? [],
    sessionId,
    startedAt,
  };
  await docClient.send(
    new PutCommand({
      TableName: TableNames.analysisSessions,
      Item: item,
    })
  );
  return item;
}

export async function updateAnalysisSession(
  organizationId: string,
  sessionId: string,
  updates: Partial<
    Pick<
      IAnalysisSession,
      'status' | 'steps' | 'result' | 'completedAt' | 'errorMessage' | 'messages' | 'query'
    >
  >
): Promise<void> {
  const expr: string[] = [];
  const values: Record<string, unknown> = {};
  const names: Record<string, string> = {};
  if (updates.status !== undefined) {
    expr.push('#st = :st');
    values[':st'] = updates.status;
    names['#st'] = 'status';
  }
  if (updates.query !== undefined) {
    expr.push('query = :q');
    values[':q'] = updates.query;
  }
  if (updates.steps !== undefined) {
    expr.push('steps = :steps');
    values[':steps'] = updates.steps;
  }
  if (updates.result !== undefined) {
    expr.push('result = :res');
    values[':res'] = updates.result;
  }
  if (updates.completedAt !== undefined) {
    expr.push('completedAt = :ca');
    values[':ca'] = updates.completedAt;
  }
  if (updates.errorMessage !== undefined) {
    expr.push('errorMessage = :em');
    values[':em'] = updates.errorMessage;
  }
  if (updates.messages !== undefined) {
    expr.push('messages = :msg');
    values[':msg'] = updates.messages;
  }
  if (expr.length === 0) return;
  await docClient.send(
    new UpdateCommand({
      TableName: TableNames.analysisSessions,
      Key: { organizationId, sessionId },
      UpdateExpression: 'SET ' + expr.join(', '),
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: Object.keys(names).length > 0 ? names : undefined,
    })
  );
}

export async function deleteAnalysisSession(organizationId: string, sessionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TableNames.analysisSessions,
      Key: { organizationId, sessionId },
    })
  );
}
