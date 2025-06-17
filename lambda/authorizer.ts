exports.handler = async (event: any) => {
  console.log(`[INFO] Authorizer invoked with event: ${JSON.stringify(event)}`);

  try {
    const token = event.authorizationToken;

    if (!token) {
      console.warn('[WARN] Missing authorization token');
      throw new Error('Unauthorized');
    }

    // Extract the token value by removing the 'Bearer ' prefix
    const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;

    console.log(`[INFO] Validating token: ${tokenValue}`);

    if (tokenValue === 'correct-token') {
      console.log('[INFO] Token validated successfully');

      // Generate the policy document
      const policyDocument = {
        Version: '2012-10-17',
        Statement: [
          {
            Action: 'execute-api:Invoke',
            Effect: 'Allow',
            Resource: event.methodArn, // Allow access to the requested resource
          },
        ],
      };

      // Log the generated policy
      console.log('[DEBUG] Generated policy:', JSON.stringify(policyDocument));

      return {
        principalId: 'user', // The user ID or principal
        policyDocument,
        context: {
          user: 'user', // Additional context (optional)
        },
      };
    }

    console.warn('[WARN] Invalid token');
    throw new Error('Unauthorized');
  } catch (error) {
    console.error('[ERROR] Authorization failed:', error);
    throw new Error('Unauthorized');
  }
};