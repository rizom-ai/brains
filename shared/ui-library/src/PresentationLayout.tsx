import type { JSX } from "preact";
import {
  markdownToHtml,
  parseSlideDirectives,
  splitColumns,
  convertMermaidBlocks,
} from "@brains/utils";

export interface PresentationLayoutProps {
  markdown: string;
}

/**
 * Presentation layout for reveal.js
 * Detects slide separators (---) and renders as a presentation
 * Uses the brain's theming system via CSS variables
 */
export const PresentationLayout = ({
  markdown,
}: PresentationLayoutProps): JSX.Element => {
  // Split markdown by slide separators (---)
  const slides = markdown.split(/^---$/gm).map((slide) => slide.trim());

  // Build slide HTML
  const processedSlides = slides.map((slideContent) => {
    const { attributes, markdown: cleanMarkdown } =
      parseSlideDirectives(slideContent);
    const columns = splitColumns(cleanMarkdown);

    let htmlContent: string;
    if (columns) {
      const columnHtml = columns
        .map(
          (col) =>
            `<div class="slide-column">${convertMermaidBlocks(markdownToHtml(col.trim()))}</div>`,
        )
        .join("");
      htmlContent = `<div class="slide-columns">${columnHtml}</div>`;
    } else {
      htmlContent = convertMermaidBlocks(markdownToHtml(cleanMarkdown));
    }

    return { attributes, htmlContent };
  });

  const hasMermaid = processedSlides.some((s) =>
    s.htmlContent.includes('class="mermaid"'),
  );

  const renderedSlides = processedSlides.map(
    ({ attributes, htmlContent }, index) => (
      <section
        key={index}
        {...attributes}
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    ),
  );

  return (
    <section className="presentation-section">
      {/* Reveal.js core CSS only (no theme) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.min.css"
      />

      {/* Reveal.js container */}
      <div className="reveal">
        <div className="slides">{renderedSlides}</div>
      </div>

      {/* Reveal.js initialization */}
      <script
        src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.min.js"
        defer
      />
      {/* Mermaid — only loaded when diagrams are present */}
      {hasMermaid && (
        <script
          src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
          defer
        />
      )}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('DOMContentLoaded', () => {
              if (window.Reveal) {
                window.Reveal.initialize({
                  controls: true,
                  progress: true,
                  disableLayout: true,
                  display: 'flex',
                  hash: true,
                  margin: 0.1,
                  minScale: 0.1,
                  maxScale: 2.0,
                  transition: 'slide',
                  transitionSpeed: 'default',
                  backgroundTransition: 'fade',
                });
              }
              if (window.mermaid) {
                window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
              }
            });
          `,
        }}
      />

      {/* Custom theme using brain's CSS variables */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .presentation-section {
              width: 100%;
              height: 100vh;
              height: 100dvh;
              overflow: hidden;
            }

            .reveal {
              font-family: var(--font-sans);
              background: var(--color-bg-gradient);
            }

            /* ---- BASE SLIDE LAYOUT ---- */

            .reveal .slides section.stack {
              justify-content: center;
            }

            .reveal .slides section:not(.stack) {
              padding: 2rem;
              height: 100%;
              align-items: flex-start;
              justify-content: center;
              flex-direction: column;
              max-width: 85vw;
              color: var(--color-text);
              text-align: left;
            }

            .reveal .slides > section,
            .reveal .slides > section > section {
              text-align: left;
            }

            @media (min-width: 640px) {
              .reveal .slides section:not(.stack) {
                padding: 3rem 4rem;
              }
            }

            @media (min-width: 1024px) {
              .reveal .slides section:not(.stack) {
                padding: 4rem 6rem;
              }
            }

            @media (min-width: 1440px) {
              .reveal .slides section:not(.stack) {
                padding: 5rem 8rem;
              }
            }

            /* ---- TITLE SLIDE (first slide) ---- */

            .reveal .slides section:first-child {
              justify-content: center;
              align-items: center;
              text-align: center;
            }

            .reveal .slides section:first-child h1 {
              text-align: center;
              font-family: var(--font-heading);
              font-size: clamp(3.5rem, 8vw, 9rem);
              font-weight: 700;
              line-height: 1.0;
              letter-spacing: -0.02em;
              color: var(--color-heading);
              margin-bottom: 1.25rem;
              text-wrap: balance;
            }

            .reveal .slides section:first-child p {
              text-align: center;
              color: var(--color-text-muted);
              font-size: clamp(1rem, 1.5vw, 1.5rem);
              font-weight: 300;
              line-height: 1.5;
              max-width: 36ch;
              margin: 0 auto;
            }

            .reveal .slides section.no-title-layout {
              justify-content: flex-start;
              align-items: flex-start;
              text-align: left;
            }

            /* ---- HEADINGS ---- */

            .reveal h1,
            .reveal h2,
            .reveal h3,
            .reveal h4,
            .reveal h5,
            .reveal h6 {
              font-family: var(--font-heading);
              font-weight: 600;
            }

            .reveal h1 {
              color: var(--color-heading);
              font-size: clamp(3rem, 6vw, 7rem);
              line-height: 1.0;
              font-weight: 700;
              letter-spacing: -0.01em;
              margin-bottom: 0.75rem;
              text-align: left;
            }

            .reveal h2 {
              color: var(--color-heading);
              font-size: clamp(2rem, 3.5vw, 4rem);
              line-height: 1.1;
              font-weight: 700;
              letter-spacing: 0em;
              margin-bottom: 1.25rem;
              text-align: left;
            }

            .reveal h3 {
              color: var(--color-brand);
              font-size: clamp(1.5rem, 2.5vw, 2.5rem);
              line-height: 1.2;
              font-weight: 600;
              letter-spacing: 0.01em;
              margin-bottom: 1.25rem;
              text-align: left;
            }

            .reveal h4 {
              color: var(--color-heading);
              font-size: clamp(1.15rem, 1.5vw, 1.75rem);
              font-weight: 600;
              letter-spacing: 0.02em;
              margin-top: 0.5rem;
              margin-bottom: 0.75rem;
              text-align: left;
              padding-bottom: 0.4rem;
              border-bottom: 2px solid var(--color-brand);
              display: inline-block;
            }

            .reveal h5,
            .reveal h6 {
              color: var(--color-text-muted);
              font-size: clamp(0.85rem, 1.1vw, 1.1rem);
              font-weight: 600;
              letter-spacing: 0.02em;
              margin-top: 1.25rem;
              margin-bottom: 0.5rem;
              text-align: left;
            }

            /* ---- BODY TEXT ---- */

            .reveal p,
            .reveal li {
              color: var(--color-text);
              font-family: var(--font-sans);
              font-size: clamp(1.2rem, 1.6vw, 1.75rem);
              line-height: 1.55;
              margin-bottom: 0.65rem;
              text-align: left;
            }

            /* ---- INLINE EMPHASIS ---- */

            .reveal strong {
              font-weight: 800;
              color: inherit;
            }

            .reveal em {
              font-style: italic;
              color: var(--color-brand);
            }

            /* ---- LINKS ---- */

            .reveal a {
              color: var(--color-accent);
              text-decoration: underline;
              text-decoration-thickness: 2px;
              text-underline-offset: 3px;
              font-weight: 600;
            }

            .reveal a:hover {
              color: var(--color-brand-light);
            }

            /* ---- LISTS ---- */

            .reveal .slides section ul,
            .reveal .slides section ol {
              display: block;
              margin-left: 0;
              padding-left: 0;
              text-align: left;
              list-style: none;
            }

            .reveal .slides section li {
              margin-top: 0.5rem;
              margin-bottom: 0.5rem;
              text-align: left;
              padding-left: 1.5em;
              position: relative;
            }

            .reveal .slides section ul li::before {
              content: '';
              position: absolute;
              left: 0;
              top: 0.55em;
              width: 0.45em;
              height: 0.45em;
              background-color: var(--color-brand);
              border-radius: 50%;
            }

            .reveal .slides section ol {
              list-style: decimal;
              padding-left: 1.5em;
            }

            .reveal .slides section ol li {
              display: list-item;
              padding-left: 0.4em;
            }

            .reveal .slides section ol li::before {
              display: none;
            }

            .reveal .slides section ol li::marker {
              color: var(--color-brand);
              font-weight: 700;
            }

            /* ---- CODE ---- */

            .reveal code {
              color: var(--color-brand);
              background-color: var(--color-bg-muted);
              padding: 0.15em 0.45em;
              border-radius: 4px;
              font-family: var(--font-mono);
              font-size: 0.85em;
            }

            .reveal pre {
              background-color: var(--color-bg-muted);
              border: 1px solid var(--color-border);
              border-radius: 6px;
              padding: 1.25em 1.5em;
              margin: 1rem 0;
              overflow-x: auto;
              text-align: left;
            }

            .reveal pre code {
              background-color: transparent;
              padding: 0;
              color: var(--color-text);
              font-size: clamp(0.85rem, 1.2vw, 1.1rem);
              line-height: 1.65;
            }

            /* ---- IMAGES ---- */

            .reveal img {
              max-width: 100%;
              max-height: 50vh;
              height: auto;
              width: auto;
              object-fit: contain;
              margin: 1.5rem 0;
              display: block;
              border-radius: 6px;
            }

            /* ---- TABLES ---- */

            .reveal table {
              width: auto;
              max-width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              margin: 1.5rem 0;
              font-size: clamp(0.9rem, 1.3vw, 1.5rem);
              border-radius: 6px;
              overflow: hidden;
            }

            .reveal table th {
              background-color: var(--color-brand);
              color: var(--color-text-inverse);
              font-weight: 600;
              text-align: left;
              padding: 0.75rem 1.25rem;
              border: none;
            }

            .reveal table td {
              padding: 0.65rem 1.25rem;
              border-bottom: 1px solid var(--color-border);
              color: var(--color-text);
              vertical-align: top;
            }

            .reveal table tr:nth-child(even) {
              background-color: var(--color-bg-subtle);
            }

            /* ---- BLOCKQUOTES ---- */

            .reveal blockquote {
              border-left: 4px solid var(--color-brand);
              padding: 1.25em 1.75em;
              margin: 1.5rem 0;
              font-style: italic;
              font-size: 1.05em;
              color: var(--color-text);
              background: var(--color-bg-subtle);
              border-radius: 0 6px 6px 0;
              position: relative;
            }

            .reveal blockquote p {
              margin: 0;
              line-height: 1.6;
            }

            /* ---- LISTS (color) ---- */

            .reveal ul,
            .reveal ol {
              color: var(--color-text);
            }

            /* ---- COLUMN LAYOUTS ---- */

            .reveal .slide-columns {
              display: flex;
              gap: 3rem;
              width: 100%;
              align-items: flex-start;
              margin-top: 1rem;
            }

            .reveal .slide-columns .slide-column {
              flex: 1;
              min-width: 0;
            }

            /* ---- MERMAID DIAGRAMS ---- */

            .reveal .mermaid {
              display: flex;
              justify-content: center;
              margin: 1.5rem 0;
            }

            .reveal .mermaid svg {
              max-width: 100%;
              max-height: 60vh;
            }

            /* ---- CONTROLS & PROGRESS ---- */

            .reveal .controls {
              color: var(--color-brand);
            }

            .reveal .progress {
              background: var(--color-bg-muted);
              height: 3px;
            }

            .reveal .progress span {
              background: var(--color-brand);
            }

            .reveal .slide-number {
              color: var(--color-text-muted);
              background-color: transparent;
              font-family: var(--font-mono);
              font-size: 0.75rem;
            }

            /* ---- TEXT ALIGNMENT OVERRIDES ---- */

            .reveal .slides section:not(:first-child) h1,
            .reveal .slides section:not(:first-child) h2,
            .reveal .slides section:not(:first-child) h3,
            .reveal .slides section:not(:first-child) h4,
            .reveal .slides section:not(:first-child) h5,
            .reveal .slides section:not(:first-child) h6,
            .reveal .slides section:not(:first-child) p,
            .reveal .slides section:not(:first-child) div:not(.slide-columns):not(.mermaid),
            .reveal .slides section:not(:first-child) span {
              text-align: left;
            }
          `,
        }}
      />
    </section>
  );
};
