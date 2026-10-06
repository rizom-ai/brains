import { createTestEntityAccess } from "@brains/plugins/test";
/** Real host-issued edits, with the installed FAQ declaration's durable identity. */
export function faqAccess(
  entityService: Parameters<typeof createTestEntityAccess>[0]["entityService"],
): ReturnType<typeof createTestEntityAccess> {
  return createTestEntityAccess({
    entityService,
    ownedTypes: ["faq"],
    owner: "@brains/faq",
    declarationId: "capture",
  });
}
