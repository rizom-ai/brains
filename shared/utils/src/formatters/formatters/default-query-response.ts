import type { ContentFormatter } from "../types";
import type { DefaultQueryResponse } from "@brains/types";

/**
 * Default query response formatter
 *
 * Formats DefaultQueryResponse objects into human-readable strings,
 * extracting just the message field for interface display.
 */
export class DefaultQueryResponseFormatter
  implements ContentFormatter<DefaultQueryResponse>
{
  format(response: DefaultQueryResponse): string {
    return response.message;
  }

  parse(content: string): DefaultQueryResponse {
    return {
      message: content.trim(),
    };
  }
}
