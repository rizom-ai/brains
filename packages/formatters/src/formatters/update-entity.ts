import { BaseFormatter } from "./base";
import { z } from "zod";

const updateEntityResponseSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string().optional(),
  updated: z.union([z.string(), z.number(), z.date()]),
  changes: z.array(z.string()).optional(),
});

export class UpdateEntityResponseFormatter extends BaseFormatter {
  format(data: unknown): string {
    const parsed = updateEntityResponseSchema.safeParse(data);
    if (!parsed.success) {
      return JSON.stringify(data, null, 2);
    }

    const response = parsed.data;
    const parts: string[] = [];

    parts.push(
      `✅ Updated ${response.entityType}: **${response.title ?? response.id}**`,
    );

    if (response.changes && response.changes.length > 0) {
      parts.push("\nChanges:");
      response.changes.forEach((change) => {
        parts.push(`- ${change}`);
      });
    }

    return parts.join("\n");
  }

  canFormat(data: unknown): boolean {
    return updateEntityResponseSchema.safeParse(data).success;
  }
}
