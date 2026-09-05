import type { FetchLike } from "@brains/deploy-support/origin-ca";
import { z } from "@brains/utils/zod";

import {
  sampleStressHealth,
  type StressHealthSample,
  type StressRuntimeSample,
} from "./directory-sync-stress";

export interface HealthPayload {
  version: string;
  entities: number;
  entityCounts: { entityType: string; count: number }[];
}

const operationalHealthPayloadSchema = z.object({
  status: z.literal("ready"),
  operationalStatus: z.literal("operational"),
  app: z.object({
    version: z.string(),
    entities: z.number().int().nonnegative(),
    entityCounts: z
      .array(
        z.object({
          entityType: z.string(),
          count: z.number().int().nonnegative(),
        }),
      )
      .default([]),
  }),
});

export function noteCount(payload: HealthPayload): number {
  return (
    payload.entityCounts.find((entry) => entry.entityType === "note")?.count ??
    0
  );
}

export interface StressHealthMonitorOptions {
  domain: string;
  fetchImpl: FetchLike;
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
  /** Take one runtime sample (e.g. docker stats over SSH), if available. */
  sampleRuntime: () => Promise<StressRuntimeSample | undefined>;
}

/**
 * Samples deployment health and runtime resource usage during a stress run,
 * and answers entity-baseline waits against the operational health endpoint.
 */
export class StressHealthMonitor {
  readonly #options: StressHealthMonitorOptions;
  readonly #healthSamples: StressHealthSample[] = [];
  readonly #runtimeSamples: StressRuntimeSample[] = [];
  readonly #activeEndpoints = new Set<string>(["/health/ready"]);
  #stopped = true;
  #loopPromise: Promise<void> | undefined;
  #loopError: unknown;
  #startedAt = "";
  #gateOffset = 0;
  #gateEndOffset: number | undefined;

  constructor(options: StressHealthMonitorOptions) {
    this.#options = options;
  }

  /** ISO timestamp of the most recent start() call. */
  get startedAt(): string {
    return this.#startedAt;
  }

  /** The first sampling failure since start(), if any. */
  get error(): unknown {
    return this.#loopError;
  }

  get healthSamples(): readonly StressHealthSample[] {
    return this.#healthSamples;
  }

  get runtimeSamples(): readonly StressRuntimeSample[] {
    return this.#runtimeSamples;
  }

  /** Health samples between start() and markGateEnd() (or now). */
  gateHealthSamples(): StressHealthSample[] {
    return this.#healthSamples.slice(
      this.#gateOffset,
      this.#gateEndOffset ?? this.#healthSamples.length,
    );
  }

  /** Exclude samples taken after this point from the gate window. */
  markGateEnd(): void {
    this.#gateEndOffset = this.#healthSamples.length;
  }

  /** Probe optional health endpoints and add responsive ones to the loop. */
  async discoverEndpoints(): Promise<void> {
    for (const endpoint of ["/health/live", "/health/operate"]) {
      const sample = await sampleStressHealth(
        `https://${this.#options.domain}${endpoint}`,
        {
          fetchImpl: this.#options.fetchImpl,
          now: this.#options.now,
          timeoutMs: 5_000,
        },
      );
      if (sample.status !== 404) {
        this.#activeEndpoints.add(endpoint);
      }
    }
  }

  start(): void {
    this.#stopped = false;
    this.#loopError = undefined;
    this.#gateOffset = this.#healthSamples.length;
    this.#gateEndOffset = undefined;
    this.#startedAt = this.#options.now().toISOString();
    this.#loopPromise = Promise.all([this.#healthLoop(), this.#runtimeLoop()])
      .then(() => undefined)
      .catch((error: unknown) => {
        this.#loopError = error;
        this.#stopped = true;
      });
  }

  /** Stop sampling and wait for the loops; a loop error stays on `error`. */
  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#loopPromise;
  }

  async waitForHealthSnapshot(
    timeoutMs: number,
  ): Promise<HealthPayload | undefined> {
    return this.waitForEntityBaseline(undefined, undefined, timeoutMs);
  }

  async waitForEntityBaseline(
    expectedNotes: number | undefined,
    expectedEntities: number | undefined,
    timeoutMs: number,
  ): Promise<HealthPayload | undefined> {
    const started = this.#options.now().getTime();
    while (this.#options.now().getTime() - started < timeoutMs) {
      const snapshot = await this.fetchHealthPayload();
      if (this.#matchesBaseline(snapshot, expectedNotes, expectedEntities)) {
        return snapshot;
      }
      await this.#options.sleep(5_000);
    }
    return undefined;
  }

  async waitForStableEntityBaseline(
    expectedNotes: number | undefined,
    expectedEntities: number | undefined,
    timeoutMs: number,
  ): Promise<HealthPayload | undefined> {
    const started = this.#options.now().getTime();
    let consecutiveMatches = 0;
    while (this.#options.now().getTime() - started < timeoutMs) {
      const snapshot = await this.fetchHealthPayload();
      if (this.#matchesBaseline(snapshot, expectedNotes, expectedEntities)) {
        consecutiveMatches += 1;
        if (consecutiveMatches === 2) {
          return snapshot;
        }
      } else {
        consecutiveMatches = 0;
      }
      await this.#options.sleep(5_000);
    }
    return undefined;
  }

  async fetchHealthPayload(): Promise<HealthPayload | undefined> {
    const started = this.#options.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.#options.fetchImpl(
        `https://${this.#options.domain}/health/operate`,
        { signal: controller.signal },
      );
      const body = await response.text();
      this.#healthSamples.push({
        timestamp: started.toISOString(),
        endpoint: "/health/operate",
        status: response.status,
        durationMs: Math.max(
          0,
          this.#options.now().getTime() - started.getTime(),
        ),
        ok: response.ok,
      });
      if (!response.ok) return undefined;
      return operationalHealthPayloadSchema.parse(JSON.parse(body)).app;
    } catch (error) {
      // The failed probe is recorded above before this returns, so the run
      // still reports it. Undefined means no reading, which the acceptance
      // checks already treat as unhealthy rather than as a pass.
      this.#healthSamples.push({
        timestamp: started.toISOString(),
        endpoint: "/health/operate",
        status: 0,
        durationMs: Math.max(
          0,
          this.#options.now().getTime() - started.getTime(),
        ),
        ok: false,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  #matchesBaseline(
    snapshot: HealthPayload | undefined,
    expectedNotes: number | undefined,
    expectedEntities: number | undefined,
  ): snapshot is HealthPayload {
    return (
      snapshot !== undefined &&
      (expectedNotes === undefined || noteCount(snapshot) === expectedNotes) &&
      (expectedEntities === undefined || snapshot.entities === expectedEntities)
    );
  }

  async #healthLoop(): Promise<void> {
    while (!this.#stopped) {
      for (const endpoint of this.#activeEndpoints) {
        this.#healthSamples.push(
          await sampleStressHealth(
            `https://${this.#options.domain}${endpoint}`,
            {
              fetchImpl: this.#options.fetchImpl,
              now: this.#options.now,
              timeoutMs: 20_000,
            },
          ),
        );
      }
      await this.#options.sleep(4_000);
    }
  }

  async #runtimeLoop(): Promise<void> {
    while (!this.#stopped) {
      const sample = await this.#options.sampleRuntime();
      if (sample) {
        this.#runtimeSamples.push(sample);
      }
      await this.#options.sleep(1_000);
    }
  }
}
