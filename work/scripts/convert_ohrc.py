#!/usr/bin/env python3
import math
import numpy as np
import rasterio
from rasterio.transform import Affine

def main():
    img_path = "work/data/raw/ohr data/calibrated/20211228/ch2_ohr_ncp_20211228T2209123959_d_img_d18.img"
    out_path = "work/data/raw/ohrc_image.tif"
    
    width = 12000
    height = 79796
    
    print(f"Reading raw binary data from {img_path}...")
    # Load 1D uint8 array
    data_1d = np.fromfile(img_path, dtype=np.uint8)
    expected_size = width * height
    if len(data_1d) != expected_size:
        print(f"Warning: File size {len(data_1d)} does not match expected {expected_size}")
        # clip/pad if necessary
        if len(data_1d) > expected_size:
            data_1d = data_1d[:expected_size]
        else:
            data_1d = np.pad(data_1d, (0, expected_size - len(data_1d)), 'constant')
            
    # Reshape to 2D
    data = data_1d.reshape((height, width))
    
    # Downsample by factor of 16
    factor = 16
    print(f"Downsampling by factor of {factor}...")
    data_down = data[::factor, ::factor]
    h_down, w_down = data_down.shape
    
    # Calculate transform for original resolution:
    # Corner coordinates to projected map coordinates
    R = 1737400.0
    
    def latlon_to_xy(lat_deg, lon_deg):
        phi = math.radians(lat_deg)
        lam = math.radians(lon_deg)
        # Polar stereographic (South Pole)
        d = 2.0 * R * math.tan(math.pi / 4.0 + phi / 2.0)
        x = d * math.sin(lam)
        y = d * math.cos(lam)
        return x, y

    # Corner coords from XML:
    # UL: -89.923132, 55.564452
    # UR: -89.850542, 110.416030
    # LL: -89.257559, 233.745958
    x_ul, y_ul = latlon_to_xy(-89.923132, 55.564452)
    x_ur, y_ur = latlon_to_xy(-89.850542, 110.416030)
    x_ll, y_ll = latlon_to_xy(-89.257559, 233.745958)
    
    # original transform
    a = (x_ur - x_ul) / width
    d = (y_ur - y_ul) / width
    b = (x_ll - x_ul) / height
    e = (y_ll - y_ul) / height
    c = x_ul
    f = y_ul
    
    # downsampled transform has coefficients scaled by the factor
    transform_down = Affine(a * factor, b * factor, c, d * factor, e * factor, f)
    
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
        "dtype": "uint8",
        "nodata": None,
        "width": w_down,
        "height": h_down,
        "count": 1,
        "crs": crs_wkt,
        "transform": transform_down,
        "compress": "lzw"
    }
    
    print(f"Writing downsampled GeoTIFF to {out_path} ({w_down}x{h_down})...")
    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(data_down, 1)
        
    print("Conversion complete!")

if __name__ == "__main__":
    main()
