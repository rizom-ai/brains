import { describe, expect, it } from "bun:test";
import { doc, drive, type As } from "./drive";
import { fakeBrain, type FakeBrain } from "./fake-brain";
import { entity } from "./fake-reader";

const SYNC = { "x-brain-sync": "1" };
const laptop: As = { user: "laptop" };
const PNG_REF = `asset://sha256/${"d".repeat(64)}` as const;

function library(): FakeBrain {
  const brain = fakeBrain(
    [
      entity("note", "tea", { content: doc("Tea") }),
      entity("note", "kettles", {
        content: doc("Kettles"),
        metadata: { title: "On kettles" },
      }),
      entity("post", "brewing", {
        content: doc("Brewing"),
        metadata: { title: "Brewing well" },
      }),
      entity("post", "board-only", {
        content: doc("Board"),
        visibility: "restricted",
      }),
      entity("image", "cup", { content: PNG_REF, metadata: { format: "png" } }),
    ],
    ["note", "post", "image", "conflict"],
    { [PNG_REF]: new Uint8Array([1, 2, 3]) },
  );
  brain.nearest.answer = [
    { entityType: "post", entityId: "brewing", distance: 0.12 },
    { entityType: "post", entityId: "board-only", distance: 0.2 },
    { entityType: "image", entityId: "cup", distance: 0.25 },
    { entityType: "note", entityId: "kettles", distance: 0.31 },
    { entityType: "note", entityId: "gone", distance: 0.4 },
  ];
  return brain;
}

async function related(
  response: Response,
): Promise<Array<Record<string, unknown>>> {
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("related" in body) ||
    !Array.isArray(body.related)
  ) {
    throw new Error("Not a related answer");
  }
  return body.related;
}

/**
 * A sync client shows, beside a note, the entries the brain holds nearest
 * to it. The drive answers with each as the file it is on the drive, so the
 * client can open it.
 */
describe("the entries nearest to a file", () => {
  it("are listed nearest first, each as its file, title and type", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/related?path=tea.md", {
      as: laptop,
      headers: SYNC,
    });

    expect(response.status).toBe(200);
    expect(await related(response)).toEqual([
      {
        path: "post/brewing.md",
        title: "Brewing well",
        entityType: "post",
        distance: 0.12,
      },
      {
        path: "kettles.md",
        title: "On kettles",
        entityType: "note",
        distance: 0.31,
      },
    ]);
  });

  it("are asked for as the person may see them, among entries with text", async () => {
    const brain = library();
    const dav = drive(brain);

    await dav("GET", "/dav/.brain/related?path=tea.md&limit=3", {
      as: laptop,
      headers: SYNC,
    });

    expect(brain.nearest.asked).toEqual([
      {
        origin: { entityType: "note", entityId: "tea" },
        // Not images, and not the brain's own record of lost edits.
        types: ["note", "post"],
        limit: 3,
        visibilityScope: "shared",
      },
    ]);
  });

  it("leave out what the person may not see, whatever the store answers", async () => {
    const brain = library();
    const dav = drive(brain);

    const trusted = await related(
      await dav("GET", "/dav/.brain/related?path=tea.md", {
        as: laptop,
        headers: SYNC,
      }),
    );
    const admin = await related(
      await dav("GET", "/dav/.brain/related?path=tea.md", {
        as: { ...laptop, level: "admin" },
        headers: SYNC,
      }),
    );

    expect(trusted.map((one) => one["path"])).not.toContain(
      "post/board-only.md",
    );
    expect(admin.map((one) => one["path"])).toContain("post/board-only.md");
  });

  it("are at most twenty-five, and ten when not said", async () => {
    const brain = library();
    const dav = drive(brain);

    await dav("GET", "/dav/.brain/related?path=tea.md", {
      as: laptop,
      headers: SYNC,
    });
    await dav("GET", "/dav/.brain/related?path=tea.md&limit=500", {
      as: laptop,
      headers: SYNC,
    });
    await dav("GET", "/dav/.brain/related?path=tea.md&limit=nonsense", {
      as: laptop,
      headers: SYNC,
    });

    expect(brain.nearest.asked.map((asked) => asked.limit)).toEqual([
      10, 25, 10,
    ]);
  });

  it("are read with an app password that cannot save", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/related?path=tea.md", {
      as: { ...laptop, access: "read" },
      headers: SYNC,
    });

    expect(response.status).toBe(200);
  });

  it("are none for a path that is no entry, without saying whether one is hidden", async () => {
    const brain = library();
    const dav = drive(brain);

    const none = await dav("GET", "/dav/.brain/related?path=nothing.md", {
      as: laptop,
      headers: SYNC,
    });
    const hidden = await dav(
      "GET",
      "/dav/.brain/related?path=post/board-only.md",
      { as: laptop, headers: SYNC },
    );

    // Answered, so a client can tell a brain that has this call from one
    // that has not; and the same for an entry the person may not see.
    expect(none.status).toBe(200);
    expect(await related(none)).toEqual([]);
    expect(hidden.status).toBe(200);
    expect(await related(hidden)).toEqual([]);
    expect(brain.nearest.asked).toEqual([]);
  });

  it("are none, and said to be untold, on a brain that keeps no index of meaning", async () => {
    const brain = library();
    brain.nearest.unindexed = true;
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/related?path=tea.md", {
      as: laptop,
      headers: SYNC,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ related: [], indexed: false });
  });

  it("say the brain keeps an index when it does", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/related?path=tea.md", {
      as: laptop,
      headers: SYNC,
    });

    expect(await response.json()).toMatchObject({ indexed: true });
  });

  it("need a path", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/related", {
      as: laptop,
      headers: SYNC,
    });

    expect(response.status).toBe(400);
    expect(brain.nearest.asked).toEqual([]);
  });

  it("are not there for a desktop's mount", async () => {
    const brain = library();
    const dav = drive(brain);

    const response = await dav("GET", "/dav/.brain/related?path=tea.md", {
      as: laptop,
    });

    expect(response.status).toBe(404);
    expect(brain.nearest.asked).toEqual([]);
  });
});
