export interface UploadCandidate {
  id: string;
  filename: string;
  mediaType: string;
}

export interface UploadHistoryMessage {
  role: string;
  text: string;
}

type UploadIntent = "image" | "pdf" | "upload";
type UploadReference = "current" | "first" | "last" | "ambiguous";

export type UploadFollowUpResolution<TCandidate extends UploadCandidate> =
  | {
      kind: "selected";
      actionMessage: string;
      candidate: TCandidate;
    }
  | {
      kind: "clarify";
      candidates: TCandidate[];
    };

export function resolveUploadFollowUp<
  TCandidate extends UploadCandidate,
>(input: {
  message: string;
  history: UploadHistoryMessage[];
  candidates: TCandidate[];
}): UploadFollowUpResolution<TCandidate> | null {
  const clarification = getUploadClarificationContext(input.history);
  const intent = inferUploadIntent(input.message) ?? clarification?.intent;
  if (!intent) return null;

  const candidates = input.candidates.filter((candidate) =>
    matchesUploadIntent(candidate, intent),
  );
  if (candidates.length === 0) return null;

  const actionMessage = clarification?.message ?? input.message;
  const namedCandidates = candidates.filter((candidate) =>
    messageNamesUpload(input.message, candidate.filename),
  );
  if (namedCandidates.length === 1) {
    return {
      kind: "selected",
      actionMessage,
      candidate: namedCandidates[0] as TCandidate,
    };
  }
  if (namedCandidates.length > 1) {
    return { kind: "clarify", candidates: namedCandidates };
  }

  const selected = selectUploadCandidate({
    reference: inferUploadReference(input.message),
    candidates,
  });
  if (selected) return { kind: "selected", actionMessage, candidate: selected };

  return { kind: "clarify", candidates };
}

function getUploadClarificationContext(
  history: UploadHistoryMessage[],
): { message: string; intent: UploadIntent } | null {
  const assistantIndex = findLastIndex(history, (message) =>
    isUploadClarificationMessage(message.text),
  );
  if (assistantIndex === -1) return null;

  const priorMessages = history.slice(0, assistantIndex);
  const priorUserIndex = findLastIndex(
    priorMessages,
    (message) => message.role === "user",
  );
  if (priorUserIndex === -1) return null;

  const priorUser = priorMessages[priorUserIndex] as UploadHistoryMessage;
  const intent = inferUploadIntent(priorUser.text);
  return intent ? { message: priorUser.text, intent } : null;
}

function findLastIndex<T>(
  values: T[],
  predicate: (value: T) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index--) {
    if (predicate(values[index] as T)) return index;
  }
  return -1;
}

function isUploadClarificationMessage(message: string): boolean {
  return /which (?:uploaded file|upload) should i use\?/i.test(message);
}

function inferUploadIntent(message: string): UploadIntent | null {
  const normalized = message.toLowerCase();
  const hasAction =
    /\b(describe|summari[sz]e|read|analy[sz]e|inspect|review|explain|save|import|promote|store)\b/.test(
      normalized,
    ) || /\b(?:what(?:'s| is)|tell me)\b/.test(normalized);
  if (!hasAction) return null;

  if (
    /\b(image|picture|photo|pic|screenshot)\b/.test(normalized) ||
    /\.(?:png|jpe?g|webp|gif)\b/.test(normalized)
  ) {
    return "image";
  }
  if (/\bpdf\b/.test(normalized) || /\.pdf\b/.test(normalized)) return "pdf";
  if (/\b(file|attachment|upload|it|that|this)\b/.test(normalized)) {
    return "upload";
  }

  return null;
}

function inferUploadReference(message: string): UploadReference {
  const normalized = message.toLowerCase();
  if (/\b(first|oldest|earliest)\b/.test(normalized)) return "first";
  if (/\b(latest|newest|most recent|last)\b/.test(normalized)) return "last";
  if (/\b(it|that|this)\b/.test(normalized)) return "current";
  return "ambiguous";
}

function selectUploadCandidate<TCandidate extends UploadCandidate>(input: {
  reference: UploadReference;
  candidates: TCandidate[];
}): TCandidate | null {
  if (input.candidates.length === 0) return null;

  switch (input.reference) {
    case "current":
    case "last":
      return input.candidates.at(-1) ?? null;
    case "first":
      return input.candidates[0] ?? null;
    case "ambiguous":
      return input.candidates.length === 1
        ? (input.candidates[0] ?? null)
        : null;
  }
}

function matchesUploadIntent(
  candidate: UploadCandidate,
  intent: UploadIntent,
): boolean {
  if (intent === "upload") return true;
  if (intent === "image") return candidate.mediaType.startsWith("image/");
  return (
    candidate.mediaType === "application/pdf" ||
    candidate.filename.toLowerCase().endsWith(".pdf")
  );
}

function messageNamesUpload(message: string, filename: string): boolean {
  return message.toLowerCase().includes(filename.toLowerCase());
}
