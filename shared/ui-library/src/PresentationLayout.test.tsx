import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PresentationLayout } from "./PresentationLayout";
import { ImageRendererProvider } from "./ImageRendererProvider";

test("resolves preserved body references through the supplied renderer", () => {
  const seen: string[] = [];
  const html = renderToStaticMarkup(
    <ImageRendererProvider
      imageRenderer={({ href }): string | undefined => {
        seen.push(href);
        return href === "entity://image/body"
          ? '<img src="/images/body.webp" alt="Body" />'
          : undefined;
      }}
    >
      <PresentationLayout
        markdown={"# Deck\n\n![Body](entity://image/body)"}
        deck={{ coverImageUrl: "/images/cover.webp" }}
      />
    </ImageRendererProvider>,
  );
  expect(seen).toEqual(["entity://image/body"]);
  expect(html).toContain('src="/images/body.webp"');
  expect(html).toContain('data-background-image="/images/cover.webp"');
  expect(html).not.toContain("data:image/");
});

test("uses the prepared cover URL only on the title slide", () => {
  const html = renderToStaticMarkup(
    <PresentationLayout
      markdown={
        '# Title\n\n---\n\n<!-- .slide: data-background-image="/other.webp" -->\n# Second'
      }
      deck={{ coverImageUrl: "/images/verified.webp" }}
    />,
  );
  expect(
    html.match(/data-background-image="\/images\/verified.webp"/g),
  ).toHaveLength(1);
  expect(html).toContain('data-background-opacity="0.4"');
  expect(html).toContain('data-background-image="/other.webp"');
  expect(html).not.toContain("data:image/");
});

test("preserves explicit slide directives without a prepared cover", () => {
  const html = renderToStaticMarkup(
    <PresentationLayout
      markdown={
        '<!-- .slide: data-background-image="/explicit.webp" data-background-opacity="0.7" -->\n# Title'
      }
    />,
  );
  expect(html).toContain('data-background-image="/explicit.webp"');
  expect(html).toContain('data-background-opacity="0.7"');
});

test("prepared cover retains precedence and uses escaped React attributes", () => {
  const html = renderToStaticMarkup(
    <PresentationLayout
      markdown={
        '<!-- .slide: data-background-image="/explicit.webp" -->\n# Title'
      }
      deck={{ coverImageUrl: '/images/cover"quoted.webp' }}
    />,
  );
  expect(html).toContain(
    'data-background-image="/images/cover&quot;quoted.webp"',
  );
  expect(html).not.toContain('data-background-image="/explicit.webp"');
});
