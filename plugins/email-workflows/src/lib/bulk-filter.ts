import type { InboundEmail } from "@brains/contracts";

const bulkPrecedenceValues = new Set(["bulk", "list", "junk"]);

export function isDeterministicBulkMail(email: InboundEmail): boolean {
  const precedence = email.headers.precedence?.trim().toLowerCase();
  return Boolean(
    email.headers.listUnsubscribe &&
    precedence &&
    bulkPrecedenceValues.has(precedence),
  );
}
