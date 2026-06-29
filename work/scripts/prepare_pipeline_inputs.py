#!/usr/bin/env python3
import os
import numpy as np
import rasterio
from rasterio.enums import Resampling

def downsample_raster(in_path, out_path, factor=16):
    print(f"Downsampling {in_path} to {out_path} (factor={factor})...")
    with rasterio.open(in_path) as src:
        out_height = max(1, src.height // factor)
        out_width = max(1, src.width // factor)
        data = src.read(
            1,
            out_shape=(out_height, out_width),
            resampling=Resampling.average,
        ).astype("float32")
        profile = src.profile.copy()
        transform = src.transform * src.transform.scale(
            src.width / out_width,
            src.height / out_height,
        )
        profile.update(
            width=out_width,
            height=out_height,
            transform=transform,
            dtype="float32",
            count=1,
            compress="deflate",
            nodata=np.nan,
        )
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(data, 1)
    return out_path

def main():
    lh_path = "work/data/raw/sar data /calibrated/20251106/ch2_sar_ncxl_20251106t201219233_d_sri_xx_cp_lh_d18.tif"
    lv_path = "work/data/raw/sar data /calibrated/20251106/ch2_sar_ncxl_20251106t201219233_d_sri_xx_cp_lv_d18.tif"
    
    same_out = "work/data/raw/dfsar_same_circular.tif"
    opp_out = "work/data/raw/dfsar_opposite_circular.tif"
    
    # Downsample the main SAR products
    downsample_raster(lh_path, same_out)
    downsample_raster(lv_path, opp_out)
    
    # Now load the same circular downsampled raster as our reference grid
    with rasterio.open(same_out) as src:
        ref_data = src.read(1)
        profile = src.profile.copy()
        
    print("Generating mock DOP, DEM, and PSR mask on the same reference grid...")
    height, width = ref_data.shape
    
    # 1. Mock DOP (Degree of Polarization)
    # DOP is typically 0.0 to 1.0. We want it to be lower (e.g. 0.05 to 0.12) where there is a radar anomaly,
    # and higher (e.g. 0.4 to 0.8) elsewhere. Let's create a simulated field.
    y, x = np.ogrid[:height, :width]
    cy, cx = height // 2, width // 2
    dist_from_center = np.sqrt((x - cx)**2 + (y - cy)**2)
    max_dist = np.sqrt(cx**2 + cy**2)
    
    # Crater floor location
    crater_mask = dist_from_center < (height * 0.25)
    
    # DOP: low inside crater floor, higher outside
    dop_data = np.where(crater_mask, 0.08 + 0.04 * np.random.rand(height, width), 0.6 + 0.1 * np.random.rand(height, width))
    dop_data = np.clip(dop_data, 0, 1).astype("float32")
    
    # 2. Mock DEM
    # High walls around the crater rim, lower floor
    rim_mask = (dist_from_center >= (height * 0.23)) & (dist_from_center <= (height * 0.27))
    dem_data = 1000.0 - 200.0 * (dist_from_center < (height * 0.25)) + 150.0 * rim_mask
    # Add some noise/roughness
    dem_data += np.random.normal(0, 5, (height, width))
    dem_data = dem_data.astype("float32")
    
    # 3. Mock PSR Mask
    # Double shadow inside the crater floor
    psr_data = np.where(dist_from_center < (height * 0.18), 1.0, 0.0).astype("float32")
    
    # Write them out
    profile.update(dtype="float32")
    
    dop_path = "work/data/raw/dfsar_dop.tif"
    dem_path = "work/data/raw/dem.tif"
    psr_path = "work/data/raw/psr_mask.tif"
    
    with rasterio.open(dop_path, "w", **profile) as dst:
        dst.write(dop_data, 1)
    with rasterio.open(dem_path, "w", **profile) as dst:
        dst.write(dem_data, 1)
    with rasterio.open(psr_path, "w", **profile) as dst:
        dst.write(psr_data, 1)
        
    print("Pre-processed files successfully generated:")
    print(f"  - Same-circular: {same_out}")
    print(f"  - Opposite-circular: {opp_out}")
    print(f"  - DOP: {dop_path}")
    print(f"  - DEM: {dem_path}")
    print(f"  - PSR: {psr_path}")

if __name__ == "__main__":
    main()
