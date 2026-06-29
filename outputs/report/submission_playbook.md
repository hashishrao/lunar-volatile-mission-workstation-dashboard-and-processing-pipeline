# Submission Playbook: Lunar South Polar Subsurface Ice

This playbook consolidates the supplied problem statement, screenshots, final summary, technical report, and local code into one execution guide for the hackathon submission.

## One-Sentence Mission

Use Chandrayaan-2 DFSAR radar signatures, OHRC surface evidence, DEM terrain constraints, and PSR illumination context to identify probable subsurface ice in a doubly shadowed crater, reject rocky false positives, select a safe nearby landing site, plan a rover traverse, and estimate 0-5 m ice volume.

## What the Judges Need to See

| Problem objective | Required evidence | Workspace output |
|---|---|---|
| Locate subsurface ice | CPR > 1.0, DOP < 0.13, inside PSR / doubly shadowed crater | `work/data/processed/ice_score.tif`, `work/data/processed/ice_class.tif` |
| Distinguish ice from rock | OHRC texture, DEM roughness, high-CPR rough terrain flagged as unreliable | `work/data/processed/roughness.tif`, `work/data/processed/ice_class.tif` class `-1` |
| Select landing site | Low slope, low roughness, low hazard, close to science target | landing-site coordinates from QGIS over `hazard_score.tif` and `slope_deg.tif` |
| Plan rover route | A* route over hazard raster, avoiding hard hazards | `work/data/processed/rover_traverse_cells.csv` |
| Estimate ice volume | high-confidence area x 5 m depth x saturation scenarios | `work/data/processed/ice_volume_estimates.csv` |

## Dataset Checklist

Use Map Browse first only to identify the assigned crater ROI and product IDs. Then prioritize fewer well-aligned products over many mismatched products.

Minimum required files:

```text
work/data/raw/dfsar_same_circular.tif
work/data/raw/dfsar_opposite_circular.tif
work/data/raw/dfsar_dop.tif
work/data/raw/ohrc_image.tif
work/data/raw/dem.tif
work/data/raw/psr_mask.tif
```

If a direct DOP product or PSR mask is not supplied, derive it in MIDAS, ENVI, QGIS, or a preprocessing notebook, then point `work/config/project_config.yaml` to the derived raster.

## Execution Order

1. Inspect supplied data:

```bash
work/.venv/bin/python work/scripts/inspect_downloads.py work/data/raw
```

Record CRS, bounds, resolution, band count, and nodata for every raster. Before running the main pipeline, confirm all products overlap the same crater ROI.

2. Update paths and assumptions:

```text
work/config/project_config.yaml
```

Keep the judging-threshold defaults unless the data forces a change:

```text
cpr_ice_min: 1.0
dop_ice_max: 0.13
depth_m: 5.0
ice fractions: 0.05, 0.10, 0.20
```

3. Generate radar, ice, hazard, and volume products:

```bash
work/.venv/bin/python work/scripts/lunar_ice_pipeline.py products --config work/config/project_config.yaml
```

4. Open the outputs in QGIS:

```text
work/data/processed/cpr.tif
work/data/processed/ice_score.tif
work/data/processed/ice_class.tif
work/data/processed/slope_deg.tif
work/data/processed/hazard_score.tif
```

Choose:

- landing pixel: low slope, low hazard, outside the most dangerous crater floor terrain
- goal pixel: high-confidence ice class inside the doubly shadowed crater

5. Run the traverse:

```bash
work/.venv/bin/python work/scripts/lunar_ice_pipeline.py traverse \
  --config work/config/project_config.yaml \
  --start-row LANDING_ROW \
  --start-col LANDING_COL \
  --goal-row TARGET_ROW \
  --goal-col TARGET_COL
```

6. Build the final map set:

- CPR map
- DOP map
- ice-confidence map
- ice-classification map with rough false positives marked
- OHRC context / roughness map
- slope and hazard maps
- landing-site suitability map
- rover traverse map
- ice-volume table

## Interpretation Rules

Use this wording discipline in the report and presentation:

- Say "high-probability subsurface ice candidate," not "confirmed ice."
- Say "high CPR is necessary but not sufficient," because rough rocky terrain can mimic ice.
- Treat PSR / doubly shadowed location as a habitat constraint, not direct proof of water ice.
- Report volume as a range using saturation scenarios, not a single precise number.
- Clearly separate high-confidence targets from moderate-confidence and unreliable rough-terrain detections.

## Core Claim

The strongest candidate ice pixels are those that simultaneously satisfy:

```text
CPR > 1.0
DOP < 0.13
inside PSR / doubly shadowed crater
low-to-moderate DEM roughness
low OHRC texture / boulder proxy
reachable from a low-hazard landing zone
```

High CPR pixels with high DOP or high OHRC texture should be treated as rough-terrain false positives, not primary science targets.

## Presentation Storyboard

1. Problem: lunar south-pole ice matters for ISRU, but radar detections are ambiguous.
2. Data: Chandrayaan-2 DFSAR for radar ice signatures, OHRC for surface morphology, DEM for slopes, PSR mask for cold-trap context.
3. Method: compute CPR and DOP, fuse evidence into an interpretable ice score, reject rocky false positives.
4. Result: show high-confidence ice candidates in the doubly shadowed crater.
5. Mission design: select a safe landing site near the target and compute a hazard-aware A* rover route.
6. Resource estimate: report 0-5 m ice volume for conservative, moderate, and optimistic saturation.
7. Limitations: no ground truth, no exact depth discrimination, no composition specificity, uniform saturation assumption.

## Final Result Template

```text
We identified high-confidence subsurface ice candidates within the assigned doubly shadowed crater where CPR exceeds 1.0 and DOP remains below 0.13. These pixels occur inside the PSR and are not coincident with the strongest OHRC/DEM roughness signals, reducing the chance that they are rocky false positives.

The proposed landing site is located at [coordinates / pixel], selected for low slope, low hazard score, and proximity to the science target. The A* rover traverse reaches the selected ice-bearing target over [distance] while avoiding hard-hazard cells such as steep slopes and high-roughness terrain.

Within the upper 5 m of regolith, the high-confidence target area corresponds to [area] m2. Assuming 5%, 10%, and 20% volumetric ice fractions, the estimated accessible ice volume is [low], [medium], and [high] m3 respectively.
```

## Known Limitations to State

- Orbital radar cannot unambiguously confirm water ice without ground truth.
- CPR can be elevated by surface roughness, blocky ejecta, or volume scattering.
- The current model estimates presence and accessible volume, not precise ice depth.
- The saturation fractions are scenario assumptions and should be treated as uncertainty bounds.
- Illumination and solar power constraints are represented through PSR / shadow context, not a full time-dependent power simulation.

## High-Value Extensions if Time Remains

- Cluster high-confidence pixels into named ice nodes and rank them by accessibility.
- Run sensitivity tests by varying CPR, DOP, and ice-score thresholds.
- Add a landing-site ranking table with slope, hazard, distance-to-target, and communication/illumination notes.
- Convert the traverse CSV into a QGIS line layer for cleaner final visualization.
- Add a small uncertainty panel showing how volume changes with 5%, 10%, and 20% ice fractions.
