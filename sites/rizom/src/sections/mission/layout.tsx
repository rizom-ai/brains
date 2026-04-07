import type { JSX } from "preact";
import { Section } from "../../components/Section";
import { Divider } from "../../components/Divider";
import { Button } from "../../components/Button";

export const MissionLayout = (): JSX.Element => {
  return (
    <Section id="mission" className="reveal py-section text-center">
      <Divider className="mb-10 md:mb-12" />
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[520px] mx-auto mb-8 md:mb-10">
        AI is not taking your job. It's exposing how much of your talent you've
        been wasting. When machines handle the busywork, what remains is the
        deeply human.
      </p>
      <h2 className="font-display font-bold text-display-xl">
        The future of
        <br />
        <span className="inline-block relative text-accent before:content-[''] before:absolute before:left-[-8%] before:right-[-8%] before:top-1/2 before:h-px before:bg-[var(--color-highlight-underline)] before:opacity-50">
          work is play.
        </span>
      </h2>
      <p className="font-body text-body-sm md:text-body-lg text-theme-light max-w-[500px] mx-auto mt-8">
        Brains are the foundation. But the vision is bigger — infrastructure for
        a world where talent flows to opportunity, professionals own what they
        create, and distributed teams outperform traditional organizations.
      </p>
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 md:justify-center items-stretch md:items-center mt-9 md:mt-16">
        <Button href="#quickstart" variant="primary-strong" size="lg" block>
          Start Building →
        </Button>
        <Button href="https://github.com" variant="secondary" size="lg" block>
          View on GitHub
        </Button>
      </div>
    </Section>
  );
};
