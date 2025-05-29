/**
 * ProfileFormatter class
 * 
 * Responsible for formatting profile data into human-readable text formats
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 * - createWithDependencies(): Creates a new instance with explicit dependencies
 * 
 * Implements the FormatterInterface for consistent formatting operations
 */
import type { FormatterInterface } from '@/contexts/formatterInterface';
import type { 
  Education, 
  Experience,
  Language,
  Profile,
  Project,
  Publication,
} from '@/models/profile';
import { Logger } from '@/utils/logger';
import { isNonEmptyString } from '@/utils/safeAccessUtils';

import type { ProfileFormattingOptions } from '../profileTypes';

/**
 * Configuration options for ProfileFormatter
 */
export interface ProfileFormatterConfig {
  /** Include section headers in the formatted output */
  includeSectionHeaders?: boolean;
  /** Include empty sections in the formatted output */
  includeEmptySections?: boolean;
  /** Maximum length for fields before truncation */
  maxFieldLength?: number;
}

/**
 * Dependencies for ProfileFormatter
 */
export interface ProfileFormatterDependencies {
  /** Logger instance */
  logger?: Logger;
}

/**
 * ProfileFormatter handles converting profile objects to human-readable text
 * Follows the Component Interface Standardization pattern
 * Implements FormatterInterface for Profile objects
 */
export class ProfileFormatter implements FormatterInterface<Profile, string> {
  /** The singleton instance */
  private static instance: ProfileFormatter | null = null;
  
  /** Configuration values */
  private readonly config: ProfileFormatterConfig;
  
  /** Logger instance for this class */
  private readonly logger: Logger;
  
  /**
   * Get the singleton instance of ProfileFormatter
   * 
   * @param config Optional configuration
   * @returns The shared ProfileFormatter instance
   */
  public static getInstance(config?: ProfileFormatterConfig): ProfileFormatter {
    if (!ProfileFormatter.instance) {
      ProfileFormatter.instance = new ProfileFormatter(config);
    } else if (config) {
      // Log a warning if trying to get instance with different config
      const logger = Logger.getInstance();
      logger.warn('getInstance called with config but instance already exists. Config ignored');
    }
    return ProfileFormatter.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   * This clears the instance and any resources it holds
   */
  public static resetInstance(): void {
    ProfileFormatter.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   * This creates a new instance without affecting the singleton
   * 
   * @param config Optional configuration
   * @returns A new ProfileFormatter instance
   */
  public static createFresh(config?: ProfileFormatterConfig): ProfileFormatter {
    return new ProfileFormatter(config);
  }
  
  /**
   * Create a new formatter with explicit dependencies
   * @param config Configuration options
   * @param dependencies Service dependencies
   * @returns A new ProfileFormatter instance
   */
  public static createWithDependencies(
    config: Record<string, unknown> = {},
    dependencies: Record<string, unknown> = {},
  ): ProfileFormatter {
    // Convert config to typed config
    const formatterConfig: ProfileFormatterConfig = {
      includeSectionHeaders: config['includeSectionHeaders'] as boolean,
      includeEmptySections: config['includeEmptySections'] as boolean,
      maxFieldLength: config['maxFieldLength'] as number,
    };
    
    // Create with typed dependencies
    return new ProfileFormatter(
      formatterConfig,
      {
        logger: dependencies['logger'] as Logger,
      },
    );
  }
  
  /**
   * Private constructor to enforce factory methods
   * @param config Optional configuration
   * @param dependencies Optional dependencies
   */
  private constructor(
    config?: ProfileFormatterConfig,
    dependencies?: ProfileFormatterDependencies,
  ) {
    this.config = {
      includeSectionHeaders: config?.includeSectionHeaders ?? true,
      includeEmptySections: config?.includeEmptySections ?? false,
      maxFieldLength: config?.maxFieldLength ?? 0,
    };
    this.logger = dependencies?.logger || Logger.getInstance();
  }
  
  /**
   * Format method implementing FormatterInterface
   * Maps to formatProfileForDisplay for compatibility
   * 
   * @param data The profile data to format
   * @param options Optional formatting options (override defaults from config)
   * @returns Formatted string representation of the profile
   */
  format(data: Profile, options?: ProfileFormattingOptions): string {
    return this.formatProfileForDisplay(data, options || {});
  }

  /**
   * Formats a profile for display to users
   * 
   * @param profile - The profile to format
   * @param options - Optional formatting options (override defaults from config)
   * @returns Formatted profile string with sections and formatting
   */
  formatProfileForDisplay(profile: Profile, options: ProfileFormattingOptions = {}): string {
    try {
      // Use options from the method call, then fall back to config values
      const includeSectionHeaders = options.includeSectionHeaders ?? this.config.includeSectionHeaders ?? true;
      const includeEmptySections = options.includeEmptySections ?? this.config.includeEmptySections ?? false;
      const maxFieldLength = options.maxFieldLength ?? this.config.maxFieldLength ?? 0;
      
      const formatField = (value: string | null | undefined): string => {
        if (!value) return '';
        return maxFieldLength > 0 && value.length > maxFieldLength 
          ? value.substring(0, maxFieldLength) + '...'
          : value;
      };
      
      // Start with personal info
      let formatted = '';
      
      // Use displayName as the main name
      if (profile.displayName) {
        formatted += `# ${profile.displayName}\n\n`;
      }
      
      if (profile.headline) {
        formatted += `**${formatField(profile.headline)}**\n\n`;
      }
      
      if (profile.summary) {
        formatted += `${formatField(profile.summary)}\n\n`;
      }
      
      // Basic info section
      let basicInfo = '';
      
      // Location from location object
      if (profile.location) {
        const locationParts = [
          profile.location.city,
          profile.location.state,
          profile.location.country,
        ].filter(Boolean);
        
        if (locationParts.length > 0) {
          const locationStr = locationParts.join(', ');
          basicInfo += `**Location:** ${formatField(locationStr)}\n`;
        }
      }
      
      // Email
      if (profile.email) {
        basicInfo += `**Email:** ${formatField(profile.email)}\n`;
      }
      
      // Contact info
      if (profile.contact) {
        if (profile.contact.phone) {
          basicInfo += `**Phone:** ${formatField(profile.contact.phone)}\n`;
        }
        
        if (profile.contact.website) {
          basicInfo += `**Website:** ${formatField(profile.contact.website)}\n`;
        }
      }
      
      if (basicInfo && (includeEmptySections || basicInfo.length > 0)) {
        if (includeSectionHeaders) {
          formatted += '## Basic Information\n\n';
        }
        formatted += `${basicInfo}\n`;
      }
      
      // Experience
      if (profile.experiences && profile.experiences.length > 0) {
        if (includeSectionHeaders) {
          formatted += '## Experience\n\n';
        }
        
        formatted += profile.experiences
          .map(exp => this.formatExperience(exp, formatField))
          .join('\n\n');
        formatted += '\n\n';
      } else if (includeEmptySections) {
        if (includeSectionHeaders) {
          formatted += '## Experience\n\n';
        }
        formatted += 'No experience listed.\n\n';
      }
      
      // Education
      if (profile.education && profile.education.length > 0) {
        if (includeSectionHeaders) {
          formatted += '## Education\n\n';
        }
        
        formatted += profile.education
          .map(edu => this.formatEducation(edu, formatField))
          .join('\n\n');
        formatted += '\n\n';
      } else if (includeEmptySections) {
        if (includeSectionHeaders) {
          formatted += '## Education\n\n';
        }
        formatted += 'No education listed.\n\n';
      }
      
      // Projects
      if (profile.projects && profile.projects.length > 0) {
        if (includeSectionHeaders) {
          formatted += '## Projects\n\n';
        }
        
        formatted += profile.projects
          .map(project => this.formatProject(project, formatField))
          .join('\n\n');
        formatted += '\n\n';
      } else if (includeEmptySections) {
        if (includeSectionHeaders) {
          formatted += '## Projects\n\n';
        }
        formatted += 'No projects listed.\n\n';
      }
      
      // Publications
      if (profile.publications && profile.publications.length > 0) {
        if (includeSectionHeaders) {
          formatted += '## Publications\n\n';
        }
        
        formatted += profile.publications
          .map(pub => this.formatPublication(pub, formatField))
          .join('\n\n');
        formatted += '\n\n';
      } else if (includeEmptySections) {
        if (includeSectionHeaders) {
          formatted += '## Publications\n\n';
        }
        formatted += 'No publications listed.\n\n';
      }
      
      // Languages
      if (profile.languages && profile.languages.length > 0) {
        if (includeSectionHeaders) {
          formatted += '## Languages\n\n';
        }
        
        formatted += profile.languages
          .map(lang => this.formatLanguage(lang, formatField))
          .join('\n');
        formatted += '\n\n';
      } else if (includeEmptySections) {
        if (includeSectionHeaders) {
          formatted += '## Languages\n\n';
        }
        formatted += 'No languages listed.\n\n';
      }
      
      // Skills
      if (profile.skills && profile.skills.length > 0) {
        if (includeSectionHeaders) {
          formatted += '## Skills\n\n';
        }
        
        formatted += profile.skills
          .map(skill => `- ${formatField(skill)}\n`)
          .join('');
        formatted += '\n\n';
      } else if (includeEmptySections) {
        if (includeSectionHeaders) {
          formatted += '## Skills\n\n';
        }
        formatted += 'No skills listed.\n\n';
      }
      
      // Tags
      if (profile.tags && profile.tags.length > 0) {
        formatted += `**Tags:** ${profile.tags.map(tag => `#${tag}`).join(' ')}\n\n`;
      }
      
      return formatted.trim();
    } catch (error) {
      this.logger.error('Error formatting profile for display:', error);
      return 'Error formatting profile.';
    }
  }
  
  /**
   * Formats a Date object into a readable string
   * 
   * @param date - JavaScript Date object
   * @returns Formatted date string
   */
  private formatDate(date: Date | undefined | null): string {
    if (!date) return '';
    
    try {
      // Format as YYYY-MM-DD
      return date.toISOString().split('T')[0];
    } catch (_error) {
      return '';
    }
  }
  
  /**
   * Formats a work experience entry
   * 
   * @param experience - The experience to format
   * @param formatField - Function to format and truncate fields
   * @returns Formatted experience string
   */
  /**
   * Helper function to safely get a non-empty string or return undefined
   */
  private safeNonEmptyString(value: string | null | undefined): string | undefined {
    return isNonEmptyString(value) ? value : undefined;
  }

  private formatExperience(
    experience: Experience, 
    formatField: (value: string | null | undefined) => string,
  ): string {
    const title = this.safeNonEmptyString(experience.title);
    const organization = this.safeNonEmptyString(experience.organization);
    const startDate = this.formatDate(experience.startDate);
    const endDate = experience.endDate ? this.formatDate(experience.endDate) : 'Present';
    const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : '';
    const location = this.safeNonEmptyString(experience.location);
    const description = this.safeNonEmptyString(experience.description);
    
    let formatted = '';
    
    if (title && organization) {
      formatted += `### ${formatField(title)} at ${formatField(organization)}\n`;
    } else if (title) {
      formatted += `### ${formatField(title)}\n`;
    } else if (organization) {
      formatted += `### Position at ${formatField(organization)}\n`;
    } else {
      formatted += '### Work Experience\n';
    }
    
    if (dateRange) {
      formatted += `**${dateRange}**`;
      if (location) {
        formatted += ` | ${formatField(location)}`;
      }
      formatted += '\n\n';
    } else if (location) {
      formatted += `**${formatField(location)}**\n\n`;
    }
    
    if (description) {
      formatted += `${formatField(description)}\n`;
    }
    
    return formatted;
  }
  
  /**
   * Formats an education entry
   * 
   * @param education - The education to format
   * @param formatField - Function to format and truncate fields
   * @returns Formatted education string
   */
  private formatEducation(
    education: Education,
    formatField: (value: string | null | undefined) => string,
  ): string {
    const institution = this.safeNonEmptyString(education.institution);
    const degree = this.safeNonEmptyString(education.degree);
    const field = this.safeNonEmptyString(education.field);
    const startDate = this.formatDate(education.startDate);
    const endDate = education.endDate ? this.formatDate(education.endDate) : 'Present';
    const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : '';
    const description = this.safeNonEmptyString(education.description);
    
    let formatted = '';
    
    if (institution) {
      formatted += `### ${formatField(institution)}\n`;
    } else {
      formatted += '### Education\n';
    }
    
    if (degree && field) {
      formatted += `**${formatField(degree)}** in **${formatField(field)}**\n`;
    } else if (degree) {
      formatted += `**${formatField(degree)}**\n`;
    } else if (field) {
      formatted += `**${formatField(field)}**\n`;
    }
    
    if (dateRange) {
      formatted += `${dateRange}\n\n`;
    } else {
      formatted += '\n';
    }
    
    if (description) {
      formatted += `${formatField(description)}\n`;
    }
    
    return formatted;
  }
  
  /**
   * Formats a project entry
   * 
   * @param project - The project to format
   * @param formatField - Function to format and truncate fields
   * @returns Formatted project string
   */
  private formatProject(
    project: Project,
    formatField: (value: string | null | undefined) => string,
  ): string {
    const name = this.safeNonEmptyString(project.title);
    const startDate = this.formatDate(project.startDate);
    const endDate = project.endDate ? this.formatDate(project.endDate) : 'Present';
    const dateRange = startDate && endDate ? `${startDate} to ${endDate}` : '';
    const url = this.safeNonEmptyString(project.url);
    const description = this.safeNonEmptyString(project.description);
    
    let formatted = '';
    
    if (name) {
      formatted += `### ${formatField(name)}\n`;
    } else {
      formatted += '### Project\n';
    }
    
    if (dateRange) {
      formatted += `**${dateRange}**\n\n`;
    }
    
    if (url) {
      formatted += `URL: ${formatField(url)}\n\n`;
    }
    
    if (description) {
      formatted += `${formatField(description)}\n`;
    }
    
    return formatted;
  }
  
  /**
   * Formats a publication entry
   * 
   * @param publication - The publication to format
   * @param formatField - Function to format and truncate fields
   * @returns Formatted publication string
   */
  private formatPublication(
    publication: Publication,
    formatField: (value: string | null | undefined) => string,
  ): string {
    const title = this.safeNonEmptyString(publication.title);
    const publisher = this.safeNonEmptyString(publication.publisher);
    const date = this.formatDate(publication.date);
    const url = this.safeNonEmptyString(publication.url);
    const description = this.safeNonEmptyString(publication.description);
    
    let formatted = '';
    
    if (title) {
      formatted += `### ${formatField(title)}\n`;
    } else {
      formatted += '### Publication\n';
    }
    
    if (publisher) {
      formatted += `**${formatField(publisher)}**`;
      if (date) {
        formatted += ` | ${date}`;
      }
      formatted += '\n\n';
    } else if (date) {
      formatted += `**${date}**\n\n`;
    }
    
    if (url) {
      formatted += `URL: ${formatField(url)}\n\n`;
    }
    
    if (description) {
      formatted += `${formatField(description)}\n`;
    }
    
    return formatted;
  }
  
  /**
   * Formats a language proficiency entry
   * 
   * @param language - The language to format
   * @param formatField - Function to format and truncate fields
   * @returns Formatted language string
   */
  private formatLanguage(
    language: Language,
    formatField: (value: string | null | undefined) => string,
  ): string {
    const name = this.safeNonEmptyString(language.name);
    const proficiency = this.safeNonEmptyString(language.proficiency);
    
    if (name && proficiency) {
      return `- **${formatField(name)}**: ${formatField(proficiency)}\n`;
    } else if (name) {
      return `- **${formatField(name)}**\n`;
    } else {
      return '';
    }
  }
}