import { readMarkdownFrontmatter } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";

/*
 * Conversation memory documents (summaries, decisions, action items) as
 * main stored them, moved into the next stored form
 * (docs/external-plugin-authoring.md, The stored format), for tests that compare the rows a store
 * writes now with the bytes captured from main's classes.
 */

const actorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), userId: z.string() }),
  z.object({ kind: z.literal("external"), externalActorId: z.string() }),
  z.object({ kind: z.literal("agent"), agentId: z.string() }),
  z.object({ kind: z.literal("service"), serviceId: z.string() }),
]);
const personSchema = z.union([
  // A summary's or a decision's person: an identity and how it is named.
  z
    .object({
      identity: actorSchema,
      identityAliases: z.array(actorSchema).default([]),
      displayName: z.string().optional(),
      roles: z.array(z.string()).default([]),
    })
    .transform(({ identity, identityAliases, displayName, roles }) => ({
      ref: refOf(identity),
      name: displayName,
      aliases: identityAliases.map(refOf),
      roles,
    })),
  // An action item's member: a name, a ref, or both.
  z
    .object({
      name: z.string().optional(),
      id: z.string().optional(),
      aliases: z.array(z.string()).default([]),
    })
    .transform(({ name, id, aliases }) => ({
      ref: id,
      name,
      aliases,
      roles: [],
    })),
]);
type Person = z.output<typeof personSchema>;

/** An actor as a ref, `<kind>:<id>`. */
function refOf(actor: z.output<typeof actorSchema>): string {
  switch (actor.kind) {
    case "user":
      return `user:${actor.userId}`;
    case "external":
      return `external:${actor.externalActorId}`;
    case "agent":
      return `agent:${actor.agentId}`;
    case "service":
      return `service:${actor.serviceId}`;
  }
}

const PEOPLE = [
  ["participants", "Participants"],
  ["decidedBy", "Decided by"],
  ["mentionedBy", "Mentioned by"],
  ["assignedTo", "Assigned to"],
  ["requestedBy", "Requested by"],
] as const;

/** A person as the closing `## People` section states them. */
function personLine({ ref, name, aliases, roles }: Person): string {
  const named = [ref, name].filter((part) => part !== undefined).join(" — ");
  return [
    `- ${named}`,
    ...(aliases.length > 0 ? [`  - also: ${aliases.join(", ")}`] : []),
    ...(roles.length > 0 ? [`  - roles: ${roles.join(", ")}`] : []),
  ].join("\n");
}

/**
 * A document main stored, as the next stored form writes it: a time range
 * as `startedAt` and `endedAt` in its place, an action item's source as
 * three flat keys, and each list of people as its actor refs and their
 * aliases, each person whole in a closing `## People` section. Moved keys
 * take the place of the keys they replace.
 */
export function inNextForm(document: string): string {
  const data = z
    .record(z.string(), z.unknown())
    .parse(readMarkdownFrontmatter(document).data);
  const [, header = "", body = ""] =
    /^---\n([\s\S]*?)---\n([\s\S]*)$/u.exec(document) ?? [];
  const timed = header.replace(
    /^timeRange:\n {2}start: (.*)\n {2}end: (.*)\n/mu,
    "startedAt: $1\nendedAt: $2\n",
  );
  const sourced = timed.replace(
    /^sourceRef:\n {2}sourceId: (.*)\n {2}entityType: (.*)\n {2}entityId: (.*)\n/mu,
    "sourceRef: $1\nsourceEntityType: $2\nsourceEntityId: $3\n",
  );
  const lists = PEOPLE.flatMap(([key, label]) => {
    const listed = data[key];
    return Array.isArray(listed) && listed.length > 0
      ? [{ key, label, people: z.array(personSchema).parse(listed) }]
      : [];
  });
  const kept = lists.reduce((text, { key, people }) => {
    const refs = people.flatMap(({ ref }) => (ref ? [ref] : []));
    const aliases = people.flatMap(({ aliases: also }) => also);
    const indexed = [
      `${key}:`,
      ...refs.map((ref) => `  - '${ref}'`),
      ...(aliases.length > 0
        ? [`${key}Aliases:`, ...aliases.map((alias) => `  - '${alias}'`)]
        : []),
    ].join("\n");
    return text.replace(
      new RegExp(`^${key}:\\n(?: {2}.*\\n)*`, "mu"),
      `${indexed}\n`,
    );
  }, sourced);
  const people = lists
    .map(
      ({ label, people: listed }) =>
        `### ${label}\n\n${listed.map(personLine).join("\n")}`,
    )
    .join("\n\n");
  const closing = people === "" ? "" : `\n## People\n\n${people}\n`;
  return `---\n${kept}---\n${body}${closing}`;
}
