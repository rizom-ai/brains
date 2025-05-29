import type { MCPWebsiteContext } from '@/contexts';
import type { IBrainProtocol } from '@/protocol/types';
import { CLIInterface } from '@/utils/cliInterface';
import { RendererRegistry } from '@/utils/registry/rendererRegistry';
import { BaseCommandHandler } from '@commands/core/baseCommandHandler';
import type { CommandInfo, CommandResult } from '@commands/core/commandTypes';
// Direct file access replaced with WebsiteContext delegation

/**
 * Command handler for website-related commands
 */
export class WebsiteCommandHandler extends BaseCommandHandler {
  private static instance: WebsiteCommandHandler | null = null;
  private websiteContext: MCPWebsiteContext | null = null;
  private rendererRegistry: RendererRegistry;
  
  /**
   * Helper method to get domain for environment (removed - now handled by WebsiteContext)
   */
  
  /**
   * Get singleton instance of WebsiteCommandHandler
   */
  public static getInstance(brainProtocol: IBrainProtocol, rendererRegistry?: RendererRegistry): WebsiteCommandHandler {
    if (!WebsiteCommandHandler.instance) {
      WebsiteCommandHandler.instance = new WebsiteCommandHandler(
        brainProtocol, 
        rendererRegistry || RendererRegistry.getInstance(),
      );
    }
    return WebsiteCommandHandler.instance;
  }
  
  /**
   * Reset the singleton instance
   */
  public static resetInstance(): void {
    WebsiteCommandHandler.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   */
  public static createFresh(brainProtocol: IBrainProtocol, rendererRegistry?: RendererRegistry): WebsiteCommandHandler {
    return new WebsiteCommandHandler(
      brainProtocol, 
      rendererRegistry || RendererRegistry.getInstance(),
    );
  }
  
  /**
   * Constructor
   */
  constructor(brainProtocol: IBrainProtocol, rendererRegistry: RendererRegistry) {
    super(brainProtocol);
    this.rendererRegistry = rendererRegistry;
    // Initialize the website context from contextManager
    this.websiteContext = brainProtocol.getContextManager().getWebsiteContext();
  }
  
  /**
   * List of commands supported by this handler
   */
  private static readonly SUPPORTED_COMMANDS = [
    'website-config',
    'landing-page',
    'website-build',
    'website-promote',
    'website-status',
    'website-identity',
  ];
  
  // Directory paths now managed by WebsiteContext

  /**
   * Check if this handler can process the given command
   */
  public canHandle(command: string): boolean {
    return WebsiteCommandHandler.SUPPORTED_COMMANDS.includes(command);
  }

  /**
   * Get list of commands supported by this handler
   */
  public getCommands(): CommandInfo[] {
    return [
      {
        command: 'website-config',
        description: 'View or update website configuration',
        usage: 'website-config [key=value ...]',
        examples: ['website-config', 'website-config title="My Website" baseUrl="https://example.com"'],
      },
      {
        command: 'landing-page',
        description: 'Manage landing page content (generate, edit, assess quality, regenerate failed sections, or view)',
        usage: 'landing-page [generate|edit|assess|apply|regenerate-failed|view]',
        examples: ['landing-page generate', 'landing-page edit', 'landing-page assess', 'landing-page apply', 'landing-page regenerate-failed', 'landing-page view'],
      },
      {
        command: 'website-build',
        description: 'Build the website (always to preview environment)',
        usage: 'website-build',
      },
      {
        command: 'website-promote',
        description: 'Promote preview to production',
        usage: 'website-promote',
      },
      {
        command: 'website-status',
        description: 'Check status of website environments',
        usage: 'website-status [preview|live]',
        examples: ['website-status', 'website-status live'],
      },
      {
        command: 'website-identity',
        description: 'Manage website identity information (view, generate, update)',
        usage: 'website-identity [view|generate|update key=value]',
        examples: [
          'website-identity', 
          'website-identity view', 
          'website-identity generate', 
          'website-identity update creativeContent.tagline="New Tagline"',
        ],
      },
    ];
  }
  
  /**
   * Process website commands
   */
  public async execute(command: string, args: string): Promise<CommandResult> {
    try {
      // If we don't have a website context, this is an error
      if (!this.websiteContext) {
        return {
          type: 'error',
          message: 'Website context not available. Try initializing the brain protocol first.',
        };
      }
      
      // Process the command
      switch (command) {
      case 'website-config':
        return this.handleWebsiteConfig(args);
      case 'landing-page':
        return this.handleLandingPage(args);
      case 'website-build':
        return this.handleWebsiteBuild();
      case 'website-promote':
        return this.handleWebsitePromote();
      case 'website-status':
        return this.handleWebsiteStatus(args);
      case 'website-identity':
        return this.handleWebsiteIdentity(args);
      default:
        return {
          type: 'error',
          message: `Unknown website command: ${command}`,
        };
      }
    } catch (error) {
      this.logger.error(`Error processing website command ${command}: ${error}`);
      return {
        type: 'error',
        message: `Failed to process website command: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Website initialization - removed as it's no longer needed 
   * The bot-controlled approach with Caddy doesn't require initialization
   */
  
  /**
   * Handle website configuration command
   */
  private async handleWebsiteConfig(_args: string): Promise<CommandResult> {
    if (!this.websiteContext) {
      return {
        type: 'website-config',
        success: false,
        message: 'Website context not available',
      };
    }
    
    // Initialize the context if it's not ready
    if (!this.websiteContext.isReady()) {
      try {
        await this.websiteContext.initialize();
      } catch (error) {
        this.logger.error('Failed to initialize website context', { error });
        return {
          type: 'website-config',
          success: false,
          message: 'Failed to initialize website context',
        };
      }
    }
    
    try {
      // Display current config - configuration is read-only
      const config = await this.websiteContext.getConfig();
      return {
        type: 'website-config',
        config,
        message: 'Current website configuration',
      };
    } catch (error) {
      this.logger.error(`Error getting website configuration: ${error}`);
      return {
        type: 'error',
        message: `Failed to get configuration: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Handle landing page commands
   */
  private async handleLandingPage(args: string): Promise<CommandResult> {
    if (!this.websiteContext) {
      return {
        type: 'landing-page',
        success: false,
        message: 'Website context not available',
      };
    }
    
    // Initialize the context if it's not ready
    if (!this.websiteContext.isReady()) {
      try {
        await this.websiteContext.initialize();
      } catch (error) {
        this.logger.error('Failed to initialize website context', { error });
        return {
          type: 'landing-page',
          success: false,
          message: 'Failed to initialize website context',
        };
      }
    }
    
    const action = args.trim().toLowerCase();
    
    // Generate landing page
    if (action === 'generate') {
      try {
        // Define steps for the progress tracking
        const steps = [
          'Retrieving website identity',
          'Analyzing site requirements',
          'Generating hero section',
          'Creating problem statement',
          'Developing services content',
          'Building process description',
          'Adding expertise highlights',
          'Creating case studies',
          'Adding pricing information',
          'Building FAQ section',
          'Finalizing content',
        ];
        
        // Get the unified progress tracker through the context manager
        const interfaceType = this.brainProtocol.getInterfaceType();
        
        // Use the injected renderer registry
        // Get the progress tracker from the registry
        const progressTracker = this.rendererRegistry.getProgressTracker(interfaceType);
        
        if (!progressTracker) {
          this.logger.error(`No progress tracker available for interface type: ${interfaceType}`);
          throw new Error(`No progress tracker available for interface type: ${interfaceType}`);
        }
        
        // For Matrix interface, we need the room ID
        let roomId: string | undefined;
        if (interfaceType === 'matrix') {
          const currentRoom = this.brainProtocol.getConversationManager().getCurrentRoom();
          if (!currentRoom) {
            this.logger.error('Room ID not available for progress tracking in Matrix');
            throw new Error('Room ID not available for progress tracking in Matrix');
          }
          roomId = currentRoom;
        }
        
        // Use the unified progress tracking interface
        this.logger.debug(`Using ${interfaceType} progress tracker`);
        
        // Call withProgress with the appropriate parameters
        // For Matrix, we pass the extra roomId parameter
        const result = await progressTracker.withProgress(
          'Generating Landing Page',
          steps,
          async (updateStep: (index: number) => void) => {
            // If the context is not available, handle gracefully
            if (!this.websiteContext) {
              return {
                success: false,
                message: 'Website context not available',
              };
            }
            
            // Pass the progress callback to the website context
            return await this.websiteContext.generateLandingPage({
              onProgress: (_step: string, index: number) => {
                // Use the index provided by the progress callback
                if (index >= 0 && index < steps.length) {
                  updateStep(index);
                }
              },
            });
          },
          roomId, // This parameter is only used by Matrix, and ignored by CLI
        );
        
        if (!result) {
          return {
            type: 'landing-page',
            success: false,
            message: 'Failed to generate landing page',
          };
        }
        
        // Convert website context result to command result format
        return {
          type: 'landing-page',
          success: true,
          message: 'Landing page generated successfully',
          data: result.data,
          action: 'generate',
        };
      } catch (error) {
        // Get CLI interface for error handling
        const cli = CLIInterface.getInstance();
        
        // Make sure we stop the spinner in case of error
        cli.stopSpinner('error', 'Error generating landing page');
        
        this.logger.error(`Error generating landing page: ${error}`);
        return {
          type: 'error',
          message: `Failed to generate landing page: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    } 
    // Edit landing page option removed - not currently supported
    // Assess landing page quality
    else if (action === 'assess' || action === 'qa') {
      try {
        // Get CLI interface for status updates with spinner
        const cli = CLIInterface.getInstance();
        
        // Note: In the future, we could use a progress spinner with steps:
        // const steps = [
        //   'Loading current landing page content',
        //   'Evaluating overall content quality',
        //   ...etc
        // ];
        
        // Start a spinner for quality assessment
        cli.startSpinner('Assessing landing page quality...');
        
        // Run the actual assessment
        const result = await this.websiteContext.assessLandingPage({ 
          useIdentity: true,
          regenerateFailingSections: false, 
        });
        
        // Stop the spinner with appropriate status
        if (result.success) {
          cli.stopSpinner('success', 'Landing page quality assessment completed');
        } else {
          cli.stopSpinner('error', 'Failed to assess landing page quality');
        }
        
        return {
          type: 'landing-page',
          success: result.success,
          message: result.message,
          // Leave data undefined since quality assessment is not LandingPageData type
          data: undefined,
          assessments: result.qualityAssessment?.sections,
          action: 'assess',
        };
      } catch (error) {
        // Get CLI interface for error handling
        const cli = CLIInterface.getInstance();
        
        // Make sure we stop the spinner in case of error
        cli.stopSpinner('error', 'Error assessing landing page quality');
        
        this.logger.error(`Error assessing landing page quality: ${error}`);
        return {
          type: 'error',
          message: `Failed to assess landing page quality: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    // Apply quality assessment recommendations
    else if (action === 'apply-recommendations' || action === 'apply') {
      try {
        // Get CLI interface for status updates with spinner
        const cli = CLIInterface.getInstance();
        
        // Note: In the future, we could use a progress spinner with steps:
        // const steps = [
        //   'Loading current landing page content',
        //   'Performing quality assessment',
        //   ...etc
        // ];
        
        // Start a spinner for applying recommendations
        cli.startSpinner('Applying quality recommendations to landing page...');
        
        // Run the actual operation
        const result = await this.websiteContext.assessLandingPage({ 
          useIdentity: true,
          regenerateFailingSections: true, 
        });
        
        // Stop the spinner with appropriate status
        if (result.success) {
          cli.stopSpinner('success', 'Quality recommendations applied successfully');
        } else {
          cli.stopSpinner('error', 'Failed to apply quality recommendations');
        }
        
        return {
          type: 'landing-page',
          success: result.success,
          message: result.message,
          // Only use regenerationResult data since it's the correct type
          data: result.regenerationResult?.data,
          assessments: result.qualityAssessment?.sections,
          action: 'apply',
        };
      } catch (error) {
        // Get CLI interface for error handling
        const cli = CLIInterface.getInstance();
        
        // Make sure we stop the spinner in case of error
        cli.stopSpinner('error', 'Error applying quality recommendations');
        
        this.logger.error(`Error applying quality recommendations: ${error}`);
        return {
          type: 'error',
          message: `Failed to apply quality recommendations: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    // View landing page content
    else if (action === 'view' || !action) {
      try {
        // Get landing page data directly from the context
        const landingPageData = await this.websiteContext.getLandingPageData();
        
        return {
          type: 'landing-page',
          data: landingPageData || undefined,
        };
      } catch (error) {
        this.logger.error(`Error reading landing page content: ${error}`);
        return {
          type: 'error',
          message: `Failed to read landing page content: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    
    // Regenerate all failed sections
    else if (action === 'regenerate-failed' || action === 'retry-failed') {
      try {
        // Get CLI interface for status updates with spinner
        const cli = CLIInterface.getInstance();
        
        // Start a spinner for regeneration
        cli.startSpinner('Regenerating all failed landing page sections...');
        
        // Run the actual regeneration
        const result = await this.websiteContext.regenerateFailedLandingPageSections();
        
        // Stop the spinner with appropriate status
        if (result.success) {
          // Use a simplified success message since we don't have detailed results
          cli.stopSpinner('success', result.message || 'Successfully regenerated sections');
        } else {
          cli.stopSpinner('error', result.message || 'Failed to regenerate sections');
        }
        
        return {
          type: 'landing-page',
          success: result.success,
          message: result.message,
          data: result.data,
          action: 'regenerate-failed',
        };
      } catch (error) {
        // Get CLI interface for error handling
        const cli = CLIInterface.getInstance();
        
        // Make sure we stop the spinner in case of error
        cli.stopSpinner('error', 'Error regenerating failed sections');
        
        this.logger.error(`Error regenerating failed sections: ${error}`);
        return {
          type: 'error',
          message: `Failed to regenerate failed sections: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    
    return {
      type: 'error',
      message: 'Invalid action. Use "landing-page generate", "landing-page edit", "landing-page assess", "landing-page apply", "landing-page regenerate-failed", or "landing-page view".',
    };
  }
  
  // Preview server methods removed - Caddy is always running in the new approach
  
  /**
   * Handle website build command - always builds to preview environment
   */
  private async handleWebsiteBuild(): Promise<CommandResult> {
    try {
      this.logger.info('Building website to preview environment');
      
      if (!this.websiteContext) {
        return {
          type: 'website-build',
          success: false,
          message: 'Website context not available',
        };
      }
      
      // Provide a clear initial message without the URL
      this.logger.info('Website build starting - check status when complete');
      
      // Delegate to WebsiteContext implementation
      const result = await this.websiteContext.handleWebsiteBuild();
      
      // Return a modified message that encourages checking status
      return {
        type: 'website-build',
        success: result.success,
        message: result.success 
          ? 'Website built successfully. Run "website-status" to view access URL.' 
          : `Failed to build website: ${result.message}`,
        path: result.path,
        // Don't include the URL in the initial response
      };
    } catch (error) {
      this.logger.error(`Error in website build command: ${error}`);
      return {
        type: 'website-build',
        success: false,
        message: `Failed to build website: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Handle website promote command
   * Copies the built files from preview to production
   */
  private async handleWebsitePromote(): Promise<CommandResult> {
    try {
      this.logger.info('Promoting website from preview to production');
      
      if (!this.websiteContext) {
        return {
          type: 'website-promote',
          success: false,
          message: 'Website context not available',
        };
      }
      
      // Delegate to WebsiteContext implementation
      const result = await this.websiteContext.handleWebsitePromote();
      
      return {
        type: 'website-promote',
        success: result.success,
        message: result.message,
        url: result.url,
      };
    } catch (error) {
      this.logger.error(`Error in website promote command: ${error}`);
      return {
        type: 'website-promote',
        success: false,
        message: `Failed to promote to production: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Handle website status command
   * Provides information about build status and accessibility
   */
  private async handleWebsiteStatus(args: string = ''): Promise<CommandResult> {
    try {
      // Parse environment from args - support both "production" and "live" for backward compatibility
      const environment = args.trim().toLowerCase() === 'production' || args.trim().toLowerCase() === 'live' ? 'live' : 'preview';
      this.logger.info(`Checking status of ${environment} environment`);
      
      if (!this.websiteContext) {
        return {
          type: 'website-status',
          success: false,
          message: 'Website context not available',
        };
      }
      
      // Make sure the context is initialized
      if (!this.websiteContext.isReady()) {
        this.logger.info('Initializing website context before checking status');
        await this.websiteContext.initialize();
      }
      
      // Use the correct method name
      const status = await this.websiteContext.getWebsiteStatus(environment);
      
      // Transform to expected format
      return {
        type: 'website-status',
        success: status.status !== 'error',
        message: status.message,
        data: {
          environment: environment,
          buildStatus: status.status,
          fileCount: status.fileCount || 0,
          serverStatus: status.status,
          domain: '',
          accessStatus: status.message,
          url: status.url || '',
        },
      };
    } catch (error) {
      this.logger.error(`Error in website status command: ${error}`);
      return {
        type: 'website-status',
        success: false,
        message: `Failed to check ${args || 'preview'} status: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  
  /**
   * Handle website identity command
   * Manages website branding and identity information
   */
  private async handleWebsiteIdentity(args: string): Promise<CommandResult> {
    if (!this.websiteContext) {
      return {
        type: 'website-identity',
        success: false,
        message: 'Website context not available',
      };
    }

    // Make sure the context is initialized
    if (!this.websiteContext.isReady()) {
      try {
        await this.websiteContext.initialize();
      } catch (error) {
        this.logger.error('Failed to initialize website context', { error });
        return {
          type: 'website-identity',
          success: false,
          message: 'Failed to initialize website context',
        };
      }
    }

    const parts = args.trim().split(/\s+/);
    const action = parts[0]?.toLowerCase() || 'view';

    // View identity information
    if (action === 'view' || action === '') {
      try {
        const identityData = await this.websiteContext.getIdentity();
        
        return {
          type: 'website-identity',
          success: true,
          message: identityData ? 'Retrieved identity data' : 'No identity data found',
          data: identityData || undefined, // Convert null to undefined to satisfy TypeScript
          action: 'view',
        };
      } catch (error) {
        this.logger.error(`Error viewing identity: ${error}`);
        return {
          type: 'error',
          message: `Failed to view identity: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    
    // Generate new identity
    else if (action === 'generate') {
      try {
        // Get CLI interface for status updates with spinner
        const cli = CLIInterface.getInstance();
        
        // Start a spinner to indicate work in progress
        cli.startSpinner('Generating website identity (this may take a minute)...');
        
        // Run the actual generation
        const result = await this.websiteContext.generateIdentity();
        
        // Stop the spinner with appropriate status
        if (result.success) {
          cli.stopSpinner('success', 'Website identity generated successfully');
        } else {
          cli.stopSpinner('error', 'Failed to generate website identity');
        }
        
        return {
          type: 'website-identity',
          success: result.success,
          message: result.message,
          data: result.data || undefined, // Convert null to undefined to satisfy TypeScript
          action: 'generate',
        };
      } catch (error) {
        // Get CLI interface for error handling
        const cli = CLIInterface.getInstance();
        
        // Make sure we stop the spinner in case of error
        cli.stopSpinner('error', 'Error generating identity');
        
        this.logger.error(`Error generating identity: ${error}`);
        return {
          type: 'error',
          message: `Failed to generate identity: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    
    
    // Unknown action
    return {
      type: 'error',
      message: `Unknown action: ${action}. Available actions: view, generate`,
    };
  }
  
// Removed website-deployment-config command as it was redundant with website-config
}