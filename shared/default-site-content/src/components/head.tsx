import type { JSX } from "preact";
import { Helmet } from "react-helmet-async";

export interface HeadProps {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  canonicalUrl?: string;
}

/**
 * Reusable Head component for managing document head
 */
export function Head({
  title,
  description,
  ogImage,
  ogType = "website",
  twitterCard = "summary_large_image",
  canonicalUrl,
}: HeadProps): JSX.Element {
  return (
    <Helmet>
      <meta charSet="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

      <title>{title}</title>
      {description && <meta name="description" content={description} />}

      {/* Favicons */}
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="icon" type="image/png" href="/favicon.png" />

      {/* Fonts - Removed hardcoded font to allow theme customization */}

      {/* Styles */}
      <link rel="stylesheet" href="/styles/main.css" />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={ogType} />
      {ogImage && <meta property="og:image" content={ogImage} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
    </Helmet>
  );
}
