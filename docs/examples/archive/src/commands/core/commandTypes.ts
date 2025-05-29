/**
 * Command types and interfaces
 * Defines the common types used throughout the command system
 */

import type { WebsiteIdentityData } from '@/contexts/website/schemas/websiteIdentitySchema';
import type { LandingPageData, WebsiteConfig } from '@/contexts/website/websiteStorage';
import type { Note } from '@/models/note';
import type { Profile } from '@/models/profile';
import type { ExternalCitation } from '@/protocol/types';
import type { AssessedSection } from '@website/schemas/sectionQualitySchema';

/**
 * Interface for command descriptions
 */
export interface CommandInfo {
  command: string;
  description: string;
  usage: string;
  examples?: string[];
}

/**
 * Union type for all website command result types
 */
export type WebsiteCommandResult =
  | { type: 'website-config'; success?: boolean; config?: WebsiteConfig; message: string }
  | { type: 'landing-page'; success?: boolean; message?: string; data?: LandingPageData; action?: 'generate' | 'edit' | 'assess' | 'apply' | 'regenerate-failed' | 'view'; assessments?: Record<string, AssessedSection<unknown>>; results?: { attempted: number; succeeded: number; failed: number; sections: Record<string, { success: boolean; message: string }> } }
  | { type: 'website-build'; success: boolean; message: string; url?: string; output?: string; path?: string }
  | { type: 'website-promote'; success: boolean; message: string; url?: string }
  | { type: 'website-status'; success: boolean; message: string; data?: { 
      environment: string;
      buildStatus: string;
      fileCount: number;
      serverStatus: string;
      domain: string;
      accessStatus: string;
      url: string;
    } }
  | { type: 'website-identity'; success?: boolean; message?: string; data?: WebsiteIdentityData; action?: 'view' | 'generate' | 'update' }
  | { type: 'progress'; progressData: {
      title: string;
      steps: Array<{
        label: string;
        complete: boolean;
        active: boolean;
        index: number;
      }>;
      currentStep: number;
      totalSteps: number;
      status: 'in_progress' | 'complete' | 'error';
      error?: string;
    } };

/**
 * Union type for all possible command result types
 */
export type CommandResult =
  | { type: 'error'; message: string }
  | { type: 'help'; commands: CommandInfo[] }
  | { type: 'profile'; profile: Profile }
  | { type: 'notes'; notes: Note[]; title?: string }
  | { type: 'note'; note: Note }
  | { type: 'tags'; tags: Array<{ tag: string; count: number }> }
  | { type: 'search'; query: string; notes: Note[] }
  | { type: 'ask'; answer: string; citations: Array<{ noteId: string; noteTitle: string; excerpt: string }>; relatedNotes: Note[]; externalSources: ExternalCitation[] | undefined }
  | { type: 'external'; enabled: boolean; message: string }
  | {
    type: 'status'; status: {
      apiConnected: boolean;
      dbConnected: boolean;
      noteCount: number;
      externalSources: Record<string, boolean>;
      externalSourcesEnabled: boolean;
    }
  }
  | { type: 'save-note-preview'; noteContent: string; title: string; conversationId: string }
  | { type: 'save-note-confirm'; noteId: string; title: string }
  | { type: 'conversation-notes'; notes: Note[] }
  | { type: 'website-config'; success?: boolean; config?: WebsiteConfig; message: string }
  | { type: 'landing-page'; success?: boolean; message?: string; data?: LandingPageData; action?: 'generate' | 'edit' | 'assess' | 'apply' | 'regenerate-failed' | 'view'; assessments?: Record<string, AssessedSection<unknown>>; results?: { attempted: number; succeeded: number; failed: number; sections: Record<string, { success: boolean; message: string }> } }
  | { type: 'website-build'; success: boolean; message: string; url?: string; output?: string; path?: string }
  | { type: 'website-promote'; success: boolean; message: string; url?: string }
  | { type: 'website-status'; success: boolean; message: string; data?: { 
      environment: string;
      buildStatus: string;
      fileCount: number;
      serverStatus: string;
      domain: string;
      accessStatus: string;
      url: string;
    } }
  | { type: 'website-identity'; success?: boolean; message?: string; data?: WebsiteIdentityData; action?: 'view' | 'generate' | 'update' }
  | { type: 'progress'; progressData: {
      title: string;
      steps: Array<{
        label: string;
        complete: boolean;
        active: boolean;
        index: number;
      }>;
      currentStep: number;
      totalSteps: number;
      status: 'in_progress' | 'complete' | 'error';
      error?: string;
    } };