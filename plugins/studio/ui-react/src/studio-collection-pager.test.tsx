/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StudioCollectionPager } from "./studio-collection-controls";

const base = {
  label: "Note pagination",
  loading: false,
  onPrevious: (): void => {},
  onNext: (): void => {},
};

test("a collection that fits on one page has no pager", () => {
  expect(
    renderToStaticMarkup(
      <StudioCollectionPager
        {...base}
        offset={0}
        count={4}
        total={4}
        hasNext={false}
      />,
    ),
  ).toBe("");
});

test("more pages, or a page past the first, keep the pager", () => {
  expect(
    renderToStaticMarkup(
      <StudioCollectionPager
        {...base}
        offset={0}
        count={25}
        total={30}
        hasNext
      />,
    ),
  ).toContain("1–25 of 30");
  expect(
    renderToStaticMarkup(
      <StudioCollectionPager
        {...base}
        offset={25}
        count={0}
        total={25}
        hasNext={false}
      />,
    ),
  ).toContain("Previous");
});
