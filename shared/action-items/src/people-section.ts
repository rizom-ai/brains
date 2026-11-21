import { actorRefKey, type ActorRef } from "@brains/contracts";
/**
 * The people a memory names, in its next stored form
 * (docs/plans/one-stored-form.md). The header indexes them, each list as
 * the actor refs of the people on it and their aliases (`decidedBy`,
 * `decidedByAliases`), which Obsidian shows as properties; the body's
 * closing People section states each person whole: their ref, their name,
 * their aliases, their roles in a conversation and their canonical id.
 *
 * ```md
 * ## People
 *
 * ### Decided by
 *
 * - user:usr_mira — Mira
 *   - also: external:ext_9
 *   - roles: user, assistant
 * - Jan
 * ```
 */

/** One person as a memory stores them; an actor ref is `user:usr_…`. */
export interface StoredPerson {
  readonly ref?: string;
  readonly name?: string;
  readonly aliases?: readonly string[];
  readonly roles?: readonly string[];
  readonly canonicalId?: string;
}

/** One list of people: the header key that indexes it and its heading. */
export interface PeopleList {
  readonly key: string;
  readonly label: string;
}

const HEADING = "## People";
const ACTOR_REF = /^(user|external|agent|service):\S+$/u;
const NAME_SEPARATOR = " — ";

/** Whether a value is an actor ref as text, as the header lists them. */
export function isActorRefText(value: unknown): value is string {
  return typeof value === "string" && ACTOR_REF.test(value);
}

function personLines(person: StoredPerson): string[] {
  const head =
    person.ref === undefined
      ? (person.name ?? "")
      : person.name === undefined
        ? person.ref
        : `${person.ref}${NAME_SEPARATOR}${person.name}`;
  return [
    `- ${head}`,
    ...(person.aliases && person.aliases.length > 0
      ? [`  - also: ${person.aliases.join(", ")}`]
      : []),
    ...(person.roles && person.roles.length > 0
      ? [`  - roles: ${person.roles.join(", ")}`]
      : []),
    ...(person.canonicalId !== undefined
      ? [`  - canonical: ${person.canonicalId}`]
      : []),
  ];
}

/** The People section for these lists; nothing when no list names anyone. */
export function peopleSection(
  lists: readonly (PeopleList & { readonly people: readonly StoredPerson[] })[],
): string {
  const named = lists.filter((list) => list.people.length > 0);
  if (named.length === 0) return "";
  return [
    HEADING,
    ...named.map((list) =>
      [`### ${list.label}`, list.people.flatMap(personLines).join("\n")].join(
        "\n\n",
      ),
    ),
  ].join("\n\n");
}

function personFromLine(text: string): StoredPerson {
  const separator = text.indexOf(NAME_SEPARATOR);
  const head = separator < 0 ? text : text.slice(0, separator);
  if (!ACTOR_REF.test(head)) return { name: text };
  return separator < 0
    ? { ref: head }
    : { ref: head, name: text.slice(separator + NAME_SEPARATOR.length) };
}

function listItems(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** A person with one detail line laid over them; none when it is not one. */
function withDetail(
  person: StoredPerson,
  line: string,
): StoredPerson | undefined {
  const detail = /^ {2}- (also|roles|canonical): (.+)$/u.exec(line);
  if (!detail) return undefined;
  const [, name, value = ""] = detail;
  if (name === "also") return { ...person, aliases: listItems(value) };
  if (name === "roles") return { ...person, roles: listItems(value) };
  return { ...person, canonicalId: value.trim() };
}

type Parsed =
  | {
      readonly key: string | undefined;
      readonly people: Readonly<Record<string, StoredPerson[]>>;
    }
  | undefined;

/** The People section's lists, or none when its text is anything else. */
function parseSection(
  text: string,
  lists: readonly PeopleList[],
): Record<string, StoredPerson[]> | undefined {
  const keyOf = new Map(lists.map((list) => [list.label, list.key]));
  const parsed = text.split("\n").reduce<Parsed>(
    (state, line) => {
      if (!state || line.trim() === "") return state;
      const heading = /^### (.+)$/u.exec(line)?.[1];
      if (heading !== undefined) {
        const key = keyOf.get(heading.trim());
        return key === undefined ? undefined : { ...state, key };
      }
      if (state.key === undefined) return undefined;
      const key = state.key;
      const people = state.people[key] ?? [];
      if (line.startsWith("- ")) {
        return {
          key,
          people: {
            ...state.people,
            [key]: [...people, personFromLine(line.slice(2))],
          },
        };
      }
      const last = people.at(-1);
      const detailed = last && withDetail(last, line);
      return detailed
        ? {
            key,
            people: {
              ...state.people,
              [key]: [...people.slice(0, -1), detailed],
            },
          }
        : undefined;
    },
    { key: undefined, people: {} },
  );
  return parsed?.people;
}

/**
 * A body read past its closing People section: the body above it and the
 * people it states. A People heading over anything but people lists (a
 * summary entry an author titled so) is the body's own and stays.
 */
export function splitPeopleSection(
  body: string,
  lists: readonly PeopleList[],
): { body: string; people: Record<string, StoredPerson[]> } {
  // The last People heading at the start of a line; a body may open on it.
  const start = `\n${body}`.lastIndexOf(`\n${HEADING}\n`);
  if (start < 0) return { body, people: {} };
  const people = parseSection(body.slice(start + HEADING.length + 1), lists);
  if (!people) return { body, people: {} };
  const above = body.slice(0, start).replace(/\n+$/u, "");
  return { body: above.length > 0 ? `${above}\n` : "", people };
}

/** A list's header index: each person's ref, and every alias not a ref. */
export function peopleIndex(
  key: string,
  people: readonly StoredPerson[],
): Record<string, string[]> {
  const refs = people.flatMap((person) =>
    person.ref === undefined ? [] : [person.ref],
  );
  const aliases = [
    ...new Set(people.flatMap((person) => person.aliases ?? [])),
  ].filter((alias) => !refs.includes(alias));
  return {
    ...(refs.length > 0 && { [key]: refs }),
    ...(aliases.length > 0 && { [`${key}Aliases`]: aliases }),
  };
}

/**
 * A list's people, the header the editor sees deciding who has a ref: a
 * ref it no longer lists leaves, one it adds joins after the body's people,
 * and a person named without a ref stays. Without a header list, the
 * body's people; without a body list, the header's refs.
 */
export function peopleFromIndex(
  fromBody: readonly StoredPerson[] | undefined,
  headerRefs: unknown,
): StoredPerson[] | undefined {
  const refs = Array.isArray(headerRefs)
    ? headerRefs.filter(isActorRefText)
    : undefined;
  if (refs === undefined) return fromBody ? [...fromBody] : undefined;
  const body = fromBody ?? [];
  return [
    ...body.filter(
      (person) => person.ref === undefined || refs.includes(person.ref),
    ),
    ...refs
      .filter((ref) => !body.some((person) => person.ref === ref))
      .map((ref) => ({ ref })),
  ];
}

/** A person as a decision or a summary holds them in its metadata. */
export interface MemoryPerson {
  readonly identity: ActorRef;
  readonly identityAliases?: readonly ActorRef[] | undefined;
  readonly displayName?: string | undefined;
  readonly roles?: readonly string[] | undefined;
}

/** An actor ref read back from its text, as `actorRefKey` writes it. */
export function actorRefFromText(
  text: string,
  canonicalId?: string,
): ActorRef | undefined {
  const at = text.indexOf(":");
  const kind = text.slice(0, at);
  const id = text.slice(at + 1);
  if (at < 0 || id.length === 0) return undefined;
  if (kind === "user")
    return {
      kind,
      userId: id,
      ...(canonicalId !== undefined && { canonicalId }),
    };
  if (kind === "external") return { kind, externalActorId: id };
  if (kind === "agent") return { kind, agentId: id };
  if (kind === "service") return { kind, serviceId: id };
  return undefined;
}

function storedPersonOf(person: MemoryPerson): StoredPerson {
  const aliases = (person.identityAliases ?? []).map(actorRefKey);
  return {
    ref: actorRefKey(person.identity),
    ...(person.displayName !== undefined && { name: person.displayName }),
    ...(aliases.length > 0 && { aliases }),
    ...(person.roles && person.roles.length > 0 && { roles: person.roles }),
    ...(person.identity.kind === "user" &&
      person.identity.canonicalId !== undefined && {
        canonicalId: person.identity.canonicalId,
      }),
  };
}

/** A stored person as a memory holds them; none without an actor ref. */
function memoryPersonOf(person: StoredPerson): MemoryPerson | undefined {
  const identity =
    person.ref === undefined
      ? undefined
      : actorRefFromText(person.ref, person.canonicalId);
  if (!identity) return undefined;
  const aliases = (person.aliases ?? []).flatMap((alias) => {
    const ref = actorRefFromText(alias);
    return ref ? [ref] : [];
  });
  return {
    identity,
    ...(aliases.length > 0 && { identityAliases: aliases }),
    ...(person.name !== undefined && { displayName: person.name }),
    ...(person.roles && person.roles.length > 0 && { roles: person.roles }),
  };
}

/**
 * A memory's people in its next stored form: each list indexed in the
 * header, every person whole in a People section closing the body.
 */
export function writeMemoryPeople(
  body: string,
  lists: readonly PeopleList[],
  people: Readonly<Record<string, readonly MemoryPerson[] | undefined>>,
): { body: string; header: Record<string, string[]> } {
  const stored = lists.map((list) => ({
    ...list,
    people: (people[list.key] ?? []).map(storedPersonOf),
  }));
  const section = peopleSection(stored);
  return {
    body:
      section.length === 0
        ? body
        : `${body.replace(/\n+$/u, "")}\n\n${section}`,
    header: Object.assign(
      {},
      ...stored.map((list) => peopleIndex(list.key, list.people)),
    ),
  };
}

/**
 * A memory's people read from its next stored form: each list the header
 * indexes as actor refs or the People section states, and the body above
 * the section. A list the header states as objects is the current form's,
 * which the type reads itself.
 */
export function readMemoryPeople(
  body: string,
  header: Readonly<Record<string, unknown>>,
  lists: readonly PeopleList[],
): { body: string; people: Record<string, MemoryPerson[]> } {
  const split = splitPeopleSection(body, lists);
  const people = Object.fromEntries(
    lists.flatMap((list) => {
      const indexed = header[list.key];
      const refs =
        Array.isArray(indexed) && indexed.every(isActorRefText)
          ? indexed
          : undefined;
      if (indexed !== undefined && refs === undefined) return [];
      const read = peopleFromIndex(split.people[list.key], refs);
      return read
        ? [[list.key, read.flatMap((person) => memoryPersonOf(person) ?? [])]]
        : [];
    }),
  );
  return { body: split.body, people };
}
