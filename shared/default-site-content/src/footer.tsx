import type { JSX } from "preact";

interface NavigationItem {
  label: string;
  href: string;
  priority: number;
}

interface FooterProps {
  primaryNavigation: NavigationItem[];
  secondaryNavigation: NavigationItem[];
  copyright?: string;
}

export const Footer = ({
  primaryNavigation,
  secondaryNavigation,
  copyright,
}: FooterProps): JSX.Element => {
  const currentYear = new Date().getFullYear();

  // Sort each navigation group by priority
  const sortedPrimary = [...primaryNavigation].sort(
    (a, b) => a.priority - b.priority,
  );
  const sortedSecondary = [...secondaryNavigation].sort(
    (a, b) => a.priority - b.priority,
  );

  return (
    <footer className="footer py-8 border-t border-theme-border">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Navigation links in two rows */}
        <nav className="footer-navigation mb-4 space-y-3">
          {/* Secondary navigation (first row) - meta pages */}
          {sortedSecondary.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-6">
              {sortedSecondary.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-theme-muted hover:text-brand transition-colors text-sm"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {/* Primary navigation (second row) - content */}
          {sortedPrimary.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-6">
              {sortedPrimary.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-theme-muted hover:text-brand transition-colors text-sm"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {/* Simple credit line */}
        <div className="text-center">
          <p className="text-sm text-theme-muted">
            {copyright ?? `Powered by Rizom • © ${currentYear}`}
          </p>
        </div>
      </div>
    </footer>
  );
};
