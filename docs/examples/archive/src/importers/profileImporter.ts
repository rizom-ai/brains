import * as fs from 'fs';

import * as yaml from 'js-yaml';

import { MCPProfileContext } from '@/contexts/profiles/MCPProfileContext';
import type { LinkedInProfile } from '@/models/linkedInProfile';

import logger from '../utils/logger';

export class ProfileImporter {
  private profileContext: MCPProfileContext;

  constructor() {
    // Use getInstance for default initialization instead of createFresh
    this.profileContext = MCPProfileContext.getInstance();
  }

  /**
   * Import a profile from a YAML file
   */
  async importProfileFromYaml(filePath: string): Promise<string> {
    try {
      logger.info(`Importing profile from ${filePath}`, { context: 'ProfileImporter' });
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const linkedInProfileData = yaml.load(fileContent) as Record<string, unknown>;
      
      // Log the YAML data for debugging
      logger.debug('YAML profile data loaded', { context: 'ProfileImporter' });
      
      // First convert the YAML data to LinkedIn profile format
      const linkedInProfile = this.transformYamlToLinkedInProfile(linkedInProfileData) as LinkedInProfile;
      logger.debug('Converted to LinkedIn profile format', { context: 'ProfileImporter' });
      
      // Then migrate the LinkedIn profile to our new format
      logger.debug('Attempting to migrate via ProfileContext...', { context: 'ProfileImporter' });
      const success = await this.profileContext.migrateLinkedInProfile(linkedInProfile);
      logger.debug(`Migration result: ${success ? 'success' : 'failure'}`, { context: 'ProfileImporter' });
      
      if (!success) {
        throw new Error('Failed to save profile');
      }
      
      const profile = await this.profileContext.getProfile();
      const profileId = profile?.id || 'unknown';
      
      logger.info(`Successfully imported profile with ID: ${profileId}`, { context: 'ProfileImporter' });
      return profileId;
    } catch (error) {
      logger.error('Error importing profile from YAML:', { error, context: 'ProfileImporter' });
      throw error;
    }
  }

  /**
   * Transform YAML data to LinkedIn profile format
   */
  private transformYamlToLinkedInProfile(data: Record<string, unknown>): Record<string, unknown> {
    // Convert snake_case from YAML to camelCase for the LinkedIn profile format
    return {
      id: data['id'] || `linkedin-${Date.now()}`,
      publicIdentifier: data['public_identifier'],
      profilePicUrl: data['profile_pic_url'],
      backgroundCoverImageUrl: data['background_cover_image_url'],
      firstName: data['first_name'],
      lastName: data['last_name'],
      fullName: data['full_name'],
      followerCount: data['follower_count'],
      occupation: data['occupation'],
      headline: data['headline'],
      summary: data['summary'],
      country: data['country'],
      countryFullName: data['country_full_name'],
      city: data['city'],
      state: data['state'],
      experiences: data['experiences'],
      education: data['education'],
      languages: data['languages'],
      languagesAndProficiencies: data['languages_and_proficiencies'],
      accomplishmentPublications: data['accomplishment_publications'],
      accomplishmentHonorsAwards: data['accomplishment_honors_awards'],
      accomplishmentProjects: data['accomplishment_projects'],
      volunteerWork: data['volunteer_work'],
    };
  }
}
