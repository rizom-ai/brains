import type { Logger } from "@brains/utils";
import type { MessageContext } from "./types.js";
import PQueue from "p-queue";

export interface InterfaceContext {
  name: string;
  version: string;
  logger: Logger;
  processQuery: (query: string, context: MessageContext) => Promise<string>;
}

export abstract class BaseInterface {
  protected logger: Logger;
  protected queue: PQueue;
  protected processQuery: (
    query: string,
    context: MessageContext,
  ) => Promise<string>;
  public readonly name: string;
  public readonly version: string;

  constructor(context: InterfaceContext) {
    this.name = context.name;
    this.version = context.version;
    this.logger = context.logger;
    this.processQuery = context.processQuery;
    this.queue = new PQueue({
      concurrency: 1,
      interval: 1000,
      intervalCap: 10,
    });
  }

  protected async handleInput(
    input: string,
    context: MessageContext,
  ): Promise<string> {
    // Handle interface-specific commands
    if (input.startsWith("/")) {
      const localResponse = await this.handleLocalCommand(input, context);
      if (localResponse !== null) {
        return localResponse;
      }
    }

    // Everything else goes to Shell
    return this.processMessage(input, context);
  }

  protected abstract handleLocalCommand(
    command: string,
    context: MessageContext,
  ): Promise<string | null>;

  protected async processMessage(
    content: string,
    context: MessageContext,
  ): Promise<string> {
    const result = await this.queue.add(async () => {
      return this.processQuery(content, context);
    });

    if (!result) {
      throw new Error("No response from query processor");
    }

    return result;
  }

  public abstract start(): Promise<void>;
  public abstract stop(): Promise<void>;
}
