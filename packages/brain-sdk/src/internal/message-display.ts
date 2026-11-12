/**
 * Internal, first-party only: how a reply's artifact cards and confirmation
 * results read and which uploads a composer accepts, for a first-party
 * browser UI. The modules it re-exports import only shared libraries, so
 * a browser bundle takes them without the plugins package's runtime, which
 * `@brains/sdk/internal/interface-runtime` carries. No public entry exports
 * this module.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-interface-runtime).
 */

export {
  artifactStatusLabel,
  formatArtifactDisplay,
  getArtifactCardState,
  narrowArtifactJobStatus,
  type ArtifactCardState,
  type ArtifactDisplay,
  type ArtifactJobStatus,
} from "@brains/plugins/message-interface/artifact-display";
export {
  formatConfirmationResult,
  type ConfirmationResultDisplay,
} from "@brains/plugins/message-interface/confirmation-result";
export {
  messageTextUploadMaxBytes,
  messageUploadAccept,
  messageUploadMaxBytes,
} from "@brains/plugins/message-interface/upload-policy";
