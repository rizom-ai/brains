/**
 * Backpressure-aware frame writer.
 *
 * `socket.write` returns how many bytes it actually accepted, which is fewer
 * than requested once the kernel buffer fills. A multi-megabyte result — a
 * `show-file` of a large blob — is then written partially, and a caller that
 * ignores the return value leaves the peer holding an incomplete frame it
 * waits on forever.
 *
 * That is the same silent wedge the broker exists to remove, arriving through
 * the transport instead of the runtime, so every write goes through here.
 */

export interface WritableSocket {
  write(data: Uint8Array): number;
}

export class SocketWriter {
  readonly #socket: WritableSocket;
  #pending: Uint8Array = new Uint8Array(0);

  constructor(socket: WritableSocket) {
    this.#socket = socket;
  }

  /** Bytes still waiting for the peer to drain. */
  get pendingBytes(): number {
    return this.#pending.length;
  }

  send(frame: Uint8Array): void {
    const combined = new Uint8Array(this.#pending.length + frame.length);
    combined.set(this.#pending);
    combined.set(frame, this.#pending.length);
    this.#pending = combined;
    this.flush();
  }

  /** Call on every `drain` event; harmless when nothing is pending. */
  flush(): void {
    if (this.#pending.length === 0) return;
    try {
      const written = this.#socket.write(this.#pending);
      this.#pending =
        written >= this.#pending.length
          ? new Uint8Array(0)
          : this.#pending.slice(written);
    } catch {
      // The peer is gone. Dropping the buffer is correct: the operation is
      // detached, not cancelled, and the broker still owns it to completion.
      this.#pending = new Uint8Array(0);
    }
  }
}
