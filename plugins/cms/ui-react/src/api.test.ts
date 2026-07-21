import { describe, expect, it } from "bun:test";
import { cmsApiPath, configureCmsApiBasePath } from "./api";

describe("cmsApiPath", () => {
  it("derives API requests from the configured CMS route", () => {
    expect(cmsApiPath("workspace?id=publishing", "/studio")).toBe(
      "/studio/api/workspace?id=publishing",
    );
    expect(cmsApiPath("entities?type=post", "/operator/content/")).toBe(
      "/operator/content/api/entities?type=post",
    );
  });

  it("retains the default CMS route", () => {
    expect(cmsApiPath("types", "/cms")).toBe("/cms/api/types");
  });

  it("uses the configured shell base instead of the current deep pathname", () => {
    configureCmsApiBasePath("/studio");
    expect(cmsApiPath("types")).toBe("/studio/api/types");
    configureCmsApiBasePath("/cms");
  });
});
