/**
 * Generates the HTML shell for the page
 * Head content is provided as a string from the head collector
 */
export function createHTMLShell(
  content: string,
  headContent?: string,
  defaultTitle?: string,
  themeMode?: "light" | "dark",
): string {
  // Default head content if none provided
  const defaultHead = `
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${defaultTitle ?? "Site"}</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <link rel="icon" type="image/png" href="/favicon.png">
    <link rel="stylesheet" href="/styles/main.css">`;

  const themeAttr = ` data-theme="${themeMode ?? "dark"}"`;

  // Theme and UI scripts - runs immediately to prevent flash
  const uiScript = `
    <script>
      (function() {
        // Theme handling
        const stored = localStorage.getItem('theme');
        const theme = stored || '${themeMode ?? "dark"}';
        document.documentElement.setAttribute('data-theme', theme);

        window.toggleTheme = function() {
          const current = document.documentElement.getAttribute('data-theme');
          const next = current === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          localStorage.setItem('theme', next);
        };

        // Mobile menu handling
        window.toggleMobileMenu = function() {
          const menu = document.getElementById('mobile-menu');
          const button = document.getElementById('mobile-menu-button');
          if (!menu || !button) return;

          const isOpen = !menu.classList.contains('max-h-0');
          const willOpen = !isOpen;

          // Toggle height and opacity classes
          menu.classList.toggle('max-h-0');
          menu.classList.toggle('max-h-screen');
          menu.classList.toggle('opacity-0');
          menu.classList.toggle('opacity-100');

          button.setAttribute('aria-expanded', String(willOpen));

          // Toggle icon visibility
          const menuIcon = button.querySelector('.menu-icon');
          const closeIcon = button.querySelector('.close-icon');
          if (menuIcon && closeIcon) {
            menuIcon.classList.toggle('hidden');
            closeIcon.classList.toggle('hidden');
          }

          if (willOpen) {
            // Focus first link when menu opens
            const firstLink = menu.querySelector('a');
            if (firstLink) {
              setTimeout(function() { firstLink.focus(); }, 100);
            }
            // Add keyboard listeners
            document.addEventListener('keydown', window.handleMobileMenuKeydown);
          } else {
            // Return focus to button when menu closes
            button.focus();
            // Remove keyboard listeners
            document.removeEventListener('keydown', window.handleMobileMenuKeydown);
          }
        };

        // Close mobile menu (for link clicks)
        window.closeMobileMenu = function() {
          const menu = document.getElementById('mobile-menu');
          if (menu && !menu.classList.contains('max-h-0')) {
            window.toggleMobileMenu();
          }
        };

        // Handle keyboard events for mobile menu
        window.handleMobileMenuKeydown = function(e) {
          const menu = document.getElementById('mobile-menu');
          const button = document.getElementById('mobile-menu-button');
          if (!menu || !button) return;

          // Close on Escape
          if (e.key === 'Escape') {
            window.closeMobileMenu();
            return;
          }

          // Focus trap on Tab
          if (e.key === 'Tab') {
            const focusableElements = menu.querySelectorAll('a, button');
            if (focusableElements.length === 0) return;

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (e.shiftKey) {
              // Shift+Tab: wrap from first to last (or button)
              if (document.activeElement === firstElement || document.activeElement === button) {
                e.preventDefault();
                lastElement.focus();
              }
            } else {
              // Tab: wrap from last to button
              if (document.activeElement === lastElement) {
                e.preventDefault();
                button.focus();
              }
            }
          }
        };
      })();
    </script>`;

  return `<!DOCTYPE html>
<html lang="en" class="h-full"${themeAttr}>
<head>
    ${headContent ?? defaultHead}
    ${uiScript}
</head>
<body class="h-full font-sans">
  <div id="root" class="min-h-screen">
    ${content}
  </div>
</body>
</html>`;
}
