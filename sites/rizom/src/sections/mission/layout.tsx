import type { JSX } from "preact";

export const MissionLayout = (): JSX.Element => {
  return (
    <section
      id="mission"
      className="px-6 md:px-10 lg:px-20 relative z-[1] reveal py-section text-center"
    >
      <div className="w-[60px] h-px bg-[linear-gradient(90deg,transparent,rgba(232,119,34,0.3),transparent)] mx-auto mb-10 md:mb-12" />
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[520px] mx-auto mb-8 md:mb-10">
        AI is not taking your job. It's exposing how much of your talent you've
        been wasting. When machines handle the busywork, what remains is the
        deeply human.
      </p>
      <h2 className="font-display font-bold text-display-xl">
        The future of
        <br />
        <span className="inline-block relative text-accent before:content-[''] before:absolute before:left-[-8%] before:right-[-8%] before:top-1/2 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(232,119,34,0.4)_20%,rgba(232,119,34,0.4)_80%,transparent)] before:opacity-50">
          work is play.
        </span>
      </h2>
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[500px] mx-auto mt-8">
        Brains are the foundation. But the vision is bigger — infrastructure for
        a world where talent flows to opportunity, professionals own what they
        create, and distributed teams outperform traditional organizations.
      </p>
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 md:justify-center items-stretch md:items-center mt-9 md:mt-16">
        <a
          href="#quickstart"
          className="inline-flex items-center justify-center gap-2 font-body text-body-md md:text-body-lg font-semibold text-white bg-accent hover:bg-accent-dark rounded-[10px] px-6 md:px-12 py-4 md:py-[22px] cursor-pointer transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:-translate-y-[3px] hover:scale-[1.02] shadow-[0_20px_60px_-15px_rgba(232,119,34,0.4)] hover:shadow-[0_0_0_8px_rgba(232,119,34,0.15),0_30px_80px_-15px_rgba(232,119,34,0.5)]"
        >
          Start Building →
        </a>
        <a
          href="https://github.com"
          className="inline-flex items-center justify-center gap-2 font-body text-body-md md:text-body-lg font-medium text-theme bg-white/[0.04] border border-white/15 hover:border-white/40 hover:bg-white/[0.08] rounded-[10px] px-6 md:px-12 py-4 md:py-[22px] cursor-pointer transition-all"
        >
          View on GitHub
        </a>
      </div>
    </section>
  );
};
