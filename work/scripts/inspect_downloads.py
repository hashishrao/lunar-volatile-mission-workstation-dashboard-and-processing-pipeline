#!/usr/bin/env python3
"""Inspect downloaded Chandrayaan-2 raster products.

Run this after downloading SAR/OHRC/Map Browse products. It prints raster
metadata so the correct files can be mapped into project_config.yaml.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path("work/.matplotlib").resolve()))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

import rasterio


RASTER_EXTENSIONS = {
    ".tif",
    ".tiff",
    ".img",
    ".cub",
    ".vrt",
    ".jp2",
    ".h5",
    ".he5",
}


def iter_candidates(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in RASTER_EXTENSIONS:
            yield path


def describe(path: Path) -> str:
    try:
        with rasterio.open(path) as src:
            bounds = src.bounds
            return "\n".join(
                [
                    f"FILE: {path}",
                    f"  driver: {src.driver}",
                    f"  size: {src.width} x {src.height}",
                    f"  bands: {src.count}",
                    f"  crs: {src.crs}",
                    f"  transform: {src.transform}",
                    f"  bounds: left={bounds.left:.3f}, bottom={bounds.bottom:.3f}, right={bounds.right:.3f}, top={bounds.top:.3f}",
                    f"  dtypes: {', '.join(src.dtypes)}",
                    f"  nodata: {src.nodata}",
                ]
            )
    except Exception as exc:
        return f"FILE: {path}\n  unreadable by rasterio: {exc}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default="work/data/raw", help="Folder containing downloaded products.")
    args = parser.parse_args()

    root = Path(args.root)
    if not root.exists():
        raise SystemExit(f"Folder does not exist: {root}")

    files = list(iter_candidates(root))
    if not files:
        raise SystemExit(f"No candidate raster files found under {root}")

    for idx, path in enumerate(files):
        if idx:
            print()
        print(describe(path))


if __name__ == "__main__":
    main()

