import type { JSX } from "preact";
import { markdownToHtml } from "@brains/utils";

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
                  transition: 'slide',
                  transitionSpeed: 'default',
                  backgroundTransition: 'fade',
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
              background: var(--color-bg-gradient);
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
              max-width: 85vw;
              color: var(--color-text);
              text-align: left;
            }

            /* Override reveal.js default centering */
            .reveal .slides > section,
            .reveal .slides > section > section {
              text-align: left;
            }

            /* Tablet and up */
            @media (min-width: 640px) {
              .reveal .slides section:not(.stack) {
                padding: 3rem 4rem;
              }
            }

            /* Desktop and up */
            @media (min-width: 1024px) {
              .reveal .slides section:not(.stack) {
                padding: 4rem 6rem;
              }
            }

            /* Large desktop */
            @media (min-width: 1440px) {
              .reveal .slides section:not(.stack) {
                padding: 5rem 8rem;
              }
            }

            /* Typography - use theme variables */
            .reveal h1,
            .reveal h2,
            .reveal h3,
            .reveal h4,
            .reveal h5,
            .reveal h6 {
              font-family: var(--font-sans);
              font-weight: 600;
            }

            .reveal h1 {
              color: var(--color-heading);
              font-size: clamp(3.75rem, 8vw, 10rem);
              line-height: 1;
              font-weight: 600;
              margin-bottom: 0.5rem;
              text-align: left;
            }

            .reveal h2 {
              color: var(--color-brand);
              font-size: clamp(3rem, 5vw, 6rem);
              line-height: 1.1;
              font-weight: 300;
              margin-bottom: 1.5rem;
              text-align: left;
            }

            .reveal h3 {
              color: var(--color-brand);
              font-size: clamp(2.25rem, 3.5vw, 4rem);
              line-height: 1.2;
              font-weight: 600;
              margin-bottom: 1.5rem;
              text-align: left;
              display: inline-block;
              padding-bottom: 0.5rem;
              border-bottom: 3px solid var(--color-brand);
            }

            .reveal h4 {
              color: var(--color-heading);
              font-size: clamp(1.5rem, 2vw, 2.5rem);
              font-weight: 600;
              margin-top: 2rem;
              margin-bottom: 1rem;
              text-align: left;
              position: relative;
              padding-left: 1rem;
            }

            .reveal h4::before {
              content: '';
              position: absolute;
              left: 0;
              top: 0.2em;
              bottom: 0.2em;
              width: 4px;
              background-color: var(--color-brand);
              border-radius: 2px;
            }

            .reveal h5,
            .reveal h6 {
              color: var(--color-text-muted);
              font-size: clamp(1rem, 1.5vw, 1.5rem);
              font-weight: 600;
              margin-top: 1.5rem;
              margin-bottom: 0.75rem;
              text-align: left;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }

            .reveal p,
            .reveal li {
              color: var(--color-text);
              font-family: var(--font-sans);
              font-size: clamp(1.5rem, 2vw, 2.5rem);
              line-height: 1.5;
              margin-bottom: 1rem;
              text-align: left;
            }

            .reveal a {
              color: var(--color-accent);
              text-decoration: underline;
              font-weight: 900;
            }

            .reveal a:hover {
              color: var(--color-brand-light);
            }

            .reveal strong,
            .reveal em {
              color: var(--color-accent);
            }

            .reveal .slides section ul,
            .reveal .slides section ol {
              display: block;
              margin-left: 0;
              padding-left: 0;
              text-align: left;
              list-style: none;
            }

            .reveal .slides section li {
              display: flex;
              align-items: flex-start;
              margin-top: 0.75rem;
              margin-bottom: 0.75rem;
              text-align: left;
              padding-left: 1.5rem;
              position: relative;
            }

            .reveal .slides section ul li::before {
              content: '';
              position: absolute;
              left: 0;
              top: 0.5em;
              width: 8px;
              height: 8px;
              background-color: var(--color-brand);
              border-radius: 50%;
              flex-shrink: 0;
            }

            .reveal .slides section ol {
              list-style: decimal;
              padding-left: 1.5rem;
            }

            .reveal .slides section ol li {
              display: list-item;
              padding-left: 0.5rem;
            }

            .reveal .slides section ol li::before {
              display: none;
            }

            .reveal .slides section ol li::marker {
              color: var(--color-brand);
              font-weight: 600;
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

            /* Images */
            .reveal img {
              max-width: 100%;
              max-height: 50vh;
              height: auto;
              width: auto;
              object-fit: contain;
              margin: 1.5rem 0;
              display: block;
              border-radius: 8px;
            }

            /* Tables - Professional styling */
            .reveal table {
              width: auto;
              max-width: 100%;
              border-collapse: separate;
              border-spacing: 0;
              margin: 1.5rem 0;
              font-size: clamp(1rem, 1.5vw, 1.75rem);
            }

            .reveal table th {
              background-color: var(--color-brand);
              color: var(--color-text-inverse);
              font-weight: 600;
              text-align: left;
              padding: clamp(0.5rem, 2vw, 2rem) clamp(0.75rem, 4vw, 5rem);
              border: none;
            }

            .reveal table td {
              padding: clamp(0.5rem, 2vw, 1.5rem) clamp(0.75rem, 4vw, 5rem);
              border-bottom: 1px solid var(--color-border);
              color: var(--color-text);
              vertical-align: top;
            }

            .reveal table tr:nth-child(even) {
              background-color: var(--color-bg-subtle);
            }

            .reveal table tr:hover {
              background-color: var(--color-bg-muted);
            }

            /* Blockquotes - Accent styling */
            .reveal blockquote {
              background: linear-gradient(135deg, var(--color-bg-subtle) 0%, var(--color-bg-muted) 100%);
              border-left: 5px solid var(--color-brand);
              border-radius: 0 12px 12px 0;
              padding: 1.5em 2em;
              margin: 2rem 0;
              font-style: italic;
              font-size: 1.1em;
              color: var(--color-text);
              position: relative;
            }

            .reveal blockquote::before {
              content: '"';
              position: absolute;
              top: -0.25em;
              left: 0.5em;
              font-size: 4em;
              color: var(--color-brand);
              opacity: 0.3;
              font-family: Georgia, serif;
              line-height: 1;
            }

            .reveal blockquote p {
              margin: 0;
              position: relative;
              z-index: 1;
            }

            /* Lists - Better spacing */
            .reveal ul,
            .reveal ol {
              color: var(--color-text);
            }

            /* Controls and progress */
            .reveal .controls {
              color: var(--color-brand-light);
            }

            .reveal .progress {
              background: var(--color-bg-muted);
            }

            .reveal .progress span {
              background: var(--color-brand);
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
