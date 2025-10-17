import type { JSX } from "preact";
import type { TutorialContent } from "./schema";
import { markdownToHtml } from "@brains/utils";

/**
 * Presentation layout for reveal.js
 * Detects slide separators (---) and renders as a presentation
 * Uses the brain's theming system via CSS variables
 */
export const PresentationLayout = ({
  markdown,
}: TutorialContent): JSX.Element => {
  // Split markdown by slide separators (---)
  const slides = markdown.split(/^---$/gm).map((slide) => slide.trim());

  return (
    <section className="presentation-section">
      {/* Reveal.js core CSS only (no theme) */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.min.css"
      />

      {/* Reveal.js container */}
      <div className="reveal">
        <div className="slides">
          {slides.map((slideContent, index) => {
            const htmlContent = markdownToHtml(slideContent);
            return (
              <section
                key={index}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            );
          })}
        </div>
      </div>

      {/* Reveal.js initialization script */}
      <script
        src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.min.js"
        defer
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('DOMContentLoaded', () => {
              if (window.Reveal) {
                window.Reveal.initialize({
                  hash: true,
                  slideNumber: true,
                  transition: 'slide',
                  controls: true,
                  progress: true,
                  center: true,
                  embedded: false,
                });
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
              overflow: hidden;
              background-color: var(--color-bg);
            }

            .reveal {
              width: 100%;
              height: 100%;
            }

            /* Use brain theme colors */
            .reveal .slides {
              background-color: var(--color-bg);
            }

            .reveal .slides section {
              background-color: var(--color-bg);
              color: var(--color-text);
            }

            /* Typography - use theme variables */
            .reveal h1,
            .reveal h2,
            .reveal h3,
            .reveal h4,
            .reveal h5,
            .reveal h6 {
              color: var(--color-text);
              font-family: var(--font-sans);
              font-weight: 700;
            }

            .reveal h1 {
              color: var(--color-brand);
              font-size: 3em;
            }

            .reveal h2 {
              color: var(--color-brand-dark);
              font-size: 2em;
            }

            .reveal p,
            .reveal li {
              color: var(--color-text-muted);
              font-family: var(--font-sans);
            }

            .reveal a {
              color: var(--color-brand);
              text-decoration: none;
            }

            .reveal a:hover {
              color: var(--color-brand-dark);
            }

            .reveal strong {
              color: var(--color-text);
            }

            .reveal em {
              color: var(--color-text-muted);
            }

            /* Code styling */
            .reveal code {
              color: var(--color-text);
              background-color: var(--color-bg-muted);
              padding: 0.2em 0.4em;
              border-radius: 3px;
              font-family: var(--font-mono);
            }

            .reveal pre {
              background-color: var(--color-bg-muted);
              border: 1px solid var(--color-border);
            }

            .reveal pre code {
              background-color: transparent;
              padding: 0;
              color: var(--color-text);
            }

            /* Blockquotes */
            .reveal blockquote {
              background-color: var(--color-bg-subtle);
              border-left: 4px solid var(--color-brand);
              padding: 1em;
              color: var(--color-text-muted);
            }

            /* Lists */
            .reveal ul,
            .reveal ol {
              color: var(--color-text-muted);
            }

            /* Controls - use theme colors */
            .reveal .controls {
              color: var(--color-brand);
            }

            /* Progress bar - use theme colors */
            .reveal .progress {
              background: var(--color-border);
            }

            .reveal .progress span {
              background: var(--color-brand);
            }

            /* Slide number */
            .reveal .slide-number {
              color: var(--color-text-muted);
              background-color: var(--color-bg-subtle);
            }
          `,
        }}
      />
    </section>
  );
};
