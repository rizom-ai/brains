import { z } from "@brains/utils/zod";
import type { Tool } from "../interfaces";

export type ListToolOutput<Data> =
  { success: true; data: Data } | { success: false; error: string };

/** Standard success/error envelope for read-only list tools. */
export function createListToolOutputSchema<Data>(
  dataSchema: z.ZodType<Data, Data>,
): z.ZodType<ListToolOutput<Data>, ListToolOutput<Data>> {
  return z.discriminatedUnion("success", [
    z.strictObject({ success: z.literal(true), data: dataSchema }),
    z.strictObject({ success: z.literal(false), error: z.string().min(1) }),
  ]);
}

interface AdminListToolOptions<Filter, FilterInput, Data> {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
  filterSchema: z.ZodType<Filter, FilterInput>;
  outputSchema: z.ZodType<ListToolOutput<Data>, ListToolOutput<Data>>;
  errors: { permission: string; invalidFilter: string; failed: string };
  list: (filter: Filter) => Promise<Data>;
}

/**
 * Admin-gated read-only list tool: permission check, one filter parse at the
 * edge, and the standard envelope around the provided list call.
 */
export function createAdminListTool<Filter, FilterInput, Data>(
  options: AdminListToolOptions<Filter, FilterInput, Data>,
): Tool<ListToolOutput<Data>> {
  return {
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    visibility: "admin",
    sideEffects: "none",
    handler: async (rawInput, context): Promise<ListToolOutput<Data>> => {
      if (context.userPermissionLevel !== "admin") {
        return { success: false, error: options.errors.permission };
      }
      const filter = options.filterSchema.safeParse(rawInput);
      if (!filter.success) {
        return { success: false, error: options.errors.invalidFilter };
      }
      try {
        return { success: true, data: await options.list(filter.data) };
      } catch {
        return { success: false, error: options.errors.failed };
      }
    },
  };
}
