#!/usr/bin/env python3
import json
import csv
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from skimage.exposure import equalize_adapthist

def read_and_downsample(path, out_width=150):
    with rasterio.open(path) as src:
        out_height = int(src.height * (out_width / src.width))
        data = src.read(
            1,
            out_shape=(out_height, out_width),
            resampling=Resampling.average,
        ).astype("float32")
        
        data = np.where(np.isnan(data) | np.isinf(data), 0, data)
        
        # Apply Contrast Limited Adaptive Histogram Equalization (CLAHE)
        d_min, d_max = np.min(data), np.max(data)
        if d_max > d_min:
            norm = (data - d_min) / (d_max - d_min)
            # Enhance local details like crater rims and slopes
            enhanced = equalize_adapthist(norm, clip_limit=0.02)
        else:
            enhanced = np.zeros_like(data)
            
        return enhanced.tolist(), src.height, src.width, out_height, out_width

def read_and_downsample_ohrc(path, ref_path, out_width=150):
    with rasterio.open(path) as src, rasterio.open(ref_path) as ref:
        aligned = np.empty((ref.height, ref.width), dtype='float32')
        reproject(
            source=rasterio.band(src, 1),
            destination=aligned,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=ref.transform,
            dst_crs=ref.crs,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=0
        )
        
        out_height = int(ref.height * (out_width / ref.width))
        factor = ref.width // out_width
        downscaled = aligned[::factor, ::factor]
        downscaled = downscaled[:out_height, :out_width]
        
        downscaled = np.where(np.isnan(downscaled) | np.isinf(downscaled), 0, downscaled)
        
        # Apply CLAHE to reveal the faint textures in shadowed craters
        d_min, d_max = np.min(downscaled), np.max(downscaled)
        if d_max > d_min:
            norm = (downscaled - d_min) / (d_max - d_min)
            enhanced = equalize_adapthist(norm, clip_limit=0.03)
        else:
            enhanced = np.zeros_like(downscaled)
            
        return enhanced.tolist()

def main():
    print("Downsampling, enhancing contrast (CLAHE), and exporting rasters for dashboard...")
    ref_path = "work/data/raw/dfsar_same_circular.tif"
    
    dem_arr, orig_h, orig_w, target_h, target_w = read_and_downsample("work/data/raw/dem.tif")
    cpr_arr, _, _, _, _ = read_and_downsample("work/data/processed/cpr.tif")
    dop_arr, _, _, _, _ = read_and_downsample("work/data/raw/dfsar_dop.tif")
    ice_score_arr, _, _, _, _ = read_and_downsample("work/data/processed/ice_score.tif")
    ice_class_arr, _, _, _, _ = read_and_downsample("work/data/processed/ice_class.tif")
    hazard_score_arr, _, _, _, _ = read_and_downsample("work/data/processed/hazard_score.tif")
    
    # Process and align real OHRC surface imagery with CLAHE enhancement
    ohrc_arr = read_and_downsample_ohrc("work/data/raw/ohrc_image.tif", ref_path)
    
    # Load rover traverse path
    route = []
    route_path = "work/data/processed/rover_traverse_cells.csv"
    try:
        with open(route_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                r = float(row["row"])
                c = float(row["col"])
                scaled_r = r * (target_h / orig_h)
                scaled_c = c * (target_w / orig_w)
                route.append({"r": scaled_r, "c": scaled_c})
    except Exception as exc:
        print(f"Warning: Could not load route from {route_path}: {exc}")

    output_data = {
        "width": target_w,
        "height": target_h,
        "dem": dem_arr,
        "ohrc": ohrc_arr,
        "cpr": cpr_arr,
        "dop": dop_arr,
        "ice_score": ice_score_arr,
        "ice_class": ice_class_arr,
        "hazard_score": hazard_score_arr,
        "route": route
    }
    
    out_json = "dashboard/data.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(output_data, f)
        
    print(f"Successfully wrote dashboard data to {out_json} ({target_w}x{target_h})")

if __name__ == "__main__":
    main()
