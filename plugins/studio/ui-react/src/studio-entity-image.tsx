/** @jsxImportSource react */
import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import type { StudioApi } from "./api";
import { useStudioApi } from "./studio-api-context";

/** Resolve only preview images, through the same scoped client as the editor. */
export function StudioEntityImage({
  imageId,
  alt,
  ...props
}: Omit<ComponentProps<"img">, "src"> & { imageId: string }): ReactElement {
  const api = useStudioApi();
  const [loaded, setLoaded] = useState<{
    api: StudioApi;
    imageId: string;
    source: string | null;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    void api.fetchImagePreview(imageId, controller.signal).then(
      (source): void => {
        if (!controller.signal.aborted)
          setLoaded({
            api,
            imageId,
            // StudioApi admits only this image's authenticated source route.
            source,
          });
      },
      (): void => {
        // Missing, forbidden and failed reads are unavailable, never a fallback
        // to a different client or a previously authorized image.
        if (!controller.signal.aborted)
          setLoaded({ api, imageId, source: null });
      },
    );
    return (): void => controller.abort();
  }, [api, imageId]);
  const current =
    loaded?.api === api && loaded.imageId === imageId ? loaded : undefined;
  if (current?.source)
    return <img {...props} alt={alt ?? ""} src={current.source} />;
  const status = current ? "Image unavailable" : "Loading image";
  return (
    <span role="img" aria-label={alt ? `${alt}: ${status}` : status}>
      {alt ? `${alt} — ${status}` : status}
    </span>
  );
}
