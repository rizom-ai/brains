# Welcome to Team Brain! 🧠

**Your team's knowledge management tutorial**

This tutorial will get you up and running with Team Brain in about 60 minutes. By the end, you'll know how to capture, organize, and find your team's collective knowledge.

---

## Introduction

### What is Team Brain?

Team Brain transforms your team's scattered knowledge into a unified intelligence. It captures links, organizes conversations, and makes everything searchable - all automatically.

### Meet Scout, Your Knowledge Coordinator

Scout is Team Brain's AI assistant who:

- Maintains team documentation
- Tracks decisions and insights
- Organizes knowledge automatically
- Provides instant access to collective expertise

**Want to customize?** Create or edit the `identity.md` entity in your brain-data folder to give your Team Brain its own name, role, and values that match your team culture.

### What You'll Learn

- ✅ Ask Scout questions about your team knowledge
- ✅ Capture important links automatically
- ✅ See automatic topic extraction and summaries
- ✅ Browse knowledge on the website
- ✅ Advanced: Git/Markdown editing and MCP integration

Let's get started!

---

## Your First 5 Minutes ⏱️

**Goal:** Verify Team Brain is working

### Steps

- [ ] Open your Matrix room
- [ ] Send this message: `Hello Scout!`
- [ ] Wait for Scout's greeting response (typically 2-5 seconds)
- [ ] See Scout introduce itself and confirm it's ready

**✓ You just verified Team Brain is working!**

**Next up:** Ask real questions →

---

## Lesson 1: Asking Questions ⏱️ 10 minutes

**Goal:** Get answers from your team's knowledge base

### How It Works

Scout can answer questions using everything your team has captured. Just ask naturally, like you would a teammate.

### Steps

- [ ] Ask a simple question: `What projects is the team working on?`
- [ ] Wait for Scout's response (5-10 seconds while it searches)
- [ ] Try another question: `What did we decide about authentication?`
- [ ] Ask a third question about something relevant to your team

**💡 Tip:** Scout searches your team's knowledge base - links, conversations, and documents. The more content you have, the better the answers.

### 👋 Hands-on Exercise

Ask Scout **3 different questions** about your team:

1. [ ] A question about a current project
2. [ ] A question about a past decision
3. [ ] A question about team processes or tools

### Troubleshooting

**Scout not responding?**

- Check `/help` to see available commands
- Verify you're in the correct Matrix room
- Contact your admin if issues persist

---

**✓ You just learned to query team knowledge**

**Next up:** Add your own knowledge →

---

## Lesson 2: Capturing Links ⏱️ 15 minutes

**Goal:** Add web content to your team's knowledge base

### How It Works

When you share a URL in chat, Scout automatically:

- Extracts the content from the webpage
- Generates a summary
- Identifies relevant topics
- Saves everything to your knowledge base

This takes 10-20 seconds. You'll see a confirmation when it's complete.

### Steps

- [ ] Share a URL in chat: Paste `https://example.com/article`
- [ ] Wait for Scout's confirmation (10-20 seconds)
- [ ] Visit the website at https://babal.io
- [ ] Find your captured link on the homepage
- [ ] Click into it to see the AI-generated summary

**💡 Tip:** You can paste URLs directly - no commands needed. Scout watches for links and processes them automatically.

### 👋 Hands-on Exercise

Capture **3 different links** and verify each on the website:

1. [ ] Share a technical article URL
2. [ ] Share a documentation page URL
3. [ ] Share a blog post or news article URL
4. [ ] Visit https://babal.io and find all 3 links

### Troubleshooting

**Link not captured?**

- Check that the URL is valid and accessible
- Note: Some sites block automated access (paywalls, login-required pages)
- Try a different URL if one fails
- Check the website after 30 seconds - processing might take a moment

---

**✓ You just learned to capture web content with AI extraction**

**Next up:** See how Scout organizes everything →

---

## Lesson 3: Topics and Summaries ⏱️ 10 minutes

**Goal:** Understand automatic knowledge organization

### How It Works

Scout doesn't just store information - it organizes it automatically:

- **Topics:** Extracted from links and conversations (10-20 seconds after sharing)
- **Summaries:** Created automatically from conversation windows

You don't need to tag or categorize anything manually. Scout does this by analyzing the content.

### Steps

- [ ] Have a natural conversation in chat about a project or decision:
  ```
  We decided to use Hetzner for deployment.
  The EU data residency was the key factor.
  Also, their pricing is better than AWS for our use case.
  ```
- [ ] Use `/topics-list` command to see automatically extracted topics
- [ ] Notice topics like "deployment", "Hetzner", etc.
- [ ] Use `/summary-list` to see conversation summaries Scout has created
- [ ] Visit https://babal.io to see topics on the homepage
- [ ] Click into a topic to see all related content organized together

**💡 Tip:** Scout extracts topics from both links and substantial conversations. The more context you provide, the better the organization.

### 👋 Hands-on Exercise

1. [ ] Have a brief conversation about a project (3-4 messages)
2. [ ] Check `/topics-list` to see extracted topics
3. [ ] Check `/summary-list` to see summaries
4. [ ] Browse topics on the website
5. [ ] Find content from Lesson 2 organized under topics

### Troubleshooting

**No topics yet?**

- Topics are extracted from links and substantial conversations
- Try sharing more links or having a longer discussion
- Processing can take up to 30 seconds

**Empty summary?**

- Summaries are created automatically after several messages
- Normal if you're the first one chatting today
- Keep having conversations - summaries will appear

---

**✓ You just learned how Scout automatically organizes your team's knowledge**

**Next up:** You're ready to use Team Brain! →

---

## You're Ready! 🎉 ⏱️ 5 minutes

Congratulations! You now have all the core skills to use Team Brain effectively.

### ✓ What You've Learned

- ✅ Ask Scout questions about team knowledge
- ✅ Capture important links automatically
- ✅ See automatic topic extraction and summaries
- ✅ Browse knowledge on the website

### 🎯 Your First Real Task

In your next team meeting:

- [ ] Share 2-3 important links discussed
- [ ] Ask Scout a question about a past decision
- [ ] Check the website to see your team's growing knowledge base

### 💡 Daily Habits for Success

Make these part of your routine:

- **Share links as they come up** - Don't batch them, share in real-time
- **Ask Scout when you need information** - Faster than searching manually
- **Check `/topics-list` weekly** - See emerging themes in your team's work
- **Visit the website regularly** - Browse summaries and read captured content

### 📚 Want to Learn More?

The tutorial continues with optional advanced topics:

- **Git & Markdown Editing:** Edit content in Obsidian, VS Code, or HackMD
- **MCP Integration:** Connect to Claude Desktop for AI-powered access
- **How It Works:** Technical details about AI processing and data storage

Keep reading below, or stop here and start using Team Brain!

---

## Advanced - Git & Markdown Editing ⏱️ 10 minutes

**⚡ Optional advanced topic**

### What is Git Sync?

All Team Brain knowledge is stored as Markdown files in a Git repository. This means:

- Edit content in any markdown editor (Obsidian, VS Code, HackMD, etc.)
- Version control for all changes
- Collaborate using familiar Git workflows
- Changes sync automatically between Team Brain, Git, and your editors

### Editing Workflows

**Option 1: Local Editing (Obsidian, VS Code)**

- [ ] Clone the repository: `git clone [your-repo-url]`
- [ ] Open the folder in your favorite markdown editor
- [ ] Edit any `.md` file
- [ ] Commit and push: `git add . && git commit -m "Update" && git push`
- [ ] Wait a few minutes for sync
- [ ] See changes appear in Team Brain and on the website

**Option 2: HackMD Collaborative Editing**

- [ ] Connect HackMD to your Team Brain Git repository
- [ ] Create or edit documents in HackMD with your team in real-time
- [ ] Push changes to Git from HackMD
- [ ] See updates appear in Team Brain automatically

**💡 Tip:** Changes sync every few minutes. Use `/git-sync` command to trigger immediate manual sync.

### File Format

All entities are stored as Markdown with YAML frontmatter:

```markdown
---
entityType: link
created: 2025-01-15T10:30:00Z
updated: 2025-01-15T10:30:00Z
---

# Article Title

Summary and content here...
```

### 👋 Hands-on Exercise

1. [ ] Use `/git-sync` to ensure everything is synced
2. [ ] Clone the repository locally
3. [ ] Edit a markdown file (add a note or update content)
4. [ ] Commit and push your changes
5. [ ] Use `/git-sync` again
6. [ ] Verify changes appear on https://babal.io

### Troubleshooting

**Sync failed?**

- Check repository permissions
- Ensure Git credentials are configured correctly
- Contact your admin if issues persist

**File format issues?**

- Ensure valid Markdown syntax
- Include YAML frontmatter for proper entity handling
- Check existing files for examples

---

## Advanced - MCP Integration ⏱️ 10 minutes

**⚡ Optional advanced topic**

### What is MCP?

Model Context Protocol (MCP) is Anthropic's standard for AI tool integration. It allows:

- AI assistants to access your Team Brain knowledge directly
- Claude Desktop to search and query your team's data
- Custom integrations with any MCP-compatible AI

### Setting Up MCP with Claude Desktop

**Step 1: Get the MCP Endpoint**

- Endpoint URL: `https://api.babal.io/mcp`

**Step 2: Configure Claude Desktop**

Add to your Claude Desktop config file:

```json
{
  "mcpServers": {
    "team-brain": {
      "command": "node",
      "args": ["/path/to/mcp-client.js", "https://api.babal.io/mcp"]
    }
  }
}
```

**Step 3: Test the Connection**

- [ ] Restart Claude Desktop
- [ ] Ask Claude: "Search team brain for deployment decisions"
- [ ] Verify it returns results from your knowledge base

**💡 Tip:** MCP gives AI assistants read access to your team's knowledge. They can search, retrieve, and reference any content you've captured.

### Using MCP

Once connected, you can:

- Ask Claude Desktop questions about your team knowledge
- Search across all captured content
- Create new entities via AI assistants
- Integrate with custom MCP-compatible tools

### 👋 Hands-on Exercise

1. [ ] Set up the MCP endpoint in Claude Desktop
2. [ ] Ask Claude: "What are the main topics in team brain?"
3. [ ] Ask Claude: "Search for information about [a project]"
4. [ ] Verify it's accessing your team's actual knowledge

### Troubleshooting

**Connection failed?**

- Check endpoint URL is correct: `https://api.babal.io/mcp`
- Ensure you have access permissions
- Verify Claude Desktop config syntax
- Check logs for error messages

**No results?**

- Ensure your Team Brain has content
- Try broader search queries
- Check that MCP server is running

---

## How It Works 📚 ⏱️ 5 minutes

**Optional technical details for curious users**

### AI Processing

**Link Capture:**

- Claude AI extracts content from the webpage
- Generates a concise summary
- Identifies relevant topics using semantic analysis
- Processing time: 10-30 seconds per link

**Topic Extraction:**

- Semantic analysis of conversations and links
- Automatic categorization without manual tagging
- Topics updated as new content is added

**Summaries:**

- Automatic digest creation from conversation windows
- Generated after several messages in a conversation
- Natural language summaries of key points

All processing happens server-side using Anthropic's Claude API.

### Data Storage

**Markdown Files:**

- All knowledge stored as `.md` files
- YAML frontmatter for metadata
- Human-readable and editable

**Git Repository:**

- Version control for all changes
- Sync with remote repository
- Collaborative editing support

**SQLite Database:**

- Fast queries and search
- Vector embeddings for semantic search
- Local or cloud-hosted

**💡 Your data, your control:** Everything is stored in formats you own and can export.

### Privacy & Security

**Matrix E2E Encryption:**

- End-to-end encryption supported
- Private conversations stay private

**AI Processing:**

- Uses Anthropic Claude API
- Only processes content you explicitly share
- No training on your data

**Self-Hosted Option:**

- Can run entirely on-premises
- Full control over data location
- No external services required (except AI provider)

**Data Control:**

- Your Git repository (can be private or self-hosted)
- Your infrastructure
- Complete data portability

### Advanced Features

**MCP (Model Context Protocol):**

- Standard AI tool integration
- Connect to Claude Desktop and other AI assistants
- Programmatic access to knowledge base

**Git Sync:**

- Automatic synchronization
- Manual trigger with `/git-sync`
- Conflict resolution

**Vector Search:**

- Semantic search using embeddings
- Find related content automatically
- Fast similarity matching

**Custom Plugins:**

- Extend Team Brain functionality
- Add custom entity types
- Build integrations

---

## Quick Reference

### Essential Commands

| Command                  | Description                             |
| ------------------------ | --------------------------------------- |
| `/help`                  | Show all available commands             |
| `/topics-list`           | View all automatically extracted topics |
| `/topics-search <query>` | Search topics by keyword                |
| `/summary-list`          | View conversation summaries             |
| `/summary-get <id>`      | Get a specific summary                  |
| `/git-sync`              | Trigger manual Git sync                 |

### Key URLs

| Purpose       | URL                      |
| ------------- | ------------------------ |
| **Website**   | https://babal.io         |
| **Preview**   | https://preview.babal.io |
| **API (MCP)** | https://api.babal.io/mcp |

### Support

- **Admin:** @yeehaa:rizom.ai
- **This Tutorial:** Available in Team Brain knowledge base
- **Repository:** Check with your admin for Git repository URL

---

## Privacy & Data

Your team's knowledge stays under your control:

- ✅ Git repository can be private or self-hosted
- ✅ All data stored in your own infrastructure
- ✅ No external services except configured AI providers (Claude)
- ✅ Access controlled via Matrix permissions
- ✅ Complete data portability via Git
- ✅ Can run entirely on-premises if needed

---

_Team Brain - Turning collective knowledge into competitive advantage_

_Powered by Rizom_
