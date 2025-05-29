// TODO: This file will be removed after the profile note migration is complete.
// It's kept temporarily for backward compatibility and migration purposes.

import { z } from 'zod';

// Define schemas for complex JSON types
export const linkedInProfileDateInfoSchema = z.object({
  day: z.number().nullable(),
  month: z.number().nullable(),
  year: z.number().nullable(),
});

export const linkedInProfileExperienceSchema = z.object({
  starts_at: linkedInProfileDateInfoSchema,
  ends_at: linkedInProfileDateInfoSchema.nullable(),
  company: z.string(),
  company_linkedin_profile_url: z.string().nullable(),
  company_facebook_profile_url: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  logo_url: z.string().nullable(),
});

export const linkedInProfileEducationSchema = z.object({
  starts_at: linkedInProfileDateInfoSchema,
  ends_at: linkedInProfileDateInfoSchema.nullable(),
  field_of_study: z.string().nullable(),
  degree_name: z.string().nullable(),
  school: z.string(),
  school_linkedin_profile_url: z.string().nullable(),
  school_facebook_profile_url: z.string().nullable(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  grade: z.string().nullable(),
  activities_and_societies: z.string().nullable(),
});

export const linkedInProfileLanguageProficiencySchema = z.object({
  name: z.string(),
  proficiency: z.string(),
});

export const linkedInProfilePublicationSchema = z.object({
  name: z.string(),
  publisher: z.string(),
  published_on: linkedInProfileDateInfoSchema,
  description: z.string().nullable(),
  url: z.string().nullable(),
});

export const linkedInProfileAwardSchema = z.object({
  title: z.string(),
  issuer: z.string(),
  issued_on: linkedInProfileDateInfoSchema,
  description: z.string().nullable(),
});

export const linkedInProfileProjectSchema = z.object({
  starts_at: linkedInProfileDateInfoSchema,
  ends_at: linkedInProfileDateInfoSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string().nullable(),
});

export const linkedInProfileVolunteerWorkSchema = z.object({
  starts_at: linkedInProfileDateInfoSchema,
  ends_at: linkedInProfileDateInfoSchema.nullable(),
  title: z.string(),
  cause: z.string().nullable(),
  company: z.string().nullable(),
  company_linkedin_profile_url: z.string().nullable(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
});

// Define base schemas since the profile table no longer exists
export const baseProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  location: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  occupation: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  yearsExperience: z.number().nullable().optional(),
  about: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()).optional(),
  updatedAt: z.string().or(z.date()).optional(),
  
  // LinkedIn profile specific fields
  fullName: z.string().optional(),
  profilePicUrl: z.string().optional(),
  headline: z.string().optional(),
  summary: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  countryFullName: z.string().optional(),
  publicIdentifier: z.string().optional(),
});

export const baseInsertProfileSchema = baseProfileSchema.omit({ 
  createdAt: true, 
  updatedAt: true, 
}).extend({
  // Additional fields for insert can be defined here
});

export const baseUpdateProfileSchema = baseProfileSchema.partial().omit({
  createdAt: true,
  updatedAt: true,
});

export const baseSelectProfileSchema = baseProfileSchema;

// Fix JSON field types by explicitly defining the correct types
export const linkedInInsertProfileSchema = baseInsertProfileSchema.extend({
  experiences: z.array(linkedInProfileExperienceSchema).nullable().optional(),
  education: z.array(linkedInProfileEducationSchema).nullable().optional(),
  languages: z.array(z.string()).nullable().optional(),
  languagesAndProficiencies: z.array(linkedInProfileLanguageProficiencySchema).nullable().optional(),
  accomplishmentPublications: z.array(linkedInProfilePublicationSchema).nullable().optional(),
  accomplishmentHonorsAwards: z.array(linkedInProfileAwardSchema).nullable().optional(),
  accomplishmentProjects: z.array(linkedInProfileProjectSchema).nullable().optional(),
  volunteerWork: z.array(linkedInProfileVolunteerWorkSchema).nullable().optional(),
  embedding: z.array(z.number()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export const linkedInUpdateProfileSchema = baseUpdateProfileSchema.extend({
  experiences: z.array(linkedInProfileExperienceSchema).nullable().optional(),
  education: z.array(linkedInProfileEducationSchema).nullable().optional(),
  languages: z.array(z.string()).nullable().optional(),
  languagesAndProficiencies: z.array(linkedInProfileLanguageProficiencySchema).nullable().optional(),
  accomplishmentPublications: z.array(linkedInProfilePublicationSchema).nullable().optional(),
  accomplishmentHonorsAwards: z.array(linkedInProfileAwardSchema).nullable().optional(),
  accomplishmentProjects: z.array(linkedInProfileProjectSchema).nullable().optional(),
  volunteerWork: z.array(linkedInProfileVolunteerWorkSchema).nullable().optional(),
  embedding: z.array(z.number()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export const linkedInSelectProfileSchema = baseSelectProfileSchema.extend({
  experiences: z.array(linkedInProfileExperienceSchema).nullable(),
  education: z.array(linkedInProfileEducationSchema).nullable(),
  languages: z.array(z.string()).nullable(),
  languagesAndProficiencies: z.array(linkedInProfileLanguageProficiencySchema).nullable(),
  accomplishmentPublications: z.array(linkedInProfilePublicationSchema).nullable(),
  accomplishmentHonorsAwards: z.array(linkedInProfileAwardSchema).nullable(),
  accomplishmentProjects: z.array(linkedInProfileProjectSchema).nullable(),
  volunteerWork: z.array(linkedInProfileVolunteerWorkSchema).nullable(),
  embedding: z.array(z.number()).nullable(),
  tags: z.array(z.string()).nullable(),
});

// Type definitions based on the LinkedIn schemas
export type LinkedInProfile = z.infer<typeof linkedInSelectProfileSchema>;
export type NewLinkedInProfile = z.infer<typeof linkedInInsertProfileSchema>;

// Define interfaces for LinkedIn profile sub-elements
export interface LinkedInProfileDateInfo {
  day: number | null;
  month: number | null;
  year: number | null;
}

export interface LinkedInProfileExperience {
  starts_at: LinkedInProfileDateInfo;
  ends_at: LinkedInProfileDateInfo | null;
  company: string;
  company_linkedin_profile_url: string | null;
  company_facebook_profile_url: string | null;
  title: string;
  description: string | null;
  location: string | null;
  logo_url: string | null;
}

export interface LinkedInProfileEducation {
  starts_at: LinkedInProfileDateInfo;
  ends_at: LinkedInProfileDateInfo | null;
  field_of_study: string | null;
  degree_name: string | null;
  school: string;
  school_linkedin_profile_url: string | null;
  school_facebook_profile_url: string | null;
  description: string | null;
  logo_url: string | null;
  grade: string | null;
  activities_and_societies: string | null;
}

export interface LinkedInProfileLanguageProficiency {
  name: string;
  proficiency: string;
}

export interface LinkedInProfilePublication {
  name: string;
  publisher: string;
  published_on: LinkedInProfileDateInfo;
  description: string | null;
  url: string | null;
}

export interface LinkedInProfileAward {
  title: string;
  issuer: string;
  issued_on: LinkedInProfileDateInfo;
  description: string | null;
}

export interface LinkedInProfileProject {
  starts_at: LinkedInProfileDateInfo;
  ends_at: LinkedInProfileDateInfo | null;
  title: string;
  description: string | null;
  url: string | null;
}

export interface LinkedInProfileVolunteerWork {
  starts_at: LinkedInProfileDateInfo;
  ends_at: LinkedInProfileDateInfo | null;
  title: string;
  cause: string | null;
  company: string | null;
  company_linkedin_profile_url: string | null;
  description: string | null;
  logo_url: string | null;
}

// Validation function
export function validateLinkedInProfile(data: unknown): NewLinkedInProfile {
  return linkedInInsertProfileSchema.parse(data);
}
