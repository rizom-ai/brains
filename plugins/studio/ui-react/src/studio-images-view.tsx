/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { STUDIO_THUMBNAIL_WIDTH } from "../../src/studio-thumbnail";
import { useStudioApi } from "./studio-api-context";
import { StudioEntityImage } from "./studio-entity-image";
import { StudioImageDetails } from "./studio-image-details";
import { imagesViewStyles as styles } from "./studio-images-view.styles";
import { StudioPageHead } from "./studio-page-head";
import { headStyles } from "./studio-page-head.styles";
import { libraryStyles } from "./studio-library.styles";
import { StudioStatus } from "./studio-status";
import { errorMessage } from "./ui-utils";

const PAGE = { offset: 0, limit: 96 };

/**
 * The brain's images as a grid. Opening one shows it with its title and alt
 * text, so an image nobody has described can be described here.
 */
export function StudioImagesView(): ReactElement {
  const api = useStudioApi();
  const library = useQuery({
    queryKey: ["studio", "image-library", PAGE.offset, PAGE.limit],
    queryFn: () => api.fetchImageLibrary(PAGE),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const panel = useRef<HTMLElement>(null);
  // On a phone the details sit under the grid; bring them into view.
  useEffect(() => {
    if (picked) panel.current?.scrollIntoView({ block: "nearest" });
  }, [picked]);
  const total = library.data?.total ?? 0;
  return (
    <main
      {...stylex.props(libraryStyles.listing, headStyles.inset, styles.page)}
      data-studio-images=""
    >
      <StudioPageHead
        model={{
          access: { kind: "permission", label: "Trusted" },
          title: "Images",
          metadata: library.data
            ? [`${total} ${total === 1 ? "image" : "images"}`]
            : [],
          totals: [],
        }}
      />
      {library.error ? (
        <StudioStatus tone="error">{errorMessage(library.error)}</StudioStatus>
      ) : null}
      <div {...stylex.props(styles.layout)}>
        <ul {...stylex.props(styles.grid)} aria-label="Images">
          {(library.data?.images ?? []).map((image) => {
            const undescribed =
              image.altSource === "fallback" || !image.alt.trim();
            return (
              <li key={image.id}>
                <button
                  type="button"
                  data-studio-image={image.id}
                  aria-pressed={picked === image.id}
                  {...stylex.props(
                    styles.card,
                    picked === image.id && styles.cardPicked,
                  )}
                  onClick={() => setPicked(image.id)}
                >
                  <span {...stylex.props(styles.thumb)}>
                    <StudioEntityImage
                      imageId={image.id}
                      thumbnailWidth={STUDIO_THUMBNAIL_WIDTH}
                      alt={image.alt}
                      placeholder={<span {...stylex.props(styles.pending)} />}
                      {...stylex.props(styles.thumbImage)}
                    />
                  </span>
                  <span {...stylex.props(styles.title)}>
                    {image.title || image.id}
                    {undescribed && (
                      <span {...stylex.props(styles.missing)}>No alt text</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {picked && (
          <aside
            ref={panel}
            data-studio-image-panel=""
            aria-label="Image details"
            {...stylex.props(styles.details)}
          >
            <StudioImageDetails imageId={picked} />
          </aside>
        )}
      </div>
    </main>
  );
}
