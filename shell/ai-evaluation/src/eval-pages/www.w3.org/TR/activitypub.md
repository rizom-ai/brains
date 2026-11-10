Title: ActivityPub

URL Source: https://www.w3.org/TR/activitypub/

Markdown Content:

# ActivityPub

W3C Recommendation

## Abstract

The ActivityPub protocol is a decentralized social networking protocol based on the ActivityStreams 2.0 data format. It provides a client to server API for creating, updating and deleting content, as well as a federated server to server API for delivering notifications and content.

## Overview

ActivityPub provides two layers: a server to server federation protocol, so decentralized websites can share information, and a client to server protocol, so users and their software can interact with ActivityPub servers.

In ActivityPub, a user is represented by an actor with an inbox, where it receives messages from the world, and an outbox, where it sends messages to others. Activities such as Create, Follow, Like and Announce are posted to an outbox and delivered to the inboxes of their recipients.
