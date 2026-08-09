import { z } from "@rizom/brain/interfaces";

const incomingMessage = z.object({
  id: z.string(),
  roomId: z.string(),
  threadId: z.string().optional(),
  userId: z.string(),
  userName: z.string(),
  text: z.string(),
});

const sentMessage = z.object({ id: z.string() });

const attachment = z.object({
  name: z.string(),
  mediaType: z.string(),
  url: z.url(),
});

interface ListenOptions {
  signal: AbortSignal;
  onReady(): void;
  onWarning(message: string): void;
  onMessage(message: z.output<typeof incomingMessage>): Promise<void>;
}

export class CampfireClient {
  constructor(
    private readonly baseUrl: string,
    private readonly workspace: string,
    private readonly token: string,
  ) {}

  async listen({
    signal,
    onReady,
    onWarning,
    onMessage,
  }: ListenOptions): Promise<void> {
    const eventsUrl = new URL("/events", this.baseUrl);
    eventsUrl.protocol = eventsUrl.protocol === "https:" ? "wss:" : "ws:";
    const stream = new WebSocket(eventsUrl);

    await new Promise<void>((resolve, reject) => {
      stream.addEventListener("open", () => {
        stream.send(
          JSON.stringify({
            type: "authenticate",
            workspace: this.workspace,
            token: this.token,
          }),
        );
        onReady();
      });
      stream.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          onWarning("Campfire sent a non-text event");
          return;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          onWarning("Campfire sent invalid JSON");
          return;
        }
        const message = incomingMessage.safeParse(payload);
        if (!message.success) {
          onWarning("Campfire sent an unrecognized event");
          return;
        }
        onMessage(message.data).catch(reject);
      });
      stream.addEventListener("error", () => {
        onWarning("Campfire connection error");
      });
      stream.addEventListener("close", () => {
        if (signal.aborted) resolve();
        else reject(new Error("Campfire connection closed"));
      });
      signal.addEventListener(
        "abort",
        () => {
          stream.close();
          resolve();
        },
        { once: true },
      );
    });
  }

  async send(roomId: string, text: string): Promise<string> {
    const response = await this.request("/messages", {
      method: "POST",
      body: JSON.stringify({ roomId, text }),
    });
    return sentMessage.parse(await response.json()).id;
  }

  async edit(roomId: string, messageId: string, text: string): Promise<void> {
    await this.request(`/messages/${encodeURIComponent(messageId)}`, {
      method: "PUT",
      body: JSON.stringify({ roomId, text }),
    });
  }

  async attachments(
    messageId: string,
  ): Promise<readonly z.output<typeof attachment>[]> {
    const response = await this.request(
      `/messages/${encodeURIComponent(messageId)}/attachments`,
    );
    return z.array(attachment).parse(await response.json());
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${this.token}`);
    headers.set("content-type", "application/json");
    headers.set("x-campfire-workspace", this.workspace);

    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new Error(`Campfire request failed (${response.status})`);
    }
    return response;
  }
}
