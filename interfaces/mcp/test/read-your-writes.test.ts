import { describe, expect, it } from "bun:test";
import { readYourWrites } from "../src/read-your-writes";

/**
 * What this package still owns after the conversion.
 *
 * Holding a conversation, scoping it to its caller, and turning a pending
 * confirmation into something a client can answer are all the runtime's now,
 * and tested where they live. What is left here is the one thing that is
 * genuinely about MCP clients: a client that asked the brain to write
 * something gets prose back, and needs the ids to read it again.
 */

describe("read-your-writes handles", () => {
  it("names what a turn addressed, from wherever the tool put it", () => {
    expect(
      readYourWrites([
        {
          toolName: "system_create",
          args: { entityType: "note", title: "Note" },
          data: { entityId: "note-1", status: "queued", jobId: "job-1" },
        },
        {
          toolName: "system_update",
          args: { type: "note" },
          jobId: "job-2",
          data: { id: "note-2" },
        },
      ]),
    ).toEqual([
      {
        toolName: "system_create",
        entityType: "note",
        entityId: "note-1",
        jobId: "job-1",
      },
      {
        toolName: "system_update",
        entityType: "note",
        entityId: "note-2",
        jobId: "job-2",
      },
    ]);
  });

  it("keeps a handle that has only a job to follow", () => {
    expect(
      readYourWrites([
        { toolName: "site-builder_build", jobId: "build-1", data: {} },
      ]),
    ).toEqual([{ toolName: "site-builder_build", jobId: "build-1" }]);
  });

  it("drops a result that addressed nothing", () => {
    // A read answered; there is nothing to read back afterwards, and
    // reporting an empty handle would send a client looking for it.
    expect(
      readYourWrites([
        { toolName: "system_search", args: { query: "notes" }, data: [] },
        { toolName: "system_status", data: { healthy: true } },
      ]),
    ).toEqual([]);
  });

  it("ignores an id that is not a string", () => {
    expect(
      readYourWrites([{ toolName: "odd_tool", data: { entityId: 7 } }]),
    ).toEqual([]);
  });
});
