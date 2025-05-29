import { MCPNoteContext } from '@/contexts/notes/MCPNoteContext';
import type { Note } from '@/models/note';
import type { Profile } from '@/models/profile';
import { TagExtractor } from '@/utils/tagExtractor';

/**
 * Dependencies for ProfileNoteAdapter
 * 
 * TODO: This creates a direct dependency between ProfileContext and NoteContext.
 * Should be refactored to use messaging layer for cross-context communication.
 */
export interface ProfileNoteAdapterDependencies {
  noteContext: MCPNoteContext;
  tagExtractor: TagExtractor;
}

/**
 * ProfileNoteAdapter
 * 
 * Specialized adapter for storing profile data as a note
 * Simplifies profile storage to a single profile per personal brain
 */
export class ProfileNoteAdapter {
  // Singleton instance management
  private static instance: ProfileNoteAdapter | null = null;

  // Fixed ID for the single profile
  public static readonly PROFILE_NOTE_ID = 'user-profile';

  private noteContext: MCPNoteContext;
  private tagExtractor: TagExtractor;

  private constructor(dependencies: ProfileNoteAdapterDependencies) {
    this.noteContext = dependencies.noteContext;
    this.tagExtractor = dependencies.tagExtractor;
  }

  public static getInstance(dependencies?: ProfileNoteAdapterDependencies): ProfileNoteAdapter {
    if (!ProfileNoteAdapter.instance) {
      // If dependencies are not provided, use default instances
      if (!dependencies) {
        const noteContext = MCPNoteContext.getInstance();
        const tagExtractor = TagExtractor.getInstance();
        dependencies = { noteContext, tagExtractor };
      }
      ProfileNoteAdapter.instance = new ProfileNoteAdapter(dependencies);
    }
    return ProfileNoteAdapter.instance;
  }

  public static resetInstance(): void {
    ProfileNoteAdapter.instance = null;
  }

  public static createFresh(dependencies?: ProfileNoteAdapterDependencies): ProfileNoteAdapter {
    // If dependencies are not provided, use default instances
    if (!dependencies) {
      const noteContext = MCPNoteContext.getInstance();
      const tagExtractor = TagExtractor.getInstance();
      dependencies = { noteContext, tagExtractor };
    }
    return new ProfileNoteAdapter(dependencies);
  }

  /**
   * Get the user profile from the note store
   */
  async getProfile(): Promise<Profile | null> {
    const note = await this.noteContext.getNoteById(ProfileNoteAdapter.PROFILE_NOTE_ID);
    if (!note) {
      return null;
    }

    return this.convertNoteToProfile(note);
  }

  /**
   * Save the user profile as a note
   */
  async saveProfile(profile: Profile): Promise<boolean> {
    try {
      const noteData = await this.convertProfileToNote(profile);
      const existingNote = await this.noteContext.getNoteById(ProfileNoteAdapter.PROFILE_NOTE_ID);

      if (existingNote) {
        // Update existing note
        return this.noteContext.updateNote(ProfileNoteAdapter.PROFILE_NOTE_ID, noteData);
      } else {
        // Create new note
        const result = await this.noteContext.createNote({
          id: ProfileNoteAdapter.PROFILE_NOTE_ID,
          ...noteData,
        });

        return !!result;
      }
    } catch (_error) {
      return false;
    }
  }

  /**
   * Convert a note to profile format
   */
  convertNoteToProfile(note: Note): Profile | null {
    try {
      // Get the JSON data from the note's metadata section
      const metadataMatch = note.content.match(/```json\n([\s\S]*?)\n```/);

      if (metadataMatch && metadataMatch[1]) {
        // Parse the profile data from the JSON block
        const profileData = JSON.parse(metadataMatch[1]);
        return profileData;
      }

      // Fallback: try to parse the entire content as JSON (for backward compatibility)
      return JSON.parse(note.content);
    } catch (_error) {
      return null;
    }
  }

  /**
   * Convert profile data to note format with markdown
   */
  async convertProfileToNote(profile: Profile): Promise<Partial<Note>> {
    // Create a markdown representation of the profile
    const markdownContent = this.createProfileMarkdown(profile);

    // Store the full profile data as JSON in a code block at the end
    const profileJson = JSON.stringify(profile, null, 2);
    const content = `${markdownContent}\n\n<!-- Profile data -->\n\`\`\`json\n${profileJson}\n\`\`\``;

    // Use the injected tag extractor to get tags from the markdown content
    const extractedTags = await this.tagExtractor.extractTags(markdownContent);

    // Combine extracted tags with any explicitly defined tags in the profile
    const tags = [
      ...(profile.tags || []),
      ...extractedTags,
    ];

    return {
      title: `Profile: ${profile.displayName}`,
      content,
      tags: [...new Set(tags)], // Remove duplicates
      source: 'profile',
    };
  }

  /**
   * Create a markdown representation of the profile
   */
  private createProfileMarkdown(profile: Profile): string {
    const sections = [];

    // Header with name and headline
    sections.push(`# ${profile.displayName}`);
    if (profile.headline) {
      sections.push(`*${profile.headline}*`);
    }
    sections.push('');

    // Avatar/image if available
    if (profile.avatar) {
      sections.push(`![Profile Photo](${profile.avatar})`);
      sections.push('');
    }

    // Contact information
    sections.push('## Contact');
    sections.push(`- Email: ${profile.email}`);
    if (profile.contact?.phone) {
      sections.push(`- Phone: ${profile.contact.phone}`);
    }
    if (profile.contact?.website) {
      sections.push(`- Website: [${profile.contact.website}](${profile.contact.website})`);
    }
    if (profile.contact?.social && profile.contact.social.length > 0) {
      sections.push('- Social:');
      profile.contact.social.forEach(social => {
        sections.push(`  - [${social.platform}](${social.url})`);
      });
    }
    sections.push('');

    // Location information
    if (profile.location) {
      const locationParts = [
        profile.location.city,
        profile.location.state,
        profile.location.country,
      ].filter(Boolean);

      if (locationParts.length > 0) {
        sections.push(`- Location: ${locationParts.join(', ')}`);
        sections.push('');
      }
    }

    // Summary
    if (profile.summary) {
      sections.push('## Summary');
      sections.push(profile.summary);
      sections.push('');
    }

    // Skills
    if (profile.skills && profile.skills.length > 0) {
      sections.push('## Skills');
      const skillsList = profile.skills.map(skill => `- ${skill}`).join('\n');
      sections.push(skillsList);
      sections.push('');
    }

    // Experience
    if (profile.experiences && profile.experiences.length > 0) {
      sections.push('## Experience');
      profile.experiences.forEach(exp => {
        const startDate = exp.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        const endDate = exp.endDate ? exp.endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : 'Present';

        sections.push(`### ${exp.title} at ${exp.organization}`);
        sections.push(`*${startDate} - ${endDate}*${exp.location ? ` | ${exp.location}` : ''}`);

        if (exp.description) {
          sections.push('');
          sections.push(exp.description);
        }
        sections.push('');
      });
    }

    // Education
    if (profile.education && profile.education.length > 0) {
      sections.push('## Education');
      profile.education.forEach(edu => {
        const startDate = edu.startDate.toLocaleDateString('en-US', { year: 'numeric' });
        const endDate = edu.endDate ? edu.endDate.toLocaleDateString('en-US', { year: 'numeric' }) : 'Present';

        const degreeField = [edu.degree, edu.field].filter(Boolean).join(' in ');
        sections.push(`### ${degreeField ? `${degreeField} - ` : ''}${edu.institution}`);
        sections.push(`*${startDate} - ${endDate}*`);

        if (edu.description) {
          sections.push('');
          sections.push(edu.description);
        }
        sections.push('');
      });
    }

    // Languages
    if (profile.languages && profile.languages.length > 0) {
      sections.push('## Languages');
      profile.languages.forEach(lang => {
        sections.push(`- ${lang.name} (${lang.proficiency})`);
      });
      sections.push('');
    }

    // Projects
    if (profile.projects && profile.projects.length > 0) {
      sections.push('## Projects');
      profile.projects.forEach(proj => {
        sections.push(`### ${proj.title}`);

        if (proj.startDate || proj.endDate) {
          const startDate = proj.startDate ? proj.startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '';
          const endDate = proj.endDate ? proj.endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : 'Present';
          sections.push(`*${startDate ? `${startDate} - ` : ''}${endDate}*`);
        }

        if (proj.url) {
          sections.push(`[Project Link](${proj.url})`);
        }

        if (proj.description) {
          sections.push('');
          sections.push(proj.description);
        }
        sections.push('');
      });
    }

    // Publications
    if (profile.publications && profile.publications.length > 0) {
      sections.push('## Publications');
      profile.publications.forEach(pub => {
        sections.push(`### ${pub.title}`);

        const publisherDate = [
          pub.publisher,
          pub.date ? pub.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : null,
        ].filter(Boolean).join(' | ');

        if (publisherDate) {
          sections.push(`*${publisherDate}*`);
        }

        if (pub.url) {
          sections.push(`[Publication Link](${pub.url})`);
        }

        if (pub.description) {
          sections.push('');
          sections.push(pub.description);
        }
        sections.push('');
      });
    }

    // Custom fields if any
    if (profile.fields && Object.keys(profile.fields).length > 0) {
      sections.push('## Additional Information');
      Object.entries(profile.fields).forEach(([key, value]) => {
        sections.push(`- **${key}**: ${value}`);
      });
      sections.push('');
    }

    return sections.join('\n');
  }
}
