import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IUser } from '../models/types';

const EMAIL_INDEX = 'email-index';

export async function getUserById(userId: string): Promise<IUser | null> {
  const res = await docClient.send(
    new GetCommand({
      TableName: TableNames.users,
      Key: { userId },
    })
  );
  const out = res as { Item?: IUser };
  return out.Item ?? null;
}

export async function getUserByEmail(email: string): Promise<IUser | null> {
  const res = await docClient.send(
    new QueryCommand({
      TableName: TableNames.users,
      IndexName: EMAIL_INDEX,
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email.toLowerCase().trim() },
      Limit: 1,
    })
  );
  return (res.Items?.[0] as IUser) ?? null;
}

export async function createUser(user: IUser): Promise<void> {
  const now = new Date().toISOString();
  const toStore = {
    ...user,
    email: user.email.toLowerCase().trim(),
    createdAt: user.createdAt ?? now,
    updatedAt: now,
  };
  await docClient.send(
    new PutCommand({
      TableName: TableNames.users,
      Item: toStore,
    })
  );
}
