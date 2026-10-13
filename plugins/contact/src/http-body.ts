export class ContactHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Bound the stream before URL/form parsing; Content-Length alone is not a cap. */
export async function readContactForm(
  request: Request,
  maxBytes: number,
  timeoutMs: number,
): Promise<Record<string, string>> {
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length))
    throw new ContactHttpError(400, "Invalid request body.");
  if (length !== null && Number(length) > maxBytes)
    throw new ContactHttpError(413, "The request is too large.");
  if (!request.body) throw new ContactHttpError(400, "A form is required.");
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  const reader = request.body.getReader();
  const cancel = (): void => {
    void reader.cancel().catch(() => {
      /* Best-effort body cancellation, no persistence has begun. */
    });
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        cancel();
        throw new ContactHttpError(413, "The request is too large.");
      }
      chunks.push(chunk.value);
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    const fields: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(text)) {
      if (
        Object.hasOwn(fields, key) ||
        !["token", "name", "email", "message", "website"].includes(key)
      )
        throw new ContactHttpError(400, "Invalid form fields.");
      fields[key] = value;
    }
    return fields;
  } catch (error) {
    if (signal.aborted)
      throw new ContactHttpError(
        408,
        "The request timed out or was cancelled. No new form was submitted.",
      );
    if (error instanceof ContactHttpError) throw error;
    throw new ContactHttpError(400, "Invalid request body.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
