/**
 * CLI Renderer for command results
 * 
 * This module handles formatting and displaying command results in the CLI.
 * It follows the Component Interface Standardization pattern with
 * getInstance(), resetInstance(), and createFresh().
 */
/* global setTimeout */

import type { Note } from '../models/note';
import type { EnhancedProfile } from '../models/profile';
// Import types and interfaces
import { CLIInterface } from '../utils/cliInterface';
import { formatIdentityToMarkdown, formatLandingPageToMarkdown } from '../utils/landingPageUtils';
import { Logger } from '../utils/logger';
import { displayNotes } from '../utils/noteUtils';

import type { CommandHandler } from '.';
import type { CommandInfo, CommandResult } from './index';

/**
 * Options for configuring the CLIRenderer
 */
export interface CLIRendererOptions {
  /** Custom CLI interface to use for rendering */
  cliInterface?: CLIInterface;
  /** Custom logger to use (instance or class) */
  logger?: Logger;
}

/**
 * CLI Renderer for displaying command results
 * 
 * This class follows the Component Interface Standardization pattern with singleton
 * management via getInstance(), resetInstance(), and createFresh().
 */
export class CLIRenderer {
  /** The singleton instance */
  private static instance: CLIRenderer | null = null;

  /** Logger instance */
  private readonly logger: Logger;

  /** CLI interface for user interaction */
  private readonly cli: CLIInterface;

  /** Command handler for interactive operations */
  private commandHandler?: CommandHandler;

  /**
   * Get the singleton instance of CLIRenderer
   * 
   * @param options Configuration options
   * @returns The shared CLIRenderer instance
   */
  public static getInstance(options?: CLIRendererOptions): CLIRenderer {
    if (!CLIRenderer.instance) {
      CLIRenderer.instance = new CLIRenderer(options);
    }
    return CLIRenderer.instance;
  }

  /**
   * Reset the singleton instance
   * This clears the instance for clean test isolation
   */
  public static resetInstance(): void {
    CLIRenderer.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   * 
   * @param options Configuration options
   * @returns A new CLIRenderer instance
   */
  public static createFresh(options?: CLIRendererOptions): CLIRenderer {
    return new CLIRenderer(options);
  }

  /**
   * Private constructor to enforce the use of getInstance()
   * 
   * @param options Configuration options
   */
  private constructor(options?: CLIRendererOptions) {
    this.cli = options?.cliInterface || CLIInterface.getInstance();
    this.logger = options?.logger || Logger.createFresh();
  }

  /**
   * Render help command
   * 
   * @param commands List of available commands to display
   */
  renderHelp(commands: CommandInfo[]): void {
    this.cli.displayTitle('Available Commands');

    commands.forEach(cmd => {
      this.cli.print(this.cli.formatCommand(cmd.usage, cmd.description, cmd.examples));
    });

    this.cli.print(''); // Add space after commands
  }

  /**
   * Set the command handler for interactive confirmation
   * 
   * @param handler The command handler to use for interactive operations
   */
  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
  }

  /**
   * Render a command result
   * 
   * @param result The command result to render
   */
  render(result: CommandResult): void {
    switch (result.type) {
    case 'error':
      this.cli.error(result.message);
      break;

    case 'search':
      this.cli.displayTitle(`Search Results for "${result.query}"`);
      this.logger.info(`Searching for: ${result.query}`);

      if (result.notes.length === 0) {
        this.cli.warn('No results found.');
      } else {
        displayNotes(result.notes, this.cli);
      }
      break;

    case 'notes':
      this.cli.displayTitle(result.title || 'Notes');

      if (result.notes.length === 0) {
        this.cli.warn('No notes found.');
      } else {
        displayNotes(result.notes, this.cli);
      }
      break;

    case 'note':
      this.renderNote(result.note);
      break;

    case 'tags':
      this.cli.displayTitle('Available Tags');

      if (result.tags.length === 0) {
        this.cli.warn('No tags found in the system.');
      } else {
        this.cli.displayList(
          result.tags,
          ({ tag, count }) => `${this.cli.styles.tag(tag)} (${this.cli.styles.dim(count.toString())})`,
        );
      }
      break;

    case 'profile':
      this.renderProfile(result.profile as EnhancedProfile);
      break;

    case 'ask':
      this.cli.displayTitle('Answer');
      this.cli.print(result.answer);

      if (result.citations && result.citations.length > 0) {
        this.cli.displayTitle('Sources');
        this.cli.displayList(
          result.citations,
          (citation) => `${this.cli.styles.subtitle(citation.noteTitle)} (${this.cli.formatId(citation.noteId)})`,
        );
      }

      if (result.externalSources && result.externalSources.length > 0) {
        this.cli.displayTitle('External Sources');
        this.cli.displayList(
          result.externalSources,
          (source) => {
            const title = this.cli.styles.subtitle(source.title);
            const sourceInfo = this.cli.styles.highlight(source.source);
            const url = this.cli.styles.url(source.url);
            return `${title} - ${sourceInfo}\n  ${url}`;
          },
        );
      }

      if (result.relatedNotes.length > 0) {
        this.cli.displayTitle('Related Notes');
        displayNotes(result.relatedNotes, this.cli);
      }

      // Profile display has been removed as it's no longer needed in the response
      break;

    case 'external':
      if (result.enabled) {
        this.cli.success(result.message);
      } else {
        this.cli.warn(result.message);
      }
      break;

    case 'save-note-preview':
      this.renderSaveNotePreview(result);
      break;

    case 'save-note-confirm':
      this.renderSaveNoteConfirm(result);
      break;

    case 'conversation-notes':
      this.renderConversationNotes(result);
      break;

      // Website commands
    case 'website-config':
      if (result.success !== undefined) {
        this.cli.displayTitle('Updated Configuration');
        if (result.success) {
          this.cli.success(result.message);
        } else {
          this.cli.error(result.message);
        }
      } else {
        this.cli.displayTitle('Website Configuration');
      }

      if (result.config) {
        const configItems = Object.entries(result.config).map(([key, value]) => ({
          key,
          value: typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value),
        }));
        this.cli.displayList(configItems, item => `${this.cli.styles.subtitle(item.key)}: ${item.value}`);
      }
      break;

    case 'landing-page':
      if (result.success !== undefined && result.message) {
        if (result.success) {
          this.cli.success(result.message);
        } else {
          this.cli.error(result.message);
        }
      }

      if (result.data) {
        this.cli.displayTitle('Landing Page Content');

        // Format landing page data as markdown for better readability
        const markdown = formatLandingPageToMarkdown(result.data);
        this.cli.print(markdown, { renderMarkdown: true });

        // If there are assessments, display them
        if (result.assessments && Object.keys(result.assessments).length > 0) {
          this.cli.displayTitle('Quality Assessments');

          Object.entries(result.assessments).forEach(([sectionType, assessedSection]) => {
            if (assessedSection && assessedSection.assessment) {
              const qualityScore = assessedSection.assessment.qualityScore;
              const confidenceScore = assessedSection.assessment.confidenceScore;
              const combinedScore = assessedSection.assessment.combinedScore;
              const enabled = assessedSection.assessment.enabled;

              // Format the section name
              const formattedSectionType = sectionType.charAt(0).toUpperCase() + sectionType.slice(1)
                .replace(/([A-Z])/g, ' $1').trim();

              this.cli.displaySubtitle(formattedSectionType);
              this.cli.printLabelValue('Quality', `${qualityScore}/10`);
              this.cli.printLabelValue('Confidence', `${confidenceScore}/10`);
              this.cli.printLabelValue('Combined', `${combinedScore}/10`);
              this.cli.printLabelValue('Enabled', enabled ? 'Yes' : 'No', {
                formatter: val => enabled ? this.cli.styles.success(val) : this.cli.styles.error(val),
              });

              if (assessedSection.assessment.suggestedImprovements) {
                this.cli.print('\n' + this.cli.styles.dim('Suggested Improvements:'));
                this.cli.print(assessedSection.assessment.suggestedImprovements);
              }

              this.cli.print('');
            }
          });
        }
      }
      break;

    case 'website-build':
      if (result.success) {
        this.cli.success(result.message);

        if (result.url) {
          this.cli.info('Website preview available at:');
          this.cli.print(result.url);
        }

        // Show helpful next steps
        this.cli.info('To promote to production:');
        this.cli.print('website-promote');
      } else {
        this.cli.error(result.message);
      }
      break;

    case 'website-promote':
      if (result.success) {
        this.cli.success(result.message);

        if (result.url) {
          this.cli.info('Production site available at:');
          this.cli.print(result.url);
        }
      } else {
        this.cli.error(result.message);
      }
      break;

    case 'website-status':
      if (result.success) {
        this.cli.displayTitle('Website Status');
        this.cli.success(result.message);

        if (result.data) {
          // Display detailed status information
          const { environment, buildStatus, fileCount, serverStatus, domain, accessStatus, url } = result.data;

          this.cli.printLabelValue('Environment', environment);
          this.cli.printLabelValue('Build Status', buildStatus);
          this.cli.printLabelValue('File Count', String(fileCount));
          this.cli.printLabelValue('Server Status', serverStatus);
          this.cli.printLabelValue('Domain', domain);
          this.cli.printLabelValue('Access Status', accessStatus);

          if (url) {
            this.cli.info('Website URL:');
            this.cli.print(url);
          }
        }
      } else {
        this.cli.error(result.message || 'Failed to check website status');
      }
      break;

    case 'website-identity':
      this.cli.displayTitle('Website Identity');

      if (result.success === false) {
        this.cli.error(result.message || 'Failed to process identity command');
        break;
      }

      if (result.message) {
        this.cli.success(result.message);
      }

      if (result.data) {
        // Format identity data as markdown for better readability
        const markdown = formatIdentityToMarkdown(result.data);
        this.cli.print(markdown, { renderMarkdown: true });
      } else if (result.action === 'view') {
        this.cli.warn('No identity data found. Generate identity data with "website-identity generate".');
      }
      break;

    case 'status':
      this.cli.displayTitle('System Status');

      // API Connection
      this.cli.printLabelValue(
        'API Connection',
        result.status.apiConnected ? 'Connected' : 'Disconnected',
        { formatter: val => result.status.apiConnected ? this.cli.styles.success(val) : this.cli.styles.error(val) },
      );

      // Database Connection
      this.cli.printLabelValue(
        'Database',
        result.status.dbConnected ? 'Connected' : 'Disconnected',
        { formatter: val => result.status.dbConnected ? this.cli.styles.success(val) : this.cli.styles.error(val) },
      );

      // Note Count
      this.cli.printLabelValue('Notes', result.status.noteCount.toString());

      // External Sources Status
      this.cli.printLabelValue(
        'External Sources',
        result.status.externalSourcesEnabled ? 'Enabled' : 'Disabled',
        {
          formatter: val => result.status.externalSourcesEnabled ?
            this.cli.styles.success(val) : this.cli.styles.warn(val),
        },
      );

      // External Sources Availability
      if (Object.keys(result.status.externalSources).length > 0) {
        this.cli.displaySubtitle('Available External Sources');

        Object.entries(result.status.externalSources).forEach(([name, available]) => {
          this.cli.printLabelValue(
            name,
            available ? 'Available' : 'Unavailable',
            {
              formatter: val => available ?
                this.cli.styles.success(val) : this.cli.styles.error(val),
            },
          );
        });
      } else {
        this.cli.warn('No external sources configured');
      }
      break;
    }
  }

  /**
   * Render save-note preview with options to edit or confirm
   * 
   * @param result Note preview information
   */
  private renderSaveNotePreview(result: { noteContent: string; title: string; conversationId: string }): void {
    this.cli.displayTitle('Note Preview');
    this.cli.printLabelValue('Title', result.title);

    this.cli.displaySubtitle('Content Preview');
    // Display first 300 characters of content with markdown rendering
    const previewContent = result.noteContent.length > 300
      ? result.noteContent.substring(0, 297) + '...'
      : result.noteContent;
    this.cli.print(previewContent, { renderMarkdown: true });

    this.cli.info('');
    this.cli.info('This is a preview of the note that will be created from your conversation.');
    this.cli.info('To save this note, type "y". To cancel, type "n".');
    this.cli.info('You can also edit the title by typing "title: New Title"');

    // Collect user input for confirmation
    // In a real implementation, we would set up an event listener for user input
    // and call confirmSaveNote when the user confirms
    // For demo purposes, we'll just provide instructions
    this.cli.print('');
    this.cli.info('Since this is a CLI interface, in a real implementation you would:');
    this.cli.info('1. Type "y" to confirm and save the note');
    this.cli.info('2. Type "n" to cancel');
    this.cli.info('3. Type "title: New Title" to change the title');

    // If we have a commandHandler, we can handle the confirmation directly
    // In a real implementation, this would be connected to user input handling
    if (this.commandHandler) {
      this.cli.print('');
      this.cli.info('For demo purposes, automatically confirming...');
      // Simulate confirmation by calling the confirmSaveNote method
      setTimeout(async () => {
        if (this.commandHandler) {
          const confirmResult = await this.commandHandler.confirmSaveNote(result.conversationId, result.title);
          this.render(confirmResult);
        }
      }, 2000); // Wait 2 seconds before auto-confirming
    }
  }

  /**
   * Render save-note confirmation
   * 
   * @param result Note creation result
   */
  private renderSaveNoteConfirm(result: { noteId: string; title: string }): void {
    this.cli.success(`Note "${result.title}" saved successfully!`);
    this.cli.info(`Note ID: ${this.cli.formatId(result.noteId)}`);
    this.cli.info('To view the note, use the command:');
    this.cli.print(`  note ${result.noteId}`);
  }

  /**
   * Render conversation notes list
   * 
   * @param result Notes created from conversations
   */
  private renderConversationNotes(result: { notes: Note[] }): void {
    this.cli.displayTitle('Notes Created from Conversations');

    if (result.notes.length === 0) {
      this.cli.warn('No conversation notes found.');
      return;
    }

    displayNotes(result.notes, this.cli);
  }

  /**
   * Render a single note with metadata and content
   * 
   * @param note The note to render
   */
  private renderNote(note: Note): void {
    this.cli.displayTitle(note.title);

    // Print metadata using label-value formatting
    this.cli.printLabelValue('ID', note.id, { formatter: id => this.cli.formatId(id) });
    this.cli.printLabelValue('Tags', note.tags as string[], { emptyText: 'None' });
    this.cli.printLabelValue('Created', this.cli.formatDate(new Date(note.createdAt)));
    this.cli.printLabelValue('Updated', this.cli.formatDate(new Date(note.updatedAt)));

    // Display content with markdown rendering
    this.cli.displaySubtitle('Content');
    this.cli.print(note.content, { renderMarkdown: true });
  }

  /**
   * Render profile information
   * 
   * @param profile The profile to render
   */
  private renderProfile(profile: EnhancedProfile): void {
    this.cli.displayTitle('Profile Information');

    // Print basic information using label-value formatting
    this.cli.printLabelValue('Name', profile.displayName);

    if (profile.headline) this.cli.printLabelValue('Headline', profile.headline);

    // Handle location
    if (profile.location) {
      const locationParts = [
        profile.location.city,
        profile.location.state,
        profile.location.country,
      ].filter(Boolean);

      if (locationParts.length > 0) {
        this.cli.printLabelValue('Location', locationParts.join(', '));
      }
    }

    // Display summary
    if (profile.summary) {
      this.cli.displaySubtitle('Summary');
      this.cli.print(profile.summary);
    }

    // Display experiences
    if (profile.experiences && profile.experiences.length > 0) {
      this.cli.displaySubtitle('Current Work');

      try {
        profile.experiences.forEach(exp => {
          const title = this.cli.styles.subtitle(exp.title);
          const organization = this.cli.styles.highlight(exp.organization);
          this.cli.print(`- ${title} at ${organization}`);

          if (exp.description) {
            // Trim long descriptions
            const desc = exp.description.length > 100
              ? exp.description.substring(0, 100) + '...'
              : exp.description;
            this.cli.print(`  ${this.cli.styles.dim(desc)}`);
          }
        });
      } catch (_error) {
        this.cli.print(this.cli.styles.dim('Error displaying experiences.'));
      }
    }

    // Display languages
    if (profile.languages && profile.languages.length > 0) {
      this.cli.displaySubtitle('Languages');

      try {
        const languageStrings = profile.languages.map(lang => 
          `${lang.name} (${lang.proficiency})`,
        );
        this.cli.printLabelValue('Languages', languageStrings);
      } catch (_error) {
        this.cli.printLabelValue('Languages', 'Error displaying languages');
      }
    }
    
    // Display skills if available
    if (profile.skills && profile.skills.length > 0) {
      this.cli.displaySubtitle('Skills');
      this.cli.printLabelValue('Skills', profile.skills);
    }

    // Display tags if available
    this.cli.displaySubtitle('Profile Tags');
    if (profile.tags && profile.tags.length > 0) {
      this.cli.printLabelValue('Tags', profile.tags);
    } else {
      this.cli.printLabelValue('Tags', '', { emptyText: 'None' });
      // Tags are automatically generated when saving a profile via the ProfileNoteAdapter
    }
  }
}
