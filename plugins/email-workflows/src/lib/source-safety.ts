import type { InboundEmail } from "@brains/contracts";
import type { RetainedMailClassification } from "../schemas/triage";

export function assertClassificationIsDerived(
  email: InboundEmail,
  classification: RetainedMailClassification,
): void {
  const generatedFields = [
    classification.title,
    classification.organization ?? "",
    ...classification.requestedActions,
    classification.summary,
  ].map(normalize);
  const output = generatedFields.join("\n");

  for (const fragment of sensitiveFragments(email)) {
    const normalizedFragment = normalize(fragment);
    if (
      generatedFields.includes(normalizedFragment) ||
      (normalizedFragment.length >= 8 && output.includes(normalizedFragment))
    ) {
      throw new Error("Mail classification copied source content");
    }
  }
}

function sensitiveFragments(email: InboundEmail): string[] {
  const exactValues = [
    email.messageId,
    email.threadId,
    email.subject,
    email.from.name,
    email.from.address,
    ...email.to.flatMap((recipient) => [recipient.name, recipient.address]),
    email.headers.listUnsubscribe,
    email.headers.autoSubmitted,
    email.headers.precedence,
  ];
  const bodyFragments = [email.text, email.html ?? ""]
    .flatMap((body) => body.split(/\r?\n|<[^>]+>/))
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);

  return [...exactValues, ...bodyFragments].filter((value): value is string =>
    Boolean(value?.trim()),
  );
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
