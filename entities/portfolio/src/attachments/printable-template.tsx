import type { JSX } from "preact";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@brains/utils/zod-v4";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const PROJECT_PRINTABLE_ATTACHMENT_TYPE = "printable";
export const PROJECT_PRINTABLE_TEMPLATE_NAME = "portfolio:project-printable";

export interface ProjectPrintableTemplateData {
  title: string;
  description?: string | undefined;
  year?: number | undefined;
  publishedAt?: string | undefined;
  url?: string | undefined;
  canonicalUrl?: string | undefined;
  coverImageUrl?: string | undefined;
  body: string;
  brandLabel?: string | undefined;
}

export const projectPrintableTemplateSchema: z.ZodType<
  ProjectPrintableTemplateData,
  ProjectPrintableTemplateData
> = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  year: z.number().optional(),
  publishedAt: z.string().optional(),
  url: z.string().optional(),
  canonicalUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  body: z.string(),
  brandLabel: z.string().optional(),
});

export const projectPrintableTemplate: MediaPageTemplate = {
  name: PROJECT_PRINTABLE_TEMPLATE_NAME,
  pluginId: "portfolio",
  schema: projectPrintableTemplateSchema,
  renderers: {
    pdf: renderProjectPrintablePdf,
  },
};

function renderProjectPrintablePdf(
  props: Record<string, unknown>,
): JSX.Element {
  const data = projectPrintableTemplateSchema.parse(props);

  return (
    <main className="printable-document printable-project">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,450;0,9..144,650&family=IBM+Plex+Sans:wght@400;450;500;600&family=JetBrains+Mono:wght@400;500&display=swap");
            @page { size: A4; margin: 0; }
            html, body { margin: 0; padding: 0; background: #11100d; }
            body { color: #161513; font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .printable-document {
              box-sizing: border-box;
              min-height: 297mm;
              padding: 18mm;
              background:
                linear-gradient(135deg, rgba(24, 23, 20, 0.05) 25%, transparent 25%) 0 0 / 18px 18px,
                #f3efe7;
            }
            .project-shell {
              min-height: calc(297mm - 36mm);
              border: 1.5px solid rgba(22, 21, 19, 0.78);
              background: #fffbf2;
              box-shadow: 10px 10px 0 #c95f2f;
            }
            .project-hero {
              display: grid;
              grid-template-columns: 36mm 1fr;
              min-height: 78mm;
              border-bottom: 1.5px solid rgba(22, 21, 19, 0.78);
            }
            .project-index {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              padding: 9mm 7mm;
              background: #161513;
              color: #fff6e8;
            }
            .printable-kicker {
              margin: 0;
              font: 500 9px/1.4 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.16em;
              text-transform: uppercase;
              color: #f0b08c;
              overflow-wrap: anywhere;
            }
            .project-year {
              color: #fff6e8;
              font: 650 36px/0.9 var(--font-heading, "Fraunces", Georgia, serif);
              letter-spacing: -0.06em;
              writing-mode: vertical-rl;
              transform: rotate(180deg);
            }
            .project-title-panel { padding: 10mm 12mm 9mm; }
            .printable-kind {
              display: inline-block;
              margin-bottom: 8mm;
              padding: 6px 9px;
              border-radius: 999px;
              background: rgba(201, 95, 47, 0.12);
              color: #8d3d1d;
              font: 500 9px/1 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.14em;
              text-transform: uppercase;
            }
            .printable-title {
              margin: 0;
              color: #11100d;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 48px;
              font-weight: 650;
              line-height: 0.95;
              letter-spacing: -0.045em;
              text-wrap: balance;
            }
            .printable-description {
              max-width: 120mm;
              margin: 7mm 0 0;
              color: #48413a;
              font-size: 17px;
              line-height: 1.43;
              text-wrap: pretty;
            }
            .printable-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 7px;
              margin: 8mm 0 0;
            }
            .printable-meta span {
              padding: 6px 8px;
              border: 1px solid rgba(22, 21, 19, 0.16);
              background: #f6ecdd;
              color: #58483b;
              font: 500 10px/1.2 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              overflow-wrap: anywhere;
            }
            .printable-cover {
              display: block;
              width: calc(100% - 20mm);
              max-height: 72mm;
              object-fit: cover;
              margin: 10mm;
              border: 1px solid rgba(22, 21, 19, 0.24);
              filter: saturate(0.9) contrast(1.04);
            }
            .printable-body {
              padding: 5mm 12mm 12mm;
              font-size: 14.2px;
              line-height: 1.64;
              color: #24211d;
            }
            .printable-body h1, .printable-body h2, .printable-body h3 {
              page-break-after: avoid;
              text-wrap: balance;
            }
            .printable-body h1 {
              margin: 0 0 7mm;
              font: 650 30px/1.06 var(--font-heading, "Fraunces", Georgia, serif);
              letter-spacing: -0.035em;
            }
            .printable-body h2 {
              position: relative;
              margin: 12mm -12mm 5mm;
              padding: 4mm 12mm 4mm 24mm;
              border-top: 1px solid rgba(22, 21, 19, 0.18);
              border-bottom: 1px solid rgba(22, 21, 19, 0.18);
              background: linear-gradient(90deg, rgba(201, 95, 47, 0.12), transparent 65%);
              color: #11100d;
              font: 650 23px/1.12 var(--font-heading, "Fraunces", Georgia, serif);
              letter-spacing: -0.025em;
            }
            .printable-body h2::before {
              content: "";
              position: absolute;
              left: 12mm;
              top: 50%;
              width: 6mm;
              height: 2px;
              background: #c95f2f;
            }
            .printable-body h3 { margin: 8mm 0 3mm; font-size: 17px; }
            .printable-body p { margin: 0 0 4mm; }
            .printable-body ul { margin: 4mm 0 6mm; padding-left: 18px; }
            .printable-body li { margin-bottom: 2.5mm; }
            .printable-body strong { color: #11100d; font-weight: 600; }
            .printable-footer {
              display: flex;
              justify-content: space-between;
              gap: 8mm;
              margin: 0 12mm 10mm;
              padding-top: 5mm;
              border-top: 1px solid rgba(22, 21, 19, 0.18);
              color: #6d6257;
              font: 10px/1.45 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
            }
            .printable-footer a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
          `,
        }}
      />
      <section className="project-shell">
        <header className="project-hero">
          <div className="project-index">
            {data.brandLabel && (
              <p className="printable-kicker">{data.brandLabel}</p>
            )}
            {data.year && <span className="project-year">{data.year}</span>}
          </div>
          <div className="project-title-panel">
            <span className="printable-kind">Case study dossier</span>
            <h1 className="printable-title">{data.title}</h1>
            {data.description && (
              <p className="printable-description">{data.description}</p>
            )}
            <div className="printable-meta">
              {data.year && <span>{data.year}</span>}
              {data.url && <span>{data.url}</span>}
            </div>
          </div>
        </header>
        {data.coverImageUrl && (
          <img className="printable-cover" src={data.coverImageUrl} alt="" />
        )}
        <MarkdownContent markdown={data.body} className="printable-body" />
        {(data.canonicalUrl || data.url || data.brandLabel) && (
          <footer className="printable-footer">
            <span>{data.brandLabel ?? "Project printable"}</span>
            {data.canonicalUrl || data.url ? (
              <a href={data.canonicalUrl ?? data.url}>
                {data.canonicalUrl ?? data.url}
              </a>
            ) : null}
          </footer>
        )}
      </section>
    </main>
  );
}
