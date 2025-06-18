export const handler = async (event: any) => {
  console.log("Authorizer event:", JSON.stringify(event));

  const principalId = 'user'; // Placeholder user identity

  const policyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: 'Allow',
        Resource: event.methodArn, // Applies to the requested endpoint
      },
    ],
  };

  return {
    principalId,
    policyDocument,
    context: {
      user: 'test-user',
    },
  };
};