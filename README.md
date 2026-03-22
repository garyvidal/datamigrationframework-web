# rdbms2marklogic — Web Frontend

A React/TypeScript web application for visualizing relational database schemas and mapping them to MarkLogic document structures (XML and JSON). This is the frontend component of the RDBMS-to-MarkLogic data migration framework.

## Purpose

This UI lets data engineers:
- **Visualize** relational database schemas as interactive node diagrams
- **Design** document mappings — define how tables and columns translate to XML or JSON documents in MarkLogic
- **Preview** generated documents using live data from the source database
- **Manage** multiple migration projects and saved database connections
- **Deploy** data migrations from relational databases to MarkLogic

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 6 |
| Diagram canvas | `@xyflow/react` (ReactFlow) |
| Auto-layout | `@dagrejs/dagre` |
| Styling | Tailwind CSS (dark slate + light mode) |
| Panel layout | `react-resizable-layout` |
| Icons | `react-icons` / `lucide-react` |

## Prerequisites

- Node.js 22+
- The Java Spring Boot backend running at `http://localhost:9390` (see `../RdmsToMarkLogic`)

## Getting Started

```bash
cd app
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173`.

```bash
npm run build    # Production build → app/dist/
npm run preview  # Preview production build
npm run lint     # Lint checks
```

## Key Features

- **Interactive schema diagrams** — collapsible table cards with FK relationship edges and crow's foot notation
- **Auto-layout** — Dagre TB / LR / BT and grid algorithms
- **Synthetic joins** — define custom join relationships beyond FK constraints
- **XML & JSON mapping** — right panel document model builder with column-level field mapping
- **Live document preview** — generate sample documents from real database rows
- **Multi-project tabs** — open and switch between multiple migration projects
- **Theme toggle** — dark mode (default) and light mode
- **Export** — download diagram as PNG, or download generated XML/JSON files

## Project Structure

```
app/src/
├── App.tsx                        # Root component, project/modal state
├── components/
│   ├── SchemaView/                # Main diagram canvas and toolbar
│   ├── DocumentModelView/         # Right panel — XML/JSON mapping UI
│   ├── Panels/                    # Left panel (project tree / schema browser)
│   ├── Project/                   # Modals: create wizard, open, config, connections
│   ├── Nodes/                     # ReactFlow custom node types
│   ├── Layout/                    # Header, collapsible panels, splitter
│   └── Migration/                 # Migration wizard and progress tracking
├── services/                      # Backend API clients
├── contexts/ThemeContext.tsx       # Dark/light theme
└── lib/                           # Utilities (case conversion, classnames)
```

## Backend API

All data is persisted and computed server-side. The frontend communicates with the Spring Boot backend at `http://localhost:9390`:

| Service | Base path | Purpose |
|---------|-----------|---------|
| Projects | `/v1/projects` | CRUD for project metadata and mappings |
| Connections | `/v1/connections` | Saved database connections |
| Schemas | `/v1/schemas` | Schema introspection via SchemaCrawler |
| MarkLogic | `/v1/marklogic/connections` | MarkLogic server connections |
| Generation | `/v1/projects/{id}/generate` | XML/JSON document preview |
| Migration | `/v1/migration/jobs` | Batch job submission and status |

## Docs

- [`docs/wireframe.md`](docs/wireframe.md) — UI layout and component reference
- [`docs/instructions.md`](docs/instructions.md) — Feature requirements and plans
