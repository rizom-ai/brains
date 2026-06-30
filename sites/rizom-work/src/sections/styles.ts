export const WORK_KICKER =
  "inline-flex items-center gap-[14px] font-label text-[11px] font-semibold uppercase tracking-[2.8px] text-accent before:content-[''] before:block before:h-px before:w-8 before:bg-accent before:opacity-80 max-[768px]:gap-3 max-[768px]:text-[10px] max-[768px]:tracking-[2.4px] max-[768px]:before:w-6";

export const WORK_RULE =
  "mx-auto h-px w-16 bg-gradient-to-r from-transparent via-accent/45 to-transparent";

export const WORK_SECTION_HEADLINE =
  "font-display font-[520] text-theme text-[clamp(36px,5vw,68px)] leading-[1.02] tracking-[-1.6px] max-[768px]:text-[34px] max-[768px]:tracking-[-1.1px]";

export const WORK_DISPLAY_QUOTE =
  "font-display italic tracking-[-0.6px] text-theme";

export const WORK_BODY_COPY = "text-[17px] leading-[1.75] text-theme-muted";

export const revealDelayClass = (index: number, max = 3): string =>
  `reveal reveal-delay-${Math.min(index + 1, max)}`;
