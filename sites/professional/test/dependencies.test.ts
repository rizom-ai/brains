import { expect, test } from "bun:test";
import { ProfessionalSitePlugin } from "../src/plugin";

test("depends on installed declarative entity identities, not retired native plugin IDs", () => {
  expect(new ProfessionalSitePlugin({}).dependencies).toEqual([
    "@brains/blog:post",
    "@brains/decks:deck",
  ]);
});
