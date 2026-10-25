# GPI Command Center (frontend prototype)

Clickable frontend for the Gulf Power International Command Center in Khobar, monitoring five planned Yemen plants (300 MW). Built from the discovery answers of 19 Oct 2026. Data is simulated in the browser; there is no backend.

```bash
pnpm install
pnpm dev        # http://localhost:5373
pnpm typecheck
pnpm test
pnpm build
```

Screens: fleet overview (operations and management views), plants, engine units, alarms with acknowledge, assign, resolve and close, fuel, construction projects, CCTV, reports, and data sources with the draft alarm register and escalation matrix. See `docs/frontend-conventions.md`.

## Palette and contrast

Sampled from the Gulf logo. Change the values in `packages/tailwind-config/theme.css`.

| Pair                                   | Ratio                                       |
| -------------------------------------- | ------------------------------------------- |
| White on ink `#022779`                 | 13.39                                       |
| White on accent-strong `#C2410C`       | 5.18                                        |
| Accent-strong on accent-soft `#FFF1EA` | 4.69                                        |
| On-ink-muted `#C3CDE8` on ink          | 8.43                                        |
| Muted `#5B6478` on surface `#F1F3F8`   | 5.35                                        |
| Accent `#FF6319` on white              | 2.98, so icons, dots and large numbers only |
