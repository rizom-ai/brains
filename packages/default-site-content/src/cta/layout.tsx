import type { CTASection } from "./schema";

export const CTALayout = ({
  headline,
  description,
  primaryButton,
  secondaryButton,
}: CTASection): JSX.Element => {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-brand-dark to-brand"></div>
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, rgba(255, 255, 255, 0.15) 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        ></div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-theme-inverse mb-6">
          {headline}
        </h2>
        <p className="text-xl md:text-2xl text-brand-light mb-10 max-w-3xl mx-auto leading-relaxed">
          {description}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={primaryButton.link}
            className="inline-flex items-center justify-center px-10 py-5 text-lg font-bold text-brand bg-theme-inverse rounded-2xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            {primaryButton.text}
            <svg
              className="ml-2 w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              ></path>
            </svg>
          </a>
          {secondaryButton && (
            <a
              href={secondaryButton.link}
              className="inline-flex items-center justify-center px-10 py-5 text-lg font-bold text-theme-inverse border-2 border-white/80 rounded-2xl hover:bg-theme-inverse hover:text-brand hover:border-theme-inverse transition-all duration-300"
            >
              {secondaryButton.text}
              <svg
                className="ml-2 w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                ></path>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
            </a>
          )}
        </div>
      </div>
    </section>
  );
};
