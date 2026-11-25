import { describe, expect, it } from "bun:test";
import {
  AUTHOR_REPO,
  POSTS,
  authorRepo,
  postRecord,
  referenceBrain,
} from "./reference-fixture";

const ESSAY = "https://author.example/essays/scale-without-a-centre";

function essays(): ReturnType<typeof authorRepo> {
  return authorRepo({
    "scale-without-a-centre": postRecord("scale-without-a-centre", {
      title: "Scale without a centre",
      summary: "How a network grows with no one in the middle.",
      series: "Common Sense",
      brainDid: "did:web:author.example",
    }),
  });
}

describe("featuring an entity another brain publishes", () => {
  it("queues the capture for the address and writes nothing yet", async () => {
    const brain = await referenceBrain(essays());

    const answer = await brain.create({ url: ESSAY });

    expect(answer).toMatchObject({
      kind: "handled",
      result: { success: true, data: { status: "generating" } },
    });
    expect(await brain.references()).toEqual([]);
  });

  it("captures the address a prompt names", async () => {
    const brain = await referenceBrain(essays());

    await brain.create({ prompt: `Feature ${ESSAY} on the site` });
    await brain.runCapture();

    expect(await brain.references()).toHaveLength(1);
  });

  it("refuses a request that names no address", async () => {
    const brain = await referenceBrain(essays());

    expect(
      await brain.create({ prompt: "Feature Ada's latest essay" }),
    ).toMatchObject({
      kind: "handled",
      result: {
        success: false,
        error:
          "A reference is created from the address of an entity on its author's brain. Give the address.",
      },
    });
  });

  it("turns an address with a matching post record into a draft", async () => {
    const brain = await referenceBrain(essays());

    const result = await brain.feature(ESSAY);

    expect(result).toEqual({
      success: true,
      entityId: "author-example-scale-without-a-centre",
      title: "Scale without a centre",
      status: "draft",
    });
    expect(await brain.references()).toEqual([
      {
        id: "author-example-scale-without-a-centre",
        content: "",
        metadata: {
          status: "draft",
          title: "Scale without a centre",
          summary: "How a network grows with no one in the middle.",
          author: "Ada Author",
          authorSite: "author.example",
          url: ESSAY,
          publishedAt: "2026-05-02T09:00:00.000Z",
          series: "Common Sense",
          sourceState: "active",
          sourceUri: `at://${AUTHOR_REPO}/${POSTS}/scale-without-a-centre`,
          sourceEntityType: "post",
          sourceEntityId: "scale-without-a-centre",
          sourceBrain: "did:web:author.example",
        },
      },
    ]);
  });

  it("takes the byline from the author's brain card", async () => {
    const repo = essays();
    repo.card = { anchor: { name: "The Name Ada Chose" } };
    const brain = await referenceBrain(repo);

    await brain.feature(ESSAY);

    expect((await brain.references())[0]?.metadata["author"]).toBe(
      "The Name Ada Chose",
    );
  });

  it("finds the record behind a page of other records, and by an address with a trailing slash", async () => {
    const repo = authorRepo(
      Object.fromEntries(
        Array.from({ length: 23 }, (_, index) => [
          `essay-${index}`,
          postRecord(`essay-${index}`),
        ]),
      ),
    );
    const brain = await referenceBrain(repo);

    await brain.feature("https://author.example/essays/essay-22/");

    expect((await brain.references()).map(({ id }) => id)).toEqual([
      "author-example-essay-22",
    ]);
  });

  it("falls back to the description and the creation date", async () => {
    const repo = authorRepo({
      deck: postRecord("deck", {
        summary: undefined,
        description: "A deck's own description.",
        publishedAt: undefined,
      }),
    });
    const brain = await referenceBrain(repo);

    await brain.feature("https://author.example/essays/deck");

    expect((await brain.references())[0]?.metadata).toMatchObject({
      summary: "A deck's own description.",
      publishedAt: "2026-05-01T08:00:00.000Z",
    });
  });

  it("never stores the record's body", async () => {
    const brain = await referenceBrain(essays());

    await brain.feature(ESSAY);

    const stored = await brain.harness.getEntityService().getEntityRaw({
      entityType: "reference",
      id: "author-example-scale-without-a-centre",
      visibilityScope: "restricted",
    });
    expect(JSON.stringify(stored)).not.toContain("THE WHOLE BODY");
    expect(JSON.stringify(stored)).not.toContain("body");
  });

  it("returns the existing entry when the same record is featured twice", async () => {
    const brain = await referenceBrain(essays());
    await brain.feature(ESSAY);

    const again = await brain.feature(`${ESSAY}/#section`);

    expect(again).toEqual({
      success: true,
      entityId: "author-example-scale-without-a-centre",
      title: "Scale without a centre",
      status: "draft",
    });
    expect(await brain.references()).toHaveLength(1);
  });

  it("says the article has no record yet, and creates nothing", async () => {
    const brain = await referenceBrain(essays());

    const result = await brain.feature(
      "https://author.example/essays/unpublished",
    );

    expect(result).toEqual({
      success: false,
      error:
        "https://author.example/essays/unpublished has no record in author.example's repo yet. It gets one when it is published on a brain that publishes records",
    });
    expect(await brain.references()).toEqual([]);
  });

  it("says so when the site has no repo, and creates nothing", async () => {
    const brain = await referenceBrain(essays());

    const result = await brain.feature("https://medium.example/@ada/essay");

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining(
        "No AT Protocol repo was found for medium.example, so nothing there can be featured",
      ),
    });
    expect(await brain.references()).toEqual([]);
  });

  it("uses the repo the agent directory holds for the site", async () => {
    const repo = essays();
    // The site's domain is not the repo's handle; only the directory knows it.
    repo.handle = "ada.bsky.example";
    const brain = await referenceBrain(repo);
    brain.harness.getMockShell().addEntities([
      {
        id: "author.example",
        entityType: "agent",
        content: "",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
        visibility: "public",
        contentHash: "agent",
        metadata: { repoDid: AUTHOR_REPO, status: "approved" },
      },
    ]);

    const result = await brain.feature(ESSAY);

    expect(result).toMatchObject({ success: true });
    expect(
      repo.urls.some((url) => url.includes("identity.resolveHandle")),
    ).toBe(false);
  });

  it("refuses a record that names no address", async () => {
    const repo = authorRepo({
      note: postRecord("note", { canonicalUrl: undefined }),
    });
    const brain = await referenceBrain(repo);

    const result = await brain.feature("https://author.example/essays/note");

    expect(result).toMatchObject({ success: false });
    expect(await brain.references()).toEqual([]);
  });

  it("says so when the author's brain card names no author", async () => {
    const repo = essays();
    repo.card = undefined;
    const brain = await referenceBrain(repo);

    const result = await brain.feature(ESSAY);

    expect(result).toMatchObject({ success: false });
    expect(await brain.references()).toEqual([]);
  });
});
