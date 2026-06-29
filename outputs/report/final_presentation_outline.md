# Final Presentation Outline

## Slide 1: Problem and Mission Relevance

- Lunar south polar PSRs may preserve water ice.
- Doubly shadowed craters are especially cold and scientifically valuable.
- Goal: detect subsurface ice and convert that detection into landing/traverse decisions.

## Slide 2: Datasets

- Chandrayaan-2 DFSAR radar data
- Chandrayaan-2 OHRC imagery
- DEM-derived slope and roughness
- PSR / illumination mask

## Slide 3: Method Overview

- Radar ice screening using CPR and DOP
- OHRC/DEM false-positive rejection
- Hazard and landing-site suitability analysis
- A* rover traverse planning
- Ice volume estimation in top 5 m

## Slide 4: Radar Detection

- CPR = same-sense / opposite-sense circular return
- Candidate rule: CPR > 1 and DOP < 0.13
- Explain why CPR alone is ambiguous.

## Slide 5: False Positive Rejection

- High CPR can be caused by rough blocky terrain.
- Use OHRC texture, DEM roughness, and slope to reject rocky false positives.
- Final ice candidates must be radar-bright and terrain-consistent.

## Slide 6: Ice Probability Map

- Show high-confidence and moderate-confidence zones.
- Mark likely rough-terrain false positives separately.

## Slide 7: Landing Site

- Show selected landing zone.
- Include slope, roughness, illumination, and distance-to-target reasoning.

## Slide 8: Rover Traverse

- Show A* path from landing site to target.
- Report path distance, max slope, hazard avoidance, and science stops.

## Slide 9: Ice Volume Estimate

- Formula: area * 5 m * ice fraction
- Report conservative, moderate, optimistic scenarios.

## Slide 10: Conclusion

- State highest-confidence target.
- State selected landing site.
- State traverse feasibility.
- State estimated accessible ice range.
- Mention limitations and next validation steps.

