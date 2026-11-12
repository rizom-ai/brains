import { basename, dirname, join, resolve } from "path";
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
 * does not exist yet has no physical identity of its own, so it takes its
 * nearest existing ancestor's and keeps the missing tail. Its lexical form
 * alone would change identity once the path is created, whenever an ancestor
 * is a symlink.
 */
export async function canonicalCheckoutPath(path: string): Promise<string> {
  const missing: string[] = [];
  let existing = resolve(path);
  for (;;) {
    try {
      return join(await realpath(existing), ...missing);
    } catch {
      // Not resolvable (usually not created yet): try its parent.
      const parent = dirname(existing);
      if (parent === existing) return resolve(path);
      missing.unshift(basename(existing));
      existing = parent;
    }
  }
}
