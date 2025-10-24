import type { JSX } from "preact";

export const FooterCTA = (): JSX.Element => {
  return (
    <section className="relative bg-footer overflow-hidden py-24">
      {/* Wavy top border decoration */}
      <div className="absolute top-0 left-0 right-0 h-16 overflow-hidden">
        <svg
          className="absolute top-0 w-full h-full"
          viewBox="0 0 1728 95"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path
            d="M0 23C144 23 144 0 288 0C432 0 432 23 576 23C720 23 720 46 864 46C1008 46 1008 23 1152 23C1296 23 1296 0 1440 0C1584 0 1584 23 1728 23V95H0V23Z"
            className="fill-theme"
          />
        </svg>
      </div>

      {/* Left decorative circles */}
      <div className="absolute left-[-200px] bottom-0 w-[600px] h-[600px] opacity-20">
        <div className="absolute inset-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute inset-0 border-2 border-white rounded-full"
              style={{
                transform: `scale(${1 - i * 0.1})`,
                opacity: 1 - i * 0.1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Right decorative circles */}
      <div className="absolute right-[-200px] top-0 w-[600px] h-[600px] opacity-20">
        <div className="absolute inset-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="absolute inset-0 border-2 border-white rounded-full"
              style={{
                transform: `scale(${1 - i * 0.1})`,
                opacity: 1 - i * 0.1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading font-bold text-white text-7xl leading-tight mb-12">
            Rizom can help your team reach its full potential
            <span className="text-accent">.</span>
          </h2>
          <a
            href="#contact"
            className="inline-block bg-white text-accent font-heading font-bold text-4xl px-12 py-6 rounded-lg hover:bg-opacity-90 transition-all"
          >
            Tune in to Rizom
          </a>
        </div>
      </div>
    </section>
  );
};
