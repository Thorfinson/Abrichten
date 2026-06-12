# Abrichten

Desktop application for planning furniture, shelving, and kitchen projects in wood and stone. Combines a full-screen 3D canvas with glass-card overlays, context-aware shortcuts, and AI-assisted sketch analysis.

## Features

### Canvas & Modelling
- **Single unified canvas** — one React Three Fiber scene, four camera modes (front, side, top, 3D)
- **Boards** — parametric rectangles with width × height × depth, material, grain direction, edge banding
- **TransformControls gizmo** — translate / rotate in 3D view; pointer-drag in orthographic views
- **Zoom & pan** — scroll-wheel zoom around cursor, right-click drag to pan; state persisted per view
- **Snap to grid** — configurable step (mm), snap indicator pulses on hit

### Overlays (in-canvas glass cards)
- **FloatingPropertiesCard** — appears bottom-right when a board is selected; edit name, W×H×D, material, duplicate, rotate 90°, delete
- **ContextHUD** — always-visible bottom-left card with LED overlay toggles (Static / Collision / Joints) and context-sensitive shortcut hints
- **AssemblyDrawer** — slide-in panel (left edge) showing the assembly tree; toggle with `◧` button or `B` key
- **ChatPanel** — AI assistant as a fixed right-edge drawer

### Analysis & Engineering
- **Static analysis** — deflection calculation with 20 % safety factor; colour-coded overlay (green / amber / red)
- **Collision detection** — AABB overlap, highlighted in-canvas with collision box overlay
- **Joint markers** — visualise Dado, Rabbet, Pocket Screw, Biscuit, Dowel, Domino joints in 3D
- **Dimension overlay** — staggered dimension lines with assembly total dims

### Panels (via ⌘K command palette)
- **Carcass generator** — build a full cabinet from outer dimensions in one step
- **Cutting list** — table of all parts with CSV export
- **Sheet nesting** — guillotine-optimised layout with SVG / DXF export
- **Shop drawings** — DXF/PDF workshop drawings per assembly
- **Cost calculator** — material + hardware cost breakdown with PDF export
- **Hardware catalogue** — Blum, Grass, Hettich fittings with quantity take-off
- **32 mm boring list** — system drilling pattern export for CNC
- **Drawer calculator** — Blum TANDEM, Grass Nova Pro, Hettich ArciTech sizing
- **Hinge calculator** — CLIP top / Sensys / Tiomos boring diagram + recommendation
- **Parameters panel** — named dimension references usable in formulas (`=H-18`)
- **Tolerance reference** — 10 standard clearances with nudge controls
- **Custom materials** — CRUD for project-specific materials with per-material pricing
- **Measurement tools** — point-to-point distance, angle, area with snap

### Workflow
- **Undo / Redo** — full history via zundo (Zustand temporal middleware)
- **Save / Load** — JSON project file via Electron file dialog (Ctrl+S / Ctrl+O)
- **Auto-save** — IndexedDB via Dexie on every project change
- **Onboarding** — first-launch welcome dialog with sample project
- **AI assistant** — upload a sketch or describe a piece; Claude / GPT via OpenRouter creates boards in one undo step
- **I18N** — German and English, switchable at runtime

## Tech Stack

| Area | Technology |
|---|---|
| Desktop | Electron 40 |
| Build | electron-vite 5 + Vite 7 |
| Frontend | React 19 + TypeScript |
| Styling | TailwindCSS v4 |
| State | Zustand 5 + zundo (undo/redo) |
| 3D | React Three Fiber 9 + @react-three/drei 10 |
| Persistence | Dexie (IndexedDB) |
| I18N | i18next + react-i18next |
| AI | OpenRouter API (VLM / chat) |

## Requirements

- **Node.js** >= 18
- **npm** >= 9

## Installation & Dev

```bash
git clone <repo-url>
cd abrichten
npm install

# optional: AI assistant config via env file
cp .env.example .env   # then add your OpenRouter API key

# development (hot-reload, Electron window opens automatically)
npm run dev

# production build
npm run build
```

`npm run dev` starts a Vite dev server on `localhost:5173` and opens the Electron window.

## Project Structure

```
src/
├── main/               # Electron main process
│   └── index.ts
├── preload/            # Electron preload (exposes electronAPI)
│   └── index.ts
└── renderer/
    └── src/
        ├── components/
        │   ├── layout/     # Toolbar, StatusBar, AssemblyDrawer, CommandPalette, ViewTabs
        │   ├── overlays/   # FloatingPropertiesCard, ContextHUD, ShortcutsOverlay, …
        │   ├── canvas/     # UnifiedCanvas, Board3D, CameraController, OrthoGrid
        │   ├── panels/     # CostPanel, HardwarePanel, NestingPanel, ParametersPanel, …
        │   ├── ai/         # ChatPanel, SketchUpload
        │   └── ui/         # SettingsDialog, JointDialog, WelcomeDialog, …
        ├── data/           # Materials, hardware catalogue, fasteners, joint rules
        ├── hooks/          # useKeyboard, useAutoSave
        ├── i18n/           # de.json, en.json
        ├── services/       # Static calc, joint advisor, OpenRouter client
        ├── store/          # useProjectStore, useUIStore (Zustand)
        ├── types/          # TypeScript interfaces (Board, Assembly, Joint, …)
        └── utils/          # Units, collision, snap, DXF, nesting, projection
```

## Keyboard Shortcuts

### Always

| Key | Action |
|---|---|
| `F` | Fit view |
| `S` | Toggle snap |
| `B` | Toggle assembly drawer |
| `?` | Show all shortcuts |
| `Ctrl+K` | Command palette |
| `Esc` | Deselect / cancel |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+O` | Open project |
| `Ctrl+S` | Save project |
| `1` – `4` | Select / Measure / Angle / Area tool |
| `Alt+1` – `Alt+4` | Front / Side / Top / 3D view |

### Board selected

| Key | Action |
|---|---|
| `D` | Duplicate (Ctrl+D also works) |
| `Delete` | Delete selected board(s) |
| `G` | Translate mode (3D) |
| `R` | Rotate mode (3D) |
| `J` | Create joint (requires 2 boards) |
| `↑ ↓ ← →` | Nudge 1 mm |
| `Shift + arrows` | Nudge 10 mm |
| `Ctrl+A` | Select all boards in assembly |

## Settings

Via the `⚙` button in the toolbar:

- **Language** — Deutsch / English
- **OpenRouter API key** — required for the AI assistant
- **VLM model** — model selection for image and chat analysis

Alternatively, configure the AI assistant via a `.env` file in the project root (see [.env.example](.env.example)): `VITE_OPENROUTER_API_KEY`, `VITE_OPENROUTER_MODEL`, and optionally `VITE_OPENROUTER_BASE_URL` for any OpenAI-compatible endpoint. Values from the Settings dialog take precedence. Note that Vite inlines env values at build time, so don't ship a production build made with a real key in `.env`.

## License

ISC
