# Changelog

## [Unreleased]

### Fixed — calculations
- Static check: the minimum thickness was about 2.3× too small (the 12 of I = b·h³/12 was missing). The 20 % is now applied as a load margin; E values follow EN 338 / EN 312 / EN 622-5, solid wood bent across its grain uses E/30, and rotated boards are rated as they stand.
- One rule for the board face: the smallest dimension is the thickness. Cost, edge banding, DXF outlines, boring rows and nesting were wrong for side panels and backs (e.g. a side panel was costed as 18 × 570 mm).
- The static summary, the 3D overlay and the AI context rate boards the same way; standing panels and supported parts are no longer flagged.
- Board presets (shelf, worktop, …) are created lying or standing the right way.
- The carcass generator used a material that does not exist (cost 0); the sample project too. A face-mounted back no longer collides with the carcass, a grooved back is cut into its grooves, and generating is one undo step.
- Nesting keeps the grain along the sheet length (materials without grain may still turn), needs kerf only between parts, and reports efficiency from placed parts only.
- Hinge cup position is 22 mm from the edge everywhere (the boring list used 35 mm); drawer runner holes follow the 32 mm system.
- Custom materials are used by cost, statics and nesting.

### Fixed — editing
- Boards that only touch are no longer reported as colliding when float rounding leaves them a hair inside each other (e.g. a board at 1435 mm, 52.3 mm wide, next to one at 1487.3 mm); overlaps below 0.01 mm count as touching.
- Changing a parameter resizes every board that uses it; renaming onto an existing name is refused; deleting one keeps the sizes.
- Dimension fields keep their formula when you only click in and out; `=H+20` and comma decimals work; invalid input is marked.
- Quad layout: every quadrant handles dragging, marquee, measuring and handles in its own view.
- Pressing a key during a drag no longer leaves the app stuck; `Esc` cancels the drag.
- Resize handles work on rotated boards and keep the opposite face in place.
- A marquee selects within one assembly; deleting such a selection no longer strips joints from other boards.
- Clicking a selected board in 3D keeps it selected; a right-drag pan no longer opens the context menu.
- Keyboard shortcuts no longer act on the model behind an open dialog; `Esc` closes the dialog.
- Joints and dado grooves sit at the contact region of the two boards (were 25 mm off; grooves were drawn in the wrong orientation).
- Undo after opening a file no longer brings back the previous project.
- The UI language survives a restart.

### Fixed — files and safety
- Print (cutting list, cost, shop drawings) did nothing in the desktop app; it now prints through a sandboxed iframe with all names escaped.
- Exports open a save dialog for their own file type (cost CSV was offered as a project file, DXF as CSV; the cutting-list DXF export called a missing function).
- A bad AI reply or file can no longer break the auto-save: values are validated, unusable AI boards are skipped with the reason, and an auto-save that fails to load is kept as a backup and reported.
- Board names can no longer inject entities into DXF files or formulas into CSV files.
- Electron 45 (from 40, which no longer gets security fixes); Content Security Policy; only `https:` links open externally; the window cannot navigate away from the app.
- The `.env` API key is used in `npm run dev` only and no longer ends up in a build.

### Added
- **Trackpad.** On a Mac trackpad two fingers pan the view and a pinch zooms towards the pointer, in the 2D views and in 3D; ⌘ + two fingers zooms as well. ⌥ + two fingers or ⌥ + drag orbits the 3D view, ⇧⌥ + drag pans it, and ⌥ + drag on empty canvas pans a 2D view — no middle or right button needed. Gizmos, board drags and the marquee work with a one-finger click-drag as before, and scroll momentum no longer moves the view during such a drag. A mouse wheel still zooms as before: the app tells wheel notches from trackpad scrolling per gesture. Settings → General → Input device fixes it to “Maus” / “Mouse” (exactly the previous behaviour, ⌥ + drag on empty canvas draws a marquee) or “Trackpad”. The shortcuts overlay (`?`) lists the gestures.
- **Assembly mode with printable instructions (Montage).** A project can now carry assembly steps: an ordered list in which each part is installed once; parts in no step are shown as “noch nicht eingeplant”. *Reihenfolge vorschlagen* builds a first order from the part roles: back panels, substructure, the carcass of each assembly (in tree order), end panels and fillers, worktop, appliances, drawer boxes, fronts, plinth, then the parts without a role per assembly. Steps can be renamed, annotated, reordered, added and deleted, and parts moved between them (or the current selection added) — each change one undo step; deleting a part takes it out of its step. The fixings are not entered twice: a joint belongs to the step in which the second of its two parts goes in, so each step lists its screws, dowels, nails … summed by type and size, with the joint notes (“26 × Holzschraube Senkkopf 4 × 40, vorgebohrt”). In the mode the 3D view shows one step at a time — earlier steps ghosted, the current one highlighted (the X-ray look of the assembly drawer), later parts hidden; ‹ › or the arrow keys step through. *Anleitung drucken* prints an IKEA-style instruction: a cover with the finished model, all parts (numbered) and all fixings, then a page per step with a picture of the state after the step, its parts and its fixings. Open it from *Panels → Montage-Modus* or the command palette. The steps are saved in the project file; older files load unchanged.
- **Part role (Bauteilart) next to the assembly tree.** A board can be marked as Sichtteil (front, end panel, filler), Korpus (bottoms, sides, middle sides, shelves), Rückwand, Unterkonstruktion, Schubkasten (the box), Arbeitsplatte, Sockel or Einbaugerät — in the properties card under the grain direction, for one board or for the whole selection at once (one undo step; a selection with different roles shows “gemischt”). The role is saved in the project file. So the assemblies can follow the build (per cabinet or compartment) while the lists still go by role: once a part has a role, the cutting list gets a role column, a role filter and “Nach Bauteilart” (sections in role order with their piece count; print and CSV follow), and the cost panel can show material and hardware per role with a subtotal each (print and CSV with a role column). Parts without a role are listed under “ohne Bauteilart”. Older files load unchanged; an unknown role value is dropped.
- **Load simulation in 2D: the exact spot instead of a coloured board.** Every board is now a finite-element model over its whole surface (shelves, tops and worktops as plates, side panels, backs and rails in their own plane), so the heat map shows where a board is stressed: at a support, under a heavy item, beside a cutout, at the root of an overhang. A ring and label mark the maximum (“max. 78 %”, “Bruch · 132 %” in red when it would break); contour lines mark 25/50/75/100 %. The legend switches between stress and deflection (deflection against span/200) and between colour ranges: the whole model (0 up to its highest value, like an FEA plot — the default, so hot spots show at everyday loads), each board on its own, or absolute (100 % = breaks). The deformed view shows the real sagging surface. Shelf pins (attached as hardware) carry a shelf at four points, and their loads enter the side panels there. **Place loads:** “Last setzen” in the legend puts a load (default 10 kg) where you click on a shelf or top; arrows show each load with its weight, the properties card lists them to change or remove. Supports of the selected board are shown. The summary and the AI context give the location of the maximum on the board (e.g. 282 mm from the left / 300 mm from the back).
- **The load follows the joints.** Connections between boards (screwed, nailed, glued …) now carry the load: what hangs on what decides where the weight goes. A cladding nailed to a frame of battens hangs on the frame and carries nothing for it, so it is no longer shown as close to buckling (it was treated as a free-standing column); boards held only by their joints (battens, rails, a shelf screwed to the sides, an oven housing) are now supported instead of "no adequate support". Joints brace standing panels against buckling, push like a contact and pull only where a board would otherwise tip. The selected board shows where it rests (cones) and where it is joined (squares). The sample cabinet's back panel is nailed into rabbets in the side panels (two new joints), so it is braced instead of showing as the most loaded part. A joint also bridges a gap of up to 15 mm, so a drawer hangs on its runners.
- **Cut plan for battens.** The cutting list plans bar stock (solid wood up to 10 cm wide: battens, rails, square timber) onto stock bars, longest pieces first, with stock length, saw kerf and trim per end (default 4 m, 5 mm, 10 mm): which pieces come from which bar and what is left, per material and section, also in the print and the CSV. Lengths in the cutting list follow the display unit in the status bar (mm, cm or m).
- The load simulation's legend folds to its title row (remembered) and has a × that switches the overlay off; before, only the STATIK switch in the corner hid it.
- **Permanent load.** The load simulation takes every load as permanent (EN 1995-1-1): strengths are reduced by the material's k_mod (solid timber 0.6, particleboard 0.3, MDF 0.2 …) and deflections include creep (k_def), so 100 % means it breaks in the long run and a particleboard shelf shows how far it sags over the years. A side panel standing on a rail with its front edge only is carried by the frame it is screwed to.
- **Weight of a part.** In statics mode the properties card has a weight field: empty, the weight comes from material and size (shown as the hint); an appliance gets its datasheet weight (an oven's 38 kg instead of a 19.5 mm solid steel front at 54 kg). The load simulation, the assembly weight in the tree and the hinge calculator use it; the assembly weight now also counts appliance placeholders as the simulation does (a dishwasher showed 2.1 t of solid steel).
- **Load simulation.** The static check now follows the weight through the furniture: self-weight, payload and everything resting on a board travel down to the floor, each lying board is solved as a beam (also continuous beams and overhangs), standing panels are checked for buckling. The result is shown on the boards as a heat map from green to red (100 % = breaks), with a band and label where a board breaks or nears it, purple for boards without support, and an optional exaggerated sag view. The legend sets the payload per shelf; a lying board can carry its own payload. The summary lists load, span, maximum utilisation and where it is, sag and minimum thickness.
- Grain direction and edge banding can be set in the properties card; its sections fold away.
- Joints can be edited, with fasteners and a note.
- The hinge calculator attaches hinges to the selected door; the drawer calculator builds the drawer box.
- Boards snap to the faces of other boards while dragging (`Alt` drags freely).
- Unsaved changes: bullet in the window title, marker in the status bar, and a question before New, Open or closing the window.
- Guide prices for all built-in materials, so the cost calculation works out of the box.
- Shop drawings preview, live nesting, and more board actions in the context menu (rotate, create joint, hide the assembly).
- `D` duplicates (as documented); `Shift+F10` / Menu key opens the board context menu; dialogs are keyboard- and screen-reader-friendly.
- Large selections show one overall dimension instead of hundreds of labels.

### Changed
- **Dark design throughout**: dark viewport, boards opaque in their material colour with edge lines, one dark dialog style with a single primary button.
- Furniture faces the front view: the sample cabinet, the carcass generator and drawer boxes put the back at z = 0 and the front towards +z, like project files already did.
- The assembly tree is a docked column; tools sit in a strip at the left of the canvas; a "Panels" button opens all panels; the status bar has labelled snap, grid and unit controls.
- The cutting list shows length × width × thickness, grain as "längs" / "quer".
- Every project load fits the view; the sample opens in 3D. The joints layer is off by default, and joint count badges show only on selected boards.
- Material strengths use characteristic values (e.g. spruce C24 = 24 N/mm² instead of the clear-wood 80), so the static check is stricter.
- The boring list puts the 32 mm rows on side panels only, not on backs.
- Settings: the colour scheme, default values and tips options were removed (they had no effect); the CSV delimiter now applies to all CSV exports.
- Requires Node.js 22.12 or newer.

### Fixed — display
- Dimension and scene labels no longer show through dialogs and the properties card.
- The sample cabinet has no collisions and uses its parameters H / B / T.
