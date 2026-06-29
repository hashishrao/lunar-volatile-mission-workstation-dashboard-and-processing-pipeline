# Detection and Characterization of Subsurface Ice in the Faustini Crater PSR

## Objective

Identify high-probability subsurface ice-bearing regions in the Faustini crater (41 km diameter, hosting a 664 km² permanently shadowed region/PSR) using Chandrayaan-2 DFSAR radar data, Chandrayaan-2 OHRC imagery, terrain constraints, and illumination constraints. Use the mapped target to select a safe landing site, design a rover traverse, and estimate ice volume within the upper 5 m of regolith.

## Working Hypothesis

Subsurface ice candidates should show radar behavior consistent with enhanced volume scattering while avoiding surface backscatter signatures better explained by blocky impact ejecta or rough terrain. In alignment with recent observations (e.g., Williams et al., 2024; Mini-RF), high CPR alone is not sufficient evidence for ice because young, boulder-rich craters also exhibit elevated CPR. The preferred detection criteria are:

```text
CPR > 1.0 (indicating enhanced backscatter)
DOP < 0.13 (consistent with high volume scattering / depolarization)
inside PSR / cold trap boundaries
low-to-moderate terrain roughness (to filter out boulder-rich ejecta)
not coincident with steep slopes (>15 degrees)
```

## Processing Workflow

1. Import DFSAR, OHRC, DEM, and PSR mask products.
2. Reproject and co-register all rasters to a common lunar south polar projection.
3. Compute Circular Polarization Ratio:

```text
CPR = same-sense circular return / opposite-sense circular return
```

4. Use supplied or derived Degree of Polarization.
5. Generate OHRC texture and DEM roughness maps as roughness and boulder-density proxies.
6. Generate slope map from DEM.
7. Compute ice-confidence score:

```text
ice_score =
  0.35 * normalized_CPR
+ 0.30 * inverse_normalized_DOP
+ 0.20 * PSR_mask
+ 0.15 * low_roughness_score
```

8. Classify pixels:

```text
2  = high-confidence ice candidate
1  = moderate-confidence ice candidate
0  = background / low-confidence
-1 = likely rough-terrain false positive
```

9. Compute terrain hazard score:

```text
hazard_score =
  0.40 * slope_score
+ 0.25 * roughness_score
+ 0.20 * shadow_score
+ 0.15 * boulder_proxy
```

10. Select landing zone from low-slope, low-roughness terrain near the crater but outside severe hazard zones.
11. Plan rover traverse using A* over the hazard-cost raster.
12. Estimate ice volume:

```text
ice_volume = high_confidence_area * 5 m * ice_fraction
```

Report conservative, moderate, and optimistic ice fractions rather than a single unsupported value.

## Expected Maps

- DFSAR CPR map
- DOP map
- Ice-confidence map
- Ice-classification map
- OHRC roughness / boulder proxy map
- DEM slope map
- Terrain hazard map
- Landing-site suitability map
- Rover traverse map
- Ice volume estimate table

## Validation Logic

The key validation step is separating ice-like radar signatures from rough-terrain false positives:

```text
Likely ice:
high CPR + low DOP + PSR location + low roughness

Likely rocky false positive:
high CPR + high DOP or high OHRC/DEM roughness
```

## Final Result Statement Template

The selected doubly shadowed crater contains high-confidence subsurface ice candidates concentrated in [location/region]. These zones satisfy CPR > 1 and DOP < 0.13 while showing comparatively low OHRC/DEM roughness, reducing the likelihood that the detections are caused by blocky terrain. A safe landing site is proposed at [landing coordinates], located [distance] from the target region. The planned rover traverse avoids slopes above [threshold] degrees and reaches the science target over a distance of [distance]. The estimated ice volume in the upper 5 m is [range] m3, depending on the assumed volumetric ice fraction.

