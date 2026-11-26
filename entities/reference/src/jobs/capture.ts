import { JobResult } from "@brains/contracts";
import {
  defineEntity,
  defineEntityJob,
  type EntityDefinition,
  type EntityJobDeclaration,
  type EntityJobHandleContext,
} from "@brains/sdk/entities";
import type { PublicRepo, PublicRepoReader } from "@brains/atproto-client";
import { recordKeyOf } from "@brains/atproto-client";
import { getErrorMessage } from "@brains/utils/error";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import {
  findRecordByAddress,
  readAuthorName,
  sourceFieldsOf,
} from "../lib/source-record";
import type { referenceMetadataSchema } from "../schemas/reference";

type ReferenceDefinition = EntityDefinition<
  "reference",
  typeof referenceMetadataSchema
>;

/** A capture: the address of the entity to point to, on its author's brain. */
export const referenceCaptureInputSchema: z.ZodObject<{ url: z.ZodURL }> =
  z.object({ url: z.url() });

export type ReferenceCaptureInput = z.output<
  typeof referenceCaptureInputSchema
>;

/**
 * A peer in the agent directory, read for the repo it publishes to. The
 * agent type is the agent directory's; a reference reads it by this shape
 * and never installs it.
 */
const agentShape = defineEntity({
  type: "agent",
  purpose: "A peer brain, read for its AT Protocol repo.",
  metadata: z.looseObject({ repoDid: z.string().optional() }),
});

/**
 * The author's repo: the one the agent directory holds for the address's
 * site, else the site's domain read as an AT Protocol handle.
 */
async function openAuthorRepo(
  context: EntityJobHandleContext<ReferenceCaptureInput>,
  repos: PublicRepoReader,
  site: string,
): Promise<PublicRepo> {
  const agent = await context.entities.get(agentShape, site);
  try {
    return await repos.open(agent?.metadata.repoDid ?? site);
  } catch (error) {
    throw new Error(
      `No AT Protocol repo was found for ${site}, so nothing there can be featured (${getErrorMessage(error)})`,
      { cause: error },
    );
  }
}

/** A reference's id: its author's site and its record's key, as one slug. */
function referenceIdOf(authorSite: string, sourceUri: string): string {
  const name = `${authorSite} ${recordKeyOf(sourceUri) ?? ""}`;
  return slugify(name.replace(/[.:~_]+/g, "-"));
}

async function capture(
  reference: ReferenceDefinition,
  context: EntityJobHandleContext<ReferenceCaptureInput>,
  repos: PublicRepoReader,
): Promise<{ success: true; entityId: string; title: string; status: string }> {
  const { url } = context.input;
  const site = new URL(url).hostname;
  const repo = await openAuthorRepo(context, repos, site);
  const record = await findRecordByAddress(repo, url);
  if (!record) {
    throw new Error(
      `${url} has no record in ${site}'s repo yet. It gets one when it is published on a brain that publishes records`,
    );
  }

  // The record is the key: one entry per record, whatever address named it.
  const existing = (await context.entities.list(reference)).find(
    (entry) => entry.metadata.sourceUri === record.uri,
  );
  if (existing) {
    return {
      success: true,
      entityId: existing.id,
      title: existing.metadata.title,
      status: existing.metadata.status,
    };
  }

  const fields = sourceFieldsOf(record, await readAuthorName(repo));
  const { id } = await context.entities.create(reference, {
    id: referenceIdOf(fields.authorSite, record.uri),
    content: "",
    metadata: { ...fields, status: "draft", sourceState: "active" },
  });
  return { success: true, entityId: id, title: fields.title, status: "draft" };
}

/**
 * The capture a create from an address queues: the author's repo found, the
 * record for the address read for its display fields, the byline taken from
 * the author's brain card, and a draft written. A record already captured
 * is answered as it is; an address with no repo or no record fails with why,
 * and nothing is written.
 */
export function referenceCaptureJob(
  reference: () => ReferenceDefinition,
  repos: PublicRepoReader,
): EntityJobDeclaration<typeof referenceCaptureInputSchema> {
  return defineEntityJob({
    input: referenceCaptureInputSchema,
    handle: async (context) => {
      try {
        return await capture(reference(), context, repos);
      } catch (error) {
        return JobResult.failure(error);
      }
    },
  });
}
