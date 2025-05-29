#!/usr/bin/env bun
import * as sdk from 'matrix-js-sdk';
import { ClientEvent } from 'matrix-js-sdk';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { MsgType } from 'matrix-js-sdk/lib/@types/event';
import { RoomEvent } from 'matrix-js-sdk/lib/models/room';
import { RoomMemberEvent } from 'matrix-js-sdk/lib/models/room-member';

import { ServerManager } from '@/contexts/website/services/serverManager';
import { BrainProtocol } from '@/protocol/core/brainProtocol';
import type { IBrainProtocol } from '@/protocol/types';

import { createCommandHandler } from '../commands';
import type { CommandHandler } from '../commands';
import { MatrixRenderer } from '../commands/matrix-renderer';
import { getEnv } from '../utils/configUtils';
import { Logger } from '../utils/logger';
import { RendererRegistry } from '../utils/registry/rendererRegistry';

import { MatrixMarkdownFormatter } from './matrix/formatters';


// Configuration constants - load from environment
interface MatrixConfig {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  roomIds: string[];
  commandPrefix: string;
}

export class MatrixBrainInterface {
  // Instance management following Component Interface Standardization pattern
  private static instance: MatrixBrainInterface | null = null;

  // Private fields
  private isReady = false;
  // Matrix is a specific interface type for conversation memory
  private readonly interfaceType = 'matrix';

  // Store pending save note requests by roomId
  private pendingSaveNotes: Map<string, { conversationId: string, title: string }> = new Map();

  /**
   * Get the singleton instance of MatrixBrainInterface
   * 
   * @param serverManager Optional server manager instance
   * @returns The shared MatrixBrainInterface instance
   */
  public static getInstance(serverManager?: ServerManager): MatrixBrainInterface {
    if (!MatrixBrainInterface.instance) {
      const config = MatrixBrainInterface.loadConfigFromEnv();

      // Create Matrix client
      const client = sdk.createClient({
        baseUrl: config.homeserverUrl,
        accessToken: config.accessToken,
        userId: config.userId,
      });

      // Initialize brain protocol
      const brainProtocol = BrainProtocol.getInstance({
        interfaceType: 'matrix',
        roomId: config.roomIds[0],
      });

      // Create command handler
      const commandHandler = createCommandHandler(brainProtocol);

      // Create logger
      const logger = Logger.getInstance();

      // Use provided server manager or get the default one
      const resolvedServerManager = serverManager || ServerManager.getInstance();

      // Create new instance
      MatrixBrainInterface.instance = new MatrixBrainInterface(
        client,
        brainProtocol,
        commandHandler,
        config,
        logger,
        resolvedServerManager,
      );
    }

    return MatrixBrainInterface.instance;
  }

  /**
   * Reset the singleton instance
   * This is primarily used for testing
   */
  public static resetInstance(): void {
    MatrixBrainInterface.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   * Primarily used for testing
   * 
   * @param client Matrix client
   * @param brainProtocol Brain protocol instance
   * @param commandHandler Command handler
   * @param config Matrix configuration
   * @param logger Logger instance
   * @param serverManager Server manager instance
   * @returns A new instance
   */
  public static createFresh(
    client: sdk.MatrixClient,
    brainProtocol: IBrainProtocol,
    commandHandler: CommandHandler,
    config: MatrixConfig,
    logger = Logger.getInstance(),
    serverManager = ServerManager.getInstance(),
  ): MatrixBrainInterface {
    return new MatrixBrainInterface(
      client,
      brainProtocol,
      commandHandler,
      config,
      logger,
      serverManager,
    );
  }

  /**
   * Load config from environment with validation
   */
  private static loadConfigFromEnv(): MatrixConfig {
    const homeserverUrl = getEnv('MATRIX_HOMESERVER_URL', 'https://matrix.org');
    const accessToken = getEnv('MATRIX_ACCESS_TOKEN');
    const userId = getEnv('MATRIX_USER_ID');
    const roomIds = getEnv('MATRIX_ROOM_IDS', '').split(',').filter(Boolean);
    const commandPrefix = getEnv('COMMAND_PREFIX', '!brain');

    Logger.getInstance().debug(`MATRIX_HOMESERVER_URL: ${homeserverUrl}`);
    Logger.getInstance().debug(`MATRIX_USER_ID: ${userId}`);
    Logger.getInstance().debug(`MATRIX_ACCESS_TOKEN: ${accessToken ? 'Set (hidden)' : 'Not set'}`);
    Logger.getInstance().debug(`MATRIX_ROOM_IDS: ${roomIds.join(', ')}`);
    Logger.getInstance().debug(`COMMAND_PREFIX: ${commandPrefix}`);

    // Validate required fields
    if (!accessToken || !userId) {
      Logger.getInstance().error('MATRIX_ACCESS_TOKEN and MATRIX_USER_ID environment variables are required');
      process.exit(1);
    }

    if (roomIds.length === 0) {
      Logger.getInstance().warn('No MATRIX_ROOM_IDS provided, the bot will not automatically join any rooms');
    }

    return {
      homeserverUrl,
      accessToken,
      userId,
      roomIds,
      commandPrefix,
    };
  }

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param client Matrix client
   * @param brainProtocol Brain protocol instance
   * @param commandHandler Command handler
   * @param config Matrix configuration
   * @param logger Logger instance
   * @param serverManager Server manager instance
   */
  private constructor(
    private readonly client: sdk.MatrixClient,
    private readonly brainProtocol: IBrainProtocol,
    private readonly commandHandler: CommandHandler,
    private readonly config: MatrixConfig,
    private readonly logger = Logger.getInstance(),
    private readonly serverManager: ServerManager,
  ) {
    // Initialize renderer with message sending function
    const renderer = new MatrixRenderer(
      this.config.commandPrefix,
      this.sendMessage.bind(this),
    );

    // Connect the command handler to the renderer for interactive commands
    renderer.setCommandHandler(this.commandHandler);

    // Set the renderer
    this.renderer = renderer;
    
    // Register Matrix renderer in the renderer registry
    // This allows other parts of the application to access the Matrix renderer
    RendererRegistry.getInstance().registerRenderer('matrix', renderer);
  }

  // Renderer is initialized in constructor
  private readonly renderer: MatrixRenderer;


  /**
   * Start the Matrix client and register event handlers
   * 
   * @param initializeWebsiteServer Whether to initialize the website server
   * @returns Promise that resolves when the client is ready
   */
  async start(initializeWebsiteServer = true): Promise<void> {
    this.logger.info(`Starting Matrix brain interface as ${this.config.userId}`);

    if (initializeWebsiteServer) {
      // Initialize and start website servers
      this.logger.info('Initializing website servers');
      await this.serverManager.initialize();

      // Explicitly start servers after initialization
      const startResult = await this.serverManager.startServers();
      if (startResult) {
        this.logger.info('Website servers started successfully');
      } else {
        this.logger.warn('Some website servers may not have started properly');
      }
    }

    // Register event handlers
    this.client.on(RoomEvent.Timeline, this.handleRoomMessage.bind(this));
    this.client.on(RoomMemberEvent.Membership, this.handleMembership.bind(this));

    try {
      // Initialize the Brain Protocol to ensure all components are ready
      this.logger.info('Initializing BrainProtocol...');
      await this.brainProtocol.initialize();
      this.logger.info('BrainProtocol initialization complete');

      // Start the client
      await this.client.startClient({ initialSyncLimit: 10 });
      this.logger.info('Matrix client started, waiting for sync');

      // Wait for the client to sync
      return new Promise((resolve, reject) => {
        this.client.once(ClientEvent.Sync, (state: string) => {
          if (state === 'PREPARED') {
            this.logger.info('Client sync complete');
            this.isReady = true;

            // Auto-join configured rooms
            this.joinConfiguredRooms().then(() => {
              resolve();
            }).catch(reject);
          } else {
            const error = new Error(`Sync failed with state: ${state}`);
            this.logger.error(error.message);
            reject(error);
          }
        });
      });
    } catch (error) {
      this.logger.error('Failed to start Matrix client:', error);
      throw error;
    }
  }

  /**
   * Join all configured rooms
   */
  private async joinConfiguredRooms(): Promise<void> {
    if (this.config.roomIds.length === 0) return;

    this.logger.info(`Joining ${this.config.roomIds.length} configured rooms...`);

    // Join each room, collecting errors but not failing if some rooms can't be joined
    const errors: Error[] = [];

    for (const roomId of this.config.roomIds) {
      try {
        await this.client.joinRoom(roomId);
        this.logger.info(`Joined room ${roomId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to join room ${roomId}: ${errorMessage}`);
        errors.push(new Error(`Failed to join room ${roomId}: ${errorMessage}`));
      }
    }

    // If we couldn't join any rooms, that's potentially a problem
    if (errors.length === this.config.roomIds.length && this.config.roomIds.length > 0) {
      this.logger.error('Failed to join any of the configured rooms');
    }
  }

  /**
   * Handle membership changes in rooms
   */
  private async handleMembership(_event: MatrixEvent, member: RoomMember): Promise<void> {
    // Auto-accept invites for the bot
    if (member.userId === this.config.userId && member.membership === 'invite') {
      this.logger.info(`Received invite to room ${member.roomId}, auto-joining`);

      try {
        // Join the room
        await this.client.joinRoom(member.roomId);
        this.logger.info(`Successfully joined room ${member.roomId}`);

        // Send welcome message
        await this.sendMessage(
          member.roomId,
          `Hello! I'm your personal brain assistant. Type \`${this.config.commandPrefix} help\` to see available commands.`,
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to join room ${member.roomId}: ${errorMessage}`);
      }
    }
  }

  /**
   * Handle incoming room messages
   */
  private async handleRoomMessage(event: MatrixEvent, room: Room | undefined): Promise<void> {
    // Only process messages if the client is ready
    if (!this.isReady) {
      return;
    }

    // Ignore non-text messages 
    if (event.getType() !== 'm.room.message') {
      return;
    }

    if (!room) {
      this.logger.error('Room undefined for message event');
      return;
    }

    const content = event.getContent();

    // Only process text messages
    if (content.msgtype !== MsgType.Text) {
      return;
    }

    const text = content['body'].trim();

    // Check if the text starts with the command prefix
    if (text.startsWith(this.config.commandPrefix)) {
      // Extract command text after the prefix
      const commandText = text.substring(this.config.commandPrefix.length).trim();

      try {
        // Make sure we're using the correct room ID for this message
        // This is crucial for conversation memory to work properly
        if (this.interfaceType === 'matrix') {
          await this.brainProtocol.getConversationManager().setCurrentRoom(room.roomId);
        }

        await this.processCommand(commandText, room.roomId, event);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error processing command: ${errorMessage}`);

        // Format error message with simple HTML that Element can render well
        const formattedErrorMessage = [
          '<h4>❌ Error Processing Command</h4>',
          `<p><strong>${errorMessage}</strong></p>`,
        ].join('\n');

        await this.sendMessage(room.roomId, formattedErrorMessage);
      }
    }
  }

  /**
   * Process a command and generate a response
   */
  private async processCommand(commandText: string, roomId: string, _event: unknown): Promise<void> {
    // Handle empty command (just the prefix) as help
    if (!commandText) {
      await this.renderer.renderHelp(roomId, this.commandHandler.getCommands());
      return;
    }

    // Parse command and arguments
    const { command, args } = this.parseCommand(commandText);

    // Handle help command specially
    if (command === 'help') {
      await this.renderer.renderHelp(roomId, this.commandHandler.getCommands());
      return;
    }

    // Handle confirm command for save-note
    if (command === 'confirm') {
      await this.handleConfirmSaveNote(roomId, args);
      return;
    }

    // Handle cancel command for save-note
    if (command === 'cancel') {
      this.pendingSaveNotes.delete(roomId);
      await this.sendMessage(roomId, '❌ Note creation cancelled.');
      return;
    }

    // Process the command through our shared command handler
    try {
      // Special case for "ask" command to show "thinking" message
      if (command === 'ask' && args) {
        await this.sendMessage(roomId, `🤔 Thinking about: "${args}"...`);
      }

      // Add debugging to make sure we have a proper userId before processing the command
      // This ensures that assistant responses will be properly identified
      const userId = this.config.userId || 'matrix-user';
      this.logger.debug(`Processing command with userId: ${userId} (should not start with 'assistant')`);

      const result = await this.commandHandler.processCommand(command, args);

      // Special handling for save-note preview - store conversation ID for later confirmation
      if (result.type === 'save-note-preview') {
        // Store the conversation ID and title for later retrieval
        this.pendingSaveNotes.set(roomId, {
          conversationId: result.conversationId,
          title: result.title,
        });
        this.logger.debug(`Stored pending note for room ${roomId} with conversation ID ${result.conversationId}`);
      }

      // Render the result using our Matrix renderer
      await this.renderer.render(roomId, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error executing command ${command}: ${errorMessage}`);
      await this.sendMessage(roomId, `❌ Error executing command: ${errorMessage}`);
    }
  }

  /**
   * Parse a command into command name and arguments
   */
  private parseCommand(commandText: string): { command: string, args: string } {
    const parts = commandText.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    return { command, args };
  }

  /**
   * Handle confirmation of save-note command
   */
  private async handleConfirmSaveNote(roomId: string, newTitle?: string): Promise<void> {
    try {
      // Make sure we're using the correct room ID for this confirmation
      // This is crucial for conversation memory to work properly
      if (this.interfaceType === 'matrix') {
        await this.brainProtocol.getConversationManager().setCurrentRoom(roomId);
      }

      // Get the pending save note from our map (stored during save-note command)
      const pendingSaveNote = this.pendingSaveNotes.get(roomId);

      if (!pendingSaveNote) {
        this.logger.debug(`No pending note found for room ${roomId}`);
        await this.sendMessage(roomId, '❌ Error: No pending note to save. Please create a note first using the save-note command.');
        return;
      }

      // Extract conversation ID and title from the stored data
      const conversationId = pendingSaveNote.conversationId;
      let title = pendingSaveNote.title;

      this.logger.debug(`Found pending note with conversation ID: ${conversationId} and title: ${title}`);

      // Use the new title if provided
      if (newTitle && newTitle.trim()) {
        // Remove quotation marks if present
        title = newTitle.trim().replace(/^"(.*)"$/, '$1');
      }

      // Log the conversation ID and title for debugging
      this.logger.debug(`Confirming save note with conversation ID: ${conversationId} and title: ${title || 'default title'}`);

      // Confirm the save note using the command handler
      const result = await this.commandHandler.confirmSaveNote(conversationId, title || undefined);

      // Render the result
      await this.renderer.render(roomId, result);

      // Clear the pending note after successful save
      this.pendingSaveNotes.delete(roomId);

      this.logger.debug('Save note confirmation successful');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error confirming save note: ${errorMessage}`);

      // Format error message with simple HTML that Element can render well
      const formattedErrorMessage = [
        '<h4>❌ Error Saving Note</h4>',
        `<p><strong>${errorMessage}</strong></p>`,
      ].join('\n');

      await this.sendMessage(roomId, formattedErrorMessage);
    }
  }

  /**
   * Send a message to a Matrix room with error handling
   */
  private async sendMessage(roomId: string, message: string): Promise<void> {
    try {
      // Convert markdown to HTML for better rendering
      const htmlContent = this.markdownToHtml(message);

      // IMPORTANT: We store the original markdown in the message body
      // This ensures the conversation memory has clean text, but the display is rich HTML
      this.logger.debug(`Sending HTML-formatted message to ${roomId}`);

      // Send both plain markdown and HTML versions
      await this.client.sendHtmlMessage(roomId, message, htmlContent);

      this.logger.debug(`Sent HTML-formatted message to ${roomId}`);
    } catch (error) {
      this.logger.error(`Failed to send HTML message to ${roomId}:`, error);

      // Fallback to plain text if HTML sending fails
      try {
        await this.client.sendMessage(roomId, {
          msgtype: MsgType.Text,
          body: message,
        });
        this.logger.debug(`Sent plain text fallback message to ${roomId}`);
      } catch (fallbackError) {
        this.logger.error(`Complete failure sending message to ${roomId}:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Convert markdown to HTML for better rendering in Matrix clients
   * This is specifically for message rendering and won't affect conversation storage
   * @param markdown Markdown text to convert
   * @returns HTML representation of the markdown
   */
  private markdownToHtml(markdown: string): string {
    // Use the MarkdownFormatter from our formatters

    // Use our enhanced formatter but without bot styling
    // Matrix will handle this itself
    const formatter = MatrixMarkdownFormatter.getInstance();

    // Format the markdown to HTML with all enhancements
    return formatter.format(markdown);
  }
}

async function main() {
  const logger = Logger.getInstance();

  try {
    // Get the server manager
    const serverManager = ServerManager.getInstance();

    // Get the singleton instance of MatrixBrainInterface with the server manager
    const matrixInterface = MatrixBrainInterface.getInstance(serverManager);

    // Start the matrix interface - this will also initialize the website servers
    await matrixInterface.start(true);

    logger.info('Matrix brain interface is running');

    // Track if we're in the process of exiting
    let isExiting = false;

    // Handle cleanup for graceful shutdown
    const performCleanup = async () => {
      if (isExiting) return;
      isExiting = true;

      logger.info('Shutting down Matrix interface, cleaning up resources...');

      try {
        // Clean up server resources
        logger.info('Stopping website servers...');
        await serverManager.cleanup();
        logger.info('Website servers stopped successfully.');
      } catch {
        // Cleanup errors are logged but don't prevent exit
      }
    };

    // Keep the process alive but handle cleanup on exit signals
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT signal');
      await performCleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM signal');
      await performCleanup();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Fatal error starting Matrix interface:', error);
    process.exit(1);
  }
}

// Only run the main function if this is the main module
if (require.main === module) {
  main().catch(error => {
    Logger.getInstance().error('Fatal error:', error);
    process.exit(1);
  });
}

