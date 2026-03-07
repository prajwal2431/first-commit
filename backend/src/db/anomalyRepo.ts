import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../config/dynamo';
import { TableNames } from '../config/dynamo';
import type { IAnomaly } from '../models/types';
import { v4 as uuidv4 } from 'uuid';

export async function createAnomaly(input: Omit<IAnomaly, 'anomalyId'>): Promise<IAnomaly> {
  const anomalyId = uuidv4();
  const item: IAnomaly = {
    ...input,
    anomalyId,
  };
  await docClient.send(
    new PutCommand({
      TableName: TableNames.anomalies,
      Item: item,
    })
  );
  return item;
}
