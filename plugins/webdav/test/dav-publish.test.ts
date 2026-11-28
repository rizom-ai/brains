import { describe, expect, it } from "bun:test";
import { doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const SYNC = { "x-brain-sync": "1" };
const laptop: As = { user: "laptop" };

function library(): FakeBrain {
  return fakeBrain([
    entity("note", "readme", { content: doc("Readme") }),
    entity("post", "tea", { content: doc("Tea", "status: draft\n") }),
    entity("post", "board-only", {
      content: doc("Board", "status: draft\n"),
      visibility: "restricted",
    }),
  ]);
}

const publish = (path: string): { body: string; headers: typeof SYNC } => ({
  body: JSON.stringify({ path }),
  headers: SYNC,
});

/**
 * A sync client's person chooses "Publish" on a file. The drive names the
 * entry the file is and asks the publishing pipeline to publish it now, as
 * that person; the pipeline decides whether it may be.
 */
describe("publishing the entry a file is", () => {
  it("asks the pipeline to publish it as the person, and answers where it is", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      ...publish("post/tea.md"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      published: true,
      url: "https://example.com/tea",
    });
    expect(brain.publishAsked).toEqual([
      {
        entityType: "post",
        id: "tea",
        userId: "laptop",
        permissionLevel: "trusted",
      },
    ]);
  });

  it("passes on the pipeline's reason when it refuses", async () => {
    const brain = library();
    brain.publishRefusal = "Missing required fields: excerpt";
    const dav = drive(brain);

    const response = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      ...publish("post/tea.md"),
    });

    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Missing required fields: excerpt");
  });

  it("finds no entry at a path that names none the person may see", async () => {
    const brain = library();
    const dav = drive(brain);

    const none = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      ...publish("post/nothing.md"),
    });
    const hidden = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      ...publish("post/board-only.md"),
    });

    // Refused with the same words either way; "not found" is what a brain
    // from before this call answers.
    expect(none.status).toBe(409);
    expect(hidden.status).toBe(409);
    expect(await none.text()).toBe(await hidden.text());
    expect(brain.publishAsked).toEqual([]);
  });

  it("needs a path in its body", async () => {
    const brain = library();
    const dav = drive(brain);

    const empty = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      headers: SYNC,
      body: "{}",
    });
    const noise = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      headers: SYNC,
      body: "not json",
    });

    expect(empty.status).toBe(400);
    expect(noise.status).toBe(400);
    expect(brain.publishAsked).toEqual([]);
  });

  it("is unavailable on a brain without a publishing pipeline", async () => {
    const brain = library();
    brain.publishingAvailable = false;
    const dav = drive(brain);

    const response = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      ...publish("post/tea.md"),
    });

    expect(response.status).toBe(503);
  });

  it("refuses a read-only app password", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("POST", "/dav/.brain/publish", {
      as: { ...laptop, access: "read" },
      ...publish("post/tea.md"),
    });

    expect(response.status).toBe(403);
    expect(brain.publishAsked).toEqual([]);
  });

  it("is the only thing a POST does, and only for a sync client", async () => {
    const brain = library();
    const dav = drive(brain);

    const mount = await dav("POST", "/dav/.brain/publish", {
      as: laptop,
      body: JSON.stringify({ path: "post/tea.md" }),
    });
    const file = await dav("POST", "/dav/post/tea.md", {
      as: laptop,
      headers: SYNC,
      body: "x",
    });
    const other = await dav("POST", "/dav/.brain/related", {
      as: laptop,
      headers: SYNC,
      body: "{}",
    });

    expect(mount.status).toBe(405);
    expect(file.status).toBe(405);
    expect(other.status).toBe(405);
    expect(brain.publishAsked).toEqual([]);
  });
});
