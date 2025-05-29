/**
 * Enhanced Matrix Renderer for command results
 * 
 * This module handles formatting and displaying command results in Matrix
 * with improved formatting, distinct bot messages, and better visual structure
 * 
 * Features:
 * - Markdown rendering
 * - Rich, visually distinct citations
 * - Bot message styling
 * - Support for MSC2398 blocks (with fallback)
 */

import type { IProgressTracker } from '@/utils/registry/rendererRegistry';

import { MatrixResponseFormatter } from '../interfaces/matrix/formatters';
import type { ProgressData } from '../interfaces/matrix/formatters/progress-types';
import type { 
  NotePreview, 
  WebsiteBuildResult, 
  WebsiteIdentityResult,
  WebsitePromoteResult, 
  WebsiteStatusResult, 
} from '../interfaces/matrix/formatters/types';
import logger from '../utils/logger';

import type { CommandHandler } from '.';
import type { CommandInfo, CommandResult } from './index';

/**
 * Render command results for Matrix with enhanced formatting
 */

/**
 * Render command results for Matrix with enhanced formatting
 * Implements IProgressTracker for standardized progress tracking
 */
export class MatrixRenderer implements IProgressTracker {
  private commandPrefix: string;
  private sendMessageFn: (roomId: string, message: string) => void;
  // private member used in methods called by tests
  private commandHandler?: CommandHandler;
  // Response formatter with consistent styling
  private formatter = MatrixResponseFormatter.getInstance();
  
  // Progress tracking support (for future message editing capabilities)

  constructor(commandPrefix: string, sendMessageFn: (roomId: string, message: string) => void) {
    this.commandPrefix = commandPrefix;
    this.sendMessageFn = sendMessageFn;
    // Initialize formatter with command prefix
    this.formatter = MatrixResponseFormatter.getInstance({ commandPrefix });
  }
  
  /**
   * Set the command handler for interactive confirmation
   */
  setCommandHandler(handler: CommandHandler): void {
    this.commandHandler = handler;
    // Validate the command handler has the required methods
    if (!this.commandHandler || typeof this.commandHandler.confirmSaveNote !== 'function') {
      throw new Error('Command handler must implement confirmSaveNote');
    }
  }

  /**
   * Render help command
   */
  renderHelp(roomId: string, commands: CommandInfo[]): void {
    const helpText = [
      '### Personal Brain Commands',
      '',
      ...commands.map(cmd => {
        // Format with markdown for better rendering
        const usage = `\`${this.commandPrefix} ${cmd.usage}\``;
        return `- ${usage} - ${cmd.description}`;
      }),
    ].join('\n');

    this.sendMessageFn(roomId, helpText);
  }

  /**
   * Implementation of the IProgressTracker interface withProgress method
   * 
   * Creates a room-specific progress tracker for Matrix clients
   * 
   * @param title Operation title
   * @param steps Array of step labels
   * @param task Function to execute with progress tracking
   * @param roomId Room ID to send updates to (defaults to current room)
   * @returns Result of the task
   */
  async withProgress<T = unknown>(
    title: string,
    steps: string[],
    task: (updateStep: (stepIndex: number) => void) => Promise<T>,
    roomId?: string,
  ): Promise<T> {
    // If no roomId is provided, attempt to get it from the conversation manager
    if (!roomId) {
      throw new Error('Matrix progress tracker requires a room ID');
    }
    
    // Use the existing implementation via the more specific method
    return this.withProgressTracker(roomId, title, steps, task);
  }

  /**
   * Create and display a progress tracker for multi-step operations
   * 
   * This provides a Matrix-friendly progress tracker with step-by-step updates.
   * It's the internal implementation used by the IProgressTracker interface.
   * 
   * @param roomId Room ID to send progress updates to
   * @param title Operation title (e.g. "Generating Landing Page")
   * @param steps Array of step labels
   * @param task Async function to execute with progress tracking
   * @returns Result of the task
   */
  async withProgressTracker<T = unknown>(
    roomId: string,
    title: string,
    steps: string[],
    task: (updateStep: (stepIndex: number) => void) => Promise<T>,
  ): Promise<T> {
    // Create initial progress data
    const progressData: ProgressData = {
      title,
      steps: steps.map((label, index) => ({
        label,
        complete: false,
        active: index === 0,
        index,
      })),
      currentStep: 0,
      totalSteps: steps.length,
      status: 'in_progress',
    };
    
    // Send initial progress message
    this.sendMessageFn(roomId, this.formatter.formatProgress(progressData));
    
    // Define step update function that will be passed to the task
    const updateStep = (stepIndex: number) => {
      if (stepIndex < 0 || stepIndex >= steps.length) {
        logger.warn(`Invalid step index: ${stepIndex}, must be between 0 and ${steps.length - 1}`);
        return;
      }
      
      // Mark previous steps as complete
      for (let i = 0; i < stepIndex; i++) {
        progressData.steps[i].complete = true;
        progressData.steps[i].active = false;
      }
      
      // Update current step
      progressData.currentStep = stepIndex;
      progressData.steps[stepIndex].active = true;
      progressData.steps[stepIndex].complete = false;
      
      // Mark next steps as inactive and incomplete
      for (let i = stepIndex + 1; i < steps.length; i++) {
        progressData.steps[i].active = false;
        progressData.steps[i].complete = false;
      }
      
      // Send updated progress message
      this.sendMessageFn(roomId, this.formatter.formatProgress(progressData));
    };
    
    try {
      // Run the task with the update function
      const result = await task(updateStep);
      
      // Mark all steps as complete and status as done
      progressData.steps.forEach(step => {
        step.complete = true;
        step.active = false;
      });
      progressData.status = 'complete';
      
      // Send final progress message
      this.sendMessageFn(roomId, this.formatter.formatProgress(progressData));
      
      return result;
    } catch (error) {
      // Update progress with error
      progressData.status = 'error';
      progressData.error = error instanceof Error ? error.message : String(error);
      
      // Send error progress message
      this.sendMessageFn(roomId, this.formatter.formatProgress(progressData));
      
      throw error;
    }
  }
  
  /**
   * Render a command result with enhanced formatting
   */
  render(roomId: string, result: CommandResult): void {
    try {
      switch (result.type) {
      case 'error': {
        this.sendMessageFn(roomId, this.formatter.formatError(result.message));
        break;
      }

      case 'search': {
        if (result.notes.length === 0) {
          this.sendMessageFn(roomId, 'No results found.');
          return;
        }

        this.sendMessageFn(roomId, this.formatter.formatSearchResults(result.query, result.notes as unknown as NotePreview[]));
        break;
      }

      case 'notes': {
        if (result.notes.length === 0) {
          this.sendMessageFn(roomId, 'No notes found.');
          return;
        }

        this.sendMessageFn(roomId, this.formatter.formatNotesList(result.notes as unknown as NotePreview[], result.title));
        break;
      }

      case 'note': {
        // Cast to NotePreview to satisfy the more flexible type system used by formatters
        this.sendMessageFn(roomId, this.formatter.formatNote(result.note as unknown as NotePreview));
        break;
      }

      case 'tags': {
        this.sendMessageFn(roomId, this.formatter.formatTags(result.tags));
        break;
      }

      case 'profile': {
        this.sendMessageFn(roomId, this.formatter.formatProfile(result.profile));
        break;
      }

      case 'ask': {
        // DEBUG: Log the raw answer from the command handler
        logger.debug(`[DEBUG RENDERER] Received answer in renderer: ${result.answer.substring(0, 100)}...`);
        
        this.sendMessageFn(
          roomId, 
          this.formatter.formatAnswer(result.answer, result.citations, result.relatedNotes as unknown as NotePreview[]),
        );
        break;
      }

      case 'status': {
        this.sendMessageFn(roomId, this.formatter.formatStatus(result.status));
        break;
      }

      case 'external': {
        const externalStatusIcon = result.enabled ? '✅' : '⚠️';
        const externalMsg = `${externalStatusIcon} ${result.message}`;
        this.sendMessageFn(roomId, externalMsg);
        break;
      }
      
      case 'save-note-preview': {
        this.sendMessageFn(roomId, this.formatter.formatSaveNotePreview(result));
        break;
      }
      
      case 'save-note-confirm': {
        this.sendMessageFn(roomId, this.formatter.formatSaveNoteConfirm(result));
        break;
      }
      
      case 'conversation-notes': {
        this.sendMessageFn(roomId, this.formatter.formatConversationNotes(result.notes as unknown as (NotePreview & { createdAt: string | Date })[]));
        break;
      }
      
      // Website commands
      case 'website-config': {
        this.sendMessageFn(roomId, this.formatter.formatWebsiteConfig(result));
        break;
      }
      
      case 'landing-page': {
        this.sendMessageFn(roomId, this.formatter.formatLandingPage(result));
        break;
      }
      
      
      case 'website-build': {
        this.sendMessageFn(roomId, this.formatter.formatWebsiteBuild(result as WebsiteBuildResult));
        break;
      }
      
      case 'website-promote': {
        this.sendMessageFn(roomId, this.formatter.formatWebsitePromote(result as WebsitePromoteResult));
        break;
      }
      
      case 'website-status': {
        this.sendMessageFn(roomId, this.formatter.formatWebsiteStatus(result as WebsiteStatusResult));
        break;
      }
      
      case 'website-identity': {
        this.sendMessageFn(roomId, this.formatter.formatWebsiteIdentity(result as WebsiteIdentityResult));
        break;
      }
      
      case 'progress': {
        this.sendMessageFn(roomId, this.formatter.formatProgress(result.progressData as ProgressData));
        break;
      }
      
      }
    } catch (error) {
      logger.error('Error rendering Matrix result:', error);
      
      // Send a fallback error message
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.sendMessageFn(roomId, `❌ Error rendering result: ${errorMessage}`);
    }
  }
}