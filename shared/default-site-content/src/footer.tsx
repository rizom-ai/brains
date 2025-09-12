import type { JSX } from "preact";

interface NavigationItem {
  label: string;
  href: string;
}

interface FooterProps {
  navigation: NavigationItem[];
  copyright?: string;
}

export const Footer = ({ navigation, copyright }: FooterProps): JSX.Element => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer py-8 border-t border-theme-border">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Simple navigation links */}
        {navigation.length > 0 && (
          <nav className="footer-navigation mb-4">
            <ul className="flex flex-wrap justify-center gap-6">
              {navigation.map((item) => (
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
          </nav>
        )}

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
