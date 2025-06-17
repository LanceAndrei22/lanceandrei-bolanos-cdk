import { DynamoDB } from 'aws-sdk';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid'; // Import the uuid library

dotenv.config(); // Load environment variables from .env file

const dynamoDb = new DynamoDB.DocumentClient();
const tableName = process.env.DYNAMODB_TABLE!;

exports.handler = async (event: any) => {
  console.log(`[INFO] Received event: ${JSON.stringify(event)}`);

  // POST /items
  if (event.httpMethod === 'POST') {
    try {
      const { name, stock, price } = JSON.parse(event.body);

      if (!name || !stock || !price) {
        console.warn('[WARN] Missing required fields');
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({ error: 'Missing required fields: name, stock, price' }),
        };
      }

      // Generate a unique ID using UUID
      const uniqueId = uuidv4();

      // Create the new item
      const newItem = {
        id: uniqueId, // Use the generated unique ID
        name: name,
        stock: stock,
        price: price,
      };

      await dynamoDb
        .put({
          TableName: tableName,
          Item: newItem,
        })
        .promise();

      console.log('[INFO] Item created successfully');
      return {
        statusCode: 201,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
        body: JSON.stringify({
          message: 'Item created successfully',
          id: newItem.id,
          name: newItem.name,
          stock: newItem.stock,
          price: newItem.price,
        }),
      };
    } catch (error) {
      console.error('[ERROR] Failed to create item:', error);
      return {
        statusCode: 500,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
        body: JSON.stringify({ error: 'Failed to create item' }),
      };
    }
  }

  // GET /items or GET /items?name=apple
  if (event.httpMethod === 'GET') {
    try {
      const { name } = event.queryStringParameters || {};

      let params: DynamoDB.DocumentClient.ScanInput = {
        TableName: tableName,
      };

      if (name) {
        // Filter by name if provided
        params = {
          TableName: tableName,
          FilterExpression: 'contains(#name, :name)',
          ExpressionAttributeNames: {
            '#name': 'name',
          },
          ExpressionAttributeValues: {
            ':name': name,
          },
        };
      }

      const result = await dynamoDb.scan(params).promise();

      console.log('[INFO] Items retrieved successfully');
      return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
        body: JSON.stringify(result.Items),
      };
    } catch (error) {
      console.error('[ERROR] Failed to retrieve items:', error);
      return {
        statusCode: 500,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
        body: JSON.stringify({ error: 'Failed to retrieve items' }),
      };
    }
  }

// PUT /items?id=1
if (event.httpMethod === 'PUT') {
  try {
    const { id } = event.queryStringParameters;
    if (!id) {
      console.warn('[WARN] Missing id in query parameters');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ error: 'Missing required query parameter: id' }),
      };
    }

    if (!event.body) {
      console.warn('[WARN] Request body is empty');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ error: 'Request body is empty' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseError) {
      console.warn('[WARN] Invalid JSON in request body');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    const { name, stock, price } = body;
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: DynamoDB.DocumentClient.ExpressionAttributeValueMap = {};

    if (name) {
      updateExpression.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = name;
    }
    if (stock) {
      updateExpression.push('#stock = :stock');
      expressionAttributeNames['#stock'] = 'stock';
      expressionAttributeValues[':stock'] = stock;
    }
    if (price) {
      updateExpression.push('#price = :price');
      expressionAttributeNames['#price'] = 'price';
      expressionAttributeValues[':price'] = price;
    }

    if (updateExpression.length === 0) {
      console.warn('[WARN] No fields provided for update');
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ error: 'No fields to update' }),
      };
    }

    console.log('[INFO] Updating item with id:', id, 'Fields:', updateExpression);
    const result = await dynamoDb
      .update({
        TableName: tableName,
        Key: { id },
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: 'attribute_exists(id)', // This ensures the item exists
        ReturnValues: 'ALL_NEW',
      })
      .promise();

    console.log('[INFO] Item updated successfully:', result.Attributes);
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({ message: 'Item updated successfully', item: result.Attributes }),
    };
  } catch (error) {
    console.error('[ERROR] Failed to update item:', JSON.stringify(error, null, 2));
    
    // Check if the error is due to condition failure (item not found)
    if ((error as any).code === 'ConditionalCheckFailedException') {
      console.warn('[WARN] Item not found for update');
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({ error: 'Item not found - cannot update non-existent item' }),
      };
    }
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({ error: 'Failed to update item', details: (error as Error).message }),
    };
  }
}


  // DELETE /items?id=1
  if (event.httpMethod === 'DELETE') {
    try {
      const { id } = event.queryStringParameters;

      if (!id) {
        console.warn('[WARN] Missing required query parameter: id');
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({ error: 'Missing required query parameter: id' }),
        };
      }

      // Delete the item
      const result = await dynamoDb
        .delete({
          TableName: tableName,
          Key: { id: id },
          ReturnValues: 'ALL_OLD', // Return the deleted item
        })
        .promise();

      if (!result.Attributes) {
        console.warn('[WARN] Item not found');
        return {
          statusCode: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({ error: 'Item not found' }),
        };
      }

      console.log('[INFO] Item deleted successfully');
      return {
        statusCode: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
        body: JSON.stringify({
          message: 'Item deleted successfully',
          deletedItem: result.Attributes,
        }),
      };
    } catch (error) {
      console.error('[ERROR] Failed to delete item:', error);
      return {
        statusCode: 500,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
        body: JSON.stringify({ error: 'Failed to delete item' }),
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
};