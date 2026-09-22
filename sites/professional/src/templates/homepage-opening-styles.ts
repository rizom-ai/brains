/** Scoped contact-first homepage styles, embedded with the server-rendered opening. */
export const homepageOpeningStyles: string = String.raw`
.homepage-opening {
  position: relative;
  padding: clamp(3rem, 7vw, 5.5rem) 3rem 4.5rem;
  border-bottom: 1px solid var(--color-rule);
  color: var(--color-text);
}
.homepage-opening__inner { position: relative; max-width: 72rem; margin-inline: auto; }
.homepage-opening__eyebrow {
  display: flex; align-items: center; gap: .7rem;
  font: 500 .7rem var(--font-mono); letter-spacing: .2em;
  text-transform: uppercase; color: var(--color-accent);
}
.homepage-opening__eyebrow::before { content: ""; width: 1.1rem; height: 1px; background: currentColor; }
.homepage-opening h1 {
  max-width: 14ch; margin: 1.2rem 0 1.75rem;
  font-family: var(--font-heading); font-size: clamp(2.75rem, 7vw, 5.5rem);
  line-height: 1.02; font-weight: 400; letter-spacing: -.025em;
  font-variation-settings: "SOFT" 30, "opsz" 144; overflow-wrap: anywhere;
}
.homepage-opening__emphasis { font-style: italic; color: var(--color-accent); font-variation-settings: "SOFT" 80, "opsz" 144; }
.homepage-opening .homepage-opening__prose {
  max-width: 36rem; margin: 0; color: var(--color-text-muted);
  font-family: var(--font-heading); font-size: clamp(1.18rem, 2vw, 1.4rem);
  line-height: 1.55; font-weight: 300; font-variation-settings: "opsz" 24;
  overflow-wrap: anywhere;
}
.homepage-opening__prose p { margin: 0 0 .85em; }
.homepage-opening__prose em { color: var(--color-accent); }
.homepage-opening__prose a { color: var(--color-accent); text-underline-offset: .18em; }
.homepage-opening__prose pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.homepage-opening__signature {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: .7rem 1rem;
  margin: 1.1rem 0 0; font-family: var(--font-heading); font-style: italic;
  color: var(--color-text-muted); font-size: 1rem;
}
.homepage-opening__signature span {
  font: 400 .65rem var(--font-mono); text-transform: uppercase; letter-spacing: .13em;
}
.homepage-opening__next { max-width: 36rem; margin-top: 2.25rem; }
.homepage-opening__topics { display: grid; border-top: 1px solid var(--color-rule-strong); }
.homepage-opening__topics a {
  display: flex; justify-content: space-between; gap: 1rem; align-items: baseline;
  border-bottom: 1px solid var(--color-rule); padding: .85rem 0;
  color: var(--color-text); font: 500 .75rem/1.6 var(--font-mono);
  letter-spacing: .055em; text-decoration: none; overflow-wrap: anywhere;
}
.homepage-opening__topics a span { color: var(--color-accent); flex-shrink: 0; }
.homepage-opening__topics a:hover { color: var(--color-accent); }
.homepage-opening__contact {
  display: inline-flex; align-items: baseline; gap: 2rem; margin-top: 1.75rem;
  border-bottom: 1px solid var(--color-accent); padding: .5rem 0;
  color: var(--color-accent); text-decoration: none;
  font: 400 1.45rem var(--font-heading); font-variation-settings: "opsz" 24;
}
.homepage-opening__contact:hover { color: var(--color-text); border-color: currentColor; }
.homepage-opening__note { margin-top: .75rem; color: var(--color-text-muted); font: 400 .8rem/1.5 var(--font-sans); }
.homepage-opening a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 5px; }
@media (max-width: 640px) {
  .homepage-opening { padding: 2.75rem 1.5rem 3rem; }
  .homepage-opening__next { margin-top: 1.75rem; }
  .homepage-opening__signature { gap: .5rem 1rem; }
}
`;
