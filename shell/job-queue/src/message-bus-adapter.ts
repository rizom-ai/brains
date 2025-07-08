import type { IEventEmitter } from "./job-progress-monitor";
import type { MessageBus } from "@brains/messaging-service";

/**
 * Adapter that implements IEventEmitter interface using MessageBus
 */
export class MessageBusAdapter implements IEventEmitter {
  constructor(
    private messageBus: MessageBus,
    private source: string,
  ) {}

  async send(event: string, data: unknown, target?: string): Promise<void> {
    // Use the messageBus send method with all parameters including target
    await this.messageBus.send(event, data, this.source, target);
  }
}
