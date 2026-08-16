import { resolve } from "path";
import { realpath } from "fs/promises";

/**
 * The physical identity of a checkout.
 *
 * Two spellings of one directory are one checkout. Matching on the string a
 * caller happened to use means a role reaching it through a symlink is
 * refused, or — worse — that a second endpoint is derived for a working tree
 * that already has an owner, which is two owners for one repository.
 *
 * `realpath` answers the question the string only approximates. A path that
 * does not exist yet has no physical identity to resolve, so its lexical form
 * is the best available answer until it does.
 */
export async function canonicalCheckoutPath(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path));
}
