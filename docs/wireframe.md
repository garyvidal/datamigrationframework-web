# Application Wireframe

## Overall Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  HEADER (dark gray bg-gray-900)                                                      │
│  🔴 Data Migration Framework        [☀/🌙] [🗄 MarkLogic] [🗄 Connections]          │
│                                     [📁 Open Project] [⬆ Migrate] [+ New Project]   │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  PROJECT TABS  [ Project A ×] [ Project B ×] [+ ...]   (scrollable, dbl-click=rename)│
└──────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  SCHEMA TOOLBAR                                                                       │
│  [↖ Select] [⊟ Edges] [~ Line Type ▾] [⊞ Layout ▾] [⚡ Synth Join]   [🖨] [</> XML] [{ } JSON] [⚙] │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌─────────────────┬──────────────────────────────────────────┬──────────────────────────┐
│  LEFT PANEL     │  MAIN CANVAS (ReactFlow)                 │  RIGHT PANEL             │
│  (collapsible)  │                                          │  (collapsible)           │
│                 │  ┌────────────────┐  ┌───────────────┐  │                          │
│ 🗄 Project Name │  │ 📋 orders      │  │ 📋 customers  │  │  Document Mapping        │
│ ─────────────── │  │────────────────│  │───────────────│  │  ─────────────────────── │
│ 2 schemas • 5t  │  │ 🔑 id  int     │  │ 🔑 id  int    │  │  [XML] [JSON]  tabs      │
│ [+ Add Tables]  │  │    name varchar│  │    name varchar│  │                          │
│                 │  │ 🔗 cust_id int │  │    email text  │  │  Root Element: orders    │
│ 📁 public ▾    │  └────────┬───────┘  └───────┬───────┘  │                          │
│   📗 orders  ✓  │           └──────────────────┘          │  ▼ orders (XML element)  │
│   📗 customers  │              FK relationship             │    src: orders           │
│   📗 products   │                                          │    col: id → @id         │
│                 │  ┌────────────────┐                      │    col: name → name      │
│ 📁 inventory ▾  │  │ 📋 products    │                      │    col: cust_id → …      │
│   📗 stock      │  │────────────────│                      │                          │
│   📗 suppliers  │  │ 🔑 id  int     │                      │  [+ Add Element]         │
│                 │  │    sku varchar │                      │                          │
│                 │  │    price decimal│                      │                          │
│                 │  └────────────────┘                      │                          │
│                 │                                          │                          │
│                 │  [Controls]           [MiniMap] ░░░░░░░  │                          │
└─────────────────┴──────────────────────────────────────────┴──────────────────────────┘
```

## Header

**File**: `app/src/components/Layout/Header.tsx`

Left-to-right contents:
- Logo (`FaCube`, red) + "Data Migration Framework" title
- Theme toggle (`FaSun`/`FaMoon`)
- MarkLogic Connections button (amber, conditional)
- Database Connections button
- Open Project button
- Migrate button (green)
- New Project button (blue)

## Project Tabs

**File**: `app/src/components/SchemaView/DiagramTabs.tsx`

- Scrollable horizontal tab bar (overflow-x-auto, scrollbar hidden)
- Each tab: project name + close (×) button
- Active tab: white bg, cyan bottom border, bold text
- Double-click to inline rename; Enter to commit, Esc to cancel

## Schema Toolbar

**File**: `app/src/components/SchemaView/SchemaToolbar.tsx`

| Side  | Buttons |
|-------|---------|
| Left  | Select tool, Toggle edges, Line type picker, Layout algorithm picker, Create Synthetic Join |
| Right | Print/Export PNG, Generate XML, Generate JSON, Project Settings (⚙) |

Generate and Settings buttons only appear when a project with nodes is active.

## Left Panel

**File**: `app/src/components/Panels/ProjectPanel.tsx` (project open)
**File**: `app/src/components/Panels/SchemasPanel.tsx` (ad-hoc DB browsing)

Collapsible — shrinks to an 8px ribbon with vertical "Project" label.

### ProjectPanel (when project is active)
- Summary: `{n} schema(s) • {m} table(s)`
- Add Tables button
- Expandable schema → table tree
  - Schema: chevron, folder icon, name, table count
  - Table: table icon, name, ✓ badge if mapped, 👁 if visible in diagram
- In mapping mode: clicking a table opens it in the right panel

### SchemasPanel (no project, ad-hoc browsing)
- Connected status + Disconnect button
- Quick switch dropdown for saved connections
- Schema → table → column tree with column counts

## Main Canvas

**File**: `app/src/components/SchemaView/SchemaView.tsx`

ReactFlow diagram with:
- **DatabaseSchemaNode** cards — collapsible, show columns with PK/FK icons and types
- **Edges** — FK relationships (gray, crow's foot markers) or synthetic joins (yellow, arrow markers)
- **Controls** — zoom/pan buttons (top-left)
- **MiniMap** — diagram overview (bottom-right)
- **Background** — grid pattern

Interactions:
- Right-click node → context menu: "Remove from view"
- Right-click synthetic edge → context menu: "Delete join"
- Drag node → edges auto-reanchor to nearest handle

## Right Panel

**File**: `app/src/components/DocumentModelView/DocumentModelView.tsx`

Collapsible — shrinks to an 8px ribbon with vertical "Document Mapping" label.

### When project is active — Mapping Interface
- XML / JSON tab switcher
- Root element field
- Per-element mapping cards:
  - Source table selector
  - XML/JSON element name (with case conversion)
  - Column-level mappings (source column → target field name)
  - Collapse/expand toggle
- Add Element button

### When no project — Ad-hoc Table Details
- Table name and schema
- Column list: name (blue monospace), type, badges: PK (green), FK (yellow), AUTO (purple)

## Modal Dialogs

All modals are portal-rendered (`ReactDOM.createPortal`) with backdrop blur.

| Modal | Trigger | Contents |
|-------|---------|----------|
| Create Project Wizard | New Project button | 3 steps: DB Connection → Select Tables → Review & Save |
| Open Project | Open Project button / app startup | Project list with Open / Delete / Rename |
| DB Connections | Connections button | Saved connections + Add / Edit / Delete / Test |
| MarkLogic Connections | MarkLogic button | ML server list + Add / Test |
| Config Dialog | ⚙ in toolbar | Default casing, line type, mapping type (XML/JSON/BOTH) |
| Add Tables | Add button in left panel | Schema browser with checkboxes |
| Generate XML | XML button in toolbar | XML preview + Download |
| Generate JSON | JSON button in toolbar | JSON preview + Download |
| Synthetic Join | ⚡ in toolbar | Source table, target table, column pair conditions |

## Context Menus (right-click)

```
Node context menu:          Synthetic edge context menu:
┌────────────────────┐      ┌────────────────────────┐
│ table_name         │      │ ⚡ Synthetic Join       │
│────────────────────│      │────────────────────────│
│ Remove from view   │      │ Delete join            │
└────────────────────┘      └────────────────────────┘
```

## Splitter Layout

```
┌──────────────┬─────────────────────────────────┬────────────────────┐
│  Left Panel  ║          Main Canvas             ║    Right Panel     │
│  (min 150px) ║       (flex-1, fills space)      ║    (min 150px)     │
│  collapsible ║                                  ║    collapsible     │
└──────────────┴─────────────────────────────────┴────────────────────┘
                 ↑ draggable splitter bars ↑
```

Both side panels collapse to an 8px ribbon. The canvas fills all remaining space.
