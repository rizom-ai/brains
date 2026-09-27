import type { EntityFileActorOptions } from "@brains/entity-service";

/** Explicit source entries; the CLI build emits this same catalog into file-actors/. */
type FileActorName =
  | "upload"
  | "download"
  | "capture"
  | "http"
  | "image"
  | "pdf"
  | "message"
  | "remote"
  | "render"
  | "ai-image"
  | "file-model"
  | "email-source"
  | "upload-markdown"
  | "site-public-assets"
  | "responsive-image";
export const fileActorSources: Readonly<Record<FileActorName, URL>> = {
  upload: new URL(
    "../../../shared/db/src/turso-worker/file-upload-process.ts",
    import.meta.url,
  ),
  download: new URL(
    "../../../shared/db/src/turso-worker/file-download-process.ts",
    import.meta.url,
  ),
  capture: new URL(
    "../../../shared/db/src/turso-worker/file-capture-process.ts",
    import.meta.url,
  ),
  http: new URL(
    "../../../shared/db/src/turso-worker/file-http-upload-process.ts",
    import.meta.url,
  ),
  image: new URL(
    "../../../shared/image/src/file-inspection-process.ts",
    import.meta.url,
  ),
  pdf: new URL(
    "../../../shared/document/src/file-inspection-process.ts",
    import.meta.url,
  ),
  message: new URL(
    "../../plugins/src/message-interface/upload-inspection-process.ts",
    import.meta.url,
  ),
  remote: new URL(
    "../../../shared/image/src/remote-image-process.ts",
    import.meta.url,
  ),
  render: new URL(
    "../../../shared/media-page-composer/src/render-process.ts",
    import.meta.url,
  ),
  "ai-image": new URL(
    "../../ai-service/src/image-generation-process.ts",
    import.meta.url,
  ),
  "file-model": new URL(
    "../../ai-service/src/file-model-process.ts",
    import.meta.url,
  ),
  "email-source": new URL(
    "../../../interfaces/email/src/email-source-process.ts",
    import.meta.url,
  ),
  "upload-markdown": new URL(
    "../../../shared/document/src/upload-markdown-process.ts",
    import.meta.url,
  ),
  "site-public-assets": new URL(
    "../../../shared/site-engine/src/public-asset-process.ts",
    import.meta.url,
  ),
  "responsive-image": new URL(
    "../../../shared/image/src/responsive-image-process.ts",
    import.meta.url,
  ),
};

/** No artifact probing, PATH lookup, or controller-byte fallback. */
export function createFileActorOptions(
  executable: string,
  directory?: URL,
): EntityFileActorOptions {
  const artifact = (name: keyof typeof fileActorSources): URL =>
    directory
      ? new URL(`${name}.js`, directory)
      : new URL(fileActorSources[name]);
  return {
    executable,
    uploadUrl: artifact("upload"),
    downloadUrl: artifact("download"),
    captureUrl: artifact("capture"),
    httpUploadUrl: artifact("http"),
    inspectionUploadUrl: artifact("image"),
    inspectionUploadUrls: {
      pdf: artifact("pdf"),
      "message-upload": artifact("message"),
    },
    remoteDownloadUrl: artifact("remote"),
    producerUrl: artifact("render"),
    producerUrls: {
      "ai-image": artifact("ai-image"),
      "file-model": artifact("file-model"),
      "email-source": artifact("email-source"),
      "upload-markdown": artifact("upload-markdown"),
      "site-public-assets": artifact("site-public-assets"),
      "responsive-image": artifact("responsive-image"),
    },
  };
}
