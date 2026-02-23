# TuringViz

Interactive visualizer for deterministic and nondeterministic **k-tape Turing machines**.

## LIVE WEBSITE (IMPORTANT)

# **https://turingviz.org**

The production website is hosted on **[turingviz.org](https://turingviz.org)**.

## What TuringViz does

TuringViz lets you define and run k-tape Turing machines in YAML and inspect them from multiple angles:

- **State Graph**: machine-level transition graph.
- **Configuration Graph**: reachable configurations including tape contents and head positions.
- **Computation Tree**: unfolded nondeterministic branching over time, with optional compression.
- **Execution controls**: step-by-step execution, auto-run, and manual choice of nondeterministic branches.
- **YAML editor**: Monaco-based editor with schema-backed validation.

## Input format

- Machine definitions are written in YAML.
- Transition styles supported:
  - movement-string shorthand (`L`, `R`, `S`)
  - object form (optional `write` + movement -> next state)
  - list form for nondeterministic choices
- Schema/reference files in this repo:
  - `public/turingMachineSchema.json`
  - `YamlSchema.md`

## Sharing and loading machines

- **Share links**: generated links encode the current machine in the URL hash (`#tm=...`).
- **Gist import**: machine YAML can be loaded from GitHub Gists via `?gist=...`.
- **Examples menu**: built-in machine examples for quick exploration.
- **Recent machines**: recently loaded machines are available in the UI.

## Project background

This project was started in the **Softwarepraktikum** course at the **University of Regensburg** and developed by **Christoph Greger** and **Gregor Porsch**.

Beyond the core functionality and the first prototypes, a significant part of the development process also used **LLM agents**.

## Local development

### Prerequisites

- Node.js (LTS recommended)
- npm

### Install dependencies

```bash
npm install
```

### Start dev server

```bash
npm run dev
```

### Build production bundle

```bash
npm run build
```

### Preview production build locally

```bash
npm run preview
```

### Run tests

```bash
npm test
npm run test:coverage
```

## Tech stack

- React + TypeScript + Vite
- Material UI
- Monaco Editor + `monaco-yaml`
- Cytoscape + React Flow + ELK layout
- Zustand state management
- Vitest + Testing Library

## Feedback and contact

Feedback is always welcome.

- Open an issue: [GitHub Issues](https://github.com/TuringViz-org/TuringViz/issues)
- Contact by mail: `public@christoph-greger.de`

We would also love to hear **where you use TuringViz** (course, lecture, project, etc.).
We are also very happy to hear from people who want to **contribute and further develop the project**.

We are always happy to receive **new, high-quality example machines**.  
If you share one (via issue or email), we are glad to add it to the website and give proper **credits**.

## Current built-in examples

The following examples are currently available in the "Load Examples" menu:

- `BinaryAdd`: Adds two binary numbers (input on tapes 1 and 2) and writes the result on tape 3.
- `NonDetSubstring`: Nondeterministically guesses a start position and checks whether tape 2 is a substring of tape 1.
- `vvWord`: Checks whether an input word has the form `vv` (the same substring repeated twice).
- `NonDetSubSetSum`: Nondeterministic subset-sum machine using binary-encoded numbers.
- `CheckEven`: Accepts iff the number of `1` symbols in a binary input is even.
- `GCD`: Computes the greatest common divisor of two unary numbers.
- `AllStrings`: Nondeterministically generates all binary strings of a fixed input length.
- `Self Loops`: Small machine that creates a configuration graph with self-loops.
- `DAG`: Example whose configuration graph is acyclic (a directed acyclic graph).
- `Circle`: Produces a cyclic configuration graph (a simple loop/circle structure).
- `NonDetSAT`: Nondeterministic SAT solver for CNF formulas (accepts iff satisfiable).
