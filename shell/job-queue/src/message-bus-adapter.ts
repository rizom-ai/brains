import type { IEventEmitter } from "./job-progress-monitor";
import type { MessageBus } from "@brains/messaging-service";

/**
 * Adapter that implements IEventEmitter interface using MessageBus
 */
export class MessageBusAdapter implements IEventEmitter {
  constructor(private messageBus: MessageBus) {}

  async send(event: string, data: unknown): Promise<void> {
    // Use the MessageBus send method with a default sender
    await this.messageBus.send(event, data, "job-progress-monitor");
  }
}