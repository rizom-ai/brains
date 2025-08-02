import { ResponseFormatter } from "./base";
import {
  updateEntityResponseSchema,
  type UpdateEntityResponse,
} from "@brains/plugins";

export class UpdateEntityResponseFormatter extends ResponseFormatter<UpdateEntityResponse> {
  format(data: UpdateEntityResponse): string {
    const parsed = updateEntityResponseSchema.safeParse(data);
    if (!parsed.success) {
      return JSON.stringify(data, null, 2);
    }

    const response = parsed.data;
    const parts: string[] = [];

    if (response.success) {
      parts.push(`✅ ${response.message} (ID: ${response.entityId})`);

      if (response.changes && response.changes.length > 0) {
        parts.push("\nChanges:");
        response.changes.forEach((change) => {
          parts.push(`- ${change}`);
        });
      }
    } else {
      parts.push(`❌ ${response.message}`);
    }

    return parts.join("\n");
  }

  canFormat(data: unknown): boolean {
    return updateEntityResponseSchema.safeParse(data).success;
  }
}
