import type { JSX } from "preact";
import { canaryStatus } from "../canary";

/** Static homepage — no entity data, so the schema carries no fields. */
export type CanaryHomeData = Record<string, never>;

const rows: ReadonlyArray<[label: string, value: string]> = [
  ["Package", canaryStatus.package],
  ["Version", canaryStatus.version],
  ["Surface", canaryStatus.surface],
  ["Purpose", canaryStatus.purpose],
];

/**
 * Deterministic canary homepage. Renders fixed build metadata with theme
 * tokens so a successful render proves the externally-hosted site+theme
 * package loaded, built, deployed, and styled — with no dependency on brain
 * content (profile, posts, site-info).
 */
export const CanaryHomeLayout = (_data: CanaryHomeData): JSX.Element => {
  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-16 bg-theme">
      <p className="text-sm uppercase tracking-wide text-theme-muted mb-2">
        Rover site canary
      </p>
      <h1 className="text-3xl font-semibold text-heading mb-4">
        Package canary is live
      </h1>
      <p className="text-lg text-theme-muted mb-10">
        This page is served entirely by the externally-hosted{" "}
        <span className="text-theme">{canaryStatus.package}</span> package. If
        you can read it, the package loaded, built, deployed, and rendered with
        its theme.
      </p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-theme-muted">{label}</dt>
            <dd className="text-heading font-mono break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
