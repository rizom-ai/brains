import { fillReaderProfile, readerProfile } from "@fixture/reader-profile";
import {
  SdkError,
  defineAccountSettings,
  defineRoute,
  defineServicePlugin,
  defineTool,
  protocol,
  z,
} from "@rizom/brain/services";

const importResult = z.object({
  filled: z.array(z.string()),
  kept: z.array(z.string()),
});

// An importer fills the reader's profile from an outside source. It does not
// steward the profile, so it asks the package that does.
export default defineServicePlugin(
  { id: "reader-import", config: z.object({}) },
  {
    tools: ({ entities, messaging }) => [
      defineTool({
        name: "import-profile",
        description: "Fill the reader's profile from an imported one.",
        input: z.object({
          headline: z.string().optional(),
          website: z.string().optional(),
        }),
        output: importResult,
        sideEffects: "writes",
        async execute({ input }) {
          const asked = await messaging.request(fillReaderProfile, {
            fields: input,
          });
          if (asked.status === "answered") return asked.data;
          // The steward's refusal reaches the caller with its code.
          throw new SdkError(
            asked.status === "failed" ? asked.error.code : "no_handler",
            asked.status === "failed"
              ? { publicMessage: asked.error.message }
              : {},
          );
        },
      }),
      defineTool({
        name: "profile-headline",
        description: "Read the reader's headline; reading needs no steward.",
        input: z.object({}),
        output: z.object({ headline: z.string().nullable() }),
        sideEffects: "none",
        async execute() {
          const profile = await entities.get(readerProfile, "reader-profile");
          return { headline: profile?.metadata.headline ?? null };
        },
      }),
    ],
  },
);

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const directWriteCanary = defineServicePlugin(
  { id: "direct-write-canary", config: z.object({}) },
  {
    tools: ({ entities }) => [
      defineTool({
        name: "take-over",
        description: "Refused: writes a type another package stewards.",
        input: z.object({}),
        output: z.object({}),
        async execute() {
          const profile = await entities.get(readerProfile, "reader-profile");
          if (profile) {
            // @ts-expect-error Only the steward writes the reader profile.
            await entities.update(readerProfile, profile, {
              metadata: { ...profile.metadata, headline: "Taken over" },
            });
          }
          return {};
        },
      }),
    ],
  },
);

// The importer's connection to the outside source: a token kept in the
// account settings of the reader who connected, and never shown back.
export const readerConnectionSettings = defineAccountSettings({
  title: "Reader import",
  description: "The connection the reader import reads your profile with.",
  schema: z.object({
    accessToken: z.string().trim().min(1),
    expiresAt: z.iso.datetime().optional(),
  }),
  fields: {
    accessToken: { label: "Access token", secret: true },
    expiresAt: { label: "Expires (ISO date and time)" },
  },
});

/** The provider's half of consent: a code becomes a token. Stubbed here. */
async function exchangeCode(
  code: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  if (!code) throw new Error("The provider returned no code");
  return {
    accessToken: `token-for-${code}`,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

// An OAuth-style connection. Start claims a single-use state for the reader
// who is connecting; the provider sends the browser back to the callback with
// it, and redeeming it writes that reader's settings. The runtime checks the
// returning browser session against the one that started, so the package
// never sees sessions or names an account.
export const readerImportConnection = defineServicePlugin(
  {
    id: "reader-import-connection",
    config: z.object({
      consentUrl: z.string().url().default("https://provider.example/consent"),
    }),
    accountSettings: readerConnectionSettings,
  },
  {
    routes: ({ accountSettings, config }) => [
      defineRoute({
        method: "GET",
        path: "/reader-import/connect",
        security: { kind: "public" },
        response: z.object({ consentUrl: z.string() }),
        async handle() {
          const state = await accountSettings.claim();
          return {
            consentUrl: `${config.consentUrl}?state=${encodeURIComponent(state)}`,
          };
        },
      }),
      defineRoute({
        method: "GET",
        path: "/reader-import/callback",
        // The provider's return is signed by the single-use state it carries.
        security: protocol({
          authenticate: ({ request }) =>
            new URL(request.url).searchParams.has("state")
              ? { id: "consent-return" }
              : null,
        }),
        response: z.object({ connected: z.boolean() }),
        async handle({ request }) {
          const params = new URL(request.url).searchParams;
          // A bad state is refused before the code is exchanged.
          await accountSettings.redeem(params.get("state") ?? "", () =>
            exchangeCode(params.get("code") ?? ""),
          );
          return { connected: true };
        },
      }),
    ],
    tools: ({ accountSettings }) => [
      defineTool({
        name: "paste-token",
        description: "Keep a token the reader pasted, for their own account.",
        input: z.object({ accessToken: z.string() }),
        output: z.object({ saved: z.boolean() }),
        sideEffects: "writes",
        async execute({ input }) {
          await accountSettings.save({ accessToken: input.accessToken });
          return { saved: true };
        },
      }),
    ],
  },
);

// Included by the standalone/packed consumer typecheck, not loaded by the brain.
export const accountSettingsCanary = defineServicePlugin(
  { id: "settings-canary", config: z.object({}) },
  {
    tools: ({ accountSettings }) => [
      defineTool({
        name: "claim",
        description: "Refused: a package without settings has none to write.",
        input: z.object({}),
        output: z.object({}),
        async execute() {
          // @ts-expect-error The header declares no account settings.
          await accountSettings.claim();
          return {};
        },
      }),
    ],
    // @ts-expect-error An answer has no caller whose account to write.
    subscriptions: ({ accountSettings }) => {
      void accountSettings;
      return [];
    },
  },
);
