/** Scoped styles for the FAQ band under the atlas: shared theme tokens only. */
export const homepageFaqsStyles: string = String.raw`
.faqs {
  /* The same content edge as the atlas above. */
  --faqs-edge: max(3rem, (100% - var(--layout-max-width, 72rem)) / 2);
  padding: 4.5rem var(--faqs-edge) 5rem;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-rule);
}
.faqs h2 {
  font: 500 1.45rem/1.2 var(--font-heading);
  color: var(--color-heading);
  margin: 0 0 .9rem;
}
/* Closed until tapped; the open question carries the accent line. */
.faqs details {
  max-width: 40rem;
  margin-left: -.85rem; padding-left: .85rem;
  border-left: 2px solid transparent;
}
.faqs details[open] { border-left-color: var(--color-accent); }
.faqs summary {
  cursor: pointer; list-style: none;
  display: flex; align-items: baseline; gap: .6rem;
  font: italic 400 1.1rem/1.3 var(--font-heading);
  color: var(--color-heading);
  padding: .45rem 0;
}
.faqs summary::-webkit-details-marker { display: none; }
.faqs summary::after {
  content: "+"; font-style: normal; color: var(--color-accent);
  margin-left: auto; padding-left: .5rem; transition: transform .2s ease;
}
.faqs details[open] > summary::after { transform: rotate(45deg); }
@media (hover: hover) { .faqs summary:hover { color: var(--color-accent); } }
.faqs summary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.faqs__answer {
  font: 400 1.0625rem/1.65 var(--font-heading);
  color: var(--color-text);
  padding: .1rem 0 .9rem;
}
.faqs__answer h1, .faqs__answer h2, .faqs__answer h3 {
  font: 500 1.19rem/1.3 var(--font-heading); color: var(--color-heading); margin: 1.4em 0 .4em;
}
.faqs__answer strong { color: var(--color-heading); font-weight: 600; }
.faqs__answer p { margin: 0 0 .9em; }
.faqs__answer ol, .faqs__answer ul { margin: 0 0 .9em; padding-left: 1.3em; }
.faqs__answer ul { list-style: disc; }
.faqs__answer ol { list-style: decimal; }
.faqs__answer li { margin-bottom: .35em; }
.faqs__answer li::marker { color: var(--color-accent); }
@media (prefers-reduced-motion: reduce) { .faqs summary::after { transition: none; } }

@media (max-width: 47.99rem) {
  .faqs { padding: 2.75rem 1rem 3rem; }
  .faqs details { margin-left: 0; padding-left: .75rem; }
  .faqs__answer { font-size: 1rem; line-height: 1.6; }
}
`;
