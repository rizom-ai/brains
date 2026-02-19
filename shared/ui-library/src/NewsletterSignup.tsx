import type { JSX } from "preact";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./lib/utils";
import { Button } from "./Button";

const newsletterSignupVariants = cva("newsletter-signup", {
  variants: {
    variant: {
      /** Horizontal inline form - for footer, minimal presence */
      inline: "",
      /** Card with background - for sidebar, end of post */
      card: "p-6 rounded-lg bg-theme-subtle",
      /** Full-width section - for homepage, dedicated page */
      section: "py-16 text-center",
    },
  },
  defaultVariants: {
    variant: "card",
  },
});

export interface NewsletterSignupProps
  extends VariantProps<typeof newsletterSignupVariants> {
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

/**
 * NewsletterSignup component - a form for subscribing to the newsletter
 *
 * Variants:
 * - `inline`: Horizontal layout for footer (label + input + button)
 * - `card`: Vertical card with background for sidebar/end-of-post
 * - `section`: Full-width prominent section for homepage/dedicated page
 *
 * Uses embedded vanilla JS for client-side interactivity without requiring hydration.
 */
export function NewsletterSignup({
  variant = "card",
  title,
  description,
  buttonText = "Subscribe",
  showNameField = false,
  action = "/api/newsletter/subscribe",
  className,
  successMessage = "Check your email to confirm your subscription.",
}: NewsletterSignupProps): JSX.Element {
  // Set appropriate defaults based on variant
  const displayTitle =
    title ??
    (variant === "inline"
      ? "Stay updated"
      : variant === "section"
        ? "Subscribe to the Newsletter"
        : "Subscribe");

  const displayDescription =
    description ??
    (variant === "section"
      ? "Get the latest essays and updates delivered to your inbox."
      : variant === "card"
        ? "Get updates delivered to your inbox."
        : undefined);

  // Inline script for client-side form handling (original working version)
  const alreadySubscribedMessage = "You are already subscribed!";
  const inlineScript = `
(function() {
  var form = document.currentScript.previousElementSibling;
  if (!form || form.tagName !== 'FORM') return;

  var container = form.parentElement;
  var button = form.querySelector('button[type="submit"]');
  var buttonText = button ? button.textContent : 'Subscribe';

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    if (button) {
      button.disabled = true;
      button.textContent = 'Subscribing...';
    }

    var formData = new FormData(form);

    fetch(form.action, {
      method: 'POST',
      body: formData,
      headers: { 'Accept': 'application/json' }
    })
    .then(function(response) {
      if (response.ok) {
        return response.json().then(function(res) {
          var msg = (res.data && res.data.message === 'already_subscribed')
            ? '${alreadySubscribedMessage}'
            : '${successMessage}';
          container.innerHTML = '<div class="text-center py-4">' +
            '<svg class="w-12 h-12 mx-auto mb-3 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>' +
            '</svg>' +
            '<p class="text-theme font-medium">' + msg + '</p>' +
            '</div>';
        });
      } else {
        return response.json().catch(function() { return {}; }).then(function(data) {
          throw new Error(data.error || 'Something went wrong. Please try again.');
        });
      }
    })
    .catch(function(err) {
      var errorEl = form.querySelector('.newsletter-error');
      if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.className = 'newsletter-error text-status-danger text-sm mb-3';
        form.insertBefore(errorEl, form.firstChild);
      }
      errorEl.textContent = err.message || 'Network error. Please try again.';
      if (button) {
        button.disabled = false;
        button.textContent = buttonText;
      }
    });
  });
})();
`;

  // Inline variant: horizontal layout for footer (adapts to footer background)
  if (variant === "inline") {
    return (
      <div
        className={cn(
          newsletterSignupVariants({ variant }),
          "max-w-md mx-auto",
          className,
        )}
      >
        <form
          action={action}
          method="POST"
          className="newsletter-signup-form flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl bg-theme-subtle border border-theme"
        >
          <span className="text-heading font-medium whitespace-nowrap">
            {displayTitle}
          </span>
          <div className="flex flex-1 w-full sm:w-auto gap-2 min-w-0">
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              required
              className="flex-1 min-w-0 px-4 py-2.5 rounded-lg bg-theme border border-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
            <Button
              type="submit"
              className="shrink-0 whitespace-nowrap font-semibold"
            >
              {buttonText}
            </Button>
          </div>
        </form>
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </div>
    );
  }

  // Section variant: full-width prominent layout
  if (variant === "section") {
    return (
      <div className={cn(newsletterSignupVariants({ variant }), className)}>
        <div className="max-w-xl mx-auto px-6">
          {displayTitle && (
            <h2 className="text-3xl font-bold text-heading mb-3">
              {displayTitle}
            </h2>
          )}
          {displayDescription && (
            <p className="text-theme-muted text-lg mb-8">
              {displayDescription}
            </p>
          )}
          <form
            action={action}
            method="POST"
            className="newsletter-signup-form flex flex-col sm:flex-row gap-3 justify-center"
          >
            {showNameField && (
              <input
                type="text"
                name="name"
                placeholder="Your name"
                className="px-4 py-3 text-base rounded-lg border border-theme bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand"
              />
            )}
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              required
              className="flex-1 max-w-sm px-4 py-3 text-base rounded-lg border border-theme bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <Button type="submit" size="lg">
              {buttonText}
            </Button>
          </form>
        </div>
        <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
      </div>
    );
  }

  // Card variant (default): vertical card layout
  return (
    <div className={cn(newsletterSignupVariants({ variant }), className)}>
      {displayTitle && (
        <h3 className="text-lg font-semibold text-heading mb-2">
          {displayTitle}
        </h3>
      )}
      {displayDescription && (
        <p className="text-theme-muted text-sm mb-4">{displayDescription}</p>
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
            className="px-3 py-2 text-sm rounded-lg border border-theme bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand"
          />
        )}
        <input
          type="email"
          name="email"
          placeholder="your@email.com"
          required
          className="px-3 py-2 text-sm rounded-lg border border-theme bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <Button type="submit">{buttonText}</Button>
      </form>
      <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
    </div>
  );
}

export { newsletterSignupVariants };
