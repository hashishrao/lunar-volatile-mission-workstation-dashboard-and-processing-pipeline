#!/usr/bin/env python3
"""Create dashboard-ready SAR screening products from projected DFSAR LH/LV rasters.

The supplied projected Chandrayaan-2 files often arrive as LH and LV channels.
Those are useful for a radar anomaly screening view, but they are not renamed
as "same circular" and "opposite circular" here because that interpretation
depends on product mode and calibration details. This script therefore writes:

- radar_ratio_lh_lv.tif: LH / LV intensity ratio
- polarization_contrast_proxy.tif: abs(LH - LV) / (LH + LV)
- radar_power_proxy.tif: LH + LV

Use these as provisional visualization and QA layers until true CPR/DOP inputs
or a verified hybrid-pol/Stokes processing path is available.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path("work/.matplotlib").resolve()))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.enums import Resampling


EPS = 1e-6


def read_downsampled(path: Path, factor: int) -> tuple[np.ndarray, dict]:
    with rasterio.open(path) as src:
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
            tiled=True,
            blockxsize=256,
            blockysize=256,
            nodata=np.nan,
        )
    data = np.where(data <= 0, np.nan, data)
    return data, profile


def write_raster(path: Path, data: np.ndarray, profile: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data.astype("float32"), 1)


def robust_display(data: np.ndarray) -> np.ndarray:
    valid = np.isfinite(data)
    out = np.zeros_like(data, dtype="float32")
    if not np.any(valid):
        return out
    lo, hi = np.nanpercentile(data, [2, 98])
    out[valid] = np.clip((data[valid] - lo) / max(hi - lo, EPS), 0, 1)
    return out


def save_quicklook(path: Path, ratio: np.ndarray, contrast: np.ndarray, power: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 3, figsize=(14, 5), constrained_layout=True)
    layers = [
        ("LH/LV ratio proxy", ratio, "magma"),
        ("Polarization contrast proxy", contrast, "viridis"),
        ("Radar power proxy", power, "gray"),
    ]
    for ax, (title, data, cmap) in zip(axes, layers):
        im = ax.imshow(robust_display(data), cmap=cmap)
        ax.set_title(title)
        ax.set_xticks([])
        ax.set_yticks([])
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    fig.savefig(path, dpi=180)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--lh",
        default="work/data/raw/data/calibrated/20251106/ch2_sar_ncxl_20251106t201219233_d_sri_xx_cp_lh_d18.tif",
        help="Projected LH channel GeoTIFF.",
    )
    parser.add_argument(
        "--lv",
        default="work/data/raw/data/calibrated/20251106/ch2_sar_ncxl_20251106t201219233_d_sri_xx_cp_lv_d18.tif",
        help="Projected LV channel GeoTIFF.",
    )
    parser.add_argument(
        "--factor",
        type=int,
        default=16,
        help="Downsample factor for manageable dashboard/QGIS products.",
    )
    parser.add_argument("--out-dir", default="work/data/processed/sar_preview")
    parser.add_argument("--fig-dir", default="outputs/figures")
    args = parser.parse_args()

    if args.factor < 1:
        raise SystemExit("--factor must be >= 1")

    lh, profile = read_downsampled(Path(args.lh), args.factor)
    lv, _ = read_downsampled(Path(args.lv), args.factor)

    ratio = lh / np.maximum(lv, EPS)
    contrast = np.abs(lh - lv) / np.maximum(lh + lv, EPS)
    power = lh + lv

    out_dir = Path(args.out_dir)
    write_raster(out_dir / "radar_ratio_lh_lv.tif", ratio, profile)
    write_raster(out_dir / "polarization_contrast_proxy.tif", contrast, profile)
    write_raster(out_dir / "radar_power_proxy.tif", power, profile)
    save_quicklook(Path(args.fig_dir) / "sar_screening_quicklook.png", ratio, contrast, power)

    print(f"Wrote SAR screening rasters to: {out_dir}")
    print(f"Wrote quicklook: {Path(args.fig_dir) / 'sar_screening_quicklook.png'}")
    print("Note: these are LH/LV screening proxies, not validated CPR/DOP products.")


if __name__ == "__main__":
    main()
