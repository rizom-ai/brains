/**
 * Conversation commands handler
 * Handles conversation-related commands like ask, save-note, and conversation-notes
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import type { MCPNoteContext } from '@/contexts';
import type { ConversationTurn } from '@/protocol/schemas/conversationSchemas';
import type { IBrainProtocol } from '@/protocol/types';
import { ConversationToNoteService } from '@/services/notes/conversationToNoteService';
import { ServiceRegistry } from '@/services/serviceRegistry';

import { BaseCommandHandler } from '../core/baseCommandHandler';
import type { CommandInfo, CommandResult } from '../core/commandTypes';

/**
 * Handler for conversation-related commands
 */
export class ConversationCommandHandler extends BaseCommandHandler {
  /** The singleton instance */
  private static instance: ConversationCommandHandler | null = null;
  
  /** Note context for accessing note-related functionality */
  private noteContext: MCPNoteContext;

  /**
   * Private constructor to enforce the use of getInstance() or createFresh()
   * 
   * @param brainProtocol - The BrainProtocol instance
   */
  constructor(brainProtocol: IBrainProtocol) {
    super(brainProtocol);
    this.noteContext = brainProtocol.getContextManager().getNoteContext();
  }
  
  /**
   * Get the singleton instance of ConversationCommandHandler
   * 
   * @param brainProtocol - The BrainProtocol instance to use (only used when creating a new instance)
   * @returns The shared ConversationCommandHandler instance
   */
  public static getInstance(brainProtocol: IBrainProtocol): ConversationCommandHandler {
    if (!ConversationCommandHandler.instance) {
      ConversationCommandHandler.instance = new ConversationCommandHandler(brainProtocol);
    }
    return ConversationCommandHandler.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ConversationCommandHandler.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param brainProtocol - The BrainProtocol instance to use
   * @returns A new ConversationCommandHandler instance
   */
  public static createFresh(brainProtocol: IBrainProtocol): ConversationCommandHandler {
    return new ConversationCommandHandler(brainProtocol);
  }

  /**
   * Get supported commands
   */
  getCommands(): CommandInfo[] {
    return [
      {
        command: 'ask',
        description: 'Ask a question to your brain',
        usage: 'ask <question>',
        examples: ['ask "What are the principles of ecosystem architecture?"'],
      },
      {
        command: 'save-note',
        description: 'Create a note from recent conversation',
        usage: 'save-note [title]',
        examples: ['save-note', 'save-note "Ecosystem Architecture Discussion"'],
      },
      {
        command: 'conversation-notes',
        description: 'List notes created from conversations',
        usage: 'conversation-notes',
        examples: ['conversation-notes'],
      },
    ];
  }

  /**
   * Check if this handler can process the command
   */
  canHandle(command: string): boolean {
    return ['ask', 'save-note', 'confirm-save-note', 'conversation-notes'].includes(command);
  }

  /**
   * Execute a command
   */
  async execute(command: string, args: string): Promise<CommandResult> {
    switch (command) {
    case 'ask':
      return await this.handleAsk(args);
    case 'save-note':
      return await this.handleSaveNote(args);
    case 'conversation-notes':
      return await this.handleConversationNotes();
    default:
      return this.formatError(`Unknown command: ${command}`);
    }
  }

  /**
   * Handle ask command
   */
  private async handleAsk(question: string): Promise<CommandResult> {
    if (!question) {
      return this.formatError('Please provide a question');
    }

    // Check for API key
    if (!this.requireApiKey()) {
      return this.formatError(this.getApiKeyErrorMessage());
    }

    try {
      const result = await this.brainProtocol.processQuery(question);
      
      // DEBUG: Log the answer to check for HTML content
      this.logger.debug(`[DEBUG ASK] Raw answer from processQuery: ${result.answer.substring(0, 100)}...`);
      if (result.answer.includes('<') && result.answer.includes('>')) {
        this.logger.warn(`[DEBUG ASK] Found HTML tags in answer: ${result.answer.substring(0, 200)}...`);
      }

      return {
        type: 'ask',
        answer: result.answer,
        citations: result.citations,
        relatedNotes: result.relatedNotes,
        externalSources: result.externalSources,
      };
    } catch (error: unknown) {
      return this.formatError(`Error processing question: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle save-note command
   */
  private async handleSaveNote(title?: string): Promise<CommandResult> {
    // Check if conversation memory is initialized
    if (!this.hasActiveConversation()) {
      return this.formatError('No active conversation. Start a conversation first.');
    }

    // Get the current conversation and recent turns
    const conversationId = this.brainProtocol.getConversationManager().getCurrentConversationId();
    if (!conversationId) {
      return this.formatError('No active conversation found.');
    }

    // Get the conversation
    const conversation = await this.brainProtocol.getConversationManager().getConversation(conversationId);
    if (!conversation) {
      return this.formatError('Conversation not found.');
    }

    // Get the conversation context from the conversation manager
    const conversationContext = this.brainProtocol.getConversationManager().getConversationContext();
    
    // Get the tiered history from the context
    const tieredHistory = await conversationContext.getTieredHistory(conversationId);
    
    // Use the active turns from tiered history
    const turns: ConversationTurn[] = tieredHistory.activeTurns;
    this.logger.debug(`Retrieved ${turns.length} turns from conversation`);
    
    // Enhanced debugging for conversation content
    this.logger.debug(`Conversation ID: ${conversationId}`);
    this.logger.debug(`Interface type: ${conversation.interfaceType}`);
    this.logger.debug(`Number of turns: ${turns.length}`);
    
    // Log details about all turns to diagnose issues
    turns.forEach((turn, index) => {
      const isUser = !turn.userId?.startsWith('assistant');
      const role = isUser ? 'User' : 'Assistant';
      
      this.logger.debug(`Turn ${index + 1} (${role}):`);
      if (isUser) {
        this.logger.debug(`  Query: ${turn.query?.substring(0, 50) || '<no query>'}...`);
      } else {
        this.logger.debug(`  Response length: ${turn.response?.length || 0}`);
        
        if (turn.response) {
          // Check for HTML content
          const responsePreview = turn.response.substring(0, 100);
          this.logger.debug(`  Response preview: ${responsePreview}`);
          
          if (responsePreview.includes('<') && responsePreview.includes('>')) {
            this.logger.warn(`  Found potential HTML in response: ${responsePreview}`);
          }
        } else {
          this.logger.warn(`  Empty response in turn ${index + 1}`);
        }
      }
    });
    
    if (turns.length === 0) {
      return this.formatError('Conversation has no turns to save.');
    }

    // Get the ConversationToNoteService
    const conversationToNoteService = this.getConversationToNoteService();

    // In preview mode, just show the content that would be saved
    const preview = await conversationToNoteService.prepareNotePreview(
      conversation,
      turns,
      title,
    );

    // Return preview for confirmation
    return {
      type: 'save-note-preview',
      noteContent: preview.content,
      title: preview.title,
      conversationId,
    };
  }

  /**
   * Handle the second part of save-note after user confirmation
   */
  async confirmSaveNote(conversationId: string, title?: string, userEdits?: string): Promise<CommandResult> {
    // Get the conversation
    const conversation = await this.brainProtocol.getConversationManager().getConversation(conversationId);
    if (!conversation) {
      return this.formatError('Conversation not found.');
    }

    // Get the conversation context from the conversation manager
    const conversationContext = this.brainProtocol.getConversationManager().getConversationContext();
    
    // Get the tiered history from the context
    const tieredHistory = await conversationContext.getTieredHistory(conversationId);
    
    // Use the active turns from tiered history
    const turns: ConversationTurn[] = tieredHistory.activeTurns;
    this.logger.debug(`Retrieved ${turns.length} turns from conversation for confirmation`);
    
    if (turns.length === 0) {
      return this.formatError('Conversation has no turns to save.');
    }

    // Get the ConversationToNoteService
    const conversationToNoteService = this.getConversationToNoteService();

    // Create the note
    const note = await conversationToNoteService.createNoteFromConversation(
      conversation,
      turns,
      title,
      userEdits,
    );

    return {
      type: 'save-note-confirm',
      noteId: note.id,
      title: note.title,
    };
  }

  /**
   * Handle conversation-notes command
   */
  private async handleConversationNotes(): Promise<CommandResult> {
    // Get the ConversationToNoteService
    const conversationToNoteService = this.getConversationToNoteService();

    // Get all notes created from conversations
    const notes = await conversationToNoteService.findConversationNotes(10, 0);

    if (notes.length === 0) {
      return this.formatError('No notes created from conversations found.');
    }

    return {
      type: 'conversation-notes',
      notes,
    };
  }

  /**
   * Get or create the ConversationToNoteService
   */
  private getConversationToNoteService(): ConversationToNoteService {
    const serviceRegistry = ServiceRegistry.getInstance();
    
    if (serviceRegistry.has('conversationToNoteService')) {
      return serviceRegistry.resolve<ConversationToNoteService>('conversationToNoteService');
    } else {
      // Create the service with required dependencies
      const noteRepository = this.noteContext.getNoteRepository();
      const noteEmbeddingService = this.noteContext.getNoteEmbeddingService();
      
      // Get the conversation storage from the conversation context
      const conversationContext = this.brainProtocol.getConversationManager().getConversationContext();
      const conversationStorage = conversationContext.getConversationStorage();
      
      // Create new service with all dependencies
      const conversationToNoteService = new ConversationToNoteService(
        noteRepository,
        noteEmbeddingService,
        conversationStorage,
      );
      
      // Register for future use
      serviceRegistry.register('conversationToNoteService', () => conversationToNoteService);
      return conversationToNoteService;
    }
  }
}