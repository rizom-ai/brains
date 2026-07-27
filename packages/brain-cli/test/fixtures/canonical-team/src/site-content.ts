const teamSiteContent = {
  namespace: "team-site",
  sections: {
    overview: {
      title: "Team overview",
      description: "Instance-owned team context",
      layout: (): null => null,
      fields: {
        headline: { type: "string", label: "Headline" },
      },
    },
  },
};

export default teamSiteContent;
