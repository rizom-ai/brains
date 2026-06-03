import type { JSX } from "preact";
import { z } from "@brains/utils";
import type { MediaPageTemplate } from "@brains/media-page-composer";

export const BLOG_OG_IMAGE_ATTACHMENT_TYPE = "og-image";
export const BLOG_OG_IMAGE_TEMPLATE_NAME = "blog:og-image";

export const blogOgImageTemplateSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  publishedAt: z.string().optional(),
  brandLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
});

export type BlogOgImageTemplateData = z.infer<typeof blogOgImageTemplateSchema>;

export const blogOgImageTemplate: MediaPageTemplate = {
  name: BLOG_OG_IMAGE_TEMPLATE_NAME,
  pluginId: "blog",
  schema: blogOgImageTemplateSchema,
  renderers: {
    image: renderBlogOgImage,
  },
};

function formatDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function renderBlogOgImage(props: Record<string, unknown>): JSX.Element {
  const data = blogOgImageTemplateSchema.parse(props);
  const published = formatDate(data.publishedAt);

  return (
    <main className="og-card">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,750&family=IBM+Plex+Sans:wght@450;500;600&family=JetBrains+Mono:wght@500&display=swap");
            @page { size: 1200px 630px; margin: 0; }
            html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #11100d; }
            body { color: #17140f; font-family: var(--font-sans, "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif); }
            .og-card {
              box-sizing: border-box;
              position: relative;
              width: 1200px;
              height: 630px;
              overflow: hidden;
              padding: 58px 64px;
              background:
                radial-gradient(circle at 86% 16%, rgba(202, 92, 38, 0.22), transparent 28%),
                linear-gradient(135deg, rgba(143, 63, 31, 0.08), transparent 42%),
                #f8f1e7;
            }
            .og-card::before {
              content: "";
              position: absolute;
              inset: 34px;
              border: 1.5px solid rgba(23, 20, 15, 0.22);
              pointer-events: none;
            }
            .og-card::after {
              content: "";
              position: absolute;
              left: 64px;
              top: 58px;
              bottom: 58px;
              width: 5px;
              background: linear-gradient(#b94e23, #e2a94d);
            }
            .og-layout {
              position: relative;
              z-index: 1;
              display: grid;
              grid-template-columns: 1fr 332px;
              gap: 52px;
              height: 100%;
              padding-left: 32px;
            }
            .og-content { display: flex; min-width: 0; flex-direction: column; justify-content: space-between; }
            .og-kicker {
              margin: 0;
              color: #8f3f1f;
              font: 500 18px/1.25 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.16em;
              text-transform: uppercase;
              overflow-wrap: anywhere;
            }
            .og-title {
              max-width: 720px;
              margin: 34px 0 0;
              color: #11100d;
              font-family: var(--font-heading, "Fraunces", Georgia, serif);
              font-size: 72px;
              font-weight: 750;
              line-height: 0.94;
              letter-spacing: -0.052em;
              text-wrap: balance;
            }
            .og-excerpt {
              max-width: 700px;
              margin: 26px 0 0;
              color: #50473d;
              font-size: 25px;
              font-weight: 450;
              line-height: 1.25;
              text-wrap: balance;
            }
            .og-meta {
              display: flex;
              flex-wrap: wrap;
              gap: 12px 28px;
              color: #6f6255;
              font: 500 18px/1.4 var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .og-meta span + span { position: relative; }
            .og-meta span + span::before {
              content: "";
              position: absolute;
              left: -17px;
              top: 0.55em;
              width: 5px;
              height: 5px;
              border-radius: 99px;
              background: #b94e23;
            }
            .og-art {
              position: relative;
              align-self: stretch;
              min-height: 0;
            }
            .og-cover-frame {
              position: absolute;
              inset: 0;
              padding: 14px;
              background: #fffaf2;
              border: 1px solid rgba(23, 20, 15, 0.18);
              box-shadow: 16px 16px 0 rgba(185, 78, 35, 0.18);
            }
            .og-cover {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: cover;
              filter: saturate(0.92) contrast(1.04);
            }
            .og-mark {
              position: absolute;
              right: 0;
              bottom: 0;
              width: 210px;
              height: 210px;
              border-radius: 999px;
              background: #b94e23;
              box-shadow: inset 0 0 0 28px #f8f1e7, inset 0 0 0 31px rgba(23, 20, 15, 0.22);
            }
          `,
        }}
      />
      <section className="og-layout">
        <div className="og-content">
          <div>
            {data.brandLabel && <p className="og-kicker">{data.brandLabel}</p>}
            <h1 className="og-title">{data.title}</h1>
            {data.excerpt && <p className="og-excerpt">{data.excerpt}</p>}
          </div>
          <div className="og-meta">
            {data.author && <span>{data.author}</span>}
            {published && <span>{published}</span>}
          </div>
        </div>
        <aside className="og-art" aria-hidden="true">
          {data.coverImageUrl ? (
            <div className="og-cover-frame">
              <img className="og-cover" src={data.coverImageUrl} alt="" />
            </div>
          ) : (
            <div className="og-mark" />
          )}
        </aside>
      </section>
    </main>
  );
}
