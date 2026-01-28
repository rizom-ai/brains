import type { JSX } from "preact";
import { useState } from "preact/hooks";

export interface NewsletterSignupProps {
  /** Form title */
  title?: string;
  /** Description text below title */
  description?: string;
  /** Submit button text */
  buttonText?: string;
  /** Show name field */
  showNameField?: boolean;
  /** API endpoint for form submission */
  action?: string;
  /** Additional CSS classes */
  className?: string;
  /** Success message after subscribing */
  successMessage?: string;
}

type FormState = "idle" | "submitting" | "success" | "error";

/**
 * NewsletterSignup component - a form for subscribing to the newsletter
 *
 * Handles form submission client-side and shows success/error states.
 */
export function NewsletterSignup({
  title = "Subscribe to our newsletter",
  description = "Get the latest updates delivered to your inbox.",
  buttonText = "Subscribe",
  showNameField = false,
  action = "/api/newsletter/subscribe",
  className = "",
  successMessage = "Check your email to confirm your subscription.",
}: NewsletterSignupProps): JSX.Element {
  const [state, setState] = useState<FormState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const containerClasses = [
    "newsletter-signup",
    "p-6 rounded-lg bg-theme-subtle",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const handleSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    setState("submitting");
    setErrorMessage("");

    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formData = new FormData(form);

    try {
      const response = await fetch(action, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setState("success");
      } else {
        const data = await response.json().catch(() => ({}));
        setErrorMessage(
          data.error ?? "Something went wrong. Please try again.",
        );
        setState("error");
      }
    } catch {
      setErrorMessage("Network error. Please try again.");
      setState("error");
    }
  };

  // Success state
  if (state === "success") {
    return (
      <div className={containerClasses}>
        <div className="text-center py-4">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-theme font-medium">{successMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {title && (
        <h3 className="text-lg font-semibold text-theme mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-theme-muted text-sm mb-4">{description}</p>
      )}
      {state === "error" && errorMessage && (
        <p className="text-red-500 text-sm mb-3">{errorMessage}</p>
      )}
      <form
        onSubmit={handleSubmit}
        className="newsletter-signup-form flex flex-col gap-3"
      >
        {showNameField && (
          <input
            type="text"
            name="name"
            placeholder="Your name"
            disabled={state === "submitting"}
            className="px-4 py-2 rounded border border-theme-muted bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
        )}
        <input
          type="email"
          name="email"
          placeholder="your@email.com"
          required
          disabled={state === "submitting"}
          className="px-4 py-2 rounded border border-theme-muted bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={state === "submitting"}
          className="px-4 py-2 rounded bg-brand hover:bg-brand-dark text-theme-inverse font-medium transition-colors disabled:opacity-50"
        >
          {state === "submitting" ? "Subscribing..." : buttonText}
        </button>
      </form>
    </div>
  );
}
