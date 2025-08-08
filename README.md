# AI Reflection Journal for Obsidian
**(Novice Student Edition)**

August 7, 2025 

**GPT 5 was released today** --> **GPT 5 was added to the plugin.** 😁
<!-- ACTION: Create a GIF showing the core workflow: 1. Initializing a note, 2. Adding a chat entry, 3. Ending the week and showing the analytics. Then, replace this comment with the markdown for the GIF. -->
<!-- Example: ![Plugin Demo GIF](https://raw.githubusercontent.com/your-username/obsidian-ai-reflection-journal/main/docs/plugin-demo.gif) -->

A powerful Obsidian plugin that transforms AI interaction from a simple Q&A into a structured, reflective, and assessable learning process. Designed for students, it integrates a guided journaling workflow directly into their personal knowledge base.

**This repository contains the completed v1.0 of the plugin, covering all features from Phase I (Core Journaling) and Phase II (Local LLM Integration).**

---

## Table of Contents

- [About The Project](#about-the-project)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [1. Initializing Your Journal](#1-initializing-your-journal)
  - [2. Chatting with an AI](#2-chatting-with-an-ai)
  - [3. Ending the Week](#3-ending-the-week)
- [Configuration](#configuration)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

## About The Project

In the classroom, it's clear that students are enthusiastic about using AI. However, this enthusiasm often lacks direction. The typical "try using ChatGPT" assignment offers no accountability, no guidance, and no supervision. How can we ensure students are truly learning the art of prompting and not just using AI as an 'answer vending machine'? How can we prevent freeloading in group work? Manually reviewing endless pages of copy-pasted conversations is impractical for any instructor.

**There has to be a better way.**

This plugin is the solution. It creates a structured learning environment inside the tool that students are already using for their personal knowledge management: **Obsidian**.

Why Obsidian?
*   **It's a Mature Platform:** As a polished and powerful tool, Obsidian provides a stable foundation.
*   **It's Accessible:** It's free for students, removing any barrier to adoption.
*   **It Eliminates Context-Switching:** Instead of jumping between a browser and a text editor, students can conduct their AI explorations, take notes, and link ideas all in one place, maintaining their creative flow.
*   **It's a Complete AI Workflow:** From in-class notes to AI-powered journaling to submitting final `.md` files for review, this plugin completes the modern educational loop.

This project transforms the abstract task of "learning AI" into a concrete, reflective, and assessable practice.

<!-- ACTION: Add a screenshot of the main chat interface here. -->
<!-- Example: ![Screenshot of Chat Modal](https://raw.githubusercontent.com/your-username/obsidian-ai-reflection-journal/main/docs/chat-modal.png) -->

## Key Features

-   **Secure API Connectivity:** Connect to official OpenAI and Google Gemini models, as well as any OpenAI-compatible service (like OpenRouter).
-   **Private Local LLM Support:** Full support for 100% private, local LLMs for privacy-sensitive coursework or research, with a mutually exclusive toggle to guarantee data security.
-   **Advanced Chat Modal:** Go beyond simple prompts. Select specific AI models, manage conversation memory, and see a real-time token estimator to learn the real-world costs and constraints of AI.
-   **Automated Learning Analytics:** The "End of Week" function acts as a "mirror" for self-reflection and provides a rich dataset for instructors by automatically generating analytics (time spent, tokens used, main topics, inferred learning theories) in the note's frontmatter.
-   **Note Locking:** Finalized weekly journals are made read-only within Obsidian to preserve the integrity of the final submission.

## Getting Started

### Prerequisites

-   You must have [Obsidian v0.15.0+](https://obsidian.md/) installed.
-   You will need API keys for any cloud-based AI services you wish to use.
-   For local LLM use, you must have a running server like [Ollama](https://ollama.com/).

### Installation

## License

Distributed under the MIT License. See the `LICENSE` file for more information.

## Contact

Christian S. Loh, Ph.D. Southern Illinois University, Illinois, USA. -- csloh [at] siu [dot] edu
<!-- [@YourTwitterHandle](https://twitter.com/YourTwitterHandle) – you@example.com -->

Project Link: [https://github.com/tenchiro/obsidian-ai-reflection-journal](https://github.com/tenchiro/obsidian-ai-reflection-journal)

<!-- ## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors",
        "Patreon": "https://www.patreon.com/"
    }
}
```

-->
