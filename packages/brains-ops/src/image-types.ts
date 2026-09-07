/** Exact runtime requirements shared by image planning and verification. */
export interface RequiredImage {
  tag: string;
  brainVersion: string;
  /** Sorted, deduped package specs installed into this runtime image. */
  sitePackages: string[];
}
