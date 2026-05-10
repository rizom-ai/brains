import type { BaseEntity } from "@brains/plugins";

export function buildFallbackExcerpt(entity: BaseEntity): string {
  return (
    entity.content
      .replace(/^---[\s\S]*?---\s*/m, "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("#")) ?? ""
  );
}
