#!/usr/bin/env bun
import * as sdk from 'matrix-js-sdk';

import { getEnv } from '../utils/configUtils';
import logger from '../utils/logger';

async function logoutMatrixClient() {
  // Get values from environment variables
  const baseUrl = getEnv('MATRIX_HOMESERVER_URL', 'https://matrix.org');
  const accessToken = getEnv('MATRIX_ACCESS_TOKEN');
  const userId = getEnv('MATRIX_USER_ID');

  if (!accessToken || !userId) {
    logger.error('Missing required environment variables', { 
      context: 'MatrixLogout',
      missing: !accessToken ? 'MATRIX_ACCESS_TOKEN' : 'MATRIX_USER_ID',
    });
    logger.error('Error: MATRIX_ACCESS_TOKEN and MATRIX_USER_ID environment variables are required', { context: 'MatrixLogout' });
    process.exit(1);
  }

  try {
    logger.info(`Logging out Matrix user: ${userId}`, { context: 'MatrixLogout' });
    logger.info(`From homeserver: ${baseUrl}`, { context: 'MatrixLogout' });

    // Create a client with the access token
    const client = sdk.createClient({
      baseUrl: baseUrl,
      accessToken: accessToken,
      userId: userId,
    });

    // Logout to invalidate the token
    logger.info('Sending logout request...', { context: 'MatrixLogout' });
    await client.logout();

    logger.info('Logout successful!', { context: 'MatrixLogout' });
    logger.info('The access token has been invalidated.', { context: 'MatrixLogout' });
    logger.info('You will need to generate a new token to reconnect.', { context: 'MatrixLogout' });

  } catch (error: unknown) {
    logger.error('Error during logout:', { error, context: 'MatrixLogout' });
  }
}

logoutMatrixClient().catch((error) => {
  logger.error('Unhandled error in Matrix logout:', { error, context: 'MatrixLogout' });
  process.exit(1);
});