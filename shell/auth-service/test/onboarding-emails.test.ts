import { describe, expect, it } from "bun:test";
import {
  renderOnboardingEmail,
  type OnboardingEmailInput,
} from "../src/onboarding-emails";

const setupUrl = "https://team.brain.test/setup?token=setup_abc";
const anchorSetupUrl = "https://yeehaa.brain.test/setup?token=setup_xyz";
const links = {
  chat: "/chat",
  studio: "/studio",
  aiTools: "/studio/workspaces/studio%3Aaccount?section=ai-tools",
};

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
    purpose: "Keep the team’s decisions, plans and meeting notes in one place",
    links,
    ...overrides,
  };
}

function anchorSetup(
  overrides: Partial<
    Extract<OnboardingEmailInput, { kind: "anchor-setup" }>
  > = {},
): OnboardingEmailInput {
  return {
    kind: "anchor-setup",
    setupUrl: anchorSetupUrl,
    expiresAt: 1_800_000_000,
    links,
    ...overrides,
  };
}

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

    it("says what the brain is for", () => {
      const { text, html } = renderOnboardingEmail(invitation());

      expect(text).toContain(
        "What it’s for: Keep the team’s decisions, plans and meeting notes in one place.",
      );
      expect(html).toContain(
        "What it’s for: Keep the team’s decisions, plans and meeting notes in one place.",
      );
    });

    it("leaves the purpose out when the brain has none", () => {
      expect(
        renderOnboardingEmail(invitation({ purpose: undefined })).text,
      ).not.toContain("What it’s for");
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

    it("escapes the brain, inviter and purpose in the HTML part", () => {
      const { html, text } = renderOnboardingEmail(
        invitation({
          brainName: "<b>Lab</b>",
          inviterName: "Ana & Bo",
          purpose: "Track <script>",
        }),
      );

      expect(html).toContain("&lt;b&gt;Lab&lt;/b&gt;");
      expect(html).toContain("Ana &amp; Bo");
      expect(html).toContain("Track &lt;script&gt;");
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
    it("greets a named person anchor", () => {
      const { subject, text, html } = renderOnboardingEmail(
        anchorSetup({ greetingName: "Becca" }),
      );

      expect(subject).toBe("Becca, your brain is ready");
      expect(text).toStartWith("Hi Becca, your brain is ready\n");
      expect(html).toContain("Hi Becca, your brain is ready");
    });

    it("keeps the plain opening without a name", () => {
      const { subject, text } = renderOnboardingEmail(anchorSetup());

      expect(subject).toBe("Your brain is ready — here’s how to start");
      expect(text).toStartWith("Your brain is ready\n");
      expect(text).toContain(
        "Your brain at yeehaa.brain.test is set up and waiting for you. Set up your passkey to sign in.",
      );
      expect(text).toContain(
        "This link works once and expires on Friday, 15 January 2027 at 08:00 UTC. Don’t forward it.",
      );
      expect(text).not.toContain("What it’s for");
    });

    it("escapes the greeting name in the HTML part", () => {
      expect(
        renderOnboardingEmail(anchorSetup({ greetingName: "<i>Bo</i>" })).html,
      ).toContain("Hi &lt;i&gt;Bo&lt;/i&gt;, your brain is ready");
    });

    it("links the setup button", () => {
      const { html } = renderOnboardingEmail(anchorSetup());

      expect(html).toContain(`href="${anchorSetupUrl}"`);
      expect(html).toContain(">Set up your passkey</a>");
    });
  });

  describe.each([
    ["invitation", invitation(), "https://team.brain.test", "the brain"],
    ["anchor setup", anchorSetup(), "https://yeehaa.brain.test", "your brain"],
  ] as const)("shared onboarding body (%s)", (_kind, input, origin, whose) => {
    it("walks through a first save and ask in chat", () => {
      const { text, html } = renderOnboardingEmail(input);

      expect(text).toContain("Your first five minutes");
      expect(text).toContain(
        `Open chat (${origin}/chat) and say “Help me save my first note.” Give it a rough thought — a half-formed idea is fine. Then ask about it: “What did I just save?”`,
      );
      expect(text).toContain(
        `Use Studio (${origin}/studio) to browse and edit everything the brain holds.`,
      );
      expect(html).toContain(`href="${origin}/chat"`);
      expect(html).toContain(`href="${origin}/studio"`);
    });

    it("points to Account → AI tools instead of listing connection steps", () => {
      const { text, html } = renderOnboardingEmail(input);
      const aiTools = `${origin}/studio/workspaces/studio%3Aaccount?section=ai-tools`;

      expect(text).toContain("Bring it into your AI tools");
      expect(text).toContain(
        `The AI tools you already use — Claude, ChatGPT, Cursor and others — can work with ${whose} directly. Account → AI tools (${aiTools}) has the address and the steps for each one.`,
      );
      expect(html).toContain(`href="${aiTools}"`);
      expect(text).not.toContain("claude mcp add");
      expect(text).not.toContain("/mcp");
    });

    it("drops each sentence whose link the brain does not serve", () => {
      const { text } = renderOnboardingEmail({ ...input, links: {} });

      expect(text).not.toContain("Your first five minutes");
      expect(text).not.toContain("Bring it into your AI tools");
      expect(
        renderOnboardingEmail({ ...input, links: { chat: "/chat" } }).text,
      ).toContain("Your first five minutes");
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
