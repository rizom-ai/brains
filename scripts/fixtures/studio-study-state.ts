import { z } from "@brains/utils/zod";

/** Source-only scenarios for the production Studio workspace fixtures. */
export const studioStudyStateSchema = z.enum([
  "empty",
  "busy",
  "outage",
  "failure",
  "dense",
  "restart",
]);
export type StudioStudyState = z.output<typeof studioStudyStateSchema>;

export function supportsStudioStudyState(
  surface: string,
  state: StudioStudyState,
): boolean {
  if (state === "restart") return surface === "studio-overview";
  if (state === "empty")
    return [
      "studio-overview",
      "studio-chat",
      "studio-inbox",
      "studio-publishing",
      "studio-site",
      "studio-content-sync",
      "studio-administration-invitations",
      "studio-administration-audit",
      "studio-account",
    ].includes(surface);
  if (state === "busy")
    return surface === "studio-chat" || surface === "studio-site";
  if (state === "outage") return surface === "studio-inbox";
  if (state === "failure") return surface === "studio-site";
  return surface === "studio-content-sync";
}
