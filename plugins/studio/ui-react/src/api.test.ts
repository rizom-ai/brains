import { describe, expect, it } from "bun:test";
import { studioApiPath } from "./api";

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
});
