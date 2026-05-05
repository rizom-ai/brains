/** Minimal plugin shape needed by site packages. */
export interface SiteCompositionPlugin {
  readonly id: string;
  readonly version: string;
  readonly type: "core" | "entity" | "service" | "interface";
  readonly packageName: string;
  readonly description?: string | undefined;
  readonly dependencies?: string[] | undefined;
  ready?(): Promise<void>;
  shutdown?(): Promise<void>;
  requiresDaemonStartup?(): boolean;
}
