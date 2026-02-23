# k-Tape Turing Machine Visualizer

An interactive web app to explore **deterministic and nondeterministic k-tape Turing machines**. It renders the **state graph**, the **configuration graph** (reachable configurations with tape contents and head positions), and the **unfolded computation tree**. You can step through runs, branch manually on nondeterminism, and switch between compact and detailed views.

## Features

- k-tape machines (deterministic & nondeterministic)
- YAML input format
- Live execution with step/auto-run and manual branching on nondeterministic choices
- Visualizations:
  - **State graph**
  - **Configuration graph** with incremental expansion
  - **Computation tree** with optional path compression
- Optimized Cytoscape circle mode for configuration graph and computation tree
- Editor with schema validation

## Quick Start (Local)

### Prerequisites

- Node.js (LTS recommended) and npm

### Install, Build, Preview

```bash
npm install
npm run build
npm run preview
```
