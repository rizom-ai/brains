import {
  simpleTextResponseSchema,
  type SimpleTextResponse,
} from "@brains/contracts";
import { ResponseFormatter } from "./base";

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
