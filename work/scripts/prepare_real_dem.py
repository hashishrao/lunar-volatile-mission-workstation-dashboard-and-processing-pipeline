#!/usr/bin/env python3
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling

def main():
    dtm_path = "work/data/raw/tmc data/derived/20090516/ch1_tmc_ndn_20090516T0258251397_d_dtm_d18.tif"
    ref_path = "work/data/raw/dfsar_same_circular.tif"
    out_path = "work/data/raw/dem.tif"
    
    print(f"Reprojecting and aligning TMC DTM from {dtm_path} to {ref_path}...")
    
    with rasterio.open(ref_path) as ref:
        ref_profile = ref.profile.copy()
        ref_data = ref.read(1)
        
    with rasterio.open(dtm_path) as src:
        aligned = np.empty_like(ref_data, dtype='float32')
        reproject(
            source=rasterio.band(src, 1),
            destination=aligned,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=ref_profile['transform'],
            dst_crs=ref_profile['crs'],
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan
        )
        
    ref_profile.update(
        dtype='float32',
        nodata=np.nan,
        compress='deflate'
    )
    
    print(f"Writing aligned DEM to {out_path}...")
    with rasterio.open(out_path, "w", **ref_profile) as dst:
        dst.write(aligned, 1)
        
    print("DEM alignment complete!")

if __name__ == "__main__":
    main()
