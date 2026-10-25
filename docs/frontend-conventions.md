# Frontend conventions

GPI Command Center follows the WIT UI style: grey canvas, white cards without borders, one ink surface, one accent. The accent (`#e5482b`) is a placeholder until GPI supplies its logo; swap it in `packages/tailwind-config/theme.css` and re-run the contrast check.

## Layout of the repo

- `packages/types`: domain types and label maps (`ALARM_STATUS_LABEL`, `ALARM_STATUS_FLOW`).
- `packages/fixtures`: seed data, the live telemetry simulation, the reducer store with its blockers, and formatters. All demo data is invented except plant names and planned capacities from the discovery answers.
- `packages/ui`: the WIT component kit, copied from CMMS.
- `apps/admin`: the console. Pages live in `src/pages/<feature>/`.

## Reference pages to copy

- Dashboard: `pages/overview/OverviewPage.tsx` (attention card, ink hero, accent card, map, list cards).
- List page: `pages/alarms/AlarmsPage.tsx` (clickable stat tiles, search, filter panel, quick views, DataTable on the canvas).
- Analytics page: `pages/insights/InsightsPage.tsx` (findings feed, capacity split, heatmap, Pareto, donut, hour-of-day columns).
- Drill-down plan: `pages/plants/SitePlan.tsx` (SVG zones as buttons, `?zone=` in the URL). Every click on the plan also shows that zone's single line under it (`ZoneLine.tsx`): electrical for the engine hall, switchyard and workshop, process for the tank farm and fuel treatment, data for the control room, CCTV for the gate. A generator or camera click preselects it in the line; every element in the line shows its values and a link.
- Unit page actions: the hero links the unit to the site plan, single line, 3D view, events, the trip replay and a CSV export; each live point links to its limit rule, its alarms and the trend; the details link to the plant, controller, breaker, fuel meters and project.
- Shared 3D stage: `lib/three-stage.ts` (renderer, labels, orbit controls, lights, resize, render loop, click-versus-drag picking with hover and selection highlight, disposal). Both 3D scenes build on it; register every mesh a user can click in `stage.pickable`, so everything in a model selects.
- Control room: `pages/room/ControlRoomPage.tsx` with the room data in `packages/fixtures/src/control-room.ts` (5.0 × 3.6 × 3.0 m from GPI, a proposed furniture layout, `roomChecks()` against ISO 11064 guidance and `heatLoadW()`). The video wall and desk monitors draw live console data onto canvas textures; every panel, monitor, desk, chair, wall and piece of equipment selects.
- 3D view: `pages/plants/Site3D.tsx`, behind the 2D/3D switch on the Site plan tab (`?view=3d`). Three.js builds the scene from the same `siteLayout()`, reads colours from the theme tokens, and loads in its own `three` chunk only when the view opens. The scene lives in `pages/plants/site3d/scene.ts` (plain three.js, built once per plant, updated in place through `update(display)`); the React side picks what to show. A drag orbits, a still click selects; the side panel shows live values and the real alarm actions for the selection. Dispose every geometry and material you add.
- Training simulation: `?mode=sim` on the 3D view. Scenarios live in `packages/fixtures/src/simulation.ts` as pure functions of the plant snapshot, sim time and the trainee's acknowledge and assign times, so tests cover them. Practice actions change only the simulation; real alarm actions are hidden while it runs.
- Event replay: `?mode=replay&event=<id>` on the 3D view, linked from every Event list row (`paths.replay`). `replaySteps()` in `packages/fixtures/src/replay.ts` rebuilds unit and link state after each recorded event; a test checks that replaying the whole record lands on today's states.
- Flows in the plant model: the fuel chain (storage, transfer, day tank, supply, treatment, engine header with a feed per unit, return) and the power chain (unit stubs, 11 kV bus, link to the transformers, 33 kV line, grid line) are pickable runs keyed `flow:<id>`; the side panel shows each run's live values and a clickable path list.
- Scene effects (`site3d/effects.ts`): exhaust smoke and fans follow load, a trip sends a shockwave and a dark puff, a synchronising unit sends a soft ring, a beacon turns over whatever is in alarm, and the Starlink dish emits rings while up and packets during a back-fill. Reduced motion stops all of them and keeps the static colours.
- Detail page with a lifecycle: `pages/alarms/AlarmDetailPage.tsx` (next step as primary, ink hero, Steps, history, dialogs).
- Detail page with tabs: `pages/plants/PlantDetailPage.tsx` (`?tab=` in the URL).

## Rules the code relies on

- The Command Center is read-only toward the plants (phase 1). No screen offers a control action.
- Every live number comes from `useLive()` and shows how old its sample is (`FreshnessBadge`). Late is over 15 s, stale over 60 s.
- Mutations go through `useAct()`, which stamps the user, toasts the result and shows the reducer's refusal in a danger toast. The same `*Blocker` function feeds the reducer and the form error.
- Roles gate by hiding: `useAuth().can(permission)`. The header lets reviewers switch the demo user.
- Filters other pages link to live in the URL (`useSearchParam`); list search and table state survive Back (`useHistoryState`, `useTableHistory`).
- Multi-select filters use `useFilters(rows, groups)` with `FilterButton`, `ActiveFilters` and `QuickViews`. Each group is one URL parameter holding a comma-separated list, so `/alarms?site=pl-jm` from another page still works. Option counts ignore the option's own group.
- Findings come from `buildInsights()` in `state/insights.ts`. Each rule names the plant, the number behind it and the page that shows the detail; add a rule there rather than computing a finding inside a page.
- Site layouts come from `siteLayout()` in `packages/fixtures/src/site-plan.ts` and are schematic until the as-built drawings arrive. Replace the `ZONES` table with surveyed positions when they do.
- Colours come from the Gulf logo: navy `#022779` as ink, orange `#FF6319` as accent. White text never sits on `accent`; use `accent-strong` (`#C2410C`, 5.18:1) behind white text and for small orange text. Charts and SVG read the tokens through `fill-*`, `stroke-*` or `var(--color-*)`.
- Check every new screen at 375 and 768 wide: `main.scrollWidth` must equal `main.clientWidth`.

## SCADA specification

Screens follow the GPI Preliminary SCADA System Specification, Rev. 2 (23 Oct 2026). Its values live in `SPEC` in `packages/fixtures/src/scada.ts`; change them there.

- Event list (`pages/events/EventsPage.tsx`): Sequence of Events with source time stamps to 1 ms, local time over UTC, first-out marks and back-filled arrivals (spec 3.2, 6.1).
- Single line model (`pages/plants/single-line-model.ts`): breakers, transformers and export figures for one plant, shared by the 2D diagram, its 3D view (`pages/plants/sld3d/`, `?sldview=3d`) and the plant 3D panel. Change electrical figures there, not in a view.
- Single line (`pages/plants/SingleLine.tsx`): 33 kV feeders, step-up transformers, the 11 kV bus in two sections, one incomer per generator, plus transformer monitoring and a breaker table (spec 4.1).
- Auxiliaries tab on each plant: common status per auxiliary system (spec 3.4).
- Data sources: Starlink link health and store-and-forward buffer (spec 6.1), tag capacity against the 1,500-tag base with 25% spare (spec 8), and the platform rules (spec 4.3, 5, 7, 9, 10, 11).
- Alarms from equipment in maintenance are suppressed (`isSuppressed`): hidden from lists and counters until a viewer asks, and never escalated (spec 4.2).
- Exports use `downloadCsv()` from `lib/csv.ts` (spec 4.4). Print covers PDF.
