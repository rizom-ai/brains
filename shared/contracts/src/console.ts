import { z } from "@brains/utils/zod";

/**
 * Console-chrome contract shared by the surface derivation (in
 * `@brains/plugins`, which owns the web-route registry the doors derive from)
 * and the strip rendering (in `@brains/console-theme`, which stays a token
 * sheet with no knowledge of plugins or permissions).
 */

/** One door in the console strip's surface nav. */
export interface ConsoleSurface {
  id: string;
  label: string;
  href: string;
  isActive: boolean;
  /** Omitted for public surfaces that do not require authenticated state. */
  requiresActiveSession?: true | undefined;
}

/** Console permission levels, lowest to highest. */
export type SurfacePermissionLevel = "public" | "trusted" | "admin";

/** Who is asking the palette, so a surface offers only what they may open. */
export interface ConsoleJumpDestinationsRequest {
  permissionLevel: SurfacePermissionLevel;
}

/** One page a surface offers in the ⌘K palette. */
export interface ConsoleJumpDestination {
  id: string;
  title: string;
  /** Where it lives, e.g. "Work" or "Library". */
  sub?: string | undefined;
  href: string;
  /** Offered before anything is typed; otherwise only on a matching search. */
  primary?: boolean | undefined;
  /** Extra words a search may match, e.g. "people" for Administration. */
  keywords?: string[] | undefined;
}

export const consoleJumpDestinationSchema: z.ZodType<
  ConsoleJumpDestination,
  unknown
> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  sub: z.string().optional(),
  href: z.string().min(1),
  primary: z.boolean().optional(),
  keywords: z.array(z.string()).optional(),
});
