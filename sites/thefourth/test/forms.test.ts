import { describe, expect, test } from "bun:test";
import { formsCSS } from "../src/forms";
import site from "../src";

// The brain's forms (the brand test among them) come as the engine's plain
// form; the site dresses them on its paper stage, ahead of the engine's own
// zero-specificity look.
describe("forms on the paper stage", () => {
  test("restyles every part of the engine's form within the site", () => {
    for (const part of [
      ".tf-site .form h1",
      ".tf-site .form .form__step",
      ".tf-site .form .form__choice",
      ".tf-site .form .form__choice:has(input:checked)",
      ".tf-site .form button",
      ".tf-site .form .form__back",
      ".tf-site .form .form__progress",
      ".tf-site .form .form__error",
      ".tf-site .form .form__outcome",
    ])
      expect(formsCSS).toContain(part);
    expect(site.themeOverride).toContain(formsCSS);
  });
});
