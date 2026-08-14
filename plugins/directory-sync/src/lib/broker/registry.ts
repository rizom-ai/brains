import { resolve } from "path";
import { pathExists } from "../fs-utils";
import type { ExecuteMessage, RegisterCheckoutMessage } from "./protocol";

/**
 * Which checkouts this broker owns, and what may be run against them.
 *
 * Registration is the boundary between bootstrap and ordinary work. A
 * repository is *declared* by `register-checkout` before its checkout exists,
 * during which only the `bootstrap` class is accepted. It becomes *ready* when
 * the checkout is actually present on disk — the broker verifies that itself
 * rather than trusting a client to announce it — after which `bootstrap` is
 * refused and every other class is accepted.
 */

export type RegistryErrorCode =
  | "identity-drift"
  | "unknown-repository"
  | "bootstrap-after-registration"
  | "not-bootstrapped";

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;

  constructor(code: RegistryErrorCode, message: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
  }
}

export interface RegisteredCheckout {
  repositoryKey: string;
  checkoutPath: string;
  branch: string;
  remoteFingerprint: string;
  timeoutMs: number;
  maxOutputBytes: number;
}

export interface CheckoutRegistryOptions {
  /** Injected so registration state is testable without a real checkout. */
  checkoutExists?: ((checkoutPath: string) => Promise<boolean>) | undefined;
}

async function defaultCheckoutExists(checkoutPath: string): Promise<boolean> {
  return pathExists(resolve(checkoutPath, ".git"));
}

export class CheckoutRegistry {
  readonly #checkouts = new Map<string, RegisteredCheckout>();
  readonly #checkoutExists: (checkoutPath: string) => Promise<boolean>;

  constructor(options: CheckoutRegistryOptions = {}) {
    this.#checkoutExists = options.checkoutExists ?? defaultCheckoutExists;
  }

  /**
   * Declare a repository, or re-declare it identically. Any change to the
   * path, branch, or remote identity is drift: the broker would otherwise
   * silently move its advisory lock to a different checkout.
   */
  register(message: RegisterCheckoutMessage): RegisteredCheckout {
    const declared: RegisteredCheckout = {
      repositoryKey: message.repositoryKey,
      checkoutPath: resolve(message.checkoutPath),
      branch: message.branch,
      remoteFingerprint: message.remoteFingerprint,
      timeoutMs: message.timeoutMs,
      maxOutputBytes: message.maxOutputBytes,
    };

    const existing = this.#checkouts.get(message.repositoryKey);
    if (existing) {
      const drifted = (
        [
          ["checkout path", existing.checkoutPath, declared.checkoutPath],
          ["branch", existing.branch, declared.branch],
          [
            "remote identity",
            existing.remoteFingerprint,
            declared.remoteFingerprint,
          ],
        ] as const
      ).filter(([, before, after]) => before !== after);

      if (drifted.length > 0) {
        throw new RegistryError(
          "identity-drift",
          `Repository "${message.repositoryKey}" is already registered with a different ${drifted
            .map(([field]) => field)
            .join(", ")}`,
        );
      }
    }

    this.#checkouts.set(message.repositoryKey, declared);
    return declared;
  }

  get(repositoryKey: string): RegisteredCheckout | undefined {
    return this.#checkouts.get(repositoryKey);
  }

  list(): string[] {
    return [...this.#checkouts.keys()].sort();
  }

  /**
   * Resolve the checkout a request may run against, enforcing the bootstrap
   * boundary. Returns the declared checkout in both states; the caller uses
   * the same advisory lock either way, keyed on the eventual checkout path.
   */
  async resolveForExecute(
    message: ExecuteMessage,
  ): Promise<RegisteredCheckout> {
    const declared = this.#checkouts.get(message.repositoryKey);
    if (!declared) {
      throw new RegistryError(
        "unknown-repository",
        `Repository "${message.repositoryKey}" is not registered with this broker`,
      );
    }

    const ready = await this.#checkoutExists(declared.checkoutPath);

    if (message.operationClass === "bootstrap" && ready) {
      throw new RegistryError(
        "bootstrap-after-registration",
        `Repository "${message.repositoryKey}" is already checked out; bootstrap is no longer accepted`,
      );
    }
    if (message.operationClass !== "bootstrap" && !ready) {
      throw new RegistryError(
        "not-bootstrapped",
        `Repository "${message.repositoryKey}" has no checkout yet; only bootstrap is accepted`,
      );
    }

    return declared;
  }
}
