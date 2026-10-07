import { expect, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CoverImage } from "./CoverImage";
import { Header } from "./Header";

test("static controls and responsive images render without React warnings", () => {
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    const html = renderToStaticMarkup(
      <>
        <Header
          title="Test"
          navigation={[{ href: "/essays", label: "Essays", priority: 10 }]}
          showThemeToggle
        />
        <CoverImage
          src="/image-960.webp"
          alt="Cover"
          width={960}
          height={640}
          srcSet="/image-480.webp 480w, /image-960.webp 960w"
          sizes="(max-width: 640px) 480px, 960px"
        />
      </>,
    );

    expect(error).not.toHaveBeenCalled();
    expect(html).toContain("data-theme-toggle");
    expect(html).not.toContain("onclick=");
    expect(html).toContain(
      'srcSet="/image-480.webp 480w, /image-960.webp 960w"',
    );
  } finally {
    error.mockRestore();
  }
});
