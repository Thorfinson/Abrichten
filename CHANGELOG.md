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
- **Load simulation in 2D: the exact spot instead of a coloured board.** Every board is now a finite-element model over its whole surface (shelves, tops and worktops as plates, side panels, backs and rails in their own plane), so the heat map shows where a board is stressed: at a support, under a heavy item, beside a cutout, at the root of an overhang. A ring and label mark the maximum (“max. 78 %”, “Bruch · 132 %” in red when it would break); contour lines mark 25/50/75/100 %. The legend switches between stress and deflection (deflection against span/200) and between colour ranges: the whole model (0 up to its highest value, like an FEA plot — the default, so hot spots show at everyday loads), each board on its own, or absolute (100 % = breaks). The deformed view shows the real sagging surface. Shelf pins (attached as hardware) carry a shelf at four points, and their loads enter the side panels there. **Place loads:** “Last setzen” in the legend puts a load (default 10 kg) where you click on a shelf or top; arrows show each load with its weight, the properties card lists them to change or remove. Supports of the selected board are shown. The summary and the AI context give the location of the maximum on the board (e.g. 282 mm from the left / 300 mm from the back).
- **The load follows the joints.** Connections between boards (screwed, nailed, glued …) now carry the load: what hangs on what decides where the weight goes. A cladding nailed to a frame of battens hangs on the frame and carries nothing for it, so it is no longer shown as close to buckling (it was treated as a free-standing column); boards held only by their joints (battens, rails, a shelf screwed to the sides, an oven housing) are now supported instead of "no adequate support". Joints brace standing panels against buckling, push like a contact and pull only where a board would otherwise tip. The selected board shows where it rests (cones) and where it is joined (squares). The sample cabinet's back panel is nailed into rabbets in the side panels (two new joints), so it is braced instead of showing as the most loaded part.
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
