/** @jsxImportSource react */
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PeopleApp, type PeopleBootstrap } from "./App";

const admin: PeopleBootstrap = {
  userId: "usr_yeehaa",
  displayName: "Yeehaa",
  role: "admin",
  isAnchor: true,
  brainName: "smoke-rover",
  routePath: "/admin",
};

function render(bootstrap: PeopleBootstrap): string {
  return renderToStaticMarkup(createElement(PeopleApp, { bootstrap }));
}

describe("transitional Admin surface", () => {
  it("hands every migrated administration view to its owning Studio workspace", () => {
    const html = render(admin);

    expect(html).toContain("Administration now lives in Studio");
    expect(html).toContain("admin%3Apeople");
    expect(html).toContain("admin%3Ainvitations");
    expect(html).toContain("admin%3Apeers");
    expect(html).toContain("admin%3Aaudit");
    expect(html).not.toContain("Permission role on this brain");
    expect(html).not.toContain("Create setup link");
  });

  it("does not advertise Admin workspaces below Admin", () => {
    const html = render({ ...admin, role: "trusted", isAnchor: false });

    expect(html).toContain("Admin access required");
    expect(html).not.toContain("admin%3Apeople");
  });
});
