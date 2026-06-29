# Quickstart

## 1. Put Data in Place

Use the portal in this order:

```text
Map Browse -> SAR -> OHRC
```

Map Browse is only for visual selection of the crater/ROI and product IDs. SAR is the primary dataset for subsurface ice detection. OHRC is the primary dataset for landing-site characterization and rover traverse hazards.

Copy or link the supplied files into:

```text
work/data/raw/
```

Then edit:

```text
work/config/project_config.yaml
```

Update these paths:

```text
dfsar_same_circular
dfsar_opposite_circular
dfsar_dop
ohrc_image
dem
psr_mask
```

If DOP or PSR masks are not supplied directly, create them first in QGIS, MIDAS, ENVI, or a preprocessing notebook and point the config to those derived rasters.

For a fuller download checklist, see:

```text
outputs/report/dataset_selection_checklist.md
```

## 2. Install Python Packages

From the project root:

```bash
python3 -m venv work/.venv
work/.venv/bin/python -m pip install -r work/requirements.txt
```

If GDAL/rasterio installation is difficult during the hackathon, use QGIS or conda for raster preprocessing and keep this script for scoring, volume estimation, and traverse planning.

## 2A. Inspect Downloads

After downloading SAR/OHRC products:

```bash
work/.venv/bin/python work/scripts/inspect_downloads.py work/data/raw
```

Use the printed band count, CRS, bounds, and nodata values to decide which downloaded file maps to each config field.

## 3. Generate Ice and Hazard Products

```bash
work/.venv/bin/python work/scripts/lunar_ice_pipeline.py products --config work/config/project_config.yaml
```

Expected outputs:

```text
work/data/processed/cpr.tif
work/data/processed/ice_score.tif
work/data/processed/ice_class.tif
work/data/processed/hazard_score.tif
work/data/processed/ice_volume_estimates.csv
outputs/figures/cpr_quicklook.png
outputs/figures/ice_score_quicklook.png
outputs/figures/hazard_score_quicklook.png
```

## 4. Pick Landing and Target Pixels

Open these in QGIS:

```text
work/data/processed/ice_class.tif
work/data/processed/hazard_score.tif
work/data/processed/slope_deg.tif
```

Choose:

- landing pixel: low hazard, low slope, near crater but not in dangerous terrain
- goal pixel: high-confidence ice class, scientifically valuable, reachable

Record their raster row/column values.

## 5. Run Rover Traverse

Example:

```bash
work/.venv/bin/python work/scripts/lunar_ice_pipeline.py traverse \
  --config work/config/project_config.yaml \
  --start-row 120 \
  --start-col 85 \
  --goal-row 260 \
  --goal-col 190
```

Output:

```text
work/data/processed/rover_traverse_cells.csv
```

Import this path into QGIS or convert the cells into map coordinates for the final traverse map.

## 6. Final Story

Your final result should make this argument:

```text
We used DFSAR CPR and DOP to identify radar ice candidates,
used OHRC/DEM roughness to reject rocky false positives,
selected a nearby safe landing site,
planned a hazard-aware rover traverse,
and estimated the accessible ice volume in the top 5 m.
```
