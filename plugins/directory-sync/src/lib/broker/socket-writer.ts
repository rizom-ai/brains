import { MAX_FRAME_BYTES, ProtocolError } from "./protocol";
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

/**
 * How much a peer may leave undrained before it is refused.
 *
 * Generous enough that an ordinary slow reader is simply waited for, and
 * bounded so that one that has stopped reading entirely cannot take the
 * owner down with it.
 */
const MAX_PENDING_BYTES = MAX_FRAME_BYTES * 2;

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
    // Retaining what the peer has not taken is correct; retaining it
    // without a ceiling is how a slow reader costs the broker its memory,
    // and the checkout with it.
    if (this.#pending.length + frame.length > MAX_PENDING_BYTES) {
      throw new ProtocolError(
        "frame-too-large",
        `Refusing to buffer ${this.#pending.length + frame.length} bytes for a peer that is not draining; the limit is ${MAX_PENDING_BYTES}`,
      );
    }
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
