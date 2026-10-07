import { escapeHtml } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

// URL parsing treats doubled slashes/backslashes as authorities and strips
// tabs/newlines. Admit only a local absolute path before resolving its origin.
const pathSchema: z.ZodString = z
  .string()
  .regex(
    /^\/(?![\\/])[^\r\n\t]*$/,
    "Onboarding links must stay on the setup origin",
  );

/**
 * Where the brain serves the surfaces the email points to, as paths resolved
 * against the setup link's origin. A missing link drops the sentence about it.
 */
const onboardingLinksSchema: z.ZodDefault<
  z.ZodObject<{
    chat: z.ZodOptional<z.ZodString>;
    studio: z.ZodOptional<z.ZodString>;
    aiTools: z.ZodOptional<z.ZodString>;
  }>
> = z
  .object({
    chat: pathSchema.optional(),
    studio: pathSchema.optional(),
    aiTools: pathSchema.optional(),
  })
  .default({});

const onboardingDetailsSchema: z.ZodObject<{
  purpose: z.ZodOptional<z.ZodString>;
  links: typeof onboardingLinksSchema;
}> = z.object({
  purpose: z.string().trim().min(1).optional(),
  links: onboardingLinksSchema,
});

/** What the brain tells a new person about itself: its purpose and where things are. */
export type OnboardingDetails = z.input<typeof onboardingDetailsSchema>;

const invitationEmailInputSchema: z.ZodObject<{
  kind: z.ZodLiteral<"invitation">;
  setupUrl: z.ZodURL;
  expiresAt: z.ZodNumber;
  brainName: z.ZodString;
  role: z.ZodEnum<{ admin: "admin"; trusted: "trusted" }>;
  inviterName: z.ZodOptional<z.ZodString>;
  purpose: z.ZodOptional<z.ZodString>;
  links: typeof onboardingLinksSchema;
}> = z.object({
  kind: z.literal("invitation"),
  setupUrl: z.url(),
  /** Unix seconds, as stored on the setup token. */
  expiresAt: z.number().int().positive(),
  brainName: z.string().trim().min(1),
  role: z.enum(["admin", "trusted"]),
  inviterName: z.string().trim().min(1).optional(),
  /** The brain character's purpose, and where the brain serves chat, Studio and AI tools. */
  ...onboardingDetailsSchema.shape,
});

const anchorSetupEmailInputSchema: z.ZodObject<{
  kind: z.ZodLiteral<"anchor-setup">;
  setupUrl: z.ZodURL;
  expiresAt: z.ZodNumber;
  greetingName: z.ZodOptional<z.ZodString>;
  links: typeof onboardingLinksSchema;
}> = z.object({
  kind: z.literal("anchor-setup"),
  setupUrl: z.url(),
  /** Unix seconds, as stored on the setup token. */
  expiresAt: z.number().int().positive(),
  /** The person anchor's name; team and organization anchors have none. */
  greetingName: z.string().trim().min(1).optional(),
  links: onboardingDetailsSchema.shape.links,
});

const onboardingEmailInputSchema: z.ZodDiscriminatedUnion<
  [typeof anchorSetupEmailInputSchema, typeof invitationEmailInputSchema],
  "kind"
> = z.discriminatedUnion("kind", [
  anchorSetupEmailInputSchema,
  invitationEmailInputSchema,
]);

export type OnboardingEmailInput = z.input<typeof onboardingEmailInputSchema>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** A run of body text: plain, emphasised, a link, or literal code. */
type Run =
  | string
  | { strong: string }
  | { link: { label: string; href: string } }
  | { code: string };

interface Section {
  heading: string;
  paragraphs: Run[][];
}

/**
 * Everything an onboarding email says, independent of format. The text and
 * HTML parts are both serialized from this, so they cannot say different things.
 */
interface EmailCopy {
  subject: string;
  host: string;
  heading: string;
  intro: Run[];
  /** What the brain is for, shown under the intro. */
  purpose?: string | undefined;
  setupUrl: string;
  buttonLabel: string;
  notes: string[];
  sections: Section[];
  footer: string[];
}

/** What differs between the anchor and the invited person: who, why, and the button. */
type Opening = Pick<
  EmailCopy,
  "subject" | "heading" | "intro" | "buttonLabel"
> & { forwardNote: string; purpose?: string | undefined };

const PASSKEY_NOTE =
  "A passkey replaces a password: your device confirms it’s you with your fingerprint, face or screen lock. It takes under a minute.";

const ROLE_PHRASES = {
  admin: "an admin",
  trusted: "a trusted member",
} as const;

export function renderOnboardingEmail(
  input: OnboardingEmailInput,
): RenderedEmail {
  const parsed = onboardingEmailInputSchema.parse(input);
  const url = new URL(parsed.setupUrl);
  const opening =
    parsed.kind === "anchor-setup"
      ? anchorSetupOpening(parsed, url)
      : invitationOpening(parsed, url);
  const resolve = (path: string | undefined): string | undefined =>
    path ? new URL(path, url.origin).toString() : undefined;
  const copy: EmailCopy = {
    subject: opening.subject,
    host: url.host,
    heading: opening.heading,
    intro: opening.intro,
    purpose: opening.purpose,
    setupUrl: parsed.setupUrl,
    buttonLabel: opening.buttonLabel,
    notes: [
      PASSKEY_NOTE,
      `This link works once and expires on ${formatExpiry(parsed.expiresAt)}. ${opening.forwardNote}`,
    ],
    sections: onboardingSections(
      {
        chat: resolve(parsed.links.chat),
        studio: resolve(parsed.links.studio),
        aiTools: resolve(parsed.links.aiTools),
      },
      parsed.kind === "anchor-setup" ? "your brain" : "the brain",
    ),
    footer: [
      "Lost access to your passkey? Ask whoever runs this brain for a new setup link.",
      "Didn’t expect this email? Ignore it — the link expires on its own.",
    ],
  };
  return {
    subject: copy.subject,
    text: renderText(copy),
    html: renderHtml(copy),
  };
}

function anchorSetupOpening(
  input: z.output<typeof anchorSetupEmailInputSchema>,
  url: URL,
): Opening {
  const name = input.greetingName;
  return {
    subject: name
      ? `${name}, your brain is ready`
      : "Your brain is ready — here’s how to start",
    heading: name ? `Hi ${name}, your brain is ready` : "Your brain is ready",
    intro: [
      "Your brain at ",
      { strong: url.host },
      " is set up and waiting for you. Set up your passkey to sign in.",
    ],
    buttonLabel: "Set up your passkey",
    forwardNote: "Don’t forward it.",
  };
}

function invitationOpening(
  input: z.output<typeof invitationEmailInputSchema>,
  url: URL,
): Opening {
  const brain = `the ${input.brainName} brain`;
  const invited: Run[] = input.inviterName
    ? [{ strong: input.inviterName }, ` invited you to join ${brain} at `]
    : [`You’ve been invited to join ${brain} at `];
  return {
    subject: input.inviterName
      ? `${input.inviterName} invited you to ${brain}`
      : `You’re invited to ${brain}`,
    heading: `You’re invited to ${brain}`,
    intro: [
      ...invited,
      { strong: url.host },
      ` as ${ROLE_PHRASES[input.role]}. Set up your passkey to accept.`,
    ],
    purpose: input.purpose
      ? `What it’s for: ${sentence(input.purpose)}`
      : undefined,
    buttonLabel: "Accept and set up your passkey",
    forwardNote: "Don’t forward it — it’s tied to you.",
  };
}

/** Ends free text with a full stop unless it already ends a sentence. */
function sentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/** The onboarding both recipients get once they are signed in. */
function onboardingSections(
  links: {
    chat?: string | undefined;
    studio?: string | undefined;
    aiTools?: string | undefined;
  },
  whose: "your brain" | "the brain",
): Section[] {
  const firstSteps: Run[][] = [
    ...(links.chat
      ? [
          [
            "Open ",
            { link: { label: "chat", href: links.chat } },
            " and say “Help me save my first note.” Give it a rough thought — a half-formed idea is fine. Then ask about it: “What did I just save?”",
          ],
        ]
      : []),
    ...(links.studio
      ? [
          [
            "Use ",
            { link: { label: "Studio", href: links.studio } },
            " to browse and edit everything the brain holds.",
          ],
        ]
      : []),
  ];
  return [
    ...(firstSteps.length > 0
      ? [{ heading: "Your first five minutes", paragraphs: firstSteps }]
      : []),
    ...(links.aiTools
      ? [
          {
            heading: "Bring it into your AI tools",
            paragraphs: [
              [
                `The AI tools you already use — Claude, ChatGPT, Cursor and others — can work with ${whose} directly. `,
                { link: { label: "Account → AI tools", href: links.aiTools } },
                " has the address and the steps for each one.",
              ],
            ],
          },
        ]
      : []),
  ];
}

/** The recipient's time zone is unknown, so the date names UTC explicitly. */
function formatExpiry(expiresAtSeconds: number): string {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(expiresAtSeconds * 1000));
  return `${formatted} UTC`;
}

function runText(run: Run): string {
  if (typeof run === "string") return run;
  if ("strong" in run) return run.strong;
  if ("code" in run) return run.code;
  return `${run.link.label} (${run.link.href})`;
}

function renderText(copy: EmailCopy): string {
  const paragraph = (runs: Run[]): string => runs.map(runText).join("");
  return [
    copy.heading,
    paragraph(copy.intro),
    ...(copy.purpose ? [copy.purpose] : []),
    copy.setupUrl,
    ...copy.notes,
    ...copy.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs.map(paragraph),
    ]),
    ...copy.footer,
  ]
    .join("\n\n")
    .concat("\n");
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const INK = "#1d2126";
const MUTED = "#5f6873";
const FAINT = "#7a838d";

function runHtml(run: Run): string {
  if (typeof run === "string") return escapeHtml(run);
  if ("strong" in run) return `<strong>${escapeHtml(run.strong)}</strong>`;
  if ("code" in run) {
    return `<code style="font-family:${MONO};font-size:13px;background:#f1f3f5;border-radius:4px;padding:1px 5px;word-break:break-all;">${escapeHtml(run.code)}</code>`;
  }
  return `<a href="${escapeHtml(run.link.href)}" style="color:${INK};">${escapeHtml(run.link.label)}</a>`;
}

/** A paragraph that is nothing but code is a command to copy, so it gets its own block. */
function paragraphHtml(runs: Run[], last: boolean): string {
  const margin = `margin:0 0 ${last ? 0 : 10}px;`;
  const [only] = runs;
  if (runs.length === 1 && typeof only === "object" && "code" in only) {
    return `<div style="${margin}font-family:${MONO};font-size:13px;line-height:1.5;background:#f1f3f5;border-radius:6px;padding:10px 12px;word-break:break-all;">${escapeHtml(only.code)}</div>`;
  }
  return `<p style="${margin}font-size:15px;line-height:1.6;">${runs.map(runHtml).join("")}</p>`;
}

function sectionHtml(section: Section): string {
  const paragraphs = section.paragraphs
    .map((runs, index) =>
      paragraphHtml(runs, index === section.paragraphs.length - 1),
    )
    .join("");
  return `<tr><td style="padding:24px 32px 0;font-family:${FONT};color:${INK};">
<h2 style="margin:0 0 10px;font-size:15px;font-weight:600;">${escapeHtml(section.heading)}</h2>
${paragraphs}
</td></tr>`;
}

function renderHtml(copy: EmailCopy): string {
  const setupHref = escapeHtml(copy.setupUrl);
  const notes = copy.notes
    .map(
      (note, index) =>
        `<p style="margin:${index === 0 ? 16 : 12}px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(note)}</p>`,
    )
    .join("");
  const footer = [
    `Button not working? Paste this link into your browser:<br /><span style="color:${MUTED};word-break:break-all;">${setupHref}</span>`,
    ...copy.footer.map(escapeHtml),
  ]
    .map(
      (line, index, lines) =>
        `<p style="margin:0 0 ${index === lines.length - 1 ? 0 : 8}px;">${line}</p>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f8;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e4e8;border-radius:8px;">
<tr><td style="padding:32px 32px 8px;font-family:${FONT};color:${INK};">
<p style="margin:0 0 6px;font-size:13px;color:${MUTED};">${escapeHtml(copy.host)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${copy.intro.map(runHtml).join("")}</p>
${copy.purpose ? `<p style="margin:-8px 0 24px;padding:10px 14px;border-left:3px solid ${INK};background:#f6f7f8;font-size:14px;line-height:1.5;color:${INK};">${escapeHtml(copy.purpose)}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${INK};border-radius:6px;"><a href="${setupHref}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(copy.buttonLabel)}</a></td></tr></table>
${notes}
</td></tr>
${copy.sections.map(sectionHtml).join("\n")}
<tr><td style="padding:24px 32px 32px;font-family:${FONT};font-size:12px;line-height:1.5;color:${FAINT};">${footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>
`;
}
