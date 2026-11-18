import { getErrorMessage } from "@brains/utils/error";

/** Why a promise was rejected, or an empty string when it was not. */
export async function rejection(promise: Promise<unknown>): Promise<string> {
  return promise.then(
    () => "",
    (error: unknown) => getErrorMessage(error),
  );
}
