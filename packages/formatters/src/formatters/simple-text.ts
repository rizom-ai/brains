import { BaseFormatter } from "./base";
import { z } from "zod";

const simpleTextResponseSchema = z.object({
  message: z.string(),
});

export class SimpleTextResponseFormatter extends BaseFormatter {
  format(data: unknown): string {
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
