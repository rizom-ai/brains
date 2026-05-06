import type { JSX } from "preact";

export interface SectionHeaderProps {
  /** Section title (renders as h2). */
  title: string;
  /** Mono caps prefix shown above the title (e.g. "01"). */
  number?: string | undefined;
  /** Italic Fraunces subtitle shown beneath the title. */
  blurb?: string | undefined;
  /**
   * Visual variant.
   * - `editorial` (default): mono number, large Fraunces title, italic blurb.
   * - `compact`: small uppercase tracked label (matches the legacy stacked
   *   `ContentSection` heading).
   */
  variant?: "editorial" | "compact";
}

/**
 * Editorial section header. Pair with {@link ContentList} (or arbitrary body
 * content) to compose a section, e.g. an editorial homepage row that splits
 * the header column from the items column in its own grid.
 */
export const SectionHeader = ({
  title,
  number,
  blurb,
  variant = "editorial",
}: SectionHeaderProps): JSX.Element => {
  if (variant === "compact") {
    return (
      <h2 className="text-sm tracking-widest uppercase text-theme-muted mb-8">
        {title}
      </h2>
    );
  }

  return (
    <header>
      {number !== undefined && (
        <span className="block font-mono text-xs font-medium uppercase tracking-[0.22em] text-accent mb-3">
          {number}
        </span>
      )}
      <h2 className="font-heading text-2xl md:text-[2rem] font-normal text-heading leading-[1.05] tracking-[-0.018em]">
        {title}
      </h2>
      {blurb !== undefined && (
        <p className="font-heading italic font-light text-[0.95rem] leading-snug text-theme-muted mt-3 max-w-[22ch]">
          {blurb}
        </p>
      )}
    </header>
  );
};
