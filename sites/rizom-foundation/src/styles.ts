/**
 * The Foundation's own styles, served as /styles/foundation.css: the reading
 * pages (one serif column, set for reading rather than scanning) and the
 * large figures in the story. Only the theme's variables are used, so light
 * and dark follow the site's toggle.
 */
export const FOUNDATION_STYLESHEET_PATH = "/styles/foundation.css";

export const foundationStyles = `
.reading-page { padding: 0 clamp(1rem, 5vw, 5rem); }
.reading-page--head { padding-top: clamp(3.5rem, 8vw, 6.5rem); }
.reading-page--close { padding-bottom: 6rem; }
.reading {
  max-width: 38rem;
  margin: 0 auto;
  font-family: var(--font-display);
  font-weight: 350;
  font-size: 19px;
  line-height: 1.75;
  color: var(--color-text-muted);
  font-variation-settings: "opsz" 24;
}
.reading__head { margin-bottom: 3rem; }
.reading h1 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(3rem, 6vw, 5rem);
  line-height: 1;
  color: var(--color-text);
  font-variation-settings: "SOFT" 70, "opsz" 96;
  margin: 0;
}
.reading__sub { margin: 0.8rem 0 0; font-style: italic; font-size: 1.35rem; color: var(--color-accent); }
.reading h2 {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 1.85rem;
  line-height: 1.15;
  color: var(--color-text);
  font-variation-settings: "SOFT" 70, "opsz" 72;
  margin: 3.2rem 0 0.9rem;
}
.reading h3 { font-family: var(--font-display); font-weight: 500; font-size: 1.2rem; color: var(--color-text); margin: 1.8rem 0 0.4rem; }
.reading p { margin: 0 0 1.1rem; }
.reading strong { font-weight: 500; color: var(--color-text); }
.reading p a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.reading .reading__mission { font-size: 1.3rem; line-height: 1.6; color: var(--color-text); border-left: 2px solid var(--color-accent); padding-left: 1.2rem; }
/* The assumptions, numbered large: each is a claim that gets its own test. */
.reading__assumptions { list-style: none; margin: 0 0 1.2rem; padding: 0; counter-reset: assumption; }
.reading__assumptions li { counter-increment: assumption; display: grid; grid-template-columns: 2.6rem minmax(0, 1fr); gap: 0.4rem; margin: 0; padding: 0.9rem 0; border-top: 1px solid var(--color-border); color: var(--color-text); }
.reading__assumptions li::before { content: counter(assumption); font-size: 1.9rem; line-height: 1; color: var(--color-accent); font-variation-settings: "SOFT" 70, "opsz" 96; }
.reading__assumptions li:last-child { border-bottom: 1px solid var(--color-border); }
/* The goals as a ledger: what is promised on the left, what would show it on the right. */
.reading__goals { margin: 0 0 1.1rem; }
.reading__goals dt { margin-top: 1.2rem; font-weight: 500; color: var(--color-text); }
.reading__goals dd { margin: 0.2rem 0 0; }
@media (min-width: 48rem) {
  .reading__goals { display: grid; grid-template-columns: 11rem minmax(0, 1fr); column-gap: 1.6rem; }
  .reading__goals dt, .reading__goals dd { margin: 0; padding: 0.9rem 0; border-top: 1px solid var(--color-border); }
}
.reading .reading__close { margin-top: 3.2rem; padding-top: 1.6rem; border-top: 1px solid var(--color-border); font-style: italic; }
.reading__doors { display: flex; flex-wrap: wrap; gap: 0.6rem 1.8rem; margin-top: 2rem; font-style: italic; }
.reading__doors a { color: var(--color-accent); text-decoration: none; }
.reading__doors a:hover, .reading__doors a:focus-visible { text-decoration: underline; text-underline-offset: 3px; }

/* Figures that carry a claim: the number in the display face, what it counts beside it. */
.figures { margin: 2rem 0 0; display: grid; gap: 1.1rem; }
.figures div { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); align-items: baseline; gap: 1.2rem; padding-top: 1.1rem; border-top: 1px solid var(--color-border); }
.figures dt { font-family: var(--font-display); font-weight: 400; font-size: clamp(2.2rem, 3.4vw, 3rem); line-height: 1; color: var(--color-accent); font-variation-settings: "SOFT" 70, "opsz" 96; }
.figures dd { margin: 0; font-family: var(--font-body); font-size: 15px; line-height: 1.55; color: var(--color-text-muted); }
.figures dd b { display: block; font-family: var(--font-display); font-weight: 500; font-size: 1.15rem; color: var(--color-text); }
@media (max-width: 39.9375rem) { .figures div { grid-template-columns: 5.5rem minmax(0, 1fr); } }
`;
