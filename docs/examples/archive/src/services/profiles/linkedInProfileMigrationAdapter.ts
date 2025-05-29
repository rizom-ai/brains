import type { LinkedInProfile, LinkedInProfileDateInfo } from '@/models/linkedInProfile';
import type { Profile } from '@/models/profile';

/**
 * Dependencies for LinkedInProfileMigrationAdapter
 */
export interface LinkedInProfileMigrationAdapterDependencies {
  // This is not an empty interface, just a placeholder for future dependencies
  _placeholder?: boolean;
}

/**
 * LinkedInProfileMigrationAdapter
 * 
 * Utility to convert LinkedIn-format profiles to our new simplified format
 */
export class LinkedInProfileMigrationAdapter {
  // Singleton instance management - useful for injecting mocks in tests
  private static instance: LinkedInProfileMigrationAdapter | null = null;
  
  private constructor(_dependencies?: LinkedInProfileMigrationAdapterDependencies) {
    // Initialize with dependencies if needed
  }
  
  public static getInstance(dependencies?: LinkedInProfileMigrationAdapterDependencies): LinkedInProfileMigrationAdapter {
    if (!LinkedInProfileMigrationAdapter.instance) {
      LinkedInProfileMigrationAdapter.instance = new LinkedInProfileMigrationAdapter(dependencies);
    }
    return LinkedInProfileMigrationAdapter.instance;
  }
  
  public static resetInstance(): void {
    LinkedInProfileMigrationAdapter.instance = null;
  }
  
  public static createFresh(dependencies?: LinkedInProfileMigrationAdapterDependencies): LinkedInProfileMigrationAdapter {
    return new LinkedInProfileMigrationAdapter(dependencies);
  }
  
  /**
   * Convert a LinkedIn profile to our simplified profile format
   */
  convertToProfile(linkedInProfile: LinkedInProfile): Profile {
    // Create a basic profile object
    const profile: Partial<Profile> = {
      // Basic information
      id: linkedInProfile.id,
      displayName: linkedInProfile.fullName,
      email: 'example@example.com', // Default placeholder - should be updated
      avatar: linkedInProfile.profilePicUrl || undefined,
      headline: linkedInProfile.headline || undefined,
      summary: linkedInProfile.summary || undefined,
      
      // Contact information
      contact: {
        social: this.extractSocialLinks(linkedInProfile),
      },
      
      // Location information
      location: {
        city: linkedInProfile.city || undefined,
        state: linkedInProfile.state || undefined,
        country: linkedInProfile.countryFullName || undefined,
      },
      
      // Preserve tags if they exist
      tags: linkedInProfile.tags || [],
    };
    
    // Add work experiences if available
    if (linkedInProfile.experiences) {
      profile.experiences = linkedInProfile.experiences.map(exp => ({
        title: exp.title,
        organization: exp.company,
        description: exp.description || undefined,
        startDate: this.convertLinkedInDateToDate(exp.starts_at),
        endDate: exp.ends_at ? this.convertLinkedInDateToDate(exp.ends_at) : undefined,
        location: exp.location || undefined,
      }));
    }
    
    // Add education if available
    if (linkedInProfile.education) {
      profile.education = linkedInProfile.education.map(edu => ({
        institution: edu.school,
        degree: edu.degree_name || undefined,
        field: edu.field_of_study || undefined,
        startDate: this.convertLinkedInDateToDate(edu.starts_at),
        endDate: edu.ends_at ? this.convertLinkedInDateToDate(edu.ends_at) : undefined,
        description: edu.description || undefined,
      }));
    }
    
    // Add skills
    profile.skills = this.extractSkills(linkedInProfile);
    
    // Add languages if available
    if (linkedInProfile.languagesAndProficiencies) {
      profile.languages = linkedInProfile.languagesAndProficiencies.map(lang => ({
        name: lang.name,
        proficiency: this.mapProficiencyLevel(lang.proficiency),
      }));
    }
    
    // Add projects if available
    if (linkedInProfile.accomplishmentProjects) {
      profile.projects = linkedInProfile.accomplishmentProjects.map(proj => ({
        title: proj.title,
        description: proj.description || undefined,
        url: proj.url || undefined,
        startDate: this.convertLinkedInDateToDate(proj.starts_at),
        endDate: proj.ends_at ? this.convertLinkedInDateToDate(proj.ends_at) : undefined,
      }));
    }
    
    // Add publications if available
    if (linkedInProfile.accomplishmentPublications) {
      profile.publications = linkedInProfile.accomplishmentPublications.map(pub => ({
        title: pub.name,
        publisher: pub.publisher,
        date: this.convertLinkedInDateToDate(pub.published_on),
        description: pub.description || undefined,
        url: pub.url || undefined,
      }));
    }
    
    return profile as Profile;
  }
  
  /**
   * Helper to convert LinkedIn date format to standard Date
   */
  private convertLinkedInDateToDate(dateInfo: LinkedInProfileDateInfo): Date {
    if (!dateInfo) return new Date();
    
    const { year, month, day } = dateInfo;
    // Default to the 1st of the month if day is missing
    const adjustedDay = day || 1;
    // Default to January if month is missing
    const adjustedMonth = month ? month - 1 : 0;
    // Default to current year if year is missing
    const adjustedYear = year || new Date().getFullYear();
    
    return new Date(adjustedYear, adjustedMonth, adjustedDay);
  }
  
  /**
   * Map LinkedIn proficiency levels to our simplified levels
   */
  private mapProficiencyLevel(proficiency: string): 'basic' | 'intermediate' | 'fluent' | 'native' {
    const map: Record<string, 'basic' | 'intermediate' | 'fluent' | 'native'> = {
      'ELEMENTARY': 'basic',
      'LIMITED_WORKING': 'basic',
      'PROFESSIONAL_WORKING': 'intermediate',
      'FULL_PROFESSIONAL': 'fluent',
      'NATIVE_OR_BILINGUAL': 'native',
    };
    
    return map[proficiency] || 'basic';
  }
  
  /**
   * Extract social media links from LinkedIn profile
   */
  private extractSocialLinks(profile: LinkedInProfile) {
    const links = [];
    
    // Extract LinkedIn URL if available
    if (profile.publicIdentifier) {
      links.push({
        platform: 'linkedin',
        url: `https://www.linkedin.com/in/${profile.publicIdentifier}`,
      });
    }
    
    // Could extract other social links from profile if available
    
    return links.length > 0 ? links : undefined;
  }
  
  /**
   * Extract skills from headline and summary
   * This is a simplified implementation that extracts keywords
   */
  private extractSkills(profile: LinkedInProfile): string[] {
    const skills: string[] = [];
    
    // Extract skill keywords from LinkedIn languages
    if (profile.languages && profile.languages.length > 0) {
      // Only add actual languages (not programming languages)
      const actualLanguages = profile.languages.filter(lang => 
        !['CSS', 'HTML', 'JavaScript', 'Objective C', 'Processing', 'Arduino', 'Elixir'].includes(lang),
      );
      skills.push(...actualLanguages);
    }
    
    // Could use more sophisticated NLP techniques to extract skills from text
    
    return skills;
  }
}