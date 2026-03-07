import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IOrgSettings } from '../models/types';
import { DEFAULT_THRESHOLDS } from '../models/types';

const SK = 'SETTINGS';

export async function getOrgSettings(organizationId: string): Promise<IOrgSettings | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TableNames.orgSettings,
      Key: { organizationId, sk: SK },
    })
  );
  const out = res as { Item?: IOrgSettings };
  return out.Item ?? null;
}

export async function createOrgSettings(organizationId: string): Promise<IOrgSettings> {
  const defaults: IOrgSettings = {
    organizationId,
    sk: SK,
    departments: [
      { id: 'supply-chain', name: 'Supply Chain', email: '' },
      { id: 'marketing', name: 'Marketing', email: '' },
      { id: 'finance', name: 'Finance', email: '' },
      { id: 'operations', name: 'Operations', email: '' },
      { id: 'product', name: 'Product', email: '' },
      { id: 'cx', name: 'Customer Experience', email: '' },
      { id: 'tech', name: 'Tech', email: '' },
    ],
    smtp: null,
    thresholds: { ...DEFAULT_THRESHOLDS },
  };
  await docClient.send(
    new PutCommand({
      TableName: TableNames.orgSettings,
      Item: defaults,
    })
  );
  return defaults;
}

export async function updateOrgSettings(
  organizationId: string,
  updates: Partial<Pick<IOrgSettings, 'departments' | 'smtp' | 'thresholds'>>
): Promise<void> {
  const expr: string[] = [];
  const values: Record<string, unknown> = {};
  if (updates.departments !== undefined) {
    expr.push('departments = :d');
    values[':d'] = updates.departments;
  }
  if (updates.smtp !== undefined) {
    expr.push('smtp = :s');
    values[':s'] = updates.smtp;
  }
  if (updates.thresholds !== undefined) {
    expr.push('thresholds = :t');
    values[':t'] = updates.thresholds;
  }
  if (expr.length === 0) return;
  await docClient.send(
    new UpdateCommand({
      TableName: TableNames.orgSettings,
      Key: { organizationId, sk: SK },
      UpdateExpression: 'SET ' + expr.join(', '),
      ExpressionAttributeValues: values,
    })
  );
}
