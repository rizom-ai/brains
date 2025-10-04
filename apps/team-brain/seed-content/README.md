# Welcome to Team Brain! 🧠

Your team's collective knowledge management system.

## What is Team Brain?

Team Brain transforms your team's scattered knowledge into a unified intelligence that makes everyone more effective. It captures, organizes, and shares your collective expertise automatically.

### Real Scenarios Where Team Brain Helps

- **When Sarah is out sick**, the team can still access all her project knowledge and decisions
- **During client calls**, instantly pull up all previous decisions, context, and relevant documentation
- **New team members** get up to speed in days instead of weeks by accessing the full team knowledge base
- **Project handoffs** become seamless with complete context preservation
- **Monthly reports** generate themselves from accumulated team insights

## Meet Marco, Your Knowledge Coordinator

Team Brain has a personality - Marco, your team knowledge coordinator. Marco's role is to:

- Maintain team documentation
- Track decisions
- Facilitate knowledge sharing
- Provide instant access to collective expertise

Want to customize? Create or edit the `identity.md` entity in your brain-data folder to give your Team Brain its own name, role, and values that match your team culture. The identity entity defines how your Brain presents itself and interacts with the team.

## How Team Brain's AI Works

- **Automatic Link Processing**: When you share URLs, AI extracts and summarizes key information
- **Smart Topic Generation**: Content is automatically categorized using semantic analysis
- **Daily Summaries**: Claude synthesizes your team's daily activities into digestible updates
- **Intelligent Search**: Natural language queries across all team knowledge
- **Context-Aware Responses**: Answers draw from your team's specific knowledge base

All AI processing happens on-demand. Private conversations remain private unless explicitly shared.

## Getting Started Checklist

- [ ] Ask Team Brain a question about your team's knowledge
- [ ] Share an important link or document with the team
- [ ] Search for information about a past project
- [ ] Add a note about something you learned
- [ ] Check what topics Team Brain has identified
- [ ] Visit the web interface to browse all content

## Ways to Interact

### Matrix Chat (Primary)

Best for: Quick questions, sharing links, team discussions

- Type messages naturally - Team Brain watches and learns
- Use commands like `!help`, `!search`, `!summary-daily`
- Links shared in chat are automatically captured

### Web Interface

Access at: https://babal.io
Best for: Browsing, reading longer content, visual overview

- Browse all captured knowledge
- Read full articles and summaries
- Navigate by topics
- Review team insights

### API (Model Context Protocol)

Access at: https://api.babal.io/mcp
Best for: AI assistants, Claude Desktop, custom integrations

MCP (Model Context Protocol) is Anthropic's standard for AI tool integration:

- Connect Team Brain to Claude Desktop app
- Let AI assistants access your team knowledge
- Build custom automations and workflows
- Industry-standard protocol for AI interactions

## Common Workflows

### Documenting a Client Meeting

1. During/after the meeting, share key links discussed
2. Write a brief note with decisions made
3. Team Brain will extract, categorize, and connect to existing knowledge
4. Tomorrow's summary will include meeting highlights

### Researching Past Decisions

1. Ask in Matrix: "What did we decide about the authentication approach?"
2. Or use: `!search authentication decision`
3. Review the aggregated knowledge from all related discussions
4. Find links to original sources and context

### Creating a Project Knowledge Base

1. Share all relevant project links in your team channel
2. Add notes about project goals and constraints
3. Team Brain automatically organizes by topic
4. Access complete project context anytime via web or chat

### Generating Weekly Team Updates

1. Use `!summary-week` command
2. Review the AI-generated summary of the week's activities
3. Share with stakeholders or use for team meetings
4. All automatic, no manual compilation needed

## Integration With Your Workflow

Team Brain complements your existing tools:

- **Obsidian/HackMD**: Write in your favorite editor, sync via Git
- **Git**: All content version-controlled, use familiar git workflows
- **Slack/Discord**: Team Brain works alongside (not replacing) your chat (WIP)
- **Development Tools**: API access for custom integrations
- **Browser**: Web interface accessible from anywhere

## Data Privacy & Security

Your team's knowledge stays under your control:

- ✅ Git repository can be private or self-hosted
- ✅ All data stored in your own infrastructure
- ✅ No external services except configured AI providers (Claude)
- ✅ Access controlled via Matrix permissions
- ✅ Complete data portability via Git
- ✅ Can run entirely on-premises if needed

## Troubleshooting

**Team Brain isn't responding in Matrix**

- Check `!status` command
- Verify you're in the correct room
- Contact your admin if issues persist

**Content isn't syncing with Git**

- Use `!git-sync` to trigger manual sync
- Check git repository permissions
- Verify GIT_SYNC_TOKEN is configured

**How do I know if my contribution was saved?**

- Links show confirmation when captured
- Check the web interface for your content

**Can I edit or delete content?**

- Yes, through Git or web interface
- Changes sync on next git-sync cycle
- Historical versions preserved in Git

## Quick Reference

### Essential Commands

- `!help` - Show all commands
- `!search [query]` - Search knowledge base
- `!summary-daily` - Today's summary
- `!topics` - Browse by topic
- `!git-sync` - Sync with repository
- `!status` - System health check

### Key URLs

- Web: https://babal.io
- Preview: https://preview.babal.io
- API: https://api.babal.io/mcp

### Support

- Admin: @yeehaa:rizom.ai
- Documentation: This README
- Repository: [team-brain-content on GitHub]

---

_Team Brain - Turning collective knowledge into competitive advantage_
_Powered by Brain architecture and Claude AI_
