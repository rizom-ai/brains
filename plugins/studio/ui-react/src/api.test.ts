import { describe, expect, it } from "bun:test";
import { studioApiPath, configureStudioApiBasePath } from "./api";

describe("studioApiPath", () => {
  it("derives API requests from the configured Studio route", () => {
    expect(studioApiPath("workspace?id=publishing", "/studio")).toBe(
      "/studio/api/workspace?id=publishing",
    );
    expect(studioApiPath("entities?type=post", "/operator/content/")).toBe(
      "/operator/content/api/entities?type=post",
    );
  });

  it("retains the default Studio route", () => {
    expect(studioApiPath("types", "/studio")).toBe("/studio/api/types");
  });

  it("uses the configured shell base instead of the current deep pathname", () => {
    configureStudioApiBasePath("/studio");
    expect(studioApiPath("types")).toBe("/studio/api/types");
    configureStudioApiBasePath("/studio");
  });
});
