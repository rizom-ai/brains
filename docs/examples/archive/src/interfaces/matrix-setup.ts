#!/usr/bin/env bun
import * as sdk from 'matrix-js-sdk';

import logger from '../utils/logger';

async function setupMatrixClient() {
  // Hard-coded test values - in a real app you would get these interactively
  // but we're skipping that due to readline issues
  const baseUrl = 'https://matrix.rizom.ai';
  logger.info(`Using Matrix server: ${baseUrl}`, { context: 'MatrixSetup' });

  // Get Matrix username and password from command line arguments
  const args = process.argv.slice(2);
  if (args.length < 2) {
    logger.error('Missing required arguments', { context: 'MatrixSetup' });
    logger.error('Usage: bun run matrix:setup <username> <password>', { context: 'MatrixSetup' });
    process.exit(1);
  }

  const username = args[0];
  const password = args[1];

  try {
    logger.info(`Setting up Matrix for user: ${username}`, { context: 'MatrixSetup' });
    logger.info(`Connecting to ${baseUrl}...`, { context: 'MatrixSetup' });

    // Create a temporary client for login
    const client = sdk.createClient({ baseUrl });

    // Login to get an access token
    logger.info('Logging in...', { context: 'MatrixSetup' });
    const loginResponse = await client.login('m.login.password', {
      user: username,
      password: password,
      initial_device_display_name: 'Personal Brain',
    });

    const userId = loginResponse.user_id;
    const accessToken = loginResponse.access_token;

    logger.info(`Login successful for user ${userId}`, { context: 'MatrixSetup' });
    logger.info('Add the following to your .env file:', { context: 'MatrixSetup' });
    // Config values as formatted strings for .env file
    logger.info(`MATRIX_HOMESERVER_URL="${baseUrl}"`, { context: 'MatrixSetup' });
    logger.info(`MATRIX_USER_ID="${userId}"`, { context: 'MatrixSetup' });
    logger.info(`MATRIX_ACCESS_TOKEN="${accessToken}"`, { context: 'MatrixSetup' });
    logger.info('MATRIX_ROOM_IDS=""  # Add room IDs separated by commas', { context: 'MatrixSetup' });
    logger.info('COMMAND_PREFIX="!brain"  # Customize if desired', { context: 'MatrixSetup' });

    // Create .env file template
    logger.info('Creating .env.matrix template file...', { context: 'MatrixSetup' });
    await Bun.write(
      '.env.matrix',
      `MATRIX_HOMESERVER_URL="${baseUrl}"
MATRIX_USER_ID="${userId}"
MATRIX_ACCESS_TOKEN="${accessToken}"
MATRIX_ROOM_IDS=""
COMMAND_PREFIX="!brain"
ANTHROPIC_API_KEY=""
`,
    );

    logger.info('Template saved to .env.matrix', { context: 'MatrixSetup' });
    logger.info('Copy this file to .env and fill in any missing information.', { context: 'MatrixSetup' });

  } catch (error: unknown) {
    logger.error('Error during setup:', { error, context: 'MatrixSetup' });
  }
}

setupMatrixClient().catch((error) => {
  logger.error('Unhandled error in Matrix setup:', { error, context: 'MatrixSetup' });
  process.exit(1);
});
