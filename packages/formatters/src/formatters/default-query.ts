import { ResponseFormatter } from "./base";
import { z } from "zod";

const defaultQueryResponseSchema = z.object({
  message: z.string(),
  sources: z.array(z.string()).optional().default([]),
  relatedTopics: z.array(z.string()).optional().default([]),
});

type DefaultQueryResponse = z.infer<typeof defaultQueryResponseSchema>;

export class DefaultQueryResponseFormatter extends ResponseFormatter<DefaultQueryResponse> {
  format(data: DefaultQueryResponse): string {
    const parsed = defaultQueryResponseSchema.safeParse(data);
    if (!parsed.success) {
      return JSON.stringify(data, null, 2);
    }

    const response = parsed.data;
    const parts: string[] = [];

    // Main message
    parts.push(response.message);

    // Sources
    if (response.sources.length > 0) {
      parts.push("\n**Sources:**");
      response.sources.forEach((source) => {
        parts.push(`- ${source}`);
      });
    }

    // Related topics
    if (response.relatedTopics.length > 0) {
      parts.push("\n**Related Topics:**");
      parts.push(
        response.relatedTopics.map((topic) => `\`${topic}\``).join(" "),
      );
    }

    return parts.join("\n");
  }

  canFormat(data: unknown): boolean {
    return defaultQueryResponseSchema.safeParse(data).success;
  }
}
