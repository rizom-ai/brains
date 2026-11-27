/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState, type ReactElement } from "react";
import { Button, Input, Textarea } from "@brains/app-ui-react";
import type { ImageDetails } from "./api";
import { useStudioApi } from "./studio-api-context";
import { StudioEntityImage } from "./studio-entity-image";
import { StudioStatus } from "./studio-status";
import { fieldStyles as f } from "./studio-fields.styles";
import { errorMessage } from "./ui-utils";
import { imageDetailsStyles as styles } from "./studio-image-details.styles";
import { studioEntityPath } from "../../src/studio-paths";
import { getStudioRouterBasePath } from "./studio-router";
import { isPlainLinkClick } from "./link-click";

const SOURCE_NOTE: Record<ImageDetails["altSource"], string> = {
  fallback:
    "Not described yet: the alt text stands in until the brain describes the image.",
  generated: "Written by the brain's vision model. Edit it to make it yours.",
  owner: "Written by you. The brain will not replace it.",
};

/**
 * An image a field refers to, opened with its preview, title and alt text.
 * Saving makes the alt text the owner's.
 */
export function StudioImageDetails(props: {
  imageId: string;
  /** Open an entry that uses the image in place; links work without it. */
  onOpen?: (entityType: string, id: string) => void;
}): ReactElement {
  const api = useStudioApi();
  const [details, setDetails] = useState<ImageDetails | null>(null);
  const [title, setTitle] = useState("");
  const [alt, setAlt] = useState("");
  const [status, setStatus] = useState<
    { tone: "good" | "error"; text: string } | undefined
  >();
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let current = true;
    setDetails(null);
    setUnavailable(false);
    setStatus(undefined);
    void api.fetchImageDetails(props.imageId).then(
      (loaded) => {
        if (!current) return;
        setDetails(loaded);
        setTitle(loaded.title);
        setAlt(loaded.alt);
      },
      () => {
        // An image not yet stored, or not readable here, has nothing to edit.
        if (current) setUnavailable(true);
      },
    );
    return (): void => {
      current = false;
    };
  }, [api, props.imageId]);

  const save = async (): Promise<void> => {
    if (!details) return;
    setSaving(true);
    setStatus(undefined);
    try {
      await api.saveImageDetails({
        id: details.id,
        title,
        alt,
        baseContentHash: details.contentHash,
      });
      const reloaded = await api.fetchImageDetails(details.id);
      setDetails(reloaded);
      setStatus({ tone: "good", text: "Image details saved." });
    } catch (error) {
      setStatus({ tone: "error", text: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  if (unavailable)
    return (
      <p {...stylex.props(styles.source)}>
        This image's title and alt text are not available here.
      </p>
    );

  return (
    <div {...stylex.props(styles.details)} data-studio-image-details="">
      <StudioEntityImage
        imageId={props.imageId}
        alt={alt}
        {...stylex.props(styles.preview)}
      />
      <div {...stylex.props(styles.fields)}>
        <label {...stylex.props(styles.label)}>
          <span {...stylex.props(f.label)}>Title</span>
          <Input
            xstyle={f.control}
            type="text"
            value={title}
            disabled={!details || saving}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </label>
        <label {...stylex.props(styles.label)}>
          <span {...stylex.props(f.label)}>Alt text</span>
          <Textarea
            xstyle={f.control}
            rows={2}
            value={alt}
            disabled={!details || saving}
            onChange={(event) => setAlt(event.currentTarget.value)}
          />
        </label>
        {details && (
          <p {...stylex.props(styles.source)}>
            {SOURCE_NOTE[details.altSource]}
          </p>
        )}
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!details || saving}
            onClick={() => void save()}
          >
            Save image details
          </Button>
        </div>
        <div role="status" aria-live="polite">
          {status && (
            <StudioStatus tone={status.tone}>{status.text}</StudioStatus>
          )}
        </div>
        {details?.usedIn && (
          <section data-studio-image-uses="" {...stylex.props(styles.uses)}>
            <h3 {...stylex.props(f.label)}>Used in</h3>
            {details.usedIn.length === 0 ? (
              <p {...stylex.props(styles.source)}>Not used in any entry yet.</p>
            ) : (
              <ul {...stylex.props(styles.useList)}>
                {details.usedIn.map((use) => (
                  <li key={`${use.entityType}/${use.id}`}>
                    <a
                      href={studioEntityPath(
                        getStudioRouterBasePath(),
                        use.entityType,
                        use.id,
                      )}
                      onClick={(event) => {
                        if (!props.onOpen || !isPlainLinkClick(event)) return;
                        event.preventDefault();
                        props.onOpen(use.entityType, use.id);
                      }}
                      {...stylex.props(styles.useLink)}
                    >
                      {use.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
