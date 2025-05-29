/**
 * CLI Application for Personal Brain
 * 
 * This class handles the CLI lifecycle and input processing,
 * separating the concerns of:
 * - Command line argument parsing
 * - Command execution
 * - Input/output handling
 * - Error handling
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

import chalk from 'chalk';
import inquirer from 'inquirer';

import type { CommandHandler } from '../commands';
import type { CLIRenderer } from '../commands/cli-renderer';
import { CLIInterface } from '../utils/cliInterface';
import logger from '../utils/logger';
import { RendererRegistry } from '../utils/registry/rendererRegistry';

// Command parsing types
interface ParsedCommand {
  command: string;
  args: string;
}

export interface CLIAppOptions {
  /** Command handler for processing user input */
  commandHandler: CommandHandler;
  /** CLI renderer for displaying command results */
  renderer: CLIRenderer;
  /** Optional custom CLIInterface to use */
  cliInterface?: CLIInterface;
  /** Optional custom logger to use */
  logger?: typeof logger;
}

/**
 * CLIApp provides the main command-line application for the Personal Brain.
 * 
 * This class follows the Component Interface Standardization pattern with singleton
 * management via getInstance(), resetInstance(), and createFresh().
 */
export class CLIApp {
  /** The singleton instance */
  private static instance: CLIApp | null = null;
  
  /** Command handler for processing user commands */
  private readonly commandHandler: CommandHandler;
  
  /** CLI renderer for displaying results */
  private readonly renderer: CLIRenderer;
  
  /** CLIInterface for user interaction */
  private readonly cli: CLIInterface;
  
  /** Logger for application logging */
  private readonly logger: typeof logger;
  
  /** Whether the application is currently running */
  private running = false;

  /**
   * Get the singleton instance of CLIApp
   * 
   * @param options Options for configuring the application
   * @returns The shared CLIApp instance
   */
  public static getInstance(options: CLIAppOptions): CLIApp {
    if (!CLIApp.instance) {
      CLIApp.instance = new CLIApp(options);
    }
    return CLIApp.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance to ensure test isolation
   */
  public static resetInstance(): void {
    CLIApp.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param options Options for configuring the application
   * @returns A new CLIApp instance
   */
  public static createFresh(options: CLIAppOptions): CLIApp {
    return new CLIApp(options);
  }

  /**
   * Private constructor to enforce the use of getInstance()
   * 
   * @param options Configuration options
   */
  private constructor(options: CLIAppOptions) {
    this.commandHandler = options.commandHandler;
    this.renderer = options.renderer;
    this.cli = options.cliInterface || CLIInterface.getInstance();
    this.logger = options.logger || logger;
    
    // Connect the command handler to the renderer for interactive commands
    this.renderer.setCommandHandler(this.commandHandler);
    
    // Register CLI interface in the renderer registry
    // This allows other parts of the application to access the CLI interface
    RendererRegistry.getInstance().registerRenderer('cli', this.cli);
    this.logger.debug('Registered CLI interface in renderer registry');
  }

  /**
   * Start the CLI application
   * First checks for command line arguments, 
   * otherwise starts interactive mode
   */
  async start(): Promise<void> {
    // Check if we're running in command line mode
    if (process.argv.length > 2) {
      await this.runCommandLineMode();
    } else {
      await this.runInteractiveMode();
    }
  }

  /**
   * Run a single command from command line arguments
   */
  private async runCommandLineMode(): Promise<void> {
    const command = process.argv[2].toLowerCase();
    const args = process.argv.slice(3).join(' ');

    this.logger.info(`Running command: ${command} ${args}`);

    if (command === 'help') {
      this.renderer.renderHelp(this.commandHandler.getCommands());
      return;
    }

    try {
      const result = await this.commandHandler.processCommand(command, args);
      this.renderer.render(result);
    } catch (error) {
      this.cli.error(`Error executing command: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`Command error: ${error instanceof Error ? error.stack : String(error)}`);
    } finally {
      // Always stop the CLI application when done with the command
      // Note: Actual cleanup is handled by the CLI main function
      this.running = false;
    }
  }

  /**
   * Run interactive mode with command prompt
   */
  private async runInteractiveMode(): Promise<void> {
    this.cli.displayTitle('Personal Brain CLI');
    this.cli.info('Type "help" to see available commands, or "exit" to quit');

    this.running = true;
    while (this.running) {
      try {
        const input = await this.promptForCommand();
        if (!input) continue;

        // Handle special commands
        if (this.handleSpecialCommands(input)) continue;

        // Parse and execute regular commands
        const { command, args } = this.parseCommand(input);
        await this.executeCommand(command, args);
      } catch (error) {
        this.cli.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        this.logger.error(`Interactive mode error: ${error instanceof Error ? error.stack : String(error)}`);
      }
    }

    this.cli.success('Goodbye!');
  }

  /**
   * Prompt the user for a command
   */
  private async promptForCommand(): Promise<string> {
    const { action } = await inquirer.prompt({
      type: 'input',
      name: 'action',
      message: chalk.cyan('brain>'),
    });

    const input = action.trim();
    this.logger.info(`User entered: ${input}`);
    return input;
  }

  /**
   * Handle special commands like exit and help
   * @returns true if handled as special command
   */
  private handleSpecialCommands(input: string): boolean {
    const normalizedInput = input.toLowerCase();

    // Exit command
    if (normalizedInput === 'exit' || normalizedInput === 'quit') {
      this.running = false;
      return true;
    }

    // Help command
    if (normalizedInput === 'help') {
      this.renderer.renderHelp(this.commandHandler.getCommands());
      return true;
    }

    return false;
  }

  /**
   * Parse a command string into command and arguments
   */
  private parseCommand(input: string): ParsedCommand {
    if (input.includes(' ')) {
      const spaceIndex = input.indexOf(' ');
      const command = input.substring(0, spaceIndex).toLowerCase();
      const args = input.substring(spaceIndex + 1).trim();
      return { command, args };
    } else {
      return { command: input.toLowerCase(), args: '' };
    }
  }

  /**
   * Execute a parsed command
   */
  private async executeCommand(command: string, args: string): Promise<void> {
    try {
      // Show a spinner for commands that might take time
      if (['search', 'ask', 'profile'].includes(command) && args) {
        await this.cli.withSpinner(`Processing ${command} command...`, async () => {
          const result = await this.commandHandler.processCommand(command, args);
          this.renderer.render(result);
          return null;
        });
      } else {
        const result = await this.commandHandler.processCommand(command, args);
        this.renderer.render(result);
      }
    } catch (error) {
      this.cli.error(`Error executing command: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`Command error: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }

  /**
   * Stop the CLI application
   * Note: This method only sets the running flag to false,
   * actual cleanup is handled by the CLI main function
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping CLI application...');
    this.running = false;
    
    // Do not perform any cleanup here, as it's handled by the main CLI function
    // This prevents duplicate cleanup attempts which can cause issues
  }
}
