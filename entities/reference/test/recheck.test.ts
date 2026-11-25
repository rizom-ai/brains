import { describe, expect, it } from "bun:test";
import {
  authorRepo,
  postRecord,
  referenceBrain,
  type AuthorRepo,
  type ReferenceBrain,
} from "./reference-fixture";

const ID = "author-example-essay";
const ADDRESS = "https://author.example/essays/essay";

/** A brain featuring one published essay, checked once so its record is known. */
async function featured(): Promise<{
  repo: AuthorRepo;
  brain: ReferenceBrain;
}> {
  const repo = authorRepo({
    essay: postRecord("essay", { title: "The first title" }),
  });
  const brain = await referenceBrain(repo);
  await brain.feature(ADDRESS);
  await brain.publish(ID);
  await brain.recheck();
  return { repo, brain };
}

async function metadataOf(
  brain: ReferenceBrain,
): Promise<Record<string, unknown>> {
  const [reference] = await brain.references();
  if (!reference) throw new Error("No reference is stored");
  return reference.metadata;
}

async function updatedAt(brain: ReferenceBrain): Promise<string | undefined> {
  return (
    await brain.harness.getEntityService().getEntity({
      entityType: "reference",
      id: ID,
      visibilityScope: "restricted",
    })
  )?.updated;
}

describe("the daily recheck of what a brain features", () => {
  it("changes nothing while the record is the one last seen", async () => {
    const { brain } = await featured();
    const before = await updatedAt(brain);

    await brain.recheck();

    expect(await updatedAt(brain)).toBe(before);
    expect(await metadataOf(brain)).toMatchObject({
      status: "published",
      sourceState: "active",
      title: "The first title",
    });
    expect(brain.rebuilds).toEqual([]);
  });

  it("updates the fields of a record that changed, in place", async () => {
    const { repo, brain } = await featured();
    repo.posts.set(
      "essay",
      postRecord("essay", {
        title: "A better title",
        summary: "A rewritten summary.",
        body: "A REWRITTEN BODY",
      }),
    );

    await brain.recheck();

    expect(await brain.references()).toEqual([
      {
        id: ID,
        content: "",
        metadata: expect.objectContaining({
          status: "published",
          sourceState: "active",
          title: "A better title",
          summary: "A rewritten summary.",
        }),
      },
    ]);
    expect(JSON.stringify(await brain.references())).not.toContain("BODY");
  });

  it("keeps the byline the author's own", async () => {
    const { repo, brain } = await featured();
    repo.card = { anchor: { name: "Ada, Renamed" } };

    await brain.recheck();

    expect((await metadataOf(brain))["author"]).toBe("Ada, Renamed");
  });

  it("withdraws an entry whose record is gone, and asks for one rebuild", async () => {
    const { repo, brain } = await featured();
    repo.posts.delete("essay");

    await brain.recheck();

    expect(await metadataOf(brain)).toMatchObject({
      status: "published",
      sourceState: "withdrawn",
      title: "The first title",
    });
    expect(brain.rebuilds).toHaveLength(1);

    await brain.recheck();

    expect(brain.rebuilds).toHaveLength(1);
  });

  it("asks for one rebuild however many entries a run withdraws", async () => {
    const repo = authorRepo({
      one: postRecord("one"),
      two: postRecord("two"),
    });
    const brain = await referenceBrain(repo);
    await brain.feature("https://author.example/essays/one");
    await brain.feature("https://author.example/essays/two");
    repo.posts.clear();

    await brain.recheck();

    expect(
      (await brain.references()).map(({ metadata }) => metadata["sourceState"]),
    ).toEqual(["withdrawn", "withdrawn"]);
    expect(brain.rebuilds).toHaveLength(1);
  });

  it("makes an entry active again when its record returns", async () => {
    const { repo, brain } = await featured();
    repo.posts.delete("essay");
    await brain.recheck();

    repo.posts.set("essay", postRecord("essay", { title: "Back again" }));
    await brain.recheck();

    expect(await metadataOf(brain)).toMatchObject({
      status: "published",
      sourceState: "active",
      title: "Back again",
    });
  });

  it("changes nothing when the author's PDS fails, and counts the failure", async () => {
    const { repo, brain } = await featured();
    const before = await updatedAt(brain);
    repo.down = true;

    await brain.recheck();
    await brain.recheck();

    expect(await updatedAt(brain)).toBe(before);
    expect((await metadataOf(brain))["sourceState"]).toBe("active");
    expect(brain.rebuilds).toEqual([]);
    expect(await brain.checkState(ID)).toMatchObject({
      failureCount: 2,
      lastError: "Upstream failure",
    });

    repo.down = false;
    await brain.recheck();

    expect(await brain.checkState(ID)).not.toHaveProperty("failureCount");
  });

  for (const code of ["RepoNotFound", "RepoDeactivated", "RepoTakendown"]) {
    it(`withdraws an author's entries when their account is reported ${code}`, async () => {
      const { repo, brain } = await featured();
      repo.accountError = code;

      await brain.recheck();

      expect(await metadataOf(brain)).toMatchObject({
        status: "published",
        sourceState: "withdrawn",
      });
      expect(brain.rebuilds).toHaveLength(1);
    });
  }

  it("withdraws an author's entries when their identity is deleted for good", async () => {
    const { repo, brain } = await featured();
    repo.tombstoned = true;

    await brain.recheck();

    expect((await metadataOf(brain))["sourceState"]).toBe("withdrawn");
    expect(brain.rebuilds).toHaveLength(1);
  });

  it("makes the entries active again when the account returns", async () => {
    const { repo, brain } = await featured();
    repo.accountError = "RepoDeactivated";
    await brain.recheck();

    repo.accountError = undefined;
    await brain.recheck();

    expect((await metadataOf(brain))["sourceState"]).toBe("active");
  });

  it("changes nothing when the author's repo cannot be found", async () => {
    const { repo, brain } = await featured();
    repo.unresolvable = true;

    await brain.recheck();

    expect((await metadataOf(brain))["sourceState"]).toBe("active");
    expect(await brain.checkState(ID)).toMatchObject({ failureCount: 1 });
  });
});
