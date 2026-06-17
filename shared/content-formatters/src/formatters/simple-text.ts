import { ResponseFormatter } from "./base";
import { z } from "zod";

interface SimpleTextResponse {
  message: string;
}

const simpleTextResponseSchema: z.ZodType<SimpleTextResponse> = z.object({
  message: z.string(),
});

export class SimpleTextResponseFormatter extends ResponseFormatter<SimpleTextResponse> {
  format(data: SimpleTextResponse): string {
    const parsed = simpleTextResponseSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data.message;
    }
    return JSON.stringify(data, null, 2);
  }

  canFormat(data: unknown): boolean {
    return simpleTextResponseSchema.safeParse(data).success;
  }
}
