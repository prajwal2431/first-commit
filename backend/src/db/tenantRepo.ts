import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { ITenant } from '../models/types';

export async function getTenantByTenantId(tenantId: string): Promise<ITenant | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TableNames.tenants,
      Key: { tenantId },
    })
  );
  const out = res as { Item?: ITenant };
  return out.Item ?? null;
}

export async function createTenant(tenant: ITenant): Promise<void> {
  const now = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: TableNames.tenants,
      Item: {
        ...tenant,
        createdAt: tenant.createdAt ?? now,
        updatedAt: now,
      },
    })
  );
}
