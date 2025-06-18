import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as lambda from '@aws-cdk/aws-lambda-nodejs';
import * as lambdaRuntime from '@aws-cdk/aws-lambda';
import * as apigateway from '@aws-cdk/aws-apigateway';
import * as cognito from '@aws-cdk/aws-cognito';
import * as dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file
export class LanceandreiBolanosCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const table = new dynamodb.Table(this, 'LanceTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      tableName: process.env.DYNAMODB_TABLE!,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development; use RETAIN for production
    });

    // Lambda Function for CRUD operations
    const lambdaFn = new lambda.NodejsFunction(this, 'LanceMyLambda', {
      entry: 'lambda/handler.ts',
      runtime: lambdaRuntime.Runtime.NODEJS_16_X,
      environment: {
        DYNAMODB_TABLE: table.tableName,
        AES_SECRET_KEY: process.env.AES_SECRET_KEY!, // Pass the secret key to the Lambda environment
      },
    });

    table.grantReadWriteData(lambdaFn);

    const userPool = new cognito.UserPool(this, 'LanceUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
    });
    const userPoolClient = new cognito.UserPoolClient(this, 'LanceUserPoolClient', {
      userPool,
    });

    // API Gateway with CORS
    const api = new apigateway.RestApi(this, 'LanceMyApi', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'LanceCognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // Define the /items resource
    const resource = api.root.addResource('items');

    // Add GET method
    resource.addMethod('GET', new apigateway.LambdaIntegration(lambdaFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add POST method
    resource.addMethod('POST', new apigateway.LambdaIntegration(lambdaFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add PUT method
    resource.addMethod('PUT', new apigateway.LambdaIntegration(lambdaFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Add DELETE method
    resource.addMethod('DELETE', new apigateway.LambdaIntegration(lambdaFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Outputs for testing
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
  }
}