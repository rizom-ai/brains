/**
 * Type declarations for Astro Content Collections API
 * These provide TypeScript support for the Astro-specific imports
 */

declare module 'astro:content' {
  import type { z } from 'zod';

  /**
   * Define a collection with a schema
   */
  export function defineCollection<T extends z.ZodType>(options: { 
    type: 'data' | 'content';
    schema: T;
  }): {
    type: 'data' | 'content';
    schema: T;
  };

  /**
   * Define the collections object
   */
  export const collections: Record<string, ReturnType<typeof defineCollection>>;
}