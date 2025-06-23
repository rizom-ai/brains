import { ResponseFormatter } from "./base";
import { createEntityResponseSchema, type CreateEntityResponse } from "@brains/types";

export class CreateEntityResponseFormatter extends ResponseFormatter<CreateEntityResponse> {
  format(data: CreateEntityResponse): string {
    const parsed = createEntityResponseSchema.safeParse(data);
    if (!parsed.success) {
      return JSON.stringify(data, null, 2);
    }

    const response = parsed.data;
    
    if (response.success) {
      return `✅ ${response.message}${response.entityId ? ` (ID: ${response.entityId})` : ''}`;
    } else {
      return `❌ ${response.message}`;
    }
  }

  canFormat(data: unknown): boolean {
    return createEntityResponseSchema.safeParse(data).success;
  }
}
