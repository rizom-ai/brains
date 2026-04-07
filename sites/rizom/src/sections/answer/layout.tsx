import type { JSX } from "preact";

export const AnswerLayout = (): JSX.Element => {
  return (
    <section
      id="answer"
      className="px-6 md:px-10 lg:px-20 relative z-[1] reveal text-center py-section"
    >
      <span className="inline-flex items-center px-5 py-2 border border-accent text-accent rounded-[20px] font-label text-label-md font-semibold tracking-[0.09375em] uppercase mb-7">
        The Answer
      </span>
      <h2 className="font-display text-display-md max-w-[900px] mx-auto mb-6 mt-7">
        A network of AI agents, each built from real knowledge
      </h2>
      <p className="text-body-md md:text-body-xl text-theme-muted max-w-[640px] mx-auto">
        Every professional gets an agent that knows what they know. Every team
        gets shared intelligence. The network connects them — matching expertise
        to opportunity, automatically.
      </p>
      <div className="w-[60px] h-px bg-[linear-gradient(90deg,transparent,rgba(232,119,34,0.4),transparent)] mx-auto my-10 md:my-12" />
      <div className="font-display text-display-sm mb-3.5 md:mb-4">
        It starts with you. It scales to everyone.
      </div>
      <p className="text-body-xs md:text-body-md text-theme-light max-w-[600px] mx-auto">
        Three layers of intelligence — personal, team, network. Each one makes
        the others smarter.
      </p>
    </section>
  );
};
