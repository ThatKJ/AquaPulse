# Boundary data

| Layer | Source | Licence | Version | Notes |
| --- | --- | --- | --- | --- |
| National outline | DataMeet `Country/india-soi.geojson` ("Survey of India State Map") | CC BY 4.0 | repository state of 2022-05 | Simplified to 74 KB with mapshaper (1.5%, shapes kept). Supplies the country's extent |
| Districts (735) | geoBoundaries gbOpen IND ADM2 (Local Government Directory, Pathways Data) | ODbL 1.0 | 2021 | Simplified to 498 KB. Each district assigned to a state by point-in-polygon against ADM1 (3 unassigned) |
| States (36) | geoBoundaries gbOpen IND ADM1 | CC BY 2.5 IN | 2021 | Simplified to 86 KB |

**Limitation:** the district and state polygons stop short of the national outline in the north, so that area is drawn as country without district detail.

**Official source:** Survey of India distributes administrative boundaries through its Online Maps Portal (`onlinemaps.surveyofindia.gov.in`). Downloads need a registered account and its licence terms were not verified, so nothing from it is used.

**Alternative considered:** DataMeet's Census 2011 districts share the national outline's depiction but have 641 districts; switching would lose districts created since 2011 and reduce alert matching. Not done.

**Decision:** keep the current combination. No boundary has been edited by hand.
