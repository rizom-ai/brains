/** @jsxImportSource react */

import { describe, expect, it } from "bun:test";
import type { AuthAccountSnapshot } from "@brains/auth-service/account-contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountApp, type AccountBootstrap } from "./App";

const bootstrap: AccountBootstrap = {
  displayName: "Mira Reyes",
  role: "trusted",
  routePath: "/account",
};

const account: AuthAccountSnapshot = {
  displayName: "Mira Reyes",
  role: "trusted",
  connectedChannels: [
    {
      type: "email",
      label: "mira@example.com",
      verifiedAt: 1_735_689_600_000,
    },
  ],
  passkeys: [
    {
      id: "credential-1",
      credentialBackedUp: true,
      createdAt: 1_735_689_600_000,
      updatedAt: 1_735_689_600_000,
    },
  ],
  sessions: [
    {
      id: "session-1",
      current: true,
      createdAt: 1_735_689_600,
      expiresAt: 1_738_281_600,
    },
  ],
};

function render(snapshot: AuthAccountSnapshot = account): string {
  return renderToStaticMarkup(
    createElement(AccountApp, {
      bootstrap,
      initialAccount: snapshot,
    }),
  );
}

describe("Account surface", () => {
  it("renders self-service identity, credential, and session controls", () => {
    const html = render();

    expect(html).toContain("Mira Reyes");
    expect(html).toContain("trusted");
    expect(html).toContain("Display name");
    expect(html).toContain("Connected channels");
    expect(html).toContain("Passkeys");
    expect(html).toContain("Signed-in sessions");
    expect(html).toContain("mira@example.com");
    expect(html).toContain(
      "Verified contact details connected to your account.",
    );
    expect(html).toContain("This session");
    expect(html).toContain("Sign out everywhere");
    expect(html).not.toContain("Members");
    expect(html).not.toContain("Invitations");
    expect(html).not.toContain("Audit");
  });

  it("uses the admin console detail layout", () => {
    const html = render();

    // Surface-title hero like Admin's, with the signed-in account in the
    // mono meta block.
    expect(html).toContain("<h1>Account</h1>");
    expect(html).toContain("signed in as");
    // One detail card with the admin identity header and labeled sections,
    // not a bespoke multi-column panel grid.
    expect(html).toContain("people-detail-identity");
    expect(html).toContain("people-detail-name");
    expect(html).toContain("people-detail-section");
    expect(html).toContain("people-access-item");
    expect(html).toContain("people-detail-footer");
    expect(html).not.toContain("account-grid");
    expect(html).not.toContain("panel-heading");
    // A single live status region exists at surface level.
    expect(html).toContain('role="status"');
  });

  it("does not render a revoke action for the final passkey", () => {
    expect(render()).not.toContain(">Revoke</button>");
  });

  it("renders passkey revocation only when another credential remains", () => {
    const html = render({
      ...account,
      passkeys: [
        ...account.passkeys,
        {
          id: "credential-2",
          credentialBackedUp: false,
          createdAt: 1_735_689_700_000,
          updatedAt: 1_735_689_700_000,
        },
      ],
    });

    expect(html.match(/>Revoke<\/button>/g)).toHaveLength(2);
  });
});
