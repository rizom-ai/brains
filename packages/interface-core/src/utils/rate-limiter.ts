import PQueue from "p-queue";

export interface RateLimiterConfig {
  name?: string;
  concurrency?: number;
  interval?: number;
  intervalCap?: number;
}

export class RateLimiter {
  private queue: PQueue;

  constructor(config: RateLimiterConfig = {}) {
    const { concurrency = 1, interval, intervalCap } = config;
    const queueOptions: {
      concurrency: number;
      interval?: number;
      intervalCap?: number;
    } = { concurrency };
    
    if (interval !== undefined) {
      queueOptions.interval = interval;
    }
    
    if (intervalCap !== undefined) {
      queueOptions.intervalCap = intervalCap;
    }
    
    this.queue = new PQueue(queueOptions);
  }

  public async add<T>(fn: () => Promise<T>): Promise<T> {
    const result = await this.queue.add(fn);
    if (result === undefined) {
      throw new Error("Queue function returned undefined");
    }
    return result;
  }

  public get size(): number {
    return this.queue.size;
  }

  public get pending(): number {
    return this.queue.pending;
  }

  public clear(): void {
    this.queue.clear();
  }

  public pause(): void {
    this.queue.pause();
  }

  public start(): void {
    this.queue.start();
  }

  public async onIdle(): Promise<void> {
    return this.queue.onIdle();
  }

  public static createForInterface(
    interfaceName: string,
    config?: Partial<RateLimiterConfig>
  ): RateLimiter {
    return new RateLimiter({
      concurrency: 1,
      interval: 1000,
      intervalCap: 10,
      ...config,
      name: `${interfaceName}-limiter`,
    });
  }
}