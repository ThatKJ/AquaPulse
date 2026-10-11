# Performance — measured 2026-10-11 on production

Desktop Chromium through Playwright, 1440x900, from India. Browser cache was warm for the page timings, so transfer sizes below come from the build output instead.

| Page | First contentful paint | Notes |
| --- | --- | --- |
| `/` landing | 1.06 s | Ten screenshots, 3.3 MB of JPEG in total, lazy below the fold |
| `/live` India map | 0.33 s | One `/api/national` call (106 KB JSON, 1.3 s server time); 121 fps idle; 70 MB JS heap |
| `/?demo=1&scenario=flood` | 0.44 s | 121 fps idle; 72 MB JS heap; polls `/api/reports` every 5 s (3.8 KB, 0.7 s) |

| Asset | Size (gzip) |
| --- | --- |
| All JS chunks together | 920 KB; the largest three are 272, 156 and 104 KB (MapLibre and deck.gl) |
| MapLibre worker | 140 KB |
| District boundaries | 119 KB (485 KB raw), loaded once |
| State boundaries, national outline | 25 KB, 23 KB |

What was checked and found fine: the map is created once per view and re-framed with camera moves, not rebuilt; drill-down changes paint properties and the camera only; `/api/national` is cached in the server instance for 30 s and refreshes the feeds after responding, never inline; no request fails or repeats in a 12-second idle window beyond the 5-second report poll.

Known and left alone: moving from the India view to the Bengaluru view loads a second map (two styles, two WebGL contexts over a session); the first uncached visit downloads about 1 MB of JavaScript; `/api/national` at 1.3 s is two Supabase reads from a cold function. None of these is visible in the demo. Earlier measurement of a full flood run at real speed: 119 fps average, worst frame 59 ms.
