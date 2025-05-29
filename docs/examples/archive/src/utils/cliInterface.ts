/**
 * CLI Interface utility using Inquirer for prompts and Chalk for styling
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */
// No timers import needed

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import type { Ora } from 'ora';

import logger from './logger';
import type { IProgressTracker } from './registry/rendererRegistry';

/**
 * Configuration options for CLIInterface
 */
export interface CLIInterfaceOptions {
  /** Whether to disable console output (useful for testing) */
  silent?: boolean;
  /** Custom logger instance to use */
  customLogger?: typeof logger;
}

/**
 * CLI Styles interface to help with type checking
 */
export interface CLIStyles {
  // Basic styles
  title: typeof chalk.cyan.bold;
  subtitle: typeof chalk.magenta.bold;
  separator: typeof chalk.cyan;
  label: typeof chalk.dim;
  value: typeof chalk.white;
  highlight: typeof chalk.cyan;
  success: typeof chalk.green;
  error: typeof chalk.red;
  warning: typeof chalk.yellow;
  info: typeof chalk.blue;
  dim: typeof chalk.dim;

  // Specialized styles
  id: typeof chalk.gray;
  tag: typeof chalk.cyan;
  date: typeof chalk.white;
  number: typeof chalk.cyan;
  command: typeof chalk.cyan;
  example: typeof chalk.italic;
  url: typeof chalk.blue.underline;
  warn: typeof chalk.yellow;

  // Icon styles
  successIcon: string;
  errorIcon: string;
  warningIcon: string;
  infoIcon: string;
}

/**
 * CLIInterface provides standardized CLI output and user interaction methods.
 * 
 * This class follows the Component Interface Standardization pattern with singleton
 * management via getInstance(), resetInstance(), and createFresh().
 */
export class CLIInterface implements IProgressTracker {
  /** The singleton instance */
  private static instance: CLIInterface | null = null;

  /** Whether console output is disabled */
  public readonly silent: boolean;

  /** Logger instance to use */
  public readonly logger: typeof logger;
  
  /** Active spinner instance */
  private spinner: Ora | null = null;

  /** Common style configuration */
  private static readonly styleConfig: CLIStyles = {
    // Basic styles
    title: chalk.cyan.bold,              // Cyan bold for main titles
    subtitle: chalk.magenta.bold,        // Magenta bold for subtitles
    separator: chalk.cyan,               // Cyan for separators
    label: chalk.dim,                    // Dim for labels
    value: chalk.white,                  // White for values
    highlight: chalk.cyan,               // Cyan for highlighted text
    success: chalk.green,                // Green for success messages
    error: chalk.red,                    // Red for error messages
    warning: chalk.yellow,               // Yellow for warnings
    info: chalk.blue,                    // Blue for info messages
    dim: chalk.dim,                      // Dim for less important text

    // Specialized styles
    id: chalk.gray,                      // Gray for IDs
    tag: chalk.cyan,                     // Cyan for tags
    date: chalk.white,                   // White for dates
    number: chalk.cyan,                  // Cyan for numbers
    command: chalk.cyan,                 // Cyan for commands
    example: chalk.italic,               // Italic for examples
    url: chalk.blue.underline,           // Blue underlined for URLs
    warn: chalk.yellow,                  // Yellow for warnings

    // Icon styles
    successIcon: chalk.green('✓'),       // Green checkmark for success
    errorIcon: chalk.red('✖'),           // Red X for errors
    warningIcon: chalk.yellow('⚠'),      // Yellow warning symbol
    infoIcon: chalk.blue('ℹ'),           // Blue info symbol
  };

  /**
   * Get the singleton instance of CLIInterface
   * 
   * @param options Options for configuring the interface
   * @returns The shared CLIInterface instance
   */
  public static getInstance(options?: CLIInterfaceOptions): CLIInterface {
    if (!CLIInterface.instance) {
      CLIInterface.instance = new CLIInterface(options);
    }
    return CLIInterface.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance to ensure test isolation
   */
  public static resetInstance(): void {
    CLIInterface.instance = null;
  }

  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param options Options for configuring the interface
   * @returns A new CLIInterface instance
   */
  public static createFresh(options?: CLIInterfaceOptions): CLIInterface {
    return new CLIInterface(options);
  }

  /**
   * Get the style configuration for CLI output
   */
  public get styles(): CLIStyles {
    return CLIInterface.styleConfig;
  }

  /**
   * Static method to display an error message
   * @param message The error message to display
   */
  public static error(message: string): void {
    const instance = CLIInterface.getInstance();
    instance.error(message);
  }

  /**
   * Private constructor to enforce the use of getInstance()
   * 
   * @param options Configuration options
   */
  private constructor(options?: CLIInterfaceOptions) {
    this.silent = options?.silent ?? false;
    this.logger = options?.customLogger ?? logger;
  }

  /**
   * Display a styled title
   * @param title The title to display
   */
  public displayTitle(title: string): void {
    if (this.silent) return;

    const separator = '='.repeat(title.length + 4);
    const formattedTitle = `\n${this.styles.separator(separator)}\n${this.styles.title(`  ${title}  `)}\n${this.styles.separator(separator)}\n`;

    // Output to console
    process.stdout.write(formattedTitle);

    // Log to file only, not to console
    this.logger.debug(`Displayed title: ${title}`);
  }

  /**
   * Display a styled subtitle
   * @param subtitle The subtitle to display
   */
  public displaySubtitle(subtitle: string): void {
    if (this.silent) return;

    // Add a separator line before subtitle
    const line = '─'.repeat(subtitle.length + 4);

    // Format with separator line for clearer hierarchy
    const formattedSubtitle = `\n${this.styles.dim(line)}\n${this.styles.subtitle(subtitle)}\n`;

    // Output to console
    process.stdout.write(formattedSubtitle);

    // Log to file only, not to console
    this.logger.debug(`Displayed subtitle: ${subtitle}`);
  }

  /**
   * Display a success message
   * @param message The success message to display
   */
  public success(message: string): void {
    if (this.silent) return;

    const formatted = `${this.styles.successIcon} ${message}`;
    process.stdout.write(formatted + '\n');
    this.logger.info(`[SUCCESS] ${message}`);
  }

  /**
   * Display an error message
   * @param message The error message to display
   */
  public error(message: string): void {
    if (this.silent) return;

    const formatted = `${this.styles.errorIcon} ${message}`;
    process.stdout.write(formatted + '\n');
    this.logger.error(message);
  }

  /**
   * Display a warning message
   * @param message The warning message to display
   */
  public warn(message: string): void {
    if (this.silent) return;

    const formatted = `${this.styles.warningIcon} ${message}`;
    process.stdout.write(formatted + '\n');
    this.logger.warn(message);
  }

  /**
   * Display an info message
   * @param message The info message to display
   */
  public info(message: string): void {
    if (this.silent) return;

    const formatted = `${this.styles.infoIcon} ${message}`;
    process.stdout.write(formatted + '\n');
    this.logger.info(message);
  }

  /**
   * Print text to console without logging
   * @param message The message to print
   * @param options Optional formatting options
   */
  public print(
    message: string, 
    options?: { 
      renderMarkdown?: boolean
    },
  ): void {
    if (this.silent) return;

    if (options?.renderMarkdown) {
      process.stdout.write(this.renderMarkdown(message) + '\n');
    } else {
      process.stdout.write(message + '\n');
    }
  }
  
  /**
   * Render markdown text with terminal formatting
   * @param markdown The markdown text to render
   * @returns Formatted text for terminal display
   */
  public renderMarkdown(markdown: string): string {
    const lines = markdown.split('\n');
    const processedLines: string[] = [];
    
    // Process each line individually for better control
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      
      // Handle headers
      if (line.match(/^### /)) {
        processedLines.push(''); // Add extra line before header
        processedLines.push(this.styles.subtitle(line.substring(4)));
        // If next line doesn't have its own spacing, add a blank line
        if (nextLine && nextLine.trim() !== '') {
          processedLines.push('');
        }
      } 
      else if (line.match(/^## /)) {
        processedLines.push(''); // Add extra line before header
        processedLines.push(this.styles.title(line.substring(3)));
        // If next line doesn't have its own spacing, add a blank line
        if (nextLine && nextLine.trim() !== '') {
          processedLines.push('');
        }
      }
      else if (line.match(/^# /)) {
        processedLines.push(''); // Add extra line before header
        processedLines.push(this.styles.title(line.substring(2)));
        // If next line doesn't have its own spacing, add a blank line
        if (nextLine && nextLine.trim() !== '') {
          processedLines.push('');
        }
      }
      // Handle bold and italic (process within the line)
      else {
        // Bold and italic
        line = line.replace(/\*\*\*(.*?)\*\*\*/g, (_, text) => chalk.bold.italic(text));
        line = line.replace(/\*\*(.*?)\*\*/g, (_, text) => chalk.bold(text));
        line = line.replace(/\*(.*?)\*/g, (_, text) => chalk.italic(text));
        line = line.replace(/_(.*?)_/g, (_, text) => chalk.italic(text));
        
        // Inline code
        line = line.replace(/`(.*?)`/g, (_, code) => chalk.gray.bgBlackBright(` ${code} `));
        
        // Lists
        if (line.match(/^- /)) {
          line = `${this.styles.info('•')} ${line.substring(2)}`;
        } else if (line.match(/^ {2}- /)) {
          line = `  ${this.styles.info('◦')} ${line.substring(4)}`;
        } else if (line.match(/^ {4}- /)) {
          line = `    ${this.styles.info('▪')} ${line.substring(6)}`;
        }
        
        // Numbered lists
        const numberedListMatch = line.match(/^(\d+)\. (.*$)/);
        if (numberedListMatch) {
          const [, num, text] = numberedListMatch;
          line = `${this.styles.number(num + '.')} ${text}`;
        }
        
        // Blockquotes
        if (line.match(/^> /)) {
          line = this.styles.dim(`│ ${line.substring(2)}`);
        }
        
        // Links
        line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => 
          `${text} (${this.styles.url(url)})`);
        
        // Horizontal rules
        if (line === '---') {
          line = this.styles.separator('─'.repeat(80));
        }
        
        // Tables (simple)
        const tableMatch = line.match(/\| (.*) \|/);
        if (tableMatch) {
          const [, content] = tableMatch;
          const cells = content.split(' | ');
          line = '| ' + cells.map((cell: string) => this.styles.value(cell.trim())).join(' | ') + ' |';
        }
        
        processedLines.push(line);
      }
    }
    
    // Process code blocks which can span multiple lines
    let result = processedLines.join('\n');
    result = result.replace(/```(?:.*?)\n([\s\S]*?)```/g, (_, code) => {
      const lines = code.split('\n');
      return '\n' + lines.map((line: string) => this.styles.dim('  ' + line)).join('\n') + '\n';
    });
    
    return result;
  }

  /**
   * Format and print a label-value pair
   * @param label The label to print
   * @param value The value to print
   * @param options Optional formatting options
   */
  public printLabelValue(
    label: string,
    value: string | number | string[] | null,
    options?: {
      emptyText?: string,
      formatter?: (val: string) => string
    },
  ): void {
    if (this.silent) return;

    const emptyText = options?.emptyText || 'None';

    // Format the label
    const formattedLabel = `${this.styles.label(label + ':')}`;

    // Handle array values
    if (Array.isArray(value)) {
      if (value.length === 0) {
        process.stdout.write(`${formattedLabel} ${this.styles.dim(emptyText)}\n`);
      } else {
        const formatter = options?.formatter || (val => this.styles.tag(val));
        process.stdout.write(`${formattedLabel} ${value.map(formatter).join(' ')}\n`);
      }
    } else {
      // Handle empty values
      if (value === undefined || value === null || value === '') {
        process.stdout.write(`${formattedLabel} ${this.styles.dim(emptyText)}\n`);
      } else {
        const displayValue = options?.formatter
          ? options.formatter(value.toString())
          : value.toString();
        process.stdout.write(`${formattedLabel} ${displayValue}\n`);
      }
    }
  }

  /**
   * Display a formatted list of items
   * @param items The items to display
   * @param formatter Optional formatter for the items
   */
  public displayList<T>(items: T[], formatter?: (item: T, index: number) => string): void {
    if (this.silent) return;

    // Log the list operation
    this.logger.info(`Displaying list of ${items.length} items`);

    items.forEach((item, index) => {
      const display = formatter ? formatter(item, index) : String(item);
      process.stdout.write(`${this.styles.number(index + 1)}. ${display}\n`);
    });

    // Add a blank line after the list
    process.stdout.write('\n');
  }

  /**
   * Format a command for display
   * @param command The command to format
   * @param description The command description
   * @param examples Optional usage examples
   * @returns The formatted command string
   */
  public formatCommand(command: string, description: string, examples?: string[]): string {
    const cmdText = `  ${this.styles.command(command.padEnd(20))} - ${description}`;

    if (!examples || examples.length === 0) {
      return cmdText;
    }

    return [
      cmdText,
      ...examples.map(ex => `    ${this.styles.dim('>')} ${this.styles.example(ex)}`),
    ].join('\n');
  }

  /**
   * Format an ID for display
   * @param id The ID to format
   * @returns The formatted ID string
   */
  public formatId(id: string): string {
    return this.styles.id(id);
  }

  /**
   * Format tags for display
   * @param tags The tags to format
   * @returns The formatted tags string
   */
  public formatTags(tags: string[] | null | undefined): string {
    if (!tags || tags.length === 0) {
      return this.styles.dim('No tags');
    }

    return tags.map(tag => this.styles.tag(`#${tag}`)).join(' ');
  }

  /**
   * Format a date for display
   * @param date The date to format
   * @returns The formatted date string
   */
  public formatDate(date: Date | string | number): string {
    const dateObj = typeof date === 'object' ? date : new Date(date);
    return dateObj.toLocaleString();
  }

  /**
   * Prompt for a selection from a list of choices
   * @param message The prompt message
   * @param choices The available choices
   * @returns The selected value
   */
  public async select<T>(message: string, choices: Array<{ name: string, value: T }>): Promise<T> {
    if (this.silent) {
      throw new Error('Cannot use select in silent mode');
    }

    const { selection } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message,
        choices,
      },
    ]);
    return selection;
  }

  /**
   * Prompt for a free text input
   * @param message The prompt message
   * @param defaultValue Optional default value
   * @returns The user's input
   */
  public async input(message: string, defaultValue?: string): Promise<string> {
    if (this.silent) {
      throw new Error('Cannot use input in silent mode');
    }

    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message,
        default: defaultValue,
      },
    ]);
    return input;
  }

  /**
   * Prompt for a confirmation (yes/no)
   * @param message The prompt message
   * @param defaultValue Optional default value
   * @returns The user's confirmation
   */
  public async confirm(message: string, defaultValue = false): Promise<boolean> {
    if (this.silent) {
      throw new Error('Cannot use confirm in silent mode');
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue,
      },
    ]);
    return confirmed;
  }

  /**
   * Start a spinner with a message
   * @param text The initial spinner text
   */
  public startSpinner(text: string): void {
    if (this.silent) return;
    
    // Stop any existing spinner
    this.stopSpinner();
    
    // Create a new spinner
    this.spinner = ora({
      text,
      color: 'cyan',
    }).start();
    
    this.logger.debug(`Started spinner: ${text}`);
  }
  
  /**
   * Update an active spinner with new text
   * @param text The new spinner text
   */
  public updateSpinner(text: string): void {
    if (this.silent || !this.spinner) return;
    
    this.spinner.text = text;
    this.logger.debug(`Updated spinner: ${text}`);
  }
  
  /**
   * Stop the active spinner
   * @param type Optional completion type (success, error, info)
   * @param text Optional completion text
   */
  public stopSpinner(type?: 'success' | 'error' | 'info', text?: string): void {
    if (this.silent || !this.spinner) return;
    
    if (type === 'success') {
      this.spinner.succeed(text);
    } else if (type === 'error') {
      this.spinner.fail(text);
    } else if (type === 'info') {
      this.spinner.info(text);
    } else {
      this.spinner.stop();
    }
    
    this.spinner = null;
    this.logger.debug('Stopped spinner');
  }

  /**
   * Implementation of IProgressTracker interface
   * Execute a task with progress tracking compatible with the common interface
   * 
   * @param title Operation title (ignored in CLI, used only in Matrix)
   * @param steps Array of step descriptions
   * @param task The async task to execute
   * @returns The result of the task
   */
  public async withProgress<T>(
    _title: string,
    steps: string[],
    task: (updateStep: (stepIndex: number) => void) => Promise<T>,
  ): Promise<T> {
    // For CLI, we ignore the title and just use the withProgressSpinner implementation
    return this.withProgressSpinner(steps, task);
  }

  /**
   * Execute a task with spinner and step-by-step progress updates
   * @param steps Array of step descriptions
   * @param task The async task to execute
   * @returns The result of the task
   */
  public async withProgressSpinner<T>(
    steps: string[], 
    task: (updateStep: (stepIndex: number) => void) => Promise<T>,
  ): Promise<T> {
    if (this.silent) {
      return task(() => {});
    }
    
    if (steps.length === 0) {
      return task(() => {});
    }
    
    // Start with first step
    this.startSpinner(`${steps[0]} (Step 1/${steps.length})`);
    
    // Create an update function to pass to the task
    const updateStep = (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= steps.length) return;
      
      this.updateSpinner(`${steps[stepIndex]} (Step ${stepIndex + 1}/${steps.length})`);
    };
    
    try {
      // Execute the task with the update function
      const result = await task(updateStep);
      
      // Complete the spinner
      this.stopSpinner('success', 'Process completed successfully');
      
      return result;
    } catch (error) {
      // Show error in the spinner
      this.stopSpinner('error', `Process failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Display a spinner while an async operation is in progress (legacy implementation)
   * @param message The message to display
   * @param task The async task to execute
   * @returns The result of the task
   */
  public async withSpinner<T>(message: string, task: () => Promise<T>): Promise<T> {
    if (this.silent) {
      return task();
    }

    this.startSpinner(message);
    
    try {
      const result = await task();
      this.stopSpinner('success', message + ' Completed!');
      return result;
    } catch (error) {
      this.stopSpinner('error', message + ' Failed! ' + (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }
}