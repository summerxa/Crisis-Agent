import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';

export const awsCredentials = fromCognitoIdentityPool({
  identityPoolId: 'us-east-1:e0c49499-880d-43e9-acec-efb31617ae5f',

  clientConfig: {
    region: 'us-east-1',
  },
});
