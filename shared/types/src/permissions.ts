import { z } from "zod";

/**
 * User permission level schema
 */
export const UserPermissionLevelSchema = z.enum([
  "anchor",
  "trusted", 
  "public",
]);

export type UserPermissionLevel = z.infer<typeof UserPermissionLevelSchema>;