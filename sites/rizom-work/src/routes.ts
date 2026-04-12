import type { RouteDefinitionInput } from "@brains/plugins";
import {
  createEcosystemContent,
  routes as baseRoutes,
} from "@brains/site-rizom";

export const workRoutes: RouteDefinitionInput[] = baseRoutes.map((route) => {
  if (route.id !== "home") {
    return route;
  }

  const baseSections = route.sections ?? [];
  const sections = baseSections
    .map((section) => {
      if (section.id === "hero") {
        return {
          ...section,
          template: "rizom-site:work-hero",
          content: {
            kicker: "A workshop practice · since 2023",
            headlineStart: "Your team has a knowledge problem. AI is making it",
            headlineEmphasis: "visible",
            headlineEnd: ".",
            subtitle:
              "TMS workshops that help teams coordinate better — so your people, and your AI tools, can actually do their best work.",
            primaryCtaLabel: "Take the Team Type quiz →",
            primaryCtaHref: "https://typeform.com",
            secondaryCtaLabel: "Book a discovery call",
            secondaryCtaHref: "#mission",
            diagnosticTitle: "Team Diagnostic",
            diagnosticTag: "sample report",
            verdictLabel: "Your team type",
            verdictValue: "Distributed specialists",
            findingsLabel: "Priority actions",
            findings: [
              "Clarify decision authority in the 4 highest-friction roles",
              "Surface tacit expertise via a weekly ritual",
              "Install coordination layer before further AI pilots",
            ],
            diagnosticCtaLabel: "Run the diagnostic →",
            diagnosticCtaHref: "https://typeform.com",
          },
        };
      }

      if (section.id === "problem") {
        return {
          ...section,
          template: "rizom-site:work-problem",
          content: {
            kicker: "The Problem",
            headlineStart: "Talent isn't the bottleneck.",
            headlineEmphasis: "Coordination",
            headlineEnd: " is.",
            subhead:
              "Teams don't fail because people are untalented. They fail because nobody has mapped who knows what, who decides what, and how information moves. When you add AI into that — it doesn't help, it just automates the confusion.",
          },
        };
      }

      if (section.id === "ownership") {
        return {
          ...section,
          content: {
            badge: "Who We Are",
            headline: "A commercial practice with a non-profit research arm.",
            features: [
              {
                icon: "JH",
                title: "Jan Hein Hoogstad — founder",
                body: "Philosopher and ecosystem architect. Founded rizom.work as the commercial face so the research at rizom.foundation could stay independent and openly funded. The two sides feed each other.",
              },
              {
                icon: "N",
                title: "Natalie — workshop lead",
                body: "Runs the TMS sessions, owns delivery, and makes sure every workshop produces something a team can act on the same week.",
              },
              {
                icon: "+",
                title: "A network of practitioners",
                body: "Co-facilitators, researchers, and operators across Amsterdam, Rotterdam, and Berlin.",
              },
            ],
          },
        };
      }

      if (section.id === "mission") {
        return {
          ...section,
          template: "rizom-site:closer",
          content: {
            preamble:
              "The fastest way to find out what kind of coordination problem you have.",
            headlineStart: "Ready to find out what ",
            headlineEmphasis: "type of team",
            headlineEnd: " you are?",
            primaryCtaLabel: "Take the Team Type quiz →",
            primaryCtaHref: "https://typeform.com",
            secondaryCtaLabel: "Book a 30-minute call",
            secondaryCtaHref: "#cta",
          },
        };
      }

      if (section.id === "ecosystem") {
        return {
          ...section,
          content: createEcosystemContent("work"),
        };
      }

      return section;
    })
    .flatMap((section) => {
      if (section.id !== "problem") {
        return [section];
      }

      return [
        section,
        {
          id: "workshop",
          template: "rizom-site:workshop",
          content: {
            kicker: "TMS Workshop",
            headline:
              "One session. Clear diagnosis. Immediate team-level insight.",
            intro:
              "Outcomes-first. We map your team's transactive memory system — who knows what, how decisions flow, where information drops on the floor — and hand you a working diagnosis you can act on the next day.",
            steps: [
              {
                num: "01",
                label: "Before",
                title: "A short async survey.",
                body: "A short questionnaire maps your team's current coordination patterns. We come prepared — the workshop starts where the data leaves off.",
              },
              {
                num: "02",
                label: "During",
                title: "A facilitated half-day in the room.",
                body: "Your team builds a shared map of expertise, decision authority, and information flow. Everybody sees the same picture for the first time — often for the first time ever.",
              },
              {
                num: "03",
                label: "After",
                title: "A diagnostic report and a thirty-day playbook.",
                body: "Concrete changes to roles, rituals, and tooling — including how AI fits in without making the existing confusion worse. Something the team can act on the same week.",
              },
            ],
            ctaLabel: "Take the Team Type quiz →",
            ctaHref: "https://typeform.com",
          },
        },
        {
          id: "personas",
          template: "rizom-site:personas",
          content: {
            kicker: "Who It's For",
            headline: "If this sounds like you.",
            cards: [
              {
                label: "The Scaling Founder",
                quote: '"Your team grew faster than your operating model."',
                body: "You hired smart people, gave them ownership, and now nobody's quite sure who decides what. Stand-ups have gotten longer. Projects keep getting blocked on context. You need a map — not another tool.",
              },
              {
                label: "The Digital Transformation Lead",
                quote: '"You\'ve been told to roll out AI across the org."',
                body: "The pilots look fine, the dashboards are green, and yet the teams using the tools are quietly more frustrated than before. You suspect the problem isn't the AI — it's the coordination underneath it. You'd like proof.",
              },
            ],
          },
        },
        {
          id: "proof",
          template: "rizom-site:proof",
          content: {
            kicker: "In good company",
            headline: "What teams tell us.",
            quote:
              "We thought we had a hiring problem. The workshop showed us we had a coordination problem — three people were quietly doing the same work, and nobody knew it. That's a week of design time back, every week.",
            attribution: "— Anonymized · 14-person product team",
            partnersLabel: "Partners & appearances",
            partners: ["Pinehurst Studio", "Amsterdam", "Rotterdam", "Berlin"],
          },
        },
        {
          id: "bridge",
          template: "rizom-site:bridge",
          content: {
            kicker: "The thinking behind it",
            body: "The methodology sits on top of years of ecosystem-architecture research by Jan Hein Hoogstad — published essays, public talks, and an active research arm.",
            linkLabel: "Read the research at rizom.foundation →",
            linkHref: "https://rizom.foundation",
          },
        },
      ];
    });

  return {
    ...route,
    title: "Rizom Work",
    description: "TMS workshops for teams that need to coordinate better.",
    sections,
  };
});
