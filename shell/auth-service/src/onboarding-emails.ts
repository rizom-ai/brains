import { escapeHtml } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";

const invitationEmailInputSchema: z.ZodObject<{
  kind: z.ZodLiteral<"invitation">;
  setupUrl: z.ZodURL;
  expiresAt: z.ZodNumber;
  brainName: z.ZodString;
  role: z.ZodEnum<{ admin: "admin"; trusted: "trusted" }>;
  inviterName: z.ZodOptional<z.ZodString>;
}> = z.object({
  kind: z.literal("invitation"),
  setupUrl: z.url(),
  /** Unix seconds, as stored on the setup token. */
  expiresAt: z.number().int().positive(),
  brainName: z.string().trim().min(1),
  role: z.enum(["admin", "trusted"]),
  inviterName: z.string().trim().min(1).optional(),
});

const onboardingEmailInputSchema: z.ZodDiscriminatedUnion<
  [typeof invitationEmailInputSchema],
  "kind"
> = z.discriminatedUnion("kind", [invitationEmailInputSchema]);

export type OnboardingEmailInput = z.input<typeof onboardingEmailInputSchema>;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** A run of body text; `strong` runs are emphasised in the HTML part. */
type Run = string | { strong: string };

interface NextStep {
  before: string;
  link?: { label: string; href: string };
  after?: string;
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
  setupUrl: string;
  buttonLabel: string;
  notes: string[];
  nextSteps: NextStep[];
  footer: string[];
}

const PASSKEY_NOTE =
  "A passkey replaces a password: your device confirms it’s you with your fingerprint, face or screen lock. It takes under a minute.";
const UNEXPECTED_NOTE =
  "Didn’t expect this email? Ignore it — the link expires on its own.";

const ROLE_PHRASES = {
  admin: "an admin",
  trusted: "a trusted member",
} as const;

export function renderOnboardingEmail(
  input: OnboardingEmailInput,
): RenderedEmail {
  const parsed = onboardingEmailInputSchema.parse(input);
  const copy = invitationCopy(parsed);
  return {
    subject: copy.subject,
    text: renderText(copy),
    html: renderHtml(copy),
  };
}

function invitationCopy(
  input: z.output<typeof invitationEmailInputSchema>,
): EmailCopy {
  const url = new URL(input.setupUrl);
  const brain = `the ${input.brainName} brain`;
  const invited: Run[] = input.inviterName
    ? [{ strong: input.inviterName }, ` invited you to join ${brain} at `]
    : [`You’ve been invited to join ${brain} at `];
  return {
    subject: input.inviterName
      ? `${input.inviterName} invited you to ${brain}`
      : `You’re invited to ${brain}`,
    host: url.host,
    heading: `You’re invited to ${brain}`,
    intro: [
      ...invited,
      { strong: url.host },
      ` as ${ROLE_PHRASES[input.role]}. Set up your passkey to accept.`,
    ],
    setupUrl: input.setupUrl,
    buttonLabel: "Accept and set up your passkey",
    notes: [
      PASSKEY_NOTE,
      `This link works once and expires on ${formatExpiry(input.expiresAt)}. Don’t forward it — it’s tied to you.`,
    ],
    nextSteps: [
      { before: "Register your passkey. You’re signed in straight away." },
      {
        before: "Open ",
        link: { label: "chat", href: `${url.origin}/chat` },
        after:
          " and ask the brain what it knows — it answers from everything shared in it.",
      },
      {
        before: "Use ",
        link: { label: "Studio", href: `${url.origin}/studio` },
        after: " to browse what the brain holds.",
      },
    ],
    footer: [UNEXPECTED_NOTE],
  };
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
  return typeof run === "string" ? run : run.strong;
}

function renderText(copy: EmailCopy): string {
  const steps = copy.nextSteps.map((step, index) => {
    const line = `${index + 1}. ${step.before}${step.link?.label ?? ""}${step.after ?? ""}`;
    return step.link ? `${line}\n   ${step.link.href}` : line;
  });
  return [
    copy.heading,
    copy.intro.map(runText).join(""),
    copy.setupUrl,
    ...copy.notes,
    "What happens next",
    steps.join("\n"),
    ...copy.footer,
  ]
    .join("\n\n")
    .concat("\n");
}

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const INK = "#1d2126";
const MUTED = "#5f6873";
const FAINT = "#7a838d";

function runHtml(run: Run): string {
  return typeof run === "string"
    ? escapeHtml(run)
    : `<strong>${escapeHtml(run.strong)}</strong>`;
}

function stepHtml(step: NextStep): string {
  const link = step.link
    ? `<a href="${escapeHtml(step.link.href)}" style="color:${INK};">${escapeHtml(step.link.label)}</a>`
    : "";
  return `${escapeHtml(step.before)}${link}${escapeHtml(step.after ?? "")}`;
}

function renderHtml(copy: EmailCopy): string {
  const setupHref = escapeHtml(copy.setupUrl);
  const cell = `font-family:${FONT};color:${INK};`;
  const notes = copy.notes
    .map(
      (note, index) =>
        `<p style="margin:${index === 0 ? 16 : 12}px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(note)}</p>`,
    )
    .join("");
  const steps = copy.nextSteps
    .map(
      (step, index) =>
        `<li style="margin-bottom:${index === copy.nextSteps.length - 1 ? 0 : 6}px;">${stepHtml(step)}</li>`,
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
<tr><td style="padding:32px 32px 8px;${cell}">
<p style="margin:0 0 6px;font-size:13px;color:${MUTED};">${escapeHtml(copy.host)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:600;">${escapeHtml(copy.heading)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${copy.intro.map(runHtml).join("")}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${INK};border-radius:6px;"><a href="${setupHref}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(copy.buttonLabel)}</a></td></tr></table>
${notes}
</td></tr>
<tr><td style="padding:24px 32px 8px;${cell}">
<h2 style="margin:0 0 10px;font-size:15px;font-weight:600;">What happens next</h2>
<ol style="margin:0;padding-left:20px;font-size:15px;line-height:1.6;">${steps}</ol>
</td></tr>
<tr><td style="padding:24px 32px 32px;font-family:${FONT};font-size:12px;line-height:1.5;color:${FAINT};">${footer}</td></tr>
</table>
</td></tr></table>
</body>
</html>
`;
}
