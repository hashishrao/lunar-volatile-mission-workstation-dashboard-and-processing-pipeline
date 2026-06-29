# 30-Hour Execution Plan

## Hours 0-3: Data Inspection

- Load DFSAR, OHRC, DEM, and PSR mask in QGIS.
- Confirm projection, pixel size, extent, and nodata values.
- Mark crater boundary and candidate science region.
- Decide common raster grid.

Deliverable: one screenshot showing all data layers aligned.

## Hours 3-8: Radar Products

- Calibrate or normalize DFSAR channels if required.
- Compute CPR.
- Load or compute DOP.
- Export CPR and DOP maps.

Deliverable: CPR map, DOP map, short note on thresholds.

## Hours 8-13: Ice Candidate Classification

- Apply CPR > 1 and DOP < 0.13 criteria.
- Mask to PSR / doubly shadowed region.
- Generate ice-confidence score.
- Produce initial candidate map.

Deliverable: first ice-confidence map.

## Hours 13-18: False Positive Rejection and Hazards

- Use OHRC texture and DEM roughness to identify blocky/rough areas.
- Reclassify high-CPR rough terrain as likely false positive.
- Create slope and hazard maps.

Deliverable: final ice-classification map and terrain hazard map.

## Hours 18-23: Landing Site and Rover Traverse

- Select landing candidate from low-slope, low-roughness terrain.
- Choose highest-value accessible science target.
- Run A* traverse over hazard-cost map.
- Add science stops and backup safe points.

Deliverable: landing-site map and rover path.

## Hours 23-26: Ice Volume Estimate

- Measure high-confidence ice area.
- Estimate volume for top 5 m.
- Report low, medium, and high ice-fraction scenarios.

Deliverable: ice volume table.

## Hours 26-30: Final Presentation

- Assemble maps into a clean story.
- Emphasize why rough-terrain false positives were rejected.
- Show landing and traverse feasibility.
- State assumptions and limitations clearly.

Deliverable: final slides/report.

