export class MediaRenderError extends Error {
  public readonly code:
    | "browser-launch-failed"
    | "render-timeout"
    | "output-too-large"
    | "invalid-output";

  constructor(
    message: string,
    code:
      | "browser-launch-failed"
      | "render-timeout"
      | "output-too-large"
      | "invalid-output",
  ) {
    super(message);
    this.code = code;
    this.name = "MediaRenderError";
  }
}
