/**
 * Backpressure-aware framing writer.
 *
 * `socket.write` returns how many bytes it actually accepted, which is less
 * than requested once the kernel buffer fills. A multi-megabyte result — a
 * `show` of a large blob, a `status` in a big tree — is written partially, and
 * a caller that ignores the return value leaves the peer holding an incomplete
 * frame it will wait on forever. That silent wedge is precisely what this
 * broker exists to prevent, so every write goes through here.
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
      // The peer is gone. Dropping the buffer is correct here: the request is
      // detached, not cancelled, and its result stays in the journal.
      this.#pending = new Uint8Array(0);
    }
  }
}
