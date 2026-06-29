#!/usr/bin/env python3
"""Calculate CPR and DOP from Full Polarimetric (FP) HH, HV, VH, VV intensity channels.

This script implements the polarimetric translation from the linear basis
to circular polarization parameters (CPR and DOP) using Stokes approximations
for planetary radar intensity data.
"""

import numpy as np
import rasterio
from pathlib import Path

def main():
    data_dir = Path("work/data/raw/ch2_sar_ncxl_20191106t144032461_d_fp_d18/data/calibrated/20191106")
    out_dir = Path("work/data/processed/full_pol_derived")
    out_dir.mkdir(parents=True, exist_ok=True)
    
    hh_path = data_dir / "ch2_sar_ncxl_20191106t144032461_d_sri_xx_fp_hh_d18.tif"
    hv_path = data_dir / "ch2_sar_ncxl_20191106t144032461_d_sri_xx_fp_hv_d18.tif"
    vh_path = data_dir / "ch2_sar_ncxl_20191106t144032461_d_sri_xx_fp_vh_d18.tif"
    vv_path = data_dir / "ch2_sar_ncxl_20191106t144032461_d_sri_xx_fp_vv_d18.tif"
    
    print("Reading linear polarimetric channels...")
    with rasterio.open(hh_path) as src:
        hh = src.read(1).astype("float32")
        profile = src.profile.copy()
        
    with rasterio.open(hv_path) as src:
        hv = src.read(1).astype("float32")
        
    with rasterio.open(vh_path) as src:
        vh = src.read(1).astype("float32")
        
    with rasterio.open(vv_path) as src:
        vv = src.read(1).astype("float32")
        
    # Use average cross-pol for reciprocity check
    xpol = 0.5 * (hv + vh)
    
    print("Computing Stokes parameter approximations...")
    # S1: Total intensity
    S1 = hh + vv + 2.0 * xpol
    
    # S2: Linear polarization difference
    S2 = hh - vv
    
    # S3: 45-degree linear polarization (approximated from cross-pol correlation)
    S3 = 2.0 * xpol
    
    # S4: Circular polarization (imaginary correlation term, approximated)
    # Under circular transmit, same-sense (SC) and opposite-sense (OC) returns:
    # OC is dominated by single-bounce (HH + VV)
    # SC is dominated by double-bounce and volume scattering (cross-pol xpol)
    OC = 0.25 * (hh + vv)
    SC = xpol
    
    # Avoid division by zero
    eps = 1e-6
    cpr = SC / np.maximum(OC, eps)
    
    # DOP (Degree of Polarization) calculation from Stokes parameters
    DOP = np.sqrt(S2**2 + S3**2) / np.maximum(S1, eps)
    DOP = np.clip(DOP, 0.0, 1.0)
    
    # Write output rasters
    profile.update(dtype="float32", count=1, compress="deflate", nodata=np.nan)
    
    cpr_out = out_dir / "derived_cpr.tif"
    dop_out = out_dir / "derived_dop.tif"
    
    print(f"Writing derived CPR to {cpr_out}...")
    with rasterio.open(cpr_out, "w", **profile) as dst:
        dst.write(cpr, 1)
        
    print(f"Writing derived DOP to {dop_out}...")
    with rasterio.open(dop_out, "w", **profile) as dst:
        dst.write(DOP, 1)
        
    print("Full-polarimetric derivation complete!")

if __name__ == "__main__":
    main()
