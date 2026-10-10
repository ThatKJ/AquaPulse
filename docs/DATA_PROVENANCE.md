# Data provenance

Every value on screen belongs to one of these classes. Nothing simulated is shown as live.

| Class | Meaning | What is in it today |
| --- | --- | --- |
| LIVE_OFFICIAL | Fetched from an official feed, with its issue and fetch time | Official alerts from **NDMA SACHET** (issued by IMD offices, the Central Water Commission and state disaster authorities) |
| STATIC_OFFICIAL / open | Static reference data with a named source | District and state boundaries: geoBoundaries gbOpen IND ADM2 (ODbL 1.0; source Local Government Directory, Pathways Data) and ADM1 (CC BY 2.5 IN). Basemap in the local view: OpenFreeMap / OpenMapTiles / OpenStreetMap |
| DERIVED | Computed by AquaPulse from the above | AquaPulse Composite Water Risk per district; counts in the national summary; district placement of an alert (by name matching); everything the local engine computes |
| USER_REPORT | Sent by a person | Reports arriving at the report webhook; photos uploaded for analysis |
| LIVE (AWS) | Result of a real AWS call | Amazon Rekognition label analysis of an uploaded photo |
| SIMULATED | Seeded for the local HydroTwin | Bengaluru cells, drains, pipes, facilities, populations, failure history, scenario reports and their recorded analyses, "observed" intervention outcomes |

## National view: where each number comes from
- **Districts under a water-related alert:** districts with at least one active official alert whose event type bears on water (flood, river, rain, storm, cyclone, heat). Active = not yet expired.
- **Flood / rain / heat alert counts:** active official alerts by event type.
- **Alerts not on the map:** active alerts whose area text names no district we could match. They are counted and not placed.
- **AquaPulse water risk (0–100):** severity × urgency × certainty of the strongest water-related alert, scaled by how directly the event type bears on water, plus a small capped amount for further alerts. It is AquaPulse's own score, not a rating by IMD, CWC or NDMA.
- **Confidence and coverage:** only one of four planned inputs is connected (official alerts). Nowcast rainfall, river condition and heat are UNKNOWN, shown as unknown, and lower confidence. They are never treated as zero.
- **A district with no colour** has no water-related alert placed on it. That is not a statement that it is safe.

## Freshness
The server pulls the feed at most every 10 minutes (single flight, recorded in `sync_runs`); browsers only read AquaPulse. The header shows CURRENT (within 20 min), DELAYED (within 60 min) or STALE, with the time of the last successful sync. If the feed fails, the last good alerts stay on screen and the status ages.

## Known limits of placement
The feed's polygon service is not publicly readable (HTTP 403), so alerts are placed by matching district names in the alert's area text within the named state. Spelling variants (for example Siddharthnagar, Farrukhabad, Ayodhya) and state-wide alerts ("9 districts of Uttarakhand") are not placed. On 2026-10-10, 20 of 25 active alerts were placed.

Boundary depiction follows the geoBoundaries dataset and carries no endorsement of any territorial claim.
