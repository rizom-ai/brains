import { describe, expect, it } from "bun:test";
import {
  renderOnboardingEmail,
  type OnboardingEmailInput,
} from "../src/onboarding-emails";

const setupUrl = "https://team.brain.test/setup?token=setup_abc";

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

describe("renderOnboardingEmail", () => {
  describe("invitation", () => {
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

    it("states the role without describing permissions", () => {
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
        "This link works once and expires on Friday, 15 January 2027 at 08:00 UTC.",
      );
      expect(html).toContain("Friday, 15 January 2027 at 08:00 UTC");
      expect(text).not.toContain("2027-01-15T");
    });

    it("carries the setup link and the next-step links in the text part", () => {
      const { text } = renderOnboardingEmail(invitation());

      expect(text).toContain(setupUrl);
      expect(text).toContain("https://team.brain.test/chat");
      expect(text).toContain("https://team.brain.test/studio");
    });

    it("links the button and repeats the raw setup link in the HTML part", () => {
      const { html } = renderOnboardingEmail(invitation());

      expect(html).toContain(`href="${setupUrl}"`);
      expect(html).toContain("Accept and set up your passkey");
      expect(html).toContain('href="https://team.brain.test/chat"');
      expect(html).toContain('href="https://team.brain.test/studio"');
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

    it("tells both parts the same thing", () => {
      const { html, text } = renderOnboardingEmail(invitation());

      for (const sentence of [
        "Set up your passkey to accept.",
        "A passkey replaces a password",
        "Don’t forward it — it’s tied to you.",
        "Register your passkey. You’re signed in straight away.",
        "ask the brain what it knows",
        "Didn’t expect this email? Ignore it — the link expires on its own.",
      ]) {
        expect(text).toContain(sentence);
        expect(html).toContain(sentence);
      }
    });

    it("rejects input that is not a setup link", () => {
      expect(() =>
        renderOnboardingEmail(invitation({ setupUrl: "not a url" })),
      ).toThrow();
    });
  });
});
