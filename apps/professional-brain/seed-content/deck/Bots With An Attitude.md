---
title: Bots With An Attitude
status: published
slug: bots-with-an-attitude
description: >-
  A framework for designing ethical, creative, and intelligent collaborative
  tools. Explores state machine-based bots that augment community knowledge
  work.
author: Yeehaa
publishedAt: "2020-02-13T00:00:00.000Z"
---

# Bots With An Attitude

## Tools for Ethical Creative Intelligence

---

## Agenda

1. Tools for Rizom
2. Ethical Creative Intelligence
3. Protobots Roll Out!

---

## Tools for Rizom

---

### Task

To design and develop collaborative tools that are tailor-made for Rizom and its learning communities

---

### The Wrong Solution

An army of evil bots that will render humanity obsolete

---

### The Right Solution

A network of creative, ethical, intelligent agents that allow us to easily automate laborious and complex tasks

---

## Team Mapping

| Characteristics                       | Challenges                             |
| ------------------------------------- | -------------------------------------- |
| Blurry Distinction Team and Community | Relevancy of Information               |
| Location is Distributed               | No Shared Space                        |
| Communication occurs Asynchronously   | No Shared Time                         |
| Multi-Disciplinary Community          | No Common Language and Practices       |
| Knowledge Heavy                       | No shared Archive / Database           |
| Knowledge is often Specialized        | Different and Fragmented Domain Models |
| Community is Creative and Critical    | Known Tools may not be Acceptable      |

---

## Artificial Intelligence

---

### Sciolist

> One who exhibits only superficial knowledge; a self-proclaimed expert with little real understanding

---

## Ethical Creative Intelligence

---

### Intelligent

- The ability to come up with new information
- The ability to find more, relevant information
- The ability to find more relevant information
- The ability to aggregate and condense information

---

### Creative

- The ability to combine existing information in such a manner that it opens new insights
- The ability to present information in such a manner that it opens new insights

---

### Ethical

- The ability to respect the values of a given community
- The ability to guard the values of such community
- The ability to question these values if needed
- The ability to leave the community when an irresolvable conflict arises

---

## Protobots Roll Out!

---

### Chat Environment

A shared online space where community members (human and bots) can read/write to a uniform stream of information

---

### Grid

A rule-based system of governance where each member of the community (bots and human) is assigned a health score based on the value of their ethical and creative contributions

---

### Bots

- Creative, ethical, and intelligent agents that compensate for the lacunas of a stream-based commonplace by providing context, augmentations, and an archive for our community
- A state machine that consists of several, consecutive — but not linear — states

---

### Cassettes

- Reusable single-purpose functions that lower the threshold to contribute new features to our community
- Each cassette hooks into one of the bots' aforementioned states

---

## Bot State Machine

| State    | Description                                                  | Next States                |
| -------- | ------------------------------------------------------------ | -------------------------- |
| Acquire  | Get data from chat stream or external source                 | Clean, Acquire, Evaluate   |
| Clean    | Remove irrelevant/sensitive data, translate to domain models | Acquire, Analyze, Evaluate |
| Analyze  | Transform into recommendations and aggregations              | Evaluate, Present          |
| Evaluate | Decide if data is ready or needs to reenter loop             | Present, Acquire           |
| Present  | Show data in textual, visual, or other form                  | None                       |

---

## Example: Tweet It

---

### Tweet It Flow

| State    | Action                                           | Next                        |
| -------- | ------------------------------------------------ | --------------------------- |
| Acquire  | Get user data for Rizom collaborators on Twitter | Clean                       |
| Clean    | Tokenize tweets, reduce to three keywords        | Analyze                     |
| Analyze  | Recommend relevant hashtags for next tweet       | Present                     |
| Evaluate | Ask user if they will use the hashtags           | Yes → Present, No → Acquire |
| Present  | Return tweet with hashtags to user               | None                        |

---

## Example: The Cartographer

---

### The Cartographer Flow

| State   | Action                                   | Next    |
| ------- | ---------------------------------------- | ------- |
| Acquire | Listen for links on chat stream          | Clean   |
| Clean   | Remove invalid and internal links        | Acquire |
| Acquire | Follow links and fetch data              | Clean   |
| Clean   | Extract keywords, authors, metadata      | Analyze |
| Analyze | Determine most relevant keywords/authors | Present |
| Present | Visualize Rizom's online ecosystem       | None    |
