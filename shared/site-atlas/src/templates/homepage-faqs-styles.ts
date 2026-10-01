/** Scoped styles for the FAQ band under the atlas: shared theme tokens only. */
export const homepageFaqsStyles: string = String.raw`
.faqs {
  /* The same content edge and talk column as the atlas above. */
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
.faqs details { max-width: 40rem; }
.faqs summary {
  cursor: pointer; list-style: none;
  font: italic 400 1.1rem/1.3 var(--font-heading);
  color: var(--color-heading);
  padding: .45rem 0 .45rem .85rem; margin-left: -.85rem;
  border-left: 2px solid transparent;
}
.faqs summary::-webkit-details-marker { display: none; }
.faqs details[open] > summary { border-left-color: var(--color-accent); }
.faqs summary:hover { color: var(--color-accent); }
.faqs summary:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.faqs__answer, .faqs__reader {
  font: 400 1.0625rem/1.65 var(--font-heading);
  color: var(--color-text);
}
.faqs__answer { padding: .25rem 0 .9rem; }
.faqs__answer h1, .faqs__answer h2, .faqs__answer h3,
.faqs__reader h1, .faqs__reader h2, .faqs__reader h3 {
  font: 500 1.19rem/1.3 var(--font-heading); color: var(--color-heading); margin: 1.4em 0 .4em;
}
.faqs__answer strong, .faqs__reader strong { color: var(--color-heading); font-weight: 600; }
.faqs__answer p, .faqs__reader p { margin: 0 0 .9em; }
.faqs__answer ol, .faqs__answer ul, .faqs__reader ol, .faqs__reader ul { margin: 0 0 .9em; padding-left: 1.3em; }
.faqs__answer ul, .faqs__reader ul { list-style: disc; }
.faqs__answer ol, .faqs__reader ol { list-style: decimal; }
.faqs__answer li, .faqs__reader li { margin-bottom: .35em; }
.faqs__answer li::marker, .faqs__reader li::marker { color: var(--color-accent); }

/* Desktop, with the atlas script: questions on the left, the open answer read on the right. */
.faqs[data-split] .faqs__inner {
  display: grid; grid-template-columns: minmax(0, 31rem) minmax(0, 1fr);
  column-gap: 6rem; align-items: start;
}
.faqs[data-split] .faqs__index { position: sticky; top: 6.5rem; }
.faqs[data-split] .faqs__answer { display: none; }
.faqs__reader { max-width: 62ch; padding-top: .45rem; }
/* With a heading, the answer starts level with the first question below it. */
.faqs__index:has(> h2) + .faqs__reader { padding-top: 3.05rem; }
.faqs__reader:empty { display: none; }

@media (max-width: 47.99rem) {
  .faqs { padding: 2.75rem 1rem 3rem; }
  .faqs summary { margin-left: 0; padding-left: .75rem; }
  .faqs__answer { font-size: 1rem; line-height: 1.6; padding-left: .85rem; }
}
`;
