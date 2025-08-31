import { ResponseFormatter } from "./base";
import { z } from "../../zod";

const simpleTextResponseSchema = z.object({
  message: z.string(),
});

type SimpleTextResponse = z.infer<typeof simpleTextResponseSchema>;

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
