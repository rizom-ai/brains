import { describe, expect, it } from "bun:test";
import {
  resolveUploadFollowUp,
  type UploadCandidate,
} from "../../src/message-interface/upload-continuity";

function upload(
  id: string,
  filename: string,
  mediaType = "image/png",
): UploadCandidate {
  return { id, filename, mediaType };
}

describe("upload follow-up continuity", () => {
  it("selects the latest matching upload for a current-attachment save reference", () => {
    const resolution = resolveUploadFollowUp({
      message: "save it as an image",
      history: [],
      candidates: [
        upload("upload-first", "flirty-robot.png"),
        upload("upload-second", "drunken-robot.png"),
      ],
    });

    expect(resolution).toEqual({
      kind: "selected",
      actionMessage: "save it as an image",
      candidate: upload("upload-second", "drunken-robot.png"),
    });
  });

  it("preserves the original action when resolving an upload clarification answer", () => {
    const resolution = resolveUploadFollowUp({
      message: "the last one",
      history: [
        { role: "user", text: "save it as an image" },
        {
          role: "assistant",
          text: "Which uploaded file should I use? `flirty-robot.png`, `drunken-robot.png`",
        },
      ],
      candidates: [
        upload("upload-first", "flirty-robot.png"),
        upload("upload-second", "drunken-robot.png"),
      ],
    });

    expect(resolution).toEqual({
      kind: "selected",
      actionMessage: "save it as an image",
      candidate: upload("upload-second", "drunken-robot.png"),
    });
  });

  it("asks for clarification when a multi-upload reference has no current or positional target", () => {
    const resolution = resolveUploadFollowUp({
      message: "describe an image upload",
      history: [],
      candidates: [
        upload("upload-first", "flirty-robot.png"),
        upload("upload-second", "drunken-robot.png"),
      ],
    });

    expect(resolution).toEqual({
      kind: "clarify",
      candidates: [
        upload("upload-first", "flirty-robot.png"),
        upload("upload-second", "drunken-robot.png"),
      ],
    });
  });
});
