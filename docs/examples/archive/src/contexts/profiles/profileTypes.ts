/**
 * Profile Types
 * 
 * Type definitions for profile-related functionality
 */

/**
 * Options for formatting profiles
 */
export interface ProfileFormattingOptions {
  /** Include section headers in the formatted output */
  includeSectionHeaders?: boolean;
  /** Include empty sections in the formatted output */
  includeEmptySections?: boolean;
  /** Maximum length for fields before truncation */
  maxFieldLength?: number;
}