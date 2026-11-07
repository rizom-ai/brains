import {
  defineEntity,
  z,
  type EntityCheckAlert,
  type EntityCheckCadence,
  type EntityCheckContext,
  type EntityCheckDeclaration,
  type EntityCheckResult,
} from "@rizom/brain/entities";
import { bookmark, readingDigest } from "./index";

// Compile-only: checked by the fixture typecheck, never loaded by the brain.
function missingDigestAlert(
  id: string,
  title: string,
  siteUrl: string | undefined,
): EntityCheckAlert {
  return {
    dedupeKey: `missing-digest:${id}`,
    title: `${title} has no digest`,
    body: siteUrl
      ? `Digest it from ${siteUrl}/bookmarks/${id}`
      : `Digest "${title}" from Studio.`,
    includeInInbox: true,
  };
}

async function findUndigested(
  context: EntityCheckContext,
): Promise<EntityCheckResult> {
  context.signal.throwIfAborted();
  const [saved, digests] = await Promise.all([
    context.entities.list(bookmark),
    context.entities.list(readingDigest),
  ]);
  const digested = new Set(digests.map(({ metadata }) => metadata.bookmarkId));
  return {
    alerts: saved
      .filter(({ id }) => !digested.has(id))
      .map(({ id, metadata }) =>
        missingDigestAlert(id, metadata.title, context.siteUrl),
      ),
  };
}

const cadence: EntityCheckCadence = "weekly";
const undigested: EntityCheckDeclaration = {
  id: "undigested-pages",
  cadence,
  deliverAlerts: false,
  run: findUndigested,
};

export const readingWatch = defineEntity({
  type: "reading-watch",
  purpose: "Notices saved pages that were never digested.",
  metadata: z.object({}),
  checks: [
    undigested,
    {
      id: "daily-pulse",
      cadence: "daily",
      run: async (): Promise<EntityCheckResult> => ({}),
    },
  ],
});

export const invalidCadence: EntityCheckDeclaration = {
  id: "invalid-cadence",
  // @ts-expect-error A check runs daily or weekly.
  cadence: "hourly",
  run: async () => ({}),
};

export const invalidAlert: EntityCheckDeclaration = {
  id: "invalid-alert",
  cadence: "daily",
  // @ts-expect-error An alert has a dedupe key, a title and a body.
  run: async () => ({ alerts: [{ title: "Untitled body" }] }),
};
