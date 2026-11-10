import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

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

type ConsoleJumpDestinationsRequestSchema = z.ZodObject<{
  permissionLevel: z.ZodEnum<{
    public: "public";
    trusted: "trusted";
    admin: "admin";
  }>;
}>;

/** Who is asking the palette, so a surface offers only what they may open. */
export const consoleJumpDestinationsRequestSchema: ConsoleJumpDestinationsRequestSchema =
  z.object({
    permissionLevel: z.enum(["public", "trusted", "admin"]),
  });

/** One page a surface offers in the ⌘K palette. */
export const consoleJumpDestinationSchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  sub: z.ZodOptional<z.ZodString>;
  href: z.ZodString;
  primary: z.ZodOptional<z.ZodBoolean>;
  keywords: z.ZodOptional<z.ZodArray<z.ZodString>>;
}> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Where it lives, e.g. "Work" or "Library". */
  sub: z.string().optional(),
  href: z.string().min(1),
  /** Offered before anything is typed; otherwise only on a matching search. */
  primary: z.boolean().optional(),
  /** Extra words a search may match, e.g. "people" for Administration. */
  keywords: z.array(z.string()).optional(),
});

export type ConsoleJumpDestination = z.output<
  typeof consoleJumpDestinationSchema
>;

type ConsoleJumpDestinationsResponseSchema = z.ZodArray<
  typeof consoleJumpDestinationSchema
>;

/** The destinations one surface offers the caller. */
export const consoleJumpDestinationsResponseSchema: ConsoleJumpDestinationsResponseSchema =
  z.array(consoleJumpDestinationSchema);

/** Collected by the ⌘K palette: every surface answers with what it offers. */
export const consoleJumpDestinationsContract: BusContract<
  ConsoleJumpDestinationsRequestSchema,
  ConsoleJumpDestinationsResponseSchema,
  "collect"
> = defineBusContract({
  channel: "console:jump-destinations",
  request: consoleJumpDestinationsRequestSchema,
  response: consoleJumpDestinationsResponseSchema,
  delivery: "collect",
});
