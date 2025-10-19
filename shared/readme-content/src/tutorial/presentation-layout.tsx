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
                  controls: true,
                  progress: true,
                  disableLayout: true,
                  display: 'flex',
                  hash: true,
                  margin: 0.1,
                  minScale: 0.1,
                  maxScale: 2.0,
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
              height: 100dvh; /* Use dynamic viewport height for mobile */
              overflow: hidden;
            }

            .reveal {
              font-family: var(--font-sans);
              background: linear-gradient(to bottom left, #ffffff, #fce5c6 80%, #a8c4ff);
            }

            .reveal .slides section.stack {
              justify-content: center;
            }

            .reveal .slides section:not(.stack) {
              padding: 2rem;
              height: 100%;
              align-items: flex-start;
              justify-content: center;
              flex-direction: column;
              max-width: 800px;
              color: #1a1a1a;
              text-align: left;
            }

            /* Override reveal.js default centering */
            .reveal .slides > section,
            .reveal .slides > section > section {
              text-align: left;
            }

            @media (min-width: 640px) {
              .reveal .slides section:not(.stack) {
                padding: 3rem;
              }
            }

            /* Mobile optimizations */
            @media (max-width: 640px) {
              .reveal h1 {
                font-size: 2.5rem;
                margin-bottom: 1rem;
              }

              .reveal h2 {
                font-size: 2rem;
                margin-bottom: 0.75rem;
              }

              .reveal .slides section {
                padding: 1.5rem !important;
              }
            }

            /* Typography - use theme variables */
            .reveal h1,
            .reveal h2,
            .reveal h3,
            .reveal h4,
            .reveal h5,
            .reveal h6 {
              color: var(--color-text);
              font-family: var(--font-heading);
              font-weight: 700;
            }

            .reveal h1 {
              color: #2e007d;
              font-size: var(--text-h1-mobile);
              line-height: 1;
              font-weight: 700;
              margin-bottom: 0.5rem;
              text-align: left;
            }

            @media (min-width: 640px) {
              .reveal h1 {
                font-size: var(--text-h1);
              }
            }

            .reveal h2 {
              color: #2e007d;
              font-size: var(--text-h2-mobile);
              line-height: 1;
              font-weight: 700;
              margin-bottom: 0.5rem;
              text-align: left;
            }

            @media (min-width: 640px) {
              .reveal h2 {
                font-size: var(--text-h2);
              }
            }

            .reveal h3 {
              color: #1a1a1a;
              font-size: var(--text-h3-mobile);
              line-height: 1;
              font-weight: 700;
              margin-bottom: 1rem;
              text-align: left;
            }

            @media (min-width: 640px) {
              .reveal h3 {
                font-size: var(--text-h3);
              }
            }

            .reveal h4 {
              color: #2e007d;
              font-size: var(--text-h4);
              font-weight: 700;
              margin-top: 2rem;
              margin-bottom: 1rem;
              text-align: left;
            }

            .reveal p,
            .reveal li {
              color: #1a1a1a;
              font-family: var(--font-sans);
              font-size: var(--text-body-mobile);
              line-height: 1.5;
              margin-bottom: 1rem;
              text-align: left;
            }

            @media (min-width: 640px) {
              .reveal p,
              .reveal li {
                font-size: var(--text-body);
              }
            }

            .reveal a {
              color: #e7640a;
              text-decoration: underline;
              font-weight: 900;
            }

            .reveal a:hover {
              color: #93c5fd;
            }

            .reveal strong,
            .reveal em {
              color: #e7640a;
            }

            .reveal .slides section ul,
            .reveal .slides section ol {
              display: block;
              margin-left: 0;
              padding-left: 2rem;
              text-align: left;
            }

            .reveal .slides section li {
              display: list-item;
              list-style-position: outside;
              margin-top: 0.5rem;
              margin-bottom: 0.5rem;
              text-align: left;
            }

            .reveal .slides section ul li {
              list-style-type: disc;
            }

            .reveal .slides section ol li {
              list-style-type: decimal;
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

            /* Controls and progress */
            .reveal .controls {
              color: #93c5fd;
            }

            .reveal .progress {
              background: #1e3a8a;
            }

            .reveal .progress span {
              background: #60a5fa;
            }

            /* Slide number */
            .reveal .slide-number {
              color: var(--color-text);
              background-color: transparent;
              font-family: var(--font-mono);
              font-size: 0.875rem;
            }

            /* Override any remaining centered text from reveal.js */
            .reveal .slides section h1,
            .reveal .slides section h2,
            .reveal .slides section h3,
            .reveal .slides section h4,
            .reveal .slides section h5,
            .reveal .slides section h6,
            .reveal .slides section p,
            .reveal .slides section div,
            .reveal .slides section span {
              text-align: left;
            }
          `,
        }}
      />
    </section>
  );
};
