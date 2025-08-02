import { ResponseFormatter } from "./base";
import {
  defaultQueryResponseSchema,
  type DefaultQueryResponse,
} from "../../response-types";

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

    // Summary
    if (response.summary) {
      parts.push(`\n*${response.summary}*`);
    }

    // Sources
    if (response.sources && response.sources.length > 0) {
      parts.push("\n**Sources:**");
      response.sources.forEach((source) => {
        const relevanceStr = source.relevance
          ? ` (${Math.round(source.relevance * 100)}% relevant)`
          : "";
        const excerptStr = source.excerpt ? `\n  > ${source.excerpt}` : "";
        parts.push(
          `- [${source.type}] ${source.id}${relevanceStr}${excerptStr}`,
        );
      });
    }

    // Topics
    if (response.topics && response.topics.length > 0) {
      parts.push("\n**Related Topics:**");
      parts.push(response.topics.map((topic) => `\`${topic}\``).join(" "));
    }

    return parts.join("\n");
  }

  canFormat(data: unknown): boolean {
    return defaultQueryResponseSchema.safeParse(data).success;
  }
}
