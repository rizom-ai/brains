import { describe, expect, it } from "bun:test";
import {
  renderOnboardingEmail,
  type OnboardingEmailInput,
} from "../src/onboarding-emails";

const setupUrl = "https://team.brain.test/setup?token=setup_abc";
const anchorSetupUrl = "https://yeehaa.brain.test/setup?token=setup_xyz";

function invitation(
  overrides: Partial<
    Extract<OnboardingEmailInput, { kind: "invitation" }>
  > = {},
): OnboardingEmailInput {
  return {
    kind: "invitation",
    setupUrl,
    expiresAt: 1_800_000_000,
    brainName: "Rizom",
    role: "trusted",
    inviterName: "Sam Jansen",
    ...overrides,
  };
}

const anchorSetup: OnboardingEmailInput = {
  kind: "anchor-setup",
  setupUrl: anchorSetupUrl,
  expiresAt: 1_800_000_000,
};

describe("renderOnboardingEmail", () => {
  describe("invitation opening", () => {
    it("names the inviter and the brain in the subject", () => {
      expect(renderOnboardingEmail(invitation()).subject).toBe(
        "Sam Jansen invited you to the Rizom brain",
      );
    });

    it("drops the inviter clause when the inviter is unknown", () => {
      const email = renderOnboardingEmail(
        invitation({ inviterName: undefined }),
      );

      expect(email.subject).toBe("You’re invited to the Rizom brain");
      expect(email.text).toContain(
        "You’ve been invited to join the Rizom brain at team.brain.test",
      );
      expect(email.text).not.toContain("Sam Jansen");
    });

    it("states the role", () => {
      expect(renderOnboardingEmail(invitation()).text).toContain(
        "Sam Jansen invited you to join the Rizom brain at team.brain.test as a trusted member.",
      );
      expect(
        renderOnboardingEmail(invitation({ role: "admin" })).text,
      ).toContain("as an admin.");
    });

    it("prints the expiry as a readable UTC date", () => {
      const { text, html } = renderOnboardingEmail(invitation());

      expect(text).toContain(
        "This link works once and expires on Friday, 15 January 2027 at 08:00 UTC. Don’t forward it — it’s tied to you.",
      );
      expect(html).toContain("Friday, 15 January 2027 at 08:00 UTC");
      expect(text).not.toContain("2027-01-15T");
    });

    it("links the accept button and repeats the raw setup link in the HTML part", () => {
      const { html } = renderOnboardingEmail(invitation());

      expect(html).toContain(`href="${setupUrl}"`);
      expect(html).toContain(">Accept and set up your passkey</a>");
      expect(
        html.match(new RegExp(setupUrl.replace(/[?]/g, "\\?"), "g")),
      ).toHaveLength(2);
    });

    it("escapes the brain and inviter names in the HTML part", () => {
      const { html, text } = renderOnboardingEmail(
        invitation({ brainName: "<b>Lab</b>", inviterName: "Ana & Bo" }),
      );

      expect(html).toContain("&lt;b&gt;Lab&lt;/b&gt;");
      expect(html).toContain("Ana &amp; Bo");
      expect(html).not.toContain("<b>Lab</b>");
      expect(text).toContain(
        "Ana & Bo invited you to join the <b>Lab</b> brain",
      );
    });

    it("rejects input that is not a setup link", () => {
      expect(() =>
        renderOnboardingEmail(invitation({ setupUrl: "not a url" })),
      ).toThrow();
    });
  });

  describe("anchor setup opening", () => {
    it("tells the anchor their brain is ready", () => {
      const { subject, text } = renderOnboardingEmail(anchorSetup);

      expect(subject).toBe("Your brain is ready — here’s how to start");
      expect(text).toContain(
        "Your brain at yeehaa.brain.test is set up and waiting for you. Set up your passkey to sign in.",
      );
      expect(text).toContain(
        "This link works once and expires on Friday, 15 January 2027 at 08:00 UTC. Don’t forward it.",
      );
    });

    it("links the setup button", () => {
      const { html } = renderOnboardingEmail(anchorSetup);

      expect(html).toContain(`href="${anchorSetupUrl}"`);
      expect(html).toContain(">Set up your passkey</a>");
    });
  });

  describe.each([
    ["invitation", invitation(), "https://team.brain.test"],
    ["anchor setup", anchorSetup, "https://yeehaa.brain.test"],
  ] as const)("shared onboarding body (%s)", (_kind, input, origin) => {
    it("walks through a first save and ask in chat", () => {
      const { text, html } = renderOnboardingEmail(input);

      expect(text).toContain("Your first five minutes");
      expect(text).toContain(
        `Open chat (${origin}/chat) and say “Help me save my first note.”`,
      );
      expect(html).toContain(`href="${origin}/chat"`);
      for (const sentence of [
        "Save, ask, use: that loop is the core of working with the brain.",
        "to browse and edit everything the brain holds.",
      ]) {
        expect(text).toContain(sentence);
        expect(html).toContain(sentence);
      }
      expect(text).toContain(`Studio (${origin}/studio)`);
      expect(html).toContain(`href="${origin}/studio"`);
    });

    it("explains how to connect AI tools over MCP", () => {
      const { text, html } = renderOnboardingEmail(input);
      const command = `claude mcp add --transport http brain ${origin}/mcp`;

      expect(text).toContain("Use it from your own AI tools");
      expect(text).toContain(`Its address is ${origin}/mcp.`);
      expect(text).toContain(`In Claude Code, run:\n\n${command}\n`);
      expect(html).toContain(`<code`);
      expect(html).toMatch(
        new RegExp(`<div[^>]*>${command.replace(/[.]/g, "\\.")}</div>`),
      );
      for (const sentence of [
        "In Claude Desktop, add a custom connector with that address.",
        "When the tool asks, sign in with your passkey.",
      ]) {
        expect(text).toContain(sentence);
        expect(html).toContain(sentence);
      }
    });

    it("explains passkeys and ends with recovery and an unexpected-email note", () => {
      const { text, html } = renderOnboardingEmail(input);

      for (const sentence of [
        "A passkey replaces a password",
        "Lost access to your passkey? Ask whoever runs this brain for a new setup link.",
        "Didn’t expect this email? Ignore it — the link expires on its own.",
      ]) {
        expect(text).toContain(sentence);
        expect(html).toContain(sentence);
      }
    });
  });
});
