# Dataset Selection Checklist

Use the portal in this order: **Map Browse -> SAR -> OHRC**.

## 1. Map Browse

Use **Map Browse** first. Do not start by bulk-downloading folders.

Goal:

- visually locate the assigned south polar region
- identify the doubly shadowed crater or crater floor ROI
- note approximate center latitude/longitude
- note product IDs, orbit IDs, or tile names that cover the crater
- check whether browse layers already show SAR and OHRC footprints

Record:

```text
ROI name / crater:
Approximate center latitude:
Approximate center longitude:
SAR product IDs:
OHRC product IDs:
Notes on shadows / crater morphology:
```

## 2. SAR

Use **SAR** for the ice-detection framework.

Prefer products that are:

- closest to the crater ROI
- L-band and/or S-band DFSAR coverage over the same target
- radiometrically calibrated if available
- map-projected / terrain-corrected if available
- full polarimetric or dual-circular products if available

Minimum useful SAR files:

```text
same-sense circular return
opposite-sense circular return
DOP or polarimetric product from which DOP can be derived
```

If the SAR product is in linear polarization channels rather than circular channels, keep all available polarimetric bands. CPR and related features may need to be derived from the scattering matrix or Stokes parameters instead of a direct same/opposite circular ratio.

Use SAR outputs for:

- CPR map
- DOP map
- radar ice-confidence score
- rough-terrain false-positive checks

## 3. OHRC

Use **OHRC** for high-resolution surface characterization and traverse planning.

Prefer products that:

- overlap the SAR ROI
- cover both crater interior and possible landing area
- have the best available spatial resolution
- are map-projected or have usable geometry metadata

Use OHRC for:

- boulder/rock abundance proxy
- local texture and roughness proxy
- crater wall/floor morphology
- identifying safe landing zones
- checking rover path hazards

## 4. Optional Supporting Products

If available, also download:

- DEM or TMC-2 stereo/terrain product for slope
- illumination or PSR mask
- SPICE geometry if illumination modeling is required

If DEM or PSR masks are not supplied, create approximate versions in QGIS or document them as assumptions.

## 5. Recommended Local Naming

After downloading, place files under:

```text
work/data/raw/
```

Suggested names:

```text
work/data/raw/sar_same_circular.tif
work/data/raw/sar_opposite_circular.tif
work/data/raw/sar_dop.tif
work/data/raw/ohrc_image.tif
work/data/raw/dem.tif
work/data/raw/psr_mask.tif
```

Then edit:

```text
work/config/project_config.yaml
```

## 6. Inspect Downloaded Files

Run:

```bash
work/.venv/bin/python work/scripts/inspect_downloads.py work/data/raw
```

Use the output to confirm:

- raster sizes
- number of bands
- CRS/projection
- bounds/overlap
- nodata values

## 7. Decision Rule

For the final project, prioritize fewer well-aligned products over many mismatched products.

Best case:

```text
SAR and OHRC overlap the same doubly shadowed crater,
SAR provides polarimetric evidence,
OHRC verifies that high-CPR regions are not simply rough/boulder-rich terrain.
```

