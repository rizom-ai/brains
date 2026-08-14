import { resolve } from "path";
import { pathExists } from "../fs-utils";
import type { ExecuteMessage, RegisterCheckoutMessage } from "./protocol";

/**
 * Which checkouts this broker owns, and what may be run against them.
 *
 * `bootstrap` is the widest allow-list, so it closes as early as it can: it
 * covers only the commands that run against a checkout which does not exist
 * yet — the remote probe, clone, and init — and the broker refuses it the
 * moment the checkout appears on disk. That the checkout exists is verified
 * here rather than announced by a client.
 */

export type RegistryErrorCode =
  "identity-drift" | "unknown-repository" | "bootstrap-after-registration";

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

    // `bootstrap` covers only the commands that run against a checkout which
    // does not exist yet — the remote probe, clone, and init. Everything the
    // client does afterwards (remote configuration, identity, branch repair,
    // the initial commit) runs against a real repository and uses an ordinary
    // class, so the widest allow-list closes the moment the checkout appears.
    //
    // The reverse restriction is deliberately absent: an ordinary command
    // issued before the checkout exists simply fails in Git, which is a
    // truthful error, and forbidding it here bought nothing.
    if (
      message.operationClass === "bootstrap" &&
      (await this.#checkoutExists(declared.checkoutPath))
    ) {
      throw new RegistryError(
        "bootstrap-after-registration",
        `Repository "${message.repositoryKey}" is already checked out; bootstrap is no longer accepted`,
      );
    }

    return declared;
  }
}
