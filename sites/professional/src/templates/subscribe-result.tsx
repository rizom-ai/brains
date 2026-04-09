import type { JSX } from "preact";
import { Head, LinkButton } from "@brains/ui-library";

/**
 * Subscribe thank-you page
 * Shown after successful newsletter subscription
 */
export const SubscribeThanksLayout = (): JSX.Element => {
  return (
    <>
      <Head
        title="Thanks for subscribing!"
        description="You've successfully subscribed to the newsletter."
      />
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">&#127881;</div>
          <h1 className="text-3xl font-semibold mb-4 text-heading">
            Thanks for subscribing!
          </h1>
          <p className="text-lg text-theme-muted mb-8">
            You'll receive a confirmation email shortly. Check your inbox to
            confirm your subscription.
          </p>
          <LinkButton href="/" variant="primary">
            Back to Home
          </LinkButton>
        </div>
      </div>
    </>
  );
};

/**
 * Subscribe error page
 * Shown when newsletter subscription fails
 */
export const SubscribeErrorLayout = (): JSX.Element => {
  return (
    <>
      <Head
        title="Subscription failed"
        description="There was a problem with your subscription."
      />
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">&#128546;</div>
          <h1 className="text-3xl font-semibold mb-4 text-heading">
            Something went wrong
          </h1>
          <p className="text-lg text-theme-muted mb-8">
            We couldn't process your subscription. Please try again or contact
            us if the problem persists.
          </p>
          <LinkButton href="/" variant="primary">
            Back to Home
          </LinkButton>
        </div>
      </div>
    </>
  );
};
