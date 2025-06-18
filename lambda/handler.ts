import { DynamoDB } from 'aws-sdk';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

dotenv.config();

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.DYNAMODB_TABLE!;
const secretKey = process.env.AES_SECRET_KEY;

if (!secretKey || secretKey.length !== 64) {
  throw new Error('AES_SECRET_KEY environment variable is not set or is not a 64-character hex string.');
}

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = Buffer.from(secretKey, 'hex');

// --- Encryption/Decryption Helpers ---

const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text: string): string => {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

const decryptItem = (item: any) => {
  if (!item) return null;
  try {
    return {
      ...item,
      name: decrypt(item.name),
      stock: Number(decrypt(item.stock)),
      price: Number(decrypt(item.price)),
    };
  } catch (error) {
    console.warn(`[WARN] Could not decrypt item with id ${item.id}. Returning as is.`);
    return item; // Return original item if decryption fails
  }
};

exports.handler = async (event: any) => {
  console.log(`[INFO] Received event: ${JSON.stringify(event)}`);

  // POST /items
  if (event.httpMethod === 'POST') {
    try {
      const { name, stock, price } = JSON.parse(event.body);

      if (!name || stock === undefined || price === undefined) {
        console.warn('[WARN] Missing required fields');
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
          body: JSON.stringify({ error: 'Missing required fields: name, stock, price' }),
        };
      }

      const uniqueId = uuidv4();
      const newItem = {
        id: uniqueId,
        name: encrypt(name),
        stock: encrypt(String(stock)),
        price: encrypt(String(price)),
      };

      await dynamoDb.put({ TableName: tableName, Item: newItem }).promise();

      console.log('[INFO] Item created successfully');
      return {
        statusCode: 201,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify({
          message: 'Item created successfully',
          id: uniqueId,
          name: name,
          stock: stock,
          price: price,
        }),
      };
    } catch (error) {
      console.error('[ERROR] Failed to create item:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify({ error: 'Failed to create item' }),
      };
    }
  }

  // GET /items or GET /items?name=apple
  if (event.httpMethod === 'GET') {
    try {
      const { name } = event.queryStringParameters || {};
      let params: DynamoDB.DocumentClient.ScanInput = { TableName: tableName };

      // Note: Filtering on encrypted data is not effective.
      // This will scan all items and then filter locally if a name is provided.
      // For production, consider a different search strategy if filtering is critical.
      const result = await dynamoDb.scan(params).promise();
      let items = result.Items?.map(decryptItem);

      if (name && items) {
        items = items.filter(item => item.name.includes(name));
      }

      console.log('[INFO] Items retrieved successfully');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify(items),
      };
    } catch (error) {
      console.error('[ERROR] Failed to retrieve items:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify({ error: 'Failed to retrieve items' }),
      };
    }
  }

  // PUT /items?id=1
  if (event.httpMethod === 'PUT') {
    try {
      const { id } = event.queryStringParameters;
      if (!id) {
        return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'Missing required query parameter: id' }) };
      }
      if (!event.body) {
        return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'Request body is empty' }) };
      }
      const { name, stock, price } = JSON.parse(event.body);
      const updateExpression: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: DynamoDB.DocumentClient.ExpressionAttributeValueMap = {};

      if (name) {
        updateExpression.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = encrypt(name);
      }
      if (stock !== undefined) {
        updateExpression.push('#stock = :stock');
        expressionAttributeNames['#stock'] = 'stock';
        expressionAttributeValues[':stock'] = encrypt(String(stock));
      }
      if (price !== undefined) {
        updateExpression.push('#price = :price');
        expressionAttributeNames['#price'] = 'price';
        expressionAttributeValues[':price'] = encrypt(String(price));
      }

      if (updateExpression.length === 0) {
        return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'No fields to update' }) };
      }

      const result = await dynamoDb.update({
        TableName: tableName,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
      }).promise();

      console.log('[INFO] Item updated successfully');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify({ message: 'Item updated successfully', item: decryptItem(result.Attributes) }),
      };
    } catch (error) {
      console.error('[ERROR] Failed to update item:', JSON.stringify(error, null, 2));
      if ((error as any).code === 'ConditionalCheckFailedException') {
        return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'Item not found' }) };
      }
      return { statusCode: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'Failed to update item' }) };
    }
  }

  // DELETE /items?id=1
  if (event.httpMethod === 'DELETE') {
    try {
      const { id } = event.queryStringParameters;
      if (!id) {
        return { statusCode: 400, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'Missing required query parameter: id' }) };
      }

      const result = await dynamoDb.delete({
        TableName: tableName,
        Key: { id: id },
        ReturnValues: 'ALL_OLD',
      }).promise();

      if (!result.Attributes) {
        return { statusCode: 404, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' }, body: JSON.stringify({ error: 'Item not found' }) };
      }

      console.log('[INFO] Item deleted successfully');
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify({
          message: 'Item deleted successfully',
          deletedItem: decryptItem(result.Attributes),
        }),
      };
    } catch (error) {
      console.error('[ERROR] Failed to delete item:', error);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
        body: JSON.stringify({ error: 'Failed to delete item' }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};