/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { uploadImage } from "./mutations";
import { invalidateAfterUpload } from "./queries";

const PAGE = { offset: 0, limit: 96 };

/**
 * The brain's images as a grid. Opening one shows it with its title and alt
 * text, so an image nobody has described can be described here.
 */
export function StudioImagesView(props: {
  /** Open an entry that uses an image, in place. */
  onOpen?: (entityType: string, id: string) => void;
}): ReactElement {
  const api = useStudioApi();
  const library = useQuery({
    queryKey: ["studio", "image-library", PAGE.offset, PAGE.limit],
    queryFn: () => api.fetchImageLibrary(PAGE),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // A new image opens at once, so it can be described while it is in mind.
  const upload = useMutation({
    mutationFn: (file: File) => uploadImage(api, file),
    onSuccess: async (result) => {
      await Promise.all([
        invalidateAfterUpload(queryClient),
        queryClient.invalidateQueries({
          queryKey: ["studio", "image-library"],
        }),
      ]);
      setPicked(result.entityId);
    },
  });
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
      <div {...stylex.props(styles.uploadRow)}>
        <label {...stylex.props(styles.upload)}>
          Upload image
          <input
            type="file"
            aria-label="Upload image"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={upload.isPending}
            {...stylex.props(styles.file)}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) upload.mutate(file);
            }}
          />
        </label>
        <span role="status" aria-live="polite">
          {upload.isPending ? (
            <StudioStatus>Uploading…</StudioStatus>
          ) : upload.error ? (
            <StudioStatus tone="error">
              {errorMessage(upload.error)}
            </StudioStatus>
          ) : null}
        </span>
      </div>
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
            <StudioImageDetails
              imageId={picked}
              {...(props.onOpen && { onOpen: props.onOpen })}
            />
          </aside>
        )}
      </div>
    </main>
  );
}
