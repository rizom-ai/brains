import { BaseFormatter } from "./base";
import { z } from "zod";

const createEntityResponseSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export class CreateEntityResponseFormatter extends BaseFormatter {
  format(data: unknown): string {
    const parsed = createEntityResponseSchema.safeParse(data);
    if (!parsed.success) {
      return JSON.stringify(data, null, 2);
    }

    const response = parsed.data;
    const parts: string[] = [];

    parts.push(
      `✅ Created ${response.entityType}: **${response.title ?? response.id}**`,
    );

    if (response.tags && response.tags.length > 0) {
      parts.push(`Tags: ${response.tags.map((t) => `\`${t}\``).join(" ")}`);
    }

    return parts.join("\n");
  }

  canFormat(data: unknown): boolean {
    return createEntityResponseSchema.safeParse(data).success;
  }
}
