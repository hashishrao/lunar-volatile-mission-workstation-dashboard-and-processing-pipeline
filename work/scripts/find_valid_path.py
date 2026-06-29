#!/usr/bin/env python3
import sys
from pathlib import Path
import numpy as np
import rasterio

# Add scripts directory to path
sys.path.append(str(Path(__file__).parent))
from lunar_ice_pipeline import astar_path

def main():
    print("Finding valid traversable corridor on real hazard map...")
    hazard_path = "work/data/processed/hazard_score.tif"
    hard_hazard_path = "work/data/processed/hard_hazard.tif"
    ice_path = "work/data/processed/ice_score.tif"
    
    with rasterio.open(hazard_path) as hz_src, rasterio.open(hard_hazard_path) as hh_src, rasterio.open(ice_path) as ice_src:
        hz = hz_src.read(1)
        hh = hh_src.read(1)
        ice = ice_src.read(1)
        profile = hz_src.profile.copy()
        
    h, w = hz.shape
    
    # We know the best ice target is around [658, 1083]
    goal = (658, 1083)
    
    # Let's search locally within the floor grid with step search
    # to find a start coordinate that can connect safely to goal
    path_cells = None
    selected_start = None
    
    print("Searching locally for closest safe start...")
    for dr in range(-120, 120, 20):
        for dc in range(-120, 120, 20):
            start = (goal[0] + dr, goal[1] + dc)
            if 0 <= start[0] < h and 0 <= start[1] < w:
                if hz[start] < 0.25 and hh[start] < 0.5: # Safe terrain and not a hard hazard
                    try:
                        path_cells = astar_path(hz, hh, start, goal)
                        if path_cells and len(path_cells) > 5: # Valid path of decent size
                            selected_start = start
                            print(f"Success! Found route from {start} to {goal} of length {len(path_cells)}")
                            break
                    except ValueError:
                        continue
        if path_cells:
            break
                
    if path_cells:
        # Save to rover_traverse_cells.csv
        out_csv = "work/data/processed/rover_traverse_cells.csv"
        import csv
        with open(out_csv, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["row", "col"])
            for cell in path_cells:
                writer.writerow([cell[0], cell[1]])
        print(f"Traverse corridor successfully saved to {out_csv}")
    else:
        print("Error: Could not find any traversable corridor!")

if __name__ == "__main__":
    main()
