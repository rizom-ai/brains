import type { JSX } from "preact";
import type { FooterData } from "./schema";

export const FooterLayout = ({
  navigation,
  copyright,
}: FooterData): JSX.Element => {
  const currentYear = new Date().getFullYear();
  const defaultCopyright = `© ${currentYear} Rizom Brains. All rights reserved.`;

  return (
    <footer className="footer-section bg-theme-dark text-theme-inverse py-12">
      <div className="container mx-auto px-4">
        {/* Navigation Links */}
        <nav className="footer-navigation mb-8">
          <ul className="flex flex-wrap justify-center gap-6">
            {navigation.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-theme-light hover:text-brand transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Copyright */}
        <div className="text-center text-theme-light text-sm">
          {copyright || defaultCopyright}
        </div>
      </div>
    </footer>
  );
};
