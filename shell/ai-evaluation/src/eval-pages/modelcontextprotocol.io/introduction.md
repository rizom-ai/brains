Title: Introduction - Model Context Protocol

URL Source: https://modelcontextprotocol.io/introduction

Markdown Content:

# What is the Model Context Protocol (MCP)?

MCP is an open-source standard for connecting AI applications to external systems. With MCP, applications such as Claude or ChatGPT can connect to data sources like local files and databases, to tools like search engines and calculators, and to workflows like specialized prompts, so they can access key information and perform tasks.

Think of MCP like a USB-C port for AI applications: just as USB-C gives electronic devices a standard way to connect, MCP gives AI applications a standard way to connect to external systems.

## What can MCP enable?

- Agents can reach your calendar and notes and act as a more personalized assistant.
- Coding tools can generate an entire web app from a design file.
- Enterprise chatbots can connect to several databases across an organization.

## Why does MCP matter?

For developers, MCP reduces the time and complexity of building or integrating with an AI application. For AI applications, it opens an ecosystem of data sources, tools and apps. For end users, it means more capable applications that can access their data and act on their behalf.

## Architecture

MCP follows a client-server architecture: a host application creates clients that each keep a connection to an MCP server, which exposes tools, resources and prompts over a JSON-RPC based protocol.
