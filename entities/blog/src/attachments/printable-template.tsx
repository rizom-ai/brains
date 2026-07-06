import type { JSX } from "preact";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@brains/utils/zod";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const BLOG_PRINTABLE_ATTACHMENT_TYPE = "printable";
export const BLOG_PRINTABLE_TEMPLATE_NAME = "blog:printable";

export interface BlogPrintableTemplateData {
  title: string;
  body: string;
  excerpt?: string | undefined;
  author?: string | undefined;
  publishedAt?: string | undefined;
  canonicalUrl?: string | undefined;
  coverImageUrl?: string | undefined;
  brandLabel?: string | undefined;
}

export const blogPrintableTemplateSchema: z.ZodType<BlogPrintableTemplateData> =
  z.object({
    title: z.string().min(1),
    body: z.string(),
    excerpt: z.string().optional(),
    author: z.string().optional(),
    publishedAt: z.string().optional(),
    canonicalUrl: z.string().optional(),
    coverImageUrl: z.string().optional(),
    brandLabel: z.string().optional(),
  });

export const blogPrintableTemplate: MediaPageTemplate = {
  name: BLOG_PRINTABLE_TEMPLATE_NAME,
  pluginId: "blog",
  schema: blogPrintableTemplateSchema,
  renderers: {
    pdf: renderBlogPrintablePdf,
  },
};

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function renderBlogPrintablePdf(props: Record<string, unknown>): JSX.Element {
  const data = blogPrintableTemplateSchema.parse(props);
  const published = formatDate(data.publishedAt);

  return (
    <main className="printable-document printable-blog-post">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,550;0,9..144,650;1,9..144,400&family=IBM+Plex+Sans:wght@400;450;500&family=JetBrains+Mono:wght@400;500&display=swap");
            @page { size: A4; margin: 0; }
            html, body { margin: 0; padding: 0; background: #efe7d8; }
            body { color: #17140f; font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .printable-document {
              box-sizing: border-box;
              min-height: 297mm;
              padding: 24mm 22mm 20mm;
              background:
                radial-gradient(circle at 88% 12%, rgba(196, 84, 30, 0.14), transparent 26%),
                #f8f1e7;
            }
            .printable-hero {
              position: relative;
              display: grid;
              grid-template-columns: 46mm 1fr;
              gap: 12mm;
              padding-bottom: 18mm;
              border-bottom: 1.5px solid rgba(23, 20, 15, 0.22);
            }
            .printable-hero::before {
              content: "";
              position: absolute;
              left: 46mm;
              top: -6mm;
              bottom: 13mm;
              width: 1px;
              background: linear-gradient(#b94e23, rgba(185, 78, 35, 0));
            }
            .printable-masthead {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-height: 62mm;
            }
            .printable-kicker {
              margin: 0;
              color: #8f3f1f;
              font: 500 10px/1.35 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.16em;
              text-transform: uppercase;
              overflow-wrap: anywhere;
            }
            .printable-title {
              margin: 0;
              color: #11100d;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 52px;
              font-weight: 650;
              line-height: 0.94;
              letter-spacing: -0.045em;
              text-wrap: balance;
              font-variation-settings: "opsz" 100, "SOFT" 20;
            }
            .printable-excerpt {
              max-width: 118mm;
              margin: 9mm 0 0;
              color: #4d4439;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 19px;
              font-style: italic;
              line-height: 1.38;
              text-wrap: pretty;
            }
            .printable-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 6px 16px;
              margin: 8mm 0 0;
              color: #706457;
              font: 500 11px/1.4 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.03em;
              text-transform: uppercase;
            }
            .printable-meta span { position: relative; }
            .printable-meta span + span::before {
              content: "";
              position: absolute;
              left: -9px;
              top: 0.48em;
              width: 3px;
              height: 3px;
              border-radius: 999px;
              background: #b94e23;
            }
            .printable-cover-wrap {
              margin: 12mm 0 0;
              padding: 4mm;
              background: #fffaf2;
              border: 1px solid rgba(23, 20, 15, 0.12);
              box-shadow: 0 14px 35px rgba(49, 35, 18, 0.12);
            }
            .printable-cover {
              display: block;
              width: 100%;
              max-height: 76mm;
              object-fit: cover;
              filter: saturate(0.92) contrast(1.04);
            }
            .printable-body {
              position: relative;
              margin-top: 15mm;
              padding-left: 14mm;
              font-size: 14.8px;
              line-height: 1.72;
              color: #25211c;
            }
            .printable-body::before {
              content: "";
              position: absolute;
              left: 0;
              top: 0;
              bottom: 0;
              width: 2px;
              background: linear-gradient(#b94e23, rgba(185, 78, 35, 0.08));
            }
            .printable-body h1, .printable-body h2, .printable-body h3 {
              color: #15120e;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-weight: 600;
              line-height: 1.08;
              letter-spacing: -0.026em;
              page-break-after: avoid;
              text-wrap: balance;
            }
            .printable-body h1 { margin: 0 0 10mm; font-size: 32px; }
            .printable-body h2 { margin: 13mm 0 4mm; font-size: 26px; }
            .printable-body h3 { margin: 9mm 0 3mm; font-size: 19px; }
            .printable-body p { margin: 0 0 4.3mm; }
            .printable-body p:first-child::first-letter {
              float: left;
              padding: 4px 8px 0 0;
              color: #8f3f1f;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 58px;
              line-height: 0.82;
              font-weight: 650;
            }
            .printable-body a { color: #8f3f1f; text-decoration-color: rgba(143, 63, 31, 0.35); }
            .printable-body blockquote {
              margin: 9mm 0;
              padding: 6mm 8mm;
              background: rgba(255, 250, 242, 0.82);
              border-left: 4px solid #b94e23;
              color: #3f342b;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-style: italic;
              font-size: 17px;
              line-height: 1.48;
              box-shadow: inset 0 0 0 1px rgba(23, 20, 15, 0.08);
            }
            .printable-body ul, .printable-body ol { margin: 4mm 0 6mm; padding-left: 18px; }
            .printable-body li { margin-bottom: 2.4mm; }
            .printable-body code {
              padding: 1px 4px;
              border-radius: 4px;
              background: rgba(143, 63, 31, 0.09);
              font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              font-size: 0.88em;
            }
            .printable-body img { max-width: 100%; border-radius: 2px; }
            .printable-footer {
              display: flex;
              justify-content: space-between;
              gap: 10mm;
              margin-top: 16mm;
              padding-top: 5mm;
              border-top: 1px solid rgba(23, 20, 15, 0.18);
              color: #706457;
              font: 10px/1.5 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.02em;
            }
            .printable-footer a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
          `,
        }}
      />
      <header className="printable-hero">
        <div className="printable-masthead">
          {data.brandLabel && (
            <p className="printable-kicker">{data.brandLabel}</p>
          )}
        </div>
        <div>
          <h1 className="printable-title">{data.title}</h1>
          {data.excerpt && <p className="printable-excerpt">{data.excerpt}</p>}
          <div className="printable-meta">
            {data.author && <span>By {data.author}</span>}
            {published && <span>{published}</span>}
          </div>
        </div>
      </header>
      {data.coverImageUrl && (
        <figure className="printable-cover-wrap">
          <img className="printable-cover" src={data.coverImageUrl} alt="" />
        </figure>
      )}
      <MarkdownContent markdown={data.body} className="printable-body" />
      {(data.canonicalUrl || data.brandLabel) && (
        <footer className="printable-footer">
          <span>{data.brandLabel ?? "Printable PDF"}</span>
          {data.canonicalUrl && (
            <a href={data.canonicalUrl}>{data.canonicalUrl}</a>
          )}
        </footer>
      )}
    </main>
  );
}
