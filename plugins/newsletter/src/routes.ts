import { z } from "@brains/sdk/services";
import { getErrorMessage } from "@brains/utils/error";
import type { ButtondownClient } from "./lib/buttondown-client";
import { subscribe } from "./tools";

export const SUBSCRIBE_PATH = "/api/newsletter/subscribe";
const THANKS_PATH = "/subscribe/thanks";
const ERROR_PATH = "/subscribe/error";

const submissionSchema = z.object({
  email: z.email({ pattern: z.regexes.html5Email }),
  name: z.string().optional(),
});

/** A form field or JSON value as text, or nothing. */
function field(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function readSubmission(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null
      ? z.record(z.string(), z.unknown()).parse(body)
      : {};
  }
  if (contentType.includes("form")) {
    return Object.fromEntries(
      [...(await request.formData()).entries()].map(([key, value]) => [
        key,
        typeof value === "string" ? value : undefined,
      ]),
    );
  }
  return {};
}

const json = (body: unknown, status: number): Response =>
  Response.json(body, { status });
const redirect = (location: string): Response =>
  new Response(null, { status: 302, headers: { location } });

/**
 * The signup form's target. A scripted form asks for JSON and shows the
 * answer in place; a plain form submission is sent on to the thanks or
 * error page.
 */
export async function handleSubscribe(
  request: Request,
  client: ButtondownClient | undefined,
): Promise<Response> {
  const wantsJson = (request.headers.get("accept") ?? "").includes(
    "application/json",
  );
  const fail = (error: string, status: number): Response =>
    wantsJson ? json({ success: false, error }, status) : redirect(ERROR_PATH);

  if (!client) return fail("Newsletter signup is not configured", 503);

  const raw = await readSubmission(request);
  const submission = submissionSchema.safeParse({
    email: field(raw["email"]),
    name: field(raw["name"]),
  });
  if (!submission.success)
    return fail("A valid email address is required", 400);

  try {
    const data = await subscribe(client, submission.data);
    return wantsJson
      ? json({ success: true, data }, 200)
      : redirect(THANKS_PATH);
  } catch (error) {
    return fail(getErrorMessage(error), 400);
  }
}
