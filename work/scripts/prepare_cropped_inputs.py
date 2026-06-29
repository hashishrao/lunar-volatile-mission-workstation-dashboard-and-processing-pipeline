#!/usr/bin/env python3
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from rasterio.windows import from_bounds as win_from_bounds

def crop_and_align():
    ohrc_raw = "work/data/raw/ohrc_image.tif"
    lh_raw = "work/data/raw/sar data /calibrated/20251106/ch2_sar_ncxl_20251106t201219233_d_sri_xx_cp_lh_d18.tif"
    lv_raw = "work/data/raw/sar data /calibrated/20251106/ch2_sar_ncxl_20251106t201219233_d_sri_xx_cp_lv_d18.tif"
    
    # We want a common grid covering the OHRC bounds:
    # bounds: left=-18158.062, bottom=-16215.012, right=4247.385, top=1318.072
    left, bottom, right, top = -18158.0, -16215.0, 4247.0, 1318.0
    
    # Let's define the target resolution: ~10 meters/pixel (makes it 2240 x 1753 pixels)
    dst_res = 10.0
    width = int((right - left) / dst_res)
    height = int((top - bottom) / dst_res)
    
    dst_transform = from_bounds(left, bottom, right, top, width, height)
    
    # CRS string corresponding to POLARSTEREOGRAPHIC MOON
    crs_wkt = (
        'PROJCS["POLARSTEREOGRAPHIC MOON",'
        'GEOGCS["GCS_MOON",'
        'DATUM["D_MOON",SPHEROID["MOON_polarRadius",1737400,0]],'
        'PRIMEM["Reference_Meridian",0],'
        'UNIT["degree",0.0174532925199433]],'
        'PROJECTION["Polar_Stereographic"],'
        'PARAMETER["latitude_of_origin",-90],'
        'PARAMETER["central_meridian",0],'
        'PARAMETER["false_easting",0],'
        'PARAMETER["false_northing",0],'
        'UNIT["metre",1]]'
    )
    
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "nodata": np.nan,
        "width": width,
        "height": height,
        "count": 1,
        "crs": crs_wkt,
        "transform": dst_transform,
        "compress": "lzw"
    }
    
    print(f"Targeting cropped crop-grid: {width} x {height} pixels...")
    
    # 1. Reproject and Crop OHRC Image
    print("Cropping and aligning OHRC imagery...")
    ohrc_aligned = np.zeros((height, width), dtype='float32')
    with rasterio.open(ohrc_raw) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=ohrc_aligned,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs=crs_wkt,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan
        )
    # Write to target path
    profile.update(dtype="float32", nodata=np.nan)
    with rasterio.open("work/data/raw/ohrc_image.tif", "w", **profile) as dst:
        dst.write(ohrc_aligned, 1)

    # 2. Reproject and Crop SAR LH / LV
    print("Cropping and aligning SAR LH same-circular...")
    lh_aligned = np.zeros((height, width), dtype='float32')
    with rasterio.open(lh_raw) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=lh_aligned,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs=crs_wkt,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan
        )
    with rasterio.open("work/data/raw/dfsar_same_circular.tif", "w", **profile) as dst:
        dst.write(lh_aligned, 1)
        
    print("Cropping and aligning SAR LV opposite-circular...")
    lv_aligned = np.zeros((height, width), dtype='float32')
    with rasterio.open(lv_raw) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=lv_aligned,
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=dst_transform,
            dst_crs=crs_wkt,
            resampling=Resampling.bilinear,
            src_nodata=src.nodata,
            dst_nodata=np.nan
        )
    with rasterio.open("work/data/raw/dfsar_opposite_circular.tif", "w", **profile) as dst:
        dst.write(lv_aligned, 1)
        
    # 3. Generate Mock DOP, DEM and PSR aligned to this new cropped grid
    # Let's create a simulated crater in the middle of this cropped scene!
    print("Generating aligned mock DOP, DEM, and PSR mask inside this crop-grid...")
    y, x = np.ogrid[:height, :width]
    cy, cx = height // 2, width // 2
    dist_from_center = np.sqrt((x - cx)**2 + (y - cy)**2)
    
    # Study crater centered in our cropped scene
    crater_radius = width * 0.25
    crater_mask = dist_from_center < crater_radius
    rim_mask = (dist_from_center >= (crater_radius * 0.9)) & (dist_from_center <= (crater_radius * 1.1))
    
    # DEM (crater morphology)
    dem_data = 1000.0 - 300.0 * (dist_from_center < (crater_radius * 0.95)) + 150.0 * rim_mask
    dem_data += np.random.normal(0, 4, (height, width))
    dem_data = dem_data.astype("float32")
    
    # DOP (low inside shadowed floor)
    dop_data = np.where(dist_from_center < (crater_radius * 0.8), 0.08 + 0.04 * np.random.rand(height, width), 0.55 + 0.1 * np.random.rand(height, width))
    dop_data = dop_data.astype("float32")
    
    # PSR Mask (cold trap in bottom-left shadow of crater floor)
    # let's offset the cold trap slightly to match the shadowed side
    shadow_dist = np.sqrt((x - (cx - width*0.05))**2 + (y - (cy + height*0.05))**2)
    psr_data = np.where(shadow_dist < (crater_radius * 0.65), 1.0, 0.0).astype("float32")
    
    # Write them out
    with rasterio.open("work/data/raw/dem.tif", "w", **profile) as dst:
        dst.write(dem_data, 1)
    with rasterio.open("work/data/raw/dfsar_dop.tif", "w", **profile) as dst:
        dst.write(dop_data, 1)
    with rasterio.open("work/data/raw/psr_mask.tif", "w", **profile) as dst:
        dst.write(psr_data, 1)
        
    print("Crop and alignment complete!")

if __name__ == "__main__":
    crop_and_align()
