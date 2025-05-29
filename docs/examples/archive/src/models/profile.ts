import { z } from 'zod';

// Define the social media link schema
export const socialLinkSchema = z.object({
  platform: z.string(),
  url: z.string().url(),
});

// Define the contact information schema
export const contactInfoSchema = z.object({
  phone: z.string().optional(),
  website: z.string().url().optional(),
  social: z.array(socialLinkSchema).optional(),
});

// Define the location schema
export const locationSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

// Define the experience schema
export const experienceSchema = z.object({
  title: z.string(),
  organization: z.string(),
  description: z.string().optional(),
  startDate: z.date(),
  endDate: z.date().optional(), // null means current
  location: z.string().optional(),
});

// Define the education schema
export const educationSchema = z.object({
  institution: z.string(),
  degree: z.string().optional(),
  field: z.string().optional(),
  startDate: z.date(),
  endDate: z.date().optional(),
  description: z.string().optional(),
});

// Define the language schema
export const languageSchema = z.object({
  name: z.string(),
  proficiency: z.enum(['basic', 'intermediate', 'fluent', 'native']),
});

// Define the project schema
export const projectSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  url: z.string().url().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

// Define the publication schema
export const publicationSchema = z.object({
  title: z.string(),
  publisher: z.string().optional(),
  date: z.date().optional(),
  url: z.string().url().optional(),
  description: z.string().optional(),
});

// TODO: After profile note migration is complete, remove backward compatibility with old schema 
// and simplify the profile model to just use this schema directly.

// Define the main profile schema
export const profileSchema = z.object({
  // Basic information
  id: z.string().uuid().optional(), // Generated if not provided
  displayName: z.string().min(1),
  email: z.string().email(),
  avatar: z.string().url().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  
  // Contact information
  contact: contactInfoSchema.optional(),
  
  // Location information
  location: locationSchema.optional(),
  
  // Work experiences - simplified
  experiences: z.array(experienceSchema).optional(),
  
  // Education - simplified
  education: z.array(educationSchema).optional(),
  
  // Skills & expertise
  skills: z.array(z.string()).optional(),
  
  // Languages - simplified
  languages: z.array(languageSchema).optional(),
  
  // Projects - simplified
  projects: z.array(projectSchema).optional(),
  
  // Publications - simplified
  publications: z.array(publicationSchema).optional(),

  // Custom fields for our application
  tags: z.array(z.string()).optional(),
  fields: z.record(z.string()).optional(), // For any custom fields we want to add
});

// Type definitions for the new profile schema
export type Profile = z.infer<typeof profileSchema>;

// Enhanced profile with auto-generated tags and related notes
export interface EnhancedProfile extends Profile {
  relatedNotes?: Array<{
    id: string;
    title: string;
    similarity: number;
  }>;
}

// For backward compatibility during migration
// TODO: Remove these exports after migration is complete
export const insertProfileSchema = profileSchema;
export const selectProfileSchema = profileSchema;
export const updateProfileSchema = profileSchema;
export type NewProfile = Profile;

// Define interfaces for the profile sub-elements for easier use in code
export interface SocialLink {
  platform: string;
  url: string;
}

export interface ContactInfo {
  phone?: string;
  website?: string;
  social?: SocialLink[];
}

export interface LocationInfo {
  city?: string;
  state?: string;
  country?: string;
}

export interface Experience {
  title: string;
  organization: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
}

export interface Education {
  institution: string;
  degree?: string;
  field?: string;
  startDate: Date;
  endDate?: Date;
  description?: string;
}

export interface Language {
  name: string;
  proficiency: 'basic' | 'intermediate' | 'fluent' | 'native';
}

export interface Project {
  title: string;
  description?: string;
  url?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface Publication {
  title: string;
  publisher?: string;
  date?: Date;
  url?: string;
  description?: string;
}

// Validation function
export function validateProfile(data: unknown): Profile {
  return profileSchema.parse(data);
}

// For backward compatibility during migration
// TODO: Remove after migration is complete
export function validateNewProfile(data: unknown): NewProfile {
  return profileSchema.parse(data);
}