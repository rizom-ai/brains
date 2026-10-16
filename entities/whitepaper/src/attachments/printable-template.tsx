import type { JSX } from "preact";
import { MarkdownContent } from "@brains/ui-library";
import { z } from "@brains/utils";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const WHITEPAPER_PRINTABLE_ATTACHMENT_TYPE = "printable";
export const WHITEPAPER_PRINTABLE_TEMPLATE_NAME = "whitepaper:printable";

export const whitepaperPrintableTemplateSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  subtitle: z.string().optional(),
  thesis: z.string().optional(),
  abstract: z.string().optional(),
  audience: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  publishedAt: z.string().optional(),
  brandLabel: z.string().optional(),
});

export type WhitepaperPrintableTemplateData = z.infer<
  typeof whitepaperPrintableTemplateSchema
>;

export const whitepaperPrintableTemplate: MediaPageTemplate = {
  name: WHITEPAPER_PRINTABLE_TEMPLATE_NAME,
  pluginId: "whitepaper",
  schema: whitepaperPrintableTemplateSchema,
  renderers: {
    pdf: renderWhitepaperPrintablePdf,
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

function renderWhitepaperPrintablePdf(
  props: Record<string, unknown>,
): JSX.Element {
  const data = whitepaperPrintableTemplateSchema.parse(props);
  const published = formatDate(data.publishedAt);

  return (
    <main className="printable-document printable-whitepaper">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @page { size: A4; margin: 0; }
            html, body { margin: 0; padding: 0; background: #f6f4ef; }
            body { color: #171717; font-family: var(--font-sans, ui-sans-serif, system-ui, sans-serif); }
            .printable-document { box-sizing: border-box; min-height: 297mm; padding: 24mm 22mm 20mm; background: #fffdf8; }
            .printable-kicker { margin: 0 0 10mm; color: #5f5a50; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
            .printable-title { margin: 0; max-width: 150mm; font-family: var(--font-heading, Georgia, serif); font-size: 42px; line-height: 1.04; letter-spacing: -.03em; }
            .printable-subtitle { margin: 6mm 0 0; max-width: 145mm; color: #4d4a43; font-family: var(--font-heading, Georgia, serif); font-size: 20px; line-height: 1.35; }
            .printable-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 8mm 0 0; color: #706b61; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
            .printable-summary { margin: 14mm 0 0; padding: 7mm 8mm; background: #f4efe4; border-left: 4px solid #3730a3; }
            .printable-summary h2 { margin: 0 0 3mm; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; }
            .printable-summary p { margin: 0 0 4mm; font-size: 14px; line-height: 1.55; }
            .printable-body { margin-top: 14mm; font-size: 14px; line-height: 1.7; }
            .printable-body h1, .printable-body h2, .printable-body h3 { font-family: var(--font-heading, Georgia, serif); line-height: 1.12; page-break-after: avoid; }
            .printable-body h1 { font-size: 30px; margin: 0 0 8mm; }
            .printable-body h2 { font-size: 24px; margin: 12mm 0 4mm; border-top: 1px solid #ddd6c8; padding-top: 6mm; }
            .printable-body h3 { font-size: 18px; margin: 8mm 0 3mm; }
            .printable-body p { margin: 0 0 4mm; }
            .printable-body ul, .printable-body ol { margin: 3mm 0 5mm; padding-left: 18px; }
            .printable-body li { margin-bottom: 2mm; }
            .printable-body blockquote { margin: 8mm 0; padding: 5mm 7mm; background: #f7f4ec; border-left: 3px solid #3730a3; }
            .printable-footer { margin-top: 16mm; padding-top: 5mm; border-top: 1px solid #ddd6c8; color: #706b61; font-size: 10px; }
          `,
        }}
      />
      <header>
        <p className="printable-kicker">{data.brandLabel ?? "White paper"}</p>
        <h1 className="printable-title">{data.title}</h1>
        {data.subtitle && <p className="printable-subtitle">{data.subtitle}</p>}
        <div className="printable-meta">
          {published && <span>{published}</span>}
          {data.audience?.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </header>
      {(data.abstract || data.thesis) && (
        <section className="printable-summary">
          {data.abstract && (
            <>
              <h2>Abstract</h2>
              <p>{data.abstract}</p>
            </>
          )}
          {data.thesis && (
            <>
              <h2>Thesis</h2>
              <p>{data.thesis}</p>
            </>
          )}
        </section>
      )}
      <section className="printable-body">
        <MarkdownContent markdown={data.body} />
      </section>
      <footer className="printable-footer">
        {data.keywords?.length ? (
          <span>{data.keywords.join(" · ")}</span>
        ) : null}
      </footer>
    </main>
  );
}
