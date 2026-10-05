import { describe, expect, it } from "bun:test";
import {
  STUDIO_ACCOUNT_WORKSPACE_ID,
  STUDIO_AI_TOOLS_SECTION,
  studioAiToolsHref,
} from "../src/studio-links";

describe("studioAiToolsHref", () => {
  it("links to the AI tools section of the Account workspace under Studio's mount", () => {
    expect(studioAiToolsHref("/studio")).toBe(
      "/studio/workspaces/studio%3Aaccount?section=ai-tools",
    );
  });

  it("ignores a trailing slash and supports Studio mounted at the root", () => {
    expect(studioAiToolsHref("/studio/")).toBe(
      "/studio/workspaces/studio%3Aaccount?section=ai-tools",
    );
    expect(studioAiToolsHref("/")).toBe(
      "/workspaces/studio%3Aaccount?section=ai-tools",
    );
  });

  it("is built from the shared workspace id and section", () => {
    expect(STUDIO_ACCOUNT_WORKSPACE_ID).toBe("studio:account");
    expect(STUDIO_AI_TOOLS_SECTION).toBe("ai-tools");
  });
});
