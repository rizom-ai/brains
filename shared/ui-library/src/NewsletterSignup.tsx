import type { JSX } from "preact";

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
}

/**
 * NewsletterSignup component - a form for subscribing to the newsletter
 *
 * Can be used with SSR (form posts to action URL) or hydrated for client-side handling.
 */
export function NewsletterSignup({
  title = "Subscribe to our newsletter",
  description = "Get the latest updates delivered to your inbox.",
  buttonText = "Subscribe",
  showNameField = false,
  action = "/api/newsletter/subscribe",
  className = "",
}: NewsletterSignupProps): JSX.Element {
  const containerClasses = [
    "newsletter-signup",
    "p-6 rounded-lg bg-theme-subtle",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      {title && (
        <h3 className="text-lg font-semibold text-theme mb-2">{title}</h3>
      )}
      {description && (
        <p className="text-theme-muted text-sm mb-4">{description}</p>
      )}
      <form
        action={action}
        method="POST"
        className="newsletter-signup-form flex flex-col gap-3"
      >
        {showNameField && (
          <input
            type="text"
            name="name"
            placeholder="Your name"
            className="px-4 py-2 rounded border border-theme-muted bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
        )}
        <input
          type="email"
          name="email"
          placeholder="your@email.com"
          required
          className="px-4 py-2 rounded border border-theme-muted bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-brand hover:bg-brand-dark text-theme-inverse font-medium transition-colors"
        >
          {buttonText}
        </button>
      </form>
    </div>
  );
}
