/**
 * Context Integrator
 * 
 * This module integrates all contexts with the messaging system,
 * creating messaging-enabled versions of each context and connecting
 * them together through the mediator.
 */

import type { MCPConversationContext } from '@/contexts/conversations';
import type { MCPExternalSourceContext } from '@/contexts/externalSources';
import type { MCPNoteContext } from '@/contexts/notes';
import { NoteContextMessaging } from '@/contexts/notes/messaging/noteContextMessaging';
import type { MCPProfileContext } from '@/contexts/profiles';
import { ProfileContextMessaging } from '@/contexts/profiles/messaging';
import type { MCPWebsiteContext } from '@/contexts/website';
import { WebsiteContextMessaging } from '@/contexts/website/messaging';
import { Logger } from '@/utils/logger';

import type { ContextMediator } from './contextMediator';

/**
 * Configuration options for ContextIntegrator
 */
export interface ContextIntegratorOptions {
  /** Note context to integrate */
  noteContext: MCPNoteContext;
  /** Profile context to integrate */
  profileContext: MCPProfileContext;
  /** Conversation context to integrate */
  conversationContext: MCPConversationContext;
  /** External source context to integrate */
  externalSourceContext: MCPExternalSourceContext;
  /** Website context to integrate */
  websiteContext: MCPWebsiteContext;
  /** Context mediator for messaging */
  mediator: ContextMediator;
}

/**
 * Messaging-enabled contexts
 */
export interface MessagingContexts {
  /** Messaging-enabled note context */
  note: NoteContextMessaging;
  /** Messaging-enabled profile context */
  profile: ProfileContextMessaging;
  /** Original conversation context */
  conversation: MCPConversationContext;
  /** Original external source context */
  externalSource: MCPExternalSourceContext;
  /** Messaging-enabled website context */
  website: WebsiteContextMessaging;
}

/**
 * Integrates contexts with the messaging system
 */
export class ContextIntegrator {
  private static instance: ContextIntegrator | null = null;
  
  /** Logger instance */
  private logger = Logger.getInstance();
  
  /** Integrated contexts */
  private contexts: MessagingContexts;
  
  /** Context mediator */
  private mediator: ContextMediator;
  
  /**
   * Get the singleton instance of ContextIntegrator
   * 
   * @param options Configuration options
   * @returns The singleton instance
   */
  public static getInstance(options: ContextIntegratorOptions): ContextIntegrator {
    if (!ContextIntegrator.instance) {
      ContextIntegrator.instance = new ContextIntegrator(options);
      
      const logger = Logger.getInstance();
      logger.debug('ContextIntegrator singleton instance created');
    }
    
    return ContextIntegrator.instance;
  }
  
  /**
   * Reset the singleton instance
   * This is primarily used for testing to ensure a clean state between tests
   */
  public static resetInstance(): void {
    ContextIntegrator.instance = null;
    
    const logger = Logger.getInstance();
    logger.debug('ContextIntegrator singleton instance reset');
  }
  
  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new instance
   */
  public static createFresh(options: ContextIntegratorOptions): ContextIntegrator {
    const logger = Logger.getInstance();
    logger.debug('Creating fresh ContextIntegrator instance');
    
    return new ContextIntegrator(options);
  }
  
  /**
   * Private constructor to enforce getInstance() usage
   * 
   * @param options Configuration options
   */
  private constructor(options: ContextIntegratorOptions) {
    // Store the mediator
    this.mediator = options.mediator;
    
    // Create messaging-enabled contexts with MCP contexts
    this.contexts = {
      note: new NoteContextMessaging(options.noteContext, this.mediator),
      profile: new ProfileContextMessaging(options.profileContext, this.mediator),
      conversation: options.conversationContext,
      externalSource: options.externalSourceContext,
      website: new WebsiteContextMessaging(options.websiteContext, this.mediator),
    };
    
    this.logger.debug('ContextIntegrator initialized');
  }
  
  /**
   * Get the integrated contexts
   * @returns Messaging-enabled contexts
   */
  getContexts(): MessagingContexts {
    return this.contexts;
  }
  
  /**
   * Get the messaging-enabled note context
   * @returns Note context with messaging support
   */
  getNoteContext(): NoteContextMessaging {
    return this.contexts.note;
  }
  
  /**
   * Get the messaging-enabled profile context
   * @returns Profile context with messaging support
   */
  getProfileContext(): ProfileContextMessaging {
    return this.contexts.profile;
  }
  
  /**
   * Get the conversation context
   * @returns Conversation context
   */
  getConversationContext(): MCPConversationContext {
    return this.contexts.conversation;
  }
  
  /**
   * Get the external source context
   * @returns External source context
   */
  getExternalSourceContext(): MCPExternalSourceContext {
    return this.contexts.externalSource;
  }
  
  /**
   * Get the messaging-enabled website context
   * @returns Website context with messaging support
   */
  getWebsiteContext(): WebsiteContextMessaging {
    return this.contexts.website;
  }
  
  /**
   * Get the context mediator
   * @returns Context mediator
   */
  getMediator(): ContextMediator {
    return this.mediator;
  }
}