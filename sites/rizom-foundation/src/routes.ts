import type { RouteDefinitionInput } from "@brains/plugins";
import {
  createEcosystemContent,
  routes as baseRoutes,
} from "@brains/site-rizom";

export const foundationRoutes: RouteDefinitionInput[] = baseRoutes.map(
  (route) => {
    if (route.id !== "home") {
      return route;
    }

    const sections = route.sections ?? [];
    const tailSections = sections
      .slice(3)
      .filter(
        (section) => section.id !== "products" && section.id !== "quickstart",
      )
      .map((section) => {
        if (section.id === "mission") {
          return {
            ...section,
            content: {
              preamble:
                "The research lands one essay at a time. The events land one city at a time. Both go better with company.",
              headlineStart: "Follow the",
              headlineHighlight: "research.",
              post: "Stay close to the essays, the gatherings, and the public infrastructure underneath them.",
              primaryCtaLabel: "Subscribe to the newsletter →",
              primaryCtaHref: "#",
              secondaryCtaLabel: "Follow on LinkedIn",
              secondaryCtaHref: "#",
            },
          };
        }

        if (section.id === "ownership") {
          return {
            ...section,
            content: {
              badge: "Who We Are",
              headline:
                "A small group, anchored by writing and stewarded by community.",
              features: [
                {
                  icon: "JH",
                  title: "Jan Hein Hoogstad",
                  body: "Philosopher, ecosystem architect, and public intellectual. Founder of Rizom and lead author of the research. Writes about institutions, AI, and the social contracts that quietly hold both together.",
                },
                {
                  icon: "S",
                  title: "Sam — community steward",
                  body: "Holds the Discord together, runs the reading groups, and quietly does the coordination work that keeps a distributed community from becoming a mailing list.",
                },
                {
                  icon: "J",
                  title: "Jo — events & production",
                  body: "Owns the gatherings end-to-end. Picks the rooms, sets the rhythm, makes sure the conversations that matter actually happen.",
                },
                {
                  icon: "+",
                  title: "A wider circle",
                  body: "Researchers, organizers, and contributors across Amsterdam, Rotterdam, Berlin, and beyond. The list is public — and growing.",
                },
              ],
            },
          };
        }

        if (section.id === "ecosystem") {
          return {
            ...section,
            content: createEcosystemContent("foundation"),
          };
        }

        return section;
      });

    const leadSections = sections.slice(0, 3).map((section) => {
      if (section.id !== "hero") {
        return section;
      }

      return {
        ...section,
        template: "rizom-site:foundation-hero",
        content: {
          volumeLabel: "Vol. 01",
          yearLabel: "2026",
          metaLabel: "Essays · Events · Public Infrastructure",
          headline: "Work is broken.",
          headlineTail:
            "— and the institutions organizing it were built for a different century.",
          tagline:
            "A research arm for the social contracts that quietly hold both work and technology together.",
          subtitle:
            "Rizom Foundation publishes essays, runs city-by-city gatherings, and stewards the open AI infrastructure the community runs on.",
          primaryCtaLabel: "Join our Discord →",
          primaryCtaHref: "#ecosystem",
          secondaryCtaLabel: "Find an event near you",
          secondaryCtaHref: "#events",
          scrollLabel: "Begin reading",
          scrollHref: "#answer",
          colophon: [
            "Stichting Rizom",
            "Amsterdam · Rotterdam · Berlin",
            "Open infrastructure",
          ],
        },
      };
    });

    return {
      ...route,
      title: "Rizom Foundation",
      description: "Researching alternatives to broken institutions.",
      sections: [
        ...leadSections,
        {
          id: "pull-quote",
          template: "rizom-site:pull-quote",
          content: {
            quote:
              "The smartest thing in any room is rarely a person. It's the pattern by which the people in the room are connected.",
            attribution: '— from "Coordination is the unit of intelligence"',
          },
        },
        {
          id: "research",
          template: "rizom-site:research",
          content: {
            kicker: "The Research",
            headline: "Featured essays from the ongoing series",
            subhead:
              "A working bibliography. New entries land roughly monthly.",
            essays: [
              {
                num: "01",
                series: "Future of Work is Play",
                title: "The future of work is play",
                teaser:
                  "When machines handle the busywork, what remains is the deeply human. A sketch of what work could look like once we stop pretending the industrial frame still fits.",
                href: "#",
              },
              {
                num: "02",
                series: "Urging New Institutions",
                title: "Social contracts, not constitutions",
                teaser:
                  "Why the documents we venerate aren't what's actually holding institutions together — and what that means for anyone trying to build new ones from inside the old ones.",
                href: "#",
              },
              {
                num: "03",
                series: "Urging New Institutions",
                title: "Coordination is the unit of intelligence",
                teaser:
                  "The smartest thing in any room is rarely a person — it's the pattern by which the people in the room are connected. Implications for AI, for teams, and for the institutions that claim to organize both.",
                href: "#",
              },
            ],
            ctaLabel: "Read all essays →",
            ctaHref: "#",
          },
        },
        {
          id: "events",
          template: "rizom-site:events",
          content: {
            kicker: "The Series",
            headline: "Small, curated gatherings — city by city.",
            subhead:
              "Twenty to forty people. Jan Hein as intellectual anchor. Local organizers picking the room and the rhythm.",
            events: [
              {
                num: "01",
                city: "Amsterdam",
                description:
                  "The original chapter. Quarterly gatherings on social contracts, AI, and the institutions that organize knowledge work.",
                date: "Spring 2026",
                anchor: "Anchor: Jan Hein",
                actionLabel: "Apply to attend →",
                href: "#",
              },
              {
                num: "02",
                city: "Rotterdam",
                description:
                  "A working chapter focused on industry, ports, and the practical frictions of building new institutions inside old ones.",
                date: "Summer 2026",
                anchor: "Local: TBA",
                actionLabel: "Apply to attend →",
                href: "#",
              },
              {
                num: "03",
                city: "Berlin",
                description:
                  "The newest chapter. Civic tech, digital rights, and the public-infrastructure question — where the foundation's research meets European policy.",
                date: "Autumn 2026",
                anchor: "Local: TBA",
                actionLabel: "Apply to attend →",
                href: "#",
              },
            ],
            primaryCtaLabel: "Apply to attend →",
            primaryCtaHref: "#",
            secondaryCtaLabel: "Bring this to your city",
            secondaryCtaHref: "#",
          },
        },
        {
          id: "support",
          template: "rizom-site:support",
          content: {
            kicker: "How to Support",
            headline: "Two ways the work gets funded.",
            cards: [
              {
                tone: "amber",
                label: "For Individuals",
                headline: "€1,000 – €10,000",
                body: "A gift in this range funds a meaningful slice of the research and event series. Contributors are acknowledged in the essays, invited to closer-circle gatherings, and get early access to new writing and infrastructure.",
                linkLabel: "Get in touch →",
                linkHref: "#",
              },
              {
                tone: "purple",
                label: "For Institutions",
                headline: "Grants & partnerships",
                body: "The foundation's work qualifies as public infrastructure under most civic and digital-rights funding frameworks. We're actively in conversation with grantmakers, NGOs, and institutional co-funders. Reach Jan Hein directly.",
                linkLabel: "Email Jan Hein →",
                linkHref: "#",
              },
            ],
          },
        },
        ...tailSections,
      ],
    };
  },
);
