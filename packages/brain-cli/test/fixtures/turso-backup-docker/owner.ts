// Docker protocol fixture, NOT a canonical brain app or a production service.
// Uses the actual migration chain and auth stores to test restored persistence.
import {
  AuthCredentialStore,
  AuthKeyStore,
  AuthRuntimeDatabase,
  AuthUserStore,
  RuntimeAuthSessionStore,
} from "@brains/auth-service";
import {
  createSqliteDatabase,
  closeSqliteClient,
  runPackageMigrations,
} from "@brains/db";
import { AuthAccountSettingsStore } from "../../../../../shell/auth-service/src/account-settings-store";
import { z } from "@brains/utils/zod";
import type { AccountSettingsStorageIdentity } from "@brains/plugins";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const evidenceSchema = z.object({
  actorId: z.string(),
  cookie: z.string(),
  keyId: z.string(),
});
const secret = process.env["ACCOUNT_SETTINGS_ENCRYPTION_KEY"];
if (!secret) throw new Error("Fixture encryption key is required");
const services = [
  ["brain.db", "entity-service"],
  ["brain-jobs.db", "job-queue"],
  ["conversations.db", "conversation-service"],
  ["runtime-state.db", "runtime-state"],
] as const;
for (const [file, service] of services)
  await runPackageMigrations({
    label: service,
    config: { url: `file:/data/${file}` },
    schema: {},
    migrationsFolder: `/app/dist/migrations/${service}`,
  });
const entity = createSqliteDatabase({
  url: "file:/data/brain.db",
  schema: {},
}).client;
const jobs = createSqliteDatabase({
  url: "file:/data/brain-jobs.db",
  schema: {},
}).client;
const conversations = createSqliteDatabase({
  url: "file:/data/conversations.db",
  schema: {},
}).client;
const state = createSqliteDatabase({
  url: "file:/data/runtime-state.db",
  schema: {},
}).client;
const auth = new AuthRuntimeDatabase({ storageDir: "/app/data/auth" });
await auth.start();
const users = new AuthUserStore(auth.db);
const keys = new AuthKeyStore(auth);
const credentials = new AuthCredentialStore(auth.db);
const sessions = new RuntimeAuthSessionStore(auth);
const settings = new AuthAccountSettingsStore(auth.db, secret);
const settingsIdentity = (actorId: string): AccountSettingsStorageIdentity => ({
  actorId,
  packageName: "@fixture/backup",
  definitionId: "mailbox",
});

const evidencePath = "/config/rehearsal.json";
if (!(await Bun.file(evidencePath).exists())) {
  await mkdir("/config", { recursive: true });
  const user = await users.ensureFirstAdminUser({
    displayName: "Backup rehearsal operator",
  });
  await credentials.addPasskey({
    id: "fixture-credential",
    userId: user.id,
    publicKey: "fixture-not-a-browser-authenticator",
    counter: 7,
    credentialBackedUp: false,
  });
  await settings.write(settingsIdentity(user.id), {
    password: "fixture-account-secret",
    enabled: true,
  });
  const session = await sessions.createSession(user.id);
  const publicKey = await keys.getPublicJwk();
  await entity.execute(
    "INSERT INTO entities (id, entityType, content, contentHash, metadata, created, updated) VALUES ('note', 'note', 'Docker recovery corpus', 'fixture-hash', '{}', 1, 1)",
  );
  await entity.execute({
    sql: "INSERT INTO embeddings (entity_id, entity_type, embedding, content_hash) VALUES ('note', 'note', ?, 'fixture-hash')",
    args: [new Float32Array(1536).buffer],
  });
  await conversations.executeMultiple(
    "INSERT INTO conversations (id, session_id, interface_type, started, last_active, created, updated, channel_id) VALUES ('conversation', 'session', 'chat', '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01', 'channel'); INSERT INTO messages (id, conversation_id, role, content, timestamp) VALUES ('message', 'conversation', 'user', 'Preserve this conversation', '2026-01-01');",
  );
  await state.execute(
    "INSERT INTO runtime_state_records VALUES ('fixture', 'executions', '0', 1, 1)",
  );
  await jobs.execute(
    "INSERT INTO job_queue (id, type, data, metadata, status, createdAt, scheduledFor) VALUES ('fixture-job', 'fixture:noop', '{}', '{}', 'completed', 1, 1)",
  );
  await writeFile(
    evidencePath,
    JSON.stringify({
      actorId: user.id,
      cookie: session.cookie,
      keyId: publicKey.kid,
    }),
    { mode: 0o600 },
  );
}
const evidence = evidenceSchema.parse(
  JSON.parse(await readFile(evidencePath, "utf8")),
);

async function proof(): Promise<Record<string, unknown>> {
  const session = await sessions.getSessionFromRequest(
    new Request("http://fixture/session", {
      headers: { cookie: evidence.cookie },
    }),
  );
  const saved = await settings.read(settingsIdentity(evidence.actorId));
  const privateJwk = await keys.getPrivateJwk();
  const publicJwk = await keys.getPublicJwk();
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    algorithm,
    false,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    algorithm,
    false,
    ["verify"],
  );
  const message = new TextEncoder().encode("backup-rehearsal-proof");
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    message,
  );
  return {
    scope: "docker-protocol-fixture",
    sessionValid: session?.subject === evidence.actorId,
    settingsDecrypt: saved?.values["password"] === "fixture-account-secret",
    signingKeyId: publicJwk.kid,
    signingKeyPreserved: publicJwk.kid === evidence.keyId,
    signatureVerified: await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      signature,
      message,
    ),
    passkeyCounter: (await credentials.getPasskey("fixture-credential"))
      ?.counter,
    entityContent: (
      await entity.execute("SELECT content FROM entities WHERE id = 'note'")
    ).rows[0]?.["content"],
    vectorBytes: (
      await entity.execute("SELECT length(embedding) AS size FROM embeddings")
    ).rows[0]?.["size"],
    conversationContent: (
      await conversations.execute(
        "SELECT content FROM messages WHERE id = 'message'",
      )
    ).rows[0]?.["content"],
    jobStatus: (
      await jobs.execute(
        "SELECT status FROM job_queue WHERE id = 'fixture-job'",
      )
    ).rows[0]?.["status"],
    executions: (
      await state.execute(
        "SELECT value FROM runtime_state_records WHERE namespace = 'fixture' AND key = 'executions'",
      )
    ).rows[0]?.["value"],
  };
}
let stopping = false;
const server = Bun.serve({
  port: 8080,
  hostname: "0.0.0.0",
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (stopping) return new Response("Stopping", { status: 503 });
    if (path === "/health/live") return new Response("ok");
    if (path === "/health/ready") {
      const pending = Number(
        (
          await jobs.execute(
            "SELECT count(*) AS count FROM job_queue WHERE status = 'pending'",
          )
        ).rows[0]?.["count"],
      );
      return Response.json({
        status: "ready",
        operationalStatus: "operational",
        resources: {
          queue: { totals: { pending, processing: 0 }, staleLeaseCount: 0 },
        },
      });
    }
    if (path === "/proof") return Response.json(await proof());
    if (path === "/execute-fixture-job" && request.method === "POST") {
      if ((await proof())["jobStatus"] !== "pending")
        return new Response("Not pending", { status: 409 });
      await state.execute(
        "UPDATE runtime_state_records SET value = CAST(value AS INTEGER) + 1 WHERE namespace = 'fixture' AND key = 'executions'",
      );
      await jobs.execute(
        "UPDATE job_queue SET status = 'completed' WHERE id = 'fixture-job'",
      );
      return Response.json(await proof());
    }
    return new Response("Not found", { status: 404 });
  },
});

async function stop(): Promise<void> {
  stopping = true;
  await server.stop();
  // Model an admitted intent persisted during shutdown, after the idle preflight.
  // Neither capture nor isolated restore is allowed to execute it implicitly.
  const executions = (
    await state.execute(
      "SELECT value FROM runtime_state_records WHERE namespace = 'fixture' AND key = 'executions'",
    )
  ).rows[0]?.["value"];
  if (Number(executions) === 0)
    await jobs.execute(
      "UPDATE job_queue SET status = 'pending' WHERE id = 'fixture-job' AND status = 'completed'",
    );
  await auth.stop();
  for (const client of [entity, conversations, state, jobs])
    await closeSqliteClient(client);
  process.exit(0);
}
process.once("SIGTERM", () => {
  void stop().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
});
