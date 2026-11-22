import { describe, expect, it } from "bun:test";
import {
  peopleFromIndex,
  readMemoryPeople,
  writeMemoryPeople,
  peopleIndex,
  peopleSection,
  splitPeopleSection,
  type StoredPerson,
} from "../src/people-section";

/**
 * The people a memory names, in its next stored form
 * (docs/external-plugin-authoring.md, The stored format): the header indexes them as actor refs,
 * which Obsidian shows as properties, and the body's People section holds
 * each person whole, so nothing a person carries is lost.
 */

const mira: StoredPerson = {
  ref: "user:usr_mira",
  name: "Mira",
  aliases: ["external:ext_9", "external:ext_10"],
  roles: ["user", "assistant"],
  canonicalId: "canon_1",
};
const jan: StoredPerson = { name: "Jan" };
const bot: StoredPerson = { ref: "agent:helper" };

const lists = [
  { key: "decidedBy", label: "Decided by" },
  { key: "mentionedBy", label: "Mentioned by" },
] as const;

const section = `## People

### Decided by

- user:usr_mira — Mira
  - also: external:ext_9, external:ext_10
  - roles: user, assistant
  - canonical: canon_1
- Jan

### Mentioned by

- agent:helper`;

describe("a memory's People section", () => {
  it("states each person whole, one list per heading", () => {
    expect(
      peopleSection([
        { ...lists[0], people: [mira, jan] },
        { ...lists[1], people: [bot] },
      ]),
    ).toBe(section);
  });

  it("is nothing when no list names anyone", () => {
    expect(peopleSection([{ ...lists[0], people: [] }])).toBe("");
  });

  it("reads back the people it states and the body above it", () => {
    expect(
      splitPeopleSection(
        `# Ship it\n\nWe ship on Friday.\n\n${section}\n`,
        lists,
      ),
    ).toEqual({
      body: "# Ship it\n\nWe ship on Friday.\n",
      people: { decidedBy: [mira, jan], mentionedBy: [bot] },
    });
  });

  it("leaves a body without one as it is", () => {
    expect(splitPeopleSection("# Ship it\n\nText.\n", lists)).toEqual({
      body: "# Ship it\n\nText.\n",
      people: {},
    });
  });

  // A summary entry an author titled People is prose, not the section.
  it("leaves a People heading over anything but people lists in the body", () => {
    const body = "# Summary\n\n## People\n\nTime: 10:00\n\nWe met.\n";
    expect(splitPeopleSection(body, lists)).toEqual({ body, people: {} });
  });
});

describe("a memory's people index", () => {
  it("lists each person's ref and every alias that is not one", () => {
    expect(peopleIndex("decidedBy", [mira, jan, bot])).toEqual({
      decidedBy: ["user:usr_mira", "agent:helper"],
      decidedByAliases: ["external:ext_9", "external:ext_10"],
    });
  });

  it("states nothing for a list of no one with a ref", () => {
    expect(peopleIndex("decidedBy", [jan])).toEqual({});
  });

  // An editor that adds or removes a ref in the header is heard: a ref
  // the header no longer lists leaves, one it adds joins, and a person
  // named without a ref stays.
  it("takes who has a ref from the header the editor sees", () => {
    expect(
      peopleFromIndex([mira, jan, bot], ["agent:helper", "external:ext_new"]),
    ).toEqual([jan, bot, { ref: "external:ext_new" }]);
  });

  it("is the body's people when the header lists none", () => {
    expect(peopleFromIndex([mira, jan], undefined)).toEqual([mira, jan]);
  });

  it("is the header's refs when the body names no one", () => {
    expect(peopleFromIndex(undefined, ["user:usr_mira"])).toEqual([
      { ref: "user:usr_mira" },
    ]);
  });
});

describe("a memory's people in either stored form", () => {
  const mira = {
    identity: { kind: "user" as const, userId: "usr_mira", canonicalId: "c1" },
    identityAliases: [{ kind: "external" as const, externalActorId: "ext_9" }],
    displayName: "Mira",
    roles: ["user"],
  };
  const helper = { identity: { kind: "agent" as const, agentId: "helper" } };

  it("writes the index in the header and each person whole in the body", () => {
    expect(
      writeMemoryPeople("# Ship it\n\nWe ship.", lists, {
        decidedBy: [mira],
        mentionedBy: [helper],
      }),
    ).toEqual({
      body: [
        "# Ship it\n\nWe ship.",
        "## People",
        "### Decided by",
        "- user:usr_mira — Mira\n  - also: external:ext_9\n  - roles: user\n  - canonical: c1",
        "### Mentioned by",
        "- agent:helper",
      ].join("\n\n"),
      header: {
        decidedBy: ["user:usr_mira"],
        decidedByAliases: ["external:ext_9"],
        mentionedBy: ["agent:helper"],
      },
    });
  });

  it("reads back the people it wrote, and the body above them", () => {
    const written = writeMemoryPeople("# Ship it\n\nWe ship.", lists, {
      decidedBy: [mira],
      mentionedBy: [helper],
    });
    expect(readMemoryPeople(written.body, written.header, lists)).toEqual({
      body: "# Ship it\n\nWe ship.",
      people: { decidedBy: [mira], mentionedBy: [helper] },
    });
  });

  // A list of objects is the current form's, which the type reads itself.
  it("reads no list the header states as objects", () => {
    expect(
      readMemoryPeople("Text.", { decidedBy: [mira] }, lists).people,
    ).toEqual({});
  });
});
