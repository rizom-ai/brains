import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import type { App } from "@brains/app";
import {
  readOwnedEmailSource,
  MAX_EMAIL_SOURCE_BYTES,
} from "../../interfaces/email/src/email-source";

/** Only IMAP is substituted inside the fixture actor; production parsing, file
 * production/retirement, logical-text receipt verification and admission run.
 */
export async function consumeCanonicalEmailSource(app: App): Promise<void> {
  const files = app.getShell().getEntityService().fileAssets;
  assert.ok(files?.withProducedFile);
  const result = await readOwnedEmailSource(
    files,
    {
      config: {
        host: "fixture.invalid",
        port: 993,
        user: "fixture",
        password: fileURLToPath(
          new URL(
            "../../interfaces/email/test/fixtures/multipart.eml",
            import.meta.url,
          ),
        ),
        mailbox: "INBOX",
        pollMode: "idle",
        pollIntervalMs: 1000,
      },
      selection: { mailbox: "INBOX", uidValidity: "42" },
      uid: 7,
      maxBytes: MAX_EMAIL_SOURCE_BYTES,
      allowTruncated: false,
    },
    new AbortController().signal,
  );
  assert.equal(result.uid, 7);
  assert.equal(result.email?.from.address, "bob@example.org");
  assert.equal(result.email.subject, "Multipart inquiry");
  assert.equal(Object.hasOwn(result, "source"), false);
  assert.ok(result.sourceBytes > 0);
  console.info(
    "[canonical-email] production MIME parsing and verified logical delivery completed after native actor exit; IMAP fixture substituted",
  );
}
