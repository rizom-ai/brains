/** Read bounded JSON metadata, not a binary payload. The byte limit bounds what
 * we retain/decode, not fetch's native allocation or an incoming stream chunk.
 * A failed read joins cancellation and releases only the reader we acquired.
 */
export async function readBoundedJsonResponse(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  let drained = false;
  let value: unknown;
  const errors: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
      throw new Error("JSON response requires a positive safe byte limit");
    if (!response.ok)
      throw new Error(`JSON response failed with HTTP ${response.status}`);
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) ||
        !Number.isSafeInteger(Number(declared)) ||
        Number(declared) > maxBytes)
    )
      throw new Error(
        "JSON response exceeds its limit or has an invalid length",
      );
    if (!reader) throw new Error("JSON response has no body");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts: string[] = [];
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        drained = true;
        break;
      }
      if (chunk.value.byteLength > maxBytes - size)
        throw new Error("JSON response exceeds its byte limit");
      size += chunk.value.byteLength;
      const text = decoder.decode(chunk.value, { stream: true });
      if (text) parts.push(text);
    }
    parts.push(decoder.decode());
    value = JSON.parse(parts.join(""));
  } catch (error) {
    remember(error);
  } finally {
    if (reader) {
      if (!drained) {
        try {
          await reader.cancel(errors[0]);
        } catch (error) {
          remember(error);
        }
      }
      try {
        reader.releaseLock();
      } catch (error) {
        remember(error);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "JSON response read and cleanup failed", {
      cause: errors[0],
    });
  return value;
}
