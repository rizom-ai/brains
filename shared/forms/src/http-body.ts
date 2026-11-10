export class FormHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Every chunk of a body, refusing it once it passes `maxBytes`. */
async function readChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  maxBytes: number,
  cancel: () => void,
  chunks: Uint8Array[] = [],
  size = 0,
): Promise<Uint8Array[]> {
  const chunk = await reader.read();
  signal.throwIfAborted();
  if (chunk.done) return chunks;
  const total = size + chunk.value.byteLength;
  if (total > maxBytes) {
    cancel();
    throw new FormHttpError(413, "The request is too large.");
  }
  return readChunks(
    reader,
    signal,
    maxBytes,
    cancel,
    [...chunks, chunk.value],
    total,
  );
}

/** Bound the stream before URL/form parsing; Content-Length alone is not a
 * cap. A field in `repeatable`, such as a set of checkboxes, is a list of
 * every value it was posted with; any other may come once. */
export async function readForm(
  request: Request,
  maxBytes: number,
  timeoutMs: number,
  allowedFields: ReadonlySet<string>,
  repeatable: ReadonlySet<string> = new Set(),
): Promise<Record<string, string | string[]>> {
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length))
    throw new FormHttpError(400, "Invalid request body.");
  if (length !== null && Number(length) > maxBytes)
    throw new FormHttpError(413, "The request is too large.");
  if (!request.body) throw new FormHttpError(400, "A form is required.");
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
    const chunks = await readChunks(reader, signal, maxBytes, cancel);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
    return [...new URLSearchParams(text)].reduce<
      Record<string, string | string[]>
    >((fields, [key, value]) => {
      const current = fields[key];
      if (
        !allowedFields.has(key) ||
        (!repeatable.has(key) && current !== undefined)
      )
        throw new FormHttpError(400, "Invalid form fields.");
      return {
        ...fields,
        [key]: repeatable.has(key)
          ? [...(Array.isArray(current) ? current : []), value]
          : value,
      };
    }, {});
  } catch (error) {
    if (signal.aborted)
      throw new FormHttpError(
        408,
        "The request timed out or was cancelled. No new form was submitted.",
      );
    if (error instanceof FormHttpError) throw error;
    throw new FormHttpError(400, "Invalid request body.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
