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
  /** Success message after subscribing */
  successMessage?: string;
}

/**
 * NewsletterSignup component - a form for subscribing to the newsletter
 *
 * Uses embedded vanilla JS for client-side interactivity without requiring hydration.
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
  const containerClasses = [
    "newsletter-signup",
    "p-6 rounded-lg bg-theme-subtle",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Inline script for client-side form handling
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
            '<svg class="w-12 h-12 mx-auto mb-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">' +
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
        errorEl.className = 'newsletter-error text-red-500 text-sm mb-3';
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
            className="px-4 py-2 rounded border border-theme-muted bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
        )}
        <input
          type="email"
          name="email"
          placeholder="your@email.com"
          required
          className="px-4 py-2 rounded border border-theme-muted bg-theme text-theme placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded bg-brand hover:bg-brand-dark text-theme-inverse font-medium transition-colors disabled:opacity-50"
        >
          {buttonText}
        </button>
      </form>
      <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
    </div>
  );
}
