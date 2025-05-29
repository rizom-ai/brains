/**
 * Zod schemas for Website Identity data
 * 
 * These schemas provide validation and type inference for website identity data,
 * which is used to maintain consistent branding and content across the website.
 */

import { z } from 'zod';

/**
 * Website Identity Schema - Flat structure for all identity data
 */
export const WebsiteIdentitySchema = z.object({
  // Personal data
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  company: z.string(),
  location: z.string(),
  occupation: z.string(),
  industry: z.string(),
  yearsExperience: z.number(),
  
  // Creative content
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  tagline: z.string().min(1, 'Tagline is required'),
  pitch: z.string(),
  uniqueValue: z.string(),
  keyAchievements: z.array(z.string()),
  
  // Brand identity - tone
  formality: z.enum(['casual', 'conversational', 'professional', 'academic']),
  personality: z.array(z.string()).min(1, 'At least one personality trait is required'),
  emotion: z.string().min(1, 'Emotion is required'),
  
  // Brand identity - content style
  writingStyle: z.string().min(1, 'Writing style description is required'),
  sentenceLength: z.enum(['short', 'medium', 'varied', 'long']),
  vocabLevel: z.enum(['simple', 'moderate', 'advanced', 'technical']),
  useJargon: z.boolean(),
  useHumor: z.boolean(),
  useStories: z.boolean(),
  
  // Brand identity - values
  coreValues: z.array(z.string()).min(1, 'At least one core value is required'),
  targetAudience: z.array(z.string()).min(1, 'At least one target audience is required'),
  painPoints: z.array(z.string()).min(1, 'At least one pain point is required'),
  desiredAction: z.string().min(1, 'Desired action is required'),
});

// Export type derived from schema
export type WebsiteIdentityData = z.infer<typeof WebsiteIdentitySchema>;

/**
 * Schema for tools related to website identity
 */
export const GenerateWebsiteIdentityToolSchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});

export const GetWebsiteIdentityToolSchema = z.object({});