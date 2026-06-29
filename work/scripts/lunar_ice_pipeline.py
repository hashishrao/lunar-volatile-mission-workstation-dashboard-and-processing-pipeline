#!/usr/bin/env python3
"""Radar, terrain, landing-site, traverse, and ice-volume workflow.

This script is intentionally conservative: it treats high CPR as only one
piece of evidence and downgrades rough or boulder-like terrain to avoid
confusing blocky ejecta with ice.
"""

from __future__ import annotations

import argparse
import heapq
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

os.environ.setdefault("MPLCONFIGDIR", str(Path("work/.matplotlib").resolve()))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)

import matplotlib.pyplot as plt
import numpy as np
import rasterio
import yaml
from rasterio.enums import Resampling
from rasterio.warp import reproject
from scipy.ndimage import generic_filter, sobel


EPS = 1e-6


@dataclass(frozen=True)
class RasterLayer:
    data: np.ndarray
    profile: dict


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def read_raster(path: Path) -> RasterLayer:
    with rasterio.open(path) as src:
        data = src.read(1).astype("float32")
        profile = src.profile.copy()
        nodata = src.nodata
    if nodata is not None:
        data = np.where(data == nodata, np.nan, data)
    return RasterLayer(data=data, profile=profile)


def write_raster(path: Path, data: np.ndarray, profile: dict) -> None:
    out_profile = profile.copy()
    out_profile.update(dtype="float32", count=1, compress="deflate", nodata=np.nan)
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, "w", **out_profile) as dst:
        dst.write(data.astype("float32"), 1)


def align_to_reference(source: RasterLayer, reference: RasterLayer) -> RasterLayer:
    aligned = np.empty_like(reference.data, dtype="float32")
    reproject(
        source=source.data,
        destination=aligned,
        src_transform=source.profile["transform"],
        src_crs=source.profile["crs"],
        dst_transform=reference.profile["transform"],
        dst_crs=reference.profile["crs"],
        resampling=Resampling.bilinear,
        src_nodata=np.nan,
        dst_nodata=np.nan,
    )
    return RasterLayer(data=aligned, profile=reference.profile.copy())


def robust_norm(data: np.ndarray, invert: bool = False) -> np.ndarray:
    valid = np.isfinite(data)
    out = np.zeros_like(data, dtype="float32")
    if not np.any(valid):
        return out
    lo, hi = np.nanpercentile(data, [2, 98])
    scaled = (data - lo) / max(hi - lo, EPS)
    scaled = np.clip(scaled, 0, 1)
    if invert:
        scaled = 1 - scaled
    out[valid] = scaled[valid]
    return out


def local_std(data: np.ndarray, size: int = 5) -> np.ndarray:
    def _nanstd(values: Iterable[float]) -> float:
        return float(np.nanstd(values))

    return generic_filter(data, _nanstd, size=size, mode="nearest").astype("float32")


def compute_slope_deg(dem: np.ndarray, transform) -> np.ndarray:
    x_res = abs(transform.a)
    y_res = abs(transform.e)
    dz_dx = sobel(dem, axis=1, mode="nearest") / max(8 * x_res, EPS)
    dz_dy = sobel(dem, axis=0, mode="nearest") / max(8 * y_res, EPS)
    slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
    return np.degrees(slope_rad).astype("float32")


def compute_products(cfg: dict) -> dict[str, RasterLayer]:
    inputs = cfg["inputs"]
    processed = Path(cfg["outputs"]["processed_dir"])
    thresholds = cfg["thresholds"]
    weights = cfg["weights"]

    same = read_raster(Path(inputs["dfsar_same_circular"]))
    opposite = align_to_reference(read_raster(Path(inputs["dfsar_opposite_circular"])), same)
    dop = align_to_reference(read_raster(Path(inputs["dfsar_dop"])), same)
    ohrc = align_to_reference(read_raster(Path(inputs["ohrc_image"])), same)
    dem = align_to_reference(read_raster(Path(inputs["dem"])), same)
    psr = align_to_reference(read_raster(Path(inputs["psr_mask"])), same)

    cpr = same.data / np.maximum(opposite.data, EPS)
    slope = compute_slope_deg(dem.data, dem.profile["transform"])
    roughness = local_std(dem.data, size=5)
    ohrc_texture = local_std(ohrc.data, size=7)
    boulder_proxy = robust_norm(ohrc_texture)
    psr_binary = (psr.data > 0.5).astype("float32")

    cpr_score = robust_norm(cpr)
    dop_score = robust_norm(dop.data, invert=True)
    low_roughness_score = robust_norm(roughness, invert=True)

    ice_score = (
        weights["ice_cpr"] * cpr_score
        + weights["ice_dop"] * dop_score
        + weights["ice_psr"] * psr_binary
        + weights["ice_low_roughness"] * low_roughness_score
    )

    radar_rule = (cpr > thresholds["cpr_ice_min"]) & (dop.data < thresholds["dop_ice_max"])
    high_conf = (
        (ice_score >= thresholds["high_confidence_min"])
        & radar_rule
        & (roughness <= np.nanpercentile(roughness, 70))
        & (psr_binary > 0)
    )
    moderate_conf = (
        (ice_score >= thresholds["moderate_confidence_min"])
        & ~high_conf
        & (cpr > thresholds["cpr_ice_min"])
        & (psr_binary > 0)
    )
    rough_false_positive = (
        (cpr > thresholds["cpr_ice_min"])
        & ((dop.data >= thresholds["dop_ice_max"]) | (boulder_proxy > 0.7))
    )

    ice_class = np.zeros_like(cpr, dtype="float32")
    ice_class[moderate_conf] = 1
    ice_class[high_conf] = 2
    ice_class[rough_false_positive] = -1

    slope_score = robust_norm(slope)
    roughness_score = robust_norm(roughness)
    shadow_score = psr_binary
    hazard_score = (
        weights["hazard_slope"] * slope_score
        + weights["hazard_roughness"] * roughness_score
        + weights["hazard_shadow"] * shadow_score
        + weights["hazard_boulder_proxy"] * boulder_proxy
    )
    hard_hazard = (slope > thresholds["rover_slope_hard_max_deg"]) | (boulder_proxy > 0.85)

    products = {
        "cpr": RasterLayer(cpr.astype("float32"), same.profile),
        "slope_deg": RasterLayer(slope, same.profile),
        "roughness": RasterLayer(roughness, same.profile),
        "ice_score": RasterLayer(ice_score.astype("float32"), same.profile),
        "ice_class": RasterLayer(ice_class, same.profile),
        "hazard_score": RasterLayer(hazard_score.astype("float32"), same.profile),
        "hard_hazard": RasterLayer(hard_hazard.astype("float32"), same.profile),
    }

    for name, layer in products.items():
        write_raster(processed / f"{name}.tif", layer.data, layer.profile)

    return products


def summarize_ice_volume(cfg: dict, ice_class: RasterLayer) -> dict[str, float]:
    transform = ice_class.profile["transform"]
    pixel_area_m2 = abs(transform.a * transform.e)
    high_pixels = int(np.sum(ice_class.data == 2))
    area_m2 = high_pixels * pixel_area_m2
    depth_m = cfg["ice_volume"]["depth_m"]
    regolith_volume_m3 = area_m2 * depth_m
    return {
        "high_confidence_area_m2": area_m2,
        "regolith_volume_top_depth_m3": regolith_volume_m3,
        "conservative_ice_m3": regolith_volume_m3 * cfg["ice_volume"]["conservative_fraction"],
        "moderate_ice_m3": regolith_volume_m3 * cfg["ice_volume"]["moderate_fraction"],
        "optimistic_ice_m3": regolith_volume_m3 * cfg["ice_volume"]["optimistic_fraction"],
    }


def save_volume_table(path: Path, stats: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["metric,value"]
    lines.extend(f"{key},{value:.3f}" for key, value in stats.items())
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def nearest_valid_cell(mask: np.ndarray, row: int, col: int) -> tuple[int, int]:
    valid = np.argwhere(mask)
    if valid.size == 0:
        raise ValueError("No valid cells are available for path planning.")
    distances = (valid[:, 0] - row) ** 2 + (valid[:, 1] - col) ** 2
    return tuple(valid[int(np.argmin(distances))])


def astar_path(
    hazard: np.ndarray,
    hard_hazard: np.ndarray,
    start: tuple[int, int],
    goal: tuple[int, int],
) -> list[tuple[int, int]]:
    traversable = np.isfinite(hazard) & (hard_hazard < 0.5)
    start = nearest_valid_cell(traversable, *start)
    goal = nearest_valid_cell(traversable, *goal)

    rows, cols = hazard.shape
    offsets = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]

    def heuristic(a: tuple[int, int], b: tuple[int, int]) -> float:
        return math.hypot(a[0] - b[0], a[1] - b[1])

    open_heap = [(heuristic(start, goal), 0.0, start)]
    came_from: dict[tuple[int, int], tuple[int, int]] = {}
    cost_so_far = {start: 0.0}

    while open_heap:
        _, current_cost, current = heapq.heappop(open_heap)
        if current == goal:
            break
        if current_cost > cost_so_far[current]:
            continue
        for dr, dc in offsets:
            nr, nc = current[0] + dr, current[1] + dc
            if nr < 0 or nc < 0 or nr >= rows or nc >= cols or not traversable[nr, nc]:
                continue
            step_distance = math.hypot(dr, dc)
            step_cost = step_distance * (1.0 + float(hazard[nr, nc]))
            new_cost = current_cost + step_cost
            nxt = (nr, nc)
            if nxt not in cost_so_far or new_cost < cost_so_far[nxt]:
                cost_so_far[nxt] = new_cost
                priority = new_cost + heuristic(nxt, goal)
                heapq.heappush(open_heap, (priority, new_cost, nxt))
                came_from[nxt] = current

    if goal not in came_from and goal != start:
        raise ValueError("A* could not find a route between start and goal.")

    path = [goal]
    while path[-1] != start:
        path.append(came_from[path[-1]])
    path.reverse()
    return path


def save_quicklook(path: Path, title: str, data: np.ndarray, cmap: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    plt.figure(figsize=(8, 7))
    plt.imshow(data, cmap=cmap)
    plt.title(title)
    plt.colorbar(shrink=0.8)
    plt.tight_layout()
    plt.savefig(path, dpi=180)
    plt.close()


def run_products(args: argparse.Namespace) -> None:
    cfg = load_config(Path(args.config))
    products = compute_products(cfg)
    stats = summarize_ice_volume(cfg, products["ice_class"])
    save_volume_table(Path(cfg["outputs"]["processed_dir"]) / "ice_volume_estimates.csv", stats)

    figure_dir = Path(cfg["outputs"]["figure_dir"])
    save_quicklook(figure_dir / "cpr_quicklook.png", "Circular Polarization Ratio", products["cpr"].data, "magma")
    save_quicklook(figure_dir / "ice_score_quicklook.png", "Ice Confidence Score", products["ice_score"].data, "viridis")
    save_quicklook(figure_dir / "hazard_score_quicklook.png", "Terrain Hazard Score", products["hazard_score"].data, "inferno")


def run_traverse(args: argparse.Namespace) -> None:
    cfg = load_config(Path(args.config))
    hazard = read_raster(Path(cfg["outputs"]["processed_dir"]) / "hazard_score.tif")
    hard_hazard = read_raster(Path(cfg["outputs"]["processed_dir"]) / "hard_hazard.tif")
    path_cells = astar_path(
        hazard.data,
        hard_hazard.data,
        start=(args.start_row, args.start_col),
        goal=(args.goal_row, args.goal_col),
    )
    path_out = Path(cfg["outputs"]["processed_dir"]) / "rover_traverse_cells.csv"
    path_out.parent.mkdir(parents=True, exist_ok=True)
    transform = hazard.profile["transform"]
    lines = ["step,row,col,x,y,cumulative_steps"]
    for idx, (row, col) in enumerate(path_cells):
        x, y = rasterio.transform.xy(transform, row, col)
        lines.append(f"{idx},{row},{col},{x:.3f},{y:.3f},{idx}")
    path_out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(required=True)

    products = subparsers.add_parser("products", help="Create CPR, ice, hazard, and volume products.")
    products.add_argument("--config", default="work/config/project_config.yaml")
    products.set_defaults(func=run_products)

    traverse = subparsers.add_parser("traverse", help="Plan rover route on processed hazard raster.")
    traverse.add_argument("--config", default="work/config/project_config.yaml")
    traverse.add_argument("--start-row", type=int, required=True)
    traverse.add_argument("--start-col", type=int, required=True)
    traverse.add_argument("--goal-row", type=int, required=True)
    traverse.add_argument("--goal-col", type=int, required=True)
    traverse.set_defaults(func=run_traverse)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
