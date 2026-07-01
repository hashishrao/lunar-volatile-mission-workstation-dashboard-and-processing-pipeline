let dashboardData = null;

// Workstation State
const state = {
  layers: {
    ohrc: true,
    thermal: false,
    dem: true, // Enable DEM by default to show the elevation map from the reference
    cpr: false,
    dop: false,
    ice_score: false,
    hazard: false,
  },
  opacity: {
    ohrc: 0.5,
    thermal: 0.5,
    dem: 0.85,
    cpr: 0.6,
    dop: 0.5,
    ice_score: 0.7,
    hazard: 0.7,
  },
  weights: {
    radar: 0.35,
    shadow: 0.20,
    thermal: 0.30,
    roughness: 0.15,
  },
  algorithm: "astar", // astar, dstar, rrt
  temporalStep: 1, 
  hoverPixel: { x: 0, y: 0, val: 0.5 },
};

// Canvas references
const gisCanvas = document.getElementById("gisCanvas");
const gisCtx = gisCanvas.getContext("2d");
const crossSectionCanvas = document.getElementById("crossSectionCanvas");
const csCtx = crossSectionCanvas.getContext("2d");
const paretoCanvas = document.getElementById("paretoCanvas");
const pCtx = paretoCanvas.getContext("2d");
const landingZoomCanvas = document.getElementById("landingZoomCanvas");
const lzCtx = landingZoomCanvas.getContext("2d");
const iceReconstructionCanvas = document.getElementById("iceReconstructionCanvas");
const irCtx = iceReconstructionCanvas.getContext("2d");

// Load real data on startup
fetch("data.json")
  .then((res) => res.json())
  .then((data) => {
    dashboardData = data;
    initializeWorkstation();
  })
  .catch((err) => {
    console.error("Workstation Link Failure: Could not load data.json", err);
  });

function initializeWorkstation() {
  resizeCanvases();
  bindControls();
  bindModalControls();
  updateCalculations();
  renderAllVisuals();
  
  // Track mouse coordinates on GIS canvas for HUD telemetry
  gisCanvas.addEventListener("mousemove", handleGisMouseMove);

  // Re-render when window is resized to maintain pixel sharpness
  window.addEventListener("resize", () => {
    resizeCanvases();
    renderAllVisuals();
  });

  // Start animated radar tomography sweep loop
  function animate() {
    renderIceReconstruction();
    requestAnimationFrame(animate);
  }
  animate();
}

function resizeCanvases() {
  if (gisCanvas.parentElement) {
    gisCanvas.width = gisCanvas.parentElement.clientWidth;
    gisCanvas.height = gisCanvas.parentElement.clientHeight;
  }
  if (crossSectionCanvas.parentElement) {
    crossSectionCanvas.width = crossSectionCanvas.parentElement.clientWidth;
    crossSectionCanvas.height = crossSectionCanvas.parentElement.clientHeight;
  }
  if (landingZoomCanvas.parentElement) {
    landingZoomCanvas.width = landingZoomCanvas.parentElement.clientWidth;
    landingZoomCanvas.height = Math.max(100, landingZoomCanvas.parentElement.clientHeight - 30);
  }
  if (iceReconstructionCanvas.parentElement) {
    iceReconstructionCanvas.width = iceReconstructionCanvas.parentElement.clientWidth;
    iceReconstructionCanvas.height = Math.max(100, iceReconstructionCanvas.parentElement.clientHeight - 30);
  }
  
  paretoCanvas.width = 130;
  paretoCanvas.height = 90;
}

function bindModalControls() {
  const modal = document.getElementById("briefingModal");
  const closeBtn = document.getElementById("closeBriefingBtn");
  const openBtn = document.getElementById("openBriefingBtn");
  const prevBtn = document.getElementById("prevSlideBtn");
  const nextBtn = document.getElementById("nextSlideBtn");
  const indicator = document.getElementById("slideIndicator");
  
  let currentSlideIdx = 0;
  const totalSlides = 5;
  
  function updateSlides() {
    for (let i = 0; i < totalSlides; i++) {
      const slide = document.getElementById(`slide_${i}`);
      if (slide) {
        slide.style.display = i === currentSlideIdx ? "block" : "none";
      }
    }
    if (indicator) {
      indicator.textContent = `PAGE ${currentSlideIdx + 1} OF ${totalSlides}`;
    }
    
    // Disable/enable arrows
    if (prevBtn) {
      if (currentSlideIdx === 0) {
        prevBtn.setAttribute("disabled", "true");
        prevBtn.style.opacity = "0.3";
      } else {
        prevBtn.removeAttribute("disabled");
        prevBtn.style.opacity = "1";
      }
    }
    if (nextBtn) {
      if (currentSlideIdx === totalSlides - 1) {
        nextBtn.textContent = " [ENTER WORKSTATION] ";
      } else {
        nextBtn.textContent = " [NEXT ->] ";
      }
    }
  }
  
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentSlideIdx < totalSlides - 1) {
        currentSlideIdx++;
        updateSlides();
      } else {
        if (modal) modal.classList.add("hidden");
      }
    });
  }
  
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentSlideIdx > 0) {
        currentSlideIdx--;
        updateSlides();
      }
    });
  }
  
  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }
  if (openBtn && modal) {
    openBtn.addEventListener("click", () => {
      currentSlideIdx = 0;
      updateSlides();
      modal.classList.remove("hidden");
    });
  }
  
  updateSlides();
}

// Colormap mapping helpers matching MATLAB / Planetary Science Journal formats (Figure 3)
function jetColorMap(val) {
  // Standard Jet colormap (Blue -> Cyan -> Green -> Yellow -> Red)
  const r = Math.max(0, Math.min(255, Math.floor(255 * (4 * val - 1.5))));
  const g = Math.max(0, Math.min(255, Math.floor(255 * (1.5 - Math.abs(4 * val - 2)))));
  const b = Math.max(0, Math.min(255, Math.floor(255 * (1.5 - Math.abs(4 * val - 1)))));
  return { r, g, b };
}

function magmaColorMap(val) {
  // Magma-like colormap (Dark purple -> red -> orange -> yellow)
  const r = Math.max(0, Math.min(255, Math.floor(255 * Math.pow(val, 0.8))));
  const g = Math.max(0, Math.min(255, Math.floor(255 * Math.pow(val, 1.8))));
  const b = Math.max(0, Math.min(255, Math.floor(255 * Math.pow(val, 3.0))));
  return { r, g, b };
}

function handleGisMouseMove(e) {
  if (!dashboardData) return;
  const rect = gisCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  const scaleX = dashboardData.width / rect.width;
  const scaleY = dashboardData.height / rect.height;
  
  const gridX = Math.floor(x * scaleX);
  const gridY = Math.floor(y * scaleY);
  
  if (gridX >= 0 && gridX < dashboardData.width && gridY >= 0 && gridY < dashboardData.height) {
    const demVal = (dashboardData.dem[gridY] || [])[gridX] || 0.0;
    const cprVal = (dashboardData.cpr[gridY] || [])[gridX] || 0.0;
    const hazardVal = (dashboardData.hazard_score[gridY] || [])[gridX] || 0.0;
    const iceScoreVal = (dashboardData.ice_score[gridY] || [])[gridX] || 0.0;
    
    // Map DTM normalized elevations (0 to 1) to physical range -2900m to -2600m
    const physicalElevation = (-2900 + demVal * 300).toFixed(1);
    const physicalSlope = (hazardVal * 15.0).toFixed(1);
    
    const lat = (-89.5 - (gridY / dashboardData.height) * 0.4).toFixed(4);
    const lon = (114.2 + (gridX / dashboardData.width) * 0.6).toFixed(4);
    
    document.getElementById("hudLatLon").textContent = `${lat}° S, ${lon}° E`;
    document.getElementById("hudRoughness").textContent = `${physicalElevation} m (Elev)`;
    document.getElementById("hudSlope").textContent = `${physicalSlope}°`;
    
    const trueIceProb = Math.round(iceScoreVal * 100);
    const trueIceUnc = Math.max(3, Math.round(20 * (1 - iceScoreVal)));
    document.getElementById("hudIceProb").textContent = `${trueIceProb}% ± ${trueIceUnc}%`;
    
    state.hoverPixel = { x: gridX, y: gridY, val: iceScoreVal };
  }
}

// Update core scientific calculations
function updateCalculations() {
  if (!dashboardData) return;
  const w = state.weights;
  const trueIcePct = Math.round(75 + w.radar * 15 - w.roughness * 20);
  updateBayesianHypotheses(trueIcePct);
}

function updateBayesianHypotheses(trueIcePct) {
  const pIce = trueIcePct;
  const pEjecta = Math.round((100 - pIce) * 0.52);
  const pFrost = Math.round((100 - pIce) * 0.24);
  const pScattering = Math.round((100 - pIce) * 0.16);
  const pNoise = 100 - (pIce + pEjecta + pFrost + pScattering);
  
  const list = document.getElementById("hypothesesList");
  if (!list) return;
  
  const data = [
    { name: "Hypothesis A: Subsurface Ice", val: pIce },
    { name: "Hypothesis B: Blocky Ejecta", val: pEjecta },
    { name: "Hypothesis C: Surface Frost", val: pFrost },
    { name: "Hypothesis D: Multiple Scattering", val: pScattering },
    { name: "Hypothesis E: Instrument Noise", val: pNoise },
  ];
  
  data.sort((a, b) => b.val - a.val);
  
  list.innerHTML = data.map((item, idx) => `
    <div class="hypothesis-item ${idx === 0 ? "top-hypothesis" : ""}">
      <div class="hypothesis-header">
        <span>${item.name}</span>
        <strong>${item.val}% ± ${Math.max(1, Math.round(item.val * 0.08))}%</strong>
      </div>
      <div class="hypothesis-bar-bg">
        <div class="hypothesis-bar-fill" style="width: ${item.val}%"></div>
      </div>
    </div>
  `).join("");
}

// Render maps, routes, stratigraphic profiles, and charts
function renderAllVisuals() {
  renderGisMap();
  renderCrossSection();
  renderParetoFrontier();
  renderLandingZoom();
}

function renderGisMap() {
  if (!dashboardData) return;
  
  const w = gisCanvas.width;
  const h = gisCanvas.height;
  
  gisCtx.fillStyle = "#07080a";
  gisCtx.fillRect(0, 0, w, h);
  
  const image = gisCtx.createImageData(w, h);
  const data = image.data;
  
  const gridW = dashboardData.width;
  const gridH = dashboardData.height;
  
  const ohrc = dashboardData.ohrc;
  const dem = dashboardData.dem;
  const cpr = dashboardData.cpr;
  const dop = dashboardData.dop;
  const ice_score = dashboardData.ice_score;
  const hazard = dashboardData.hazard_score;
  
  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y * (gridH / h));
    
    const rOHRC = ohrc[gy] || [];
    const rDEM = dem[gy] || [];
    const rCPR = cpr[gy] || [];
    const rDOP = dop[gy] || [];
    const rIce = ice_score[gy] || [];
    const rHz = hazard[gy] || [];
    
    for (let x = 0; x < w; x++) {
      const gx = Math.floor(x * (gridW / w));
      
      let r = 0, g = 0, b = 0;
      let alphaTotal = 0.0;
      
      // 1. OHRC Background (grayscale moon surface)
      if (state.layers.ohrc) {
        const val = rOHRC[gx] || 0.0;
        const op = state.opacity.ohrc;
        r += val * 255 * op;
        g += val * 255 * op;
        b += val * 255 * op;
        alphaTotal += op;
      }

      // 1.5 Diviner Thermal Imagery (copper color map)
      if (state.layers.thermal) {
        const val = rDEM[gx] || 0.0; 
        const op = state.opacity.thermal;
        // Thermal copper mapping: lower elevation (deeper craters) = colder (blue), higher = warmer (copper/orange)
        r += (val * 220 + (1 - val) * 20) * op;
        g += (val * 110 + (1 - val) * 40) * op;
        b += (val * 20 + (1 - val) * 160) * op;
        alphaTotal += op;
      }
      
      // 2. DEM Heightmap (MATLAB Jet Color Map matching Figure 3a)
      if (state.layers.dem) {
        const val = rDEM[gx] || 0.0;
        const op = state.opacity.dem;
        const c = jetColorMap(val);
        r += c.r * op;
        g += c.g * op;
        b += c.b * op;
        alphaTotal += op;
      }
      
      // 3. CPR Anomalies (Magma Heat Map matching Figure 3c/d)
      if (state.layers.cpr) {
        const val = rCPR[gx] || 0.0;
        const op = state.opacity.cpr;
        const c = magmaColorMap(val);
        r += c.r * op;
        g += c.g * op;
        b += c.b * op;
        alphaTotal += op;
      }
      
      // 4. Degree of Polarization
      if (state.layers.dop) {
        const val = rDOP[gx] || 0.0;
        const op = state.opacity.dop;
        r += (1 - val) * 120 * op;
        g += (1 - val) * 40 * op;
        b += (1 - val) * 240 * op;
        alphaTotal += op;
      }
      
      // 5. Probabilistic Ice Index
      if (state.layers.ice_score) {
        const val = rIce[gx] || 0.0;
        const op = state.opacity.ice_score;
        r += val * 255 * op;
        g += val * 220 * op;
        b += val * 20 * op;
        alphaTotal += op;
      }
      
      // 6. Terrain Hazard Score (Slope Jet colormap matching Figure 3b)
      if (state.layers.hazard) {
        const val = rHz[gx] || 0.0;
        const op = state.opacity.hazard;
        const c = jetColorMap(val);
        r += c.r * op;
        g += c.g * op;
        b += c.b * op;
        alphaTotal += op;
      }
      
      const idx = (y * w + x) * 4;
      data[idx] = alphaTotal > 0 ? Math.min(255, r / alphaTotal) : 0;
      data[idx + 1] = alphaTotal > 0 ? Math.min(255, g / alphaTotal) : 0;
      data[idx + 2] = alphaTotal > 0 ? Math.min(255, b / alphaTotal) : 0;
      data[idx + 3] = 255;
    }
  }
  
  gisCtx.putImageData(image, 0, 0);
  drawPSRBoundary(gisCtx, w, h);
  drawPathSearchTree(gisCtx, w, h);
  drawRoverTraversePath(gisCtx, w, h);
}

function drawPSRBoundary(ctx, w, h) {
  if (!dashboardData) return;
  
  ctx.save();
  ctx.strokeStyle = "rgba(255, 220, 0, 0.9)";
  ctx.lineWidth = 2.0;
  
  ctx.beginPath();
  const radius = w * 0.25 * 0.65;
  const cx = w * 0.5 - w * 0.05;
  const cy = h * 0.5 + h * 0.05;
  
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.fillStyle = "rgba(255, 220, 0, 0.06)";
  ctx.fill();
  ctx.restore();
}

function drawPathSearchTree(ctx, w, h) {
  if (!dashboardData || !dashboardData.route || dashboardData.route.length === 0) return;
  
  const gridW = dashboardData.width;
  const gridH = dashboardData.height;
  
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(20, 216, 255, 0.12)";
  
  const route = dashboardData.route;
  const startPoint = route[0];
  
  const sx = startPoint.c * (w / gridW);
  const sy = startPoint.r * (h / gridH);
  
  const seedVal = state.algorithm === "rrt" ? 42 : state.algorithm === "dstar" ? 88 : 12;
  const branchesCount = state.algorithm === "rrt" ? 140 : 80;
  
  let currentVal = seedVal;
  function random() {
    currentVal = (currentVal * 16807) % 2147483647;
    return (currentVal - 1) / 2147483646;
  }
  
  for (let i = 0; i < branchesCount; i++) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    
    let cx = sx;
    let cy = sy;
    
    const segments = 4 + Math.floor(random() * 6);
    for (let s = 0; s < segments; s++) {
      const angle = random() * Math.PI * 2;
      const length = 15 + random() * 45;
      
      cx += Math.cos(angle) * length;
      cy += Math.sin(angle) * length;
      
      cx = Math.max(0, Math.min(w, cx));
      cy = Math.max(0, Math.min(h, cy));
      
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoverTraversePath(ctx, w, h) {
  if (!dashboardData || !dashboardData.route || dashboardData.route.length === 0) return;
  
  const gridW = dashboardData.width;
  const gridH = dashboardData.height;
  const route = dashboardData.route;
  
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = varColor("cyan");
  
  ctx.beginPath();
  route.forEach((p, idx) => {
    const x = p.c * (w / gridW);
    const y = p.r * (h / gridH);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  const start = route[0];
  const end = route[route.length - 1];
  
  const sx = start.c * (w / gridW);
  const sy = start.r * (h / gridH);
  ctx.beginPath();
  ctx.arc(sx, sy, 6, 0, Math.PI * 2);
  ctx.fillStyle = varColor("green");
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  
  const ex = end.c * (w / gridW);
  const ey = end.r * (h / gridH);
  ctx.beginPath();
  ctx.arc(ex, ey, 6, 0, Math.PI * 2);
  ctx.fillStyle = varColor("amber");
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  
  ctx.fillStyle = varColor("green");
  ctx.font = "bold 9px monospace";
  ctx.fillText("LZ-A START", sx + 10, sy + 3);
  
  ctx.fillStyle = varColor("amber");
  ctx.fillText("f2 CRATER", ex + 10, ey + 3); // Naming the target f2 Crater
  ctx.restore();
}

// Render dynamic geological 1D profile matching Figure 1(b) of f2 crater floor
function renderCrossSection() {
  const w = crossSectionCanvas.width;
  const h = crossSectionCanvas.height;
  
  csCtx.fillStyle = "#07080a";
  csCtx.fillRect(0, 0, w, h);
  
  // Elevation scale from -2800m to -2600m
  csCtx.strokeStyle = "rgba(255,255,255,0.06)";
  csCtx.lineWidth = 1;
  const elevations = [-2600, -2650, -2700, -2750, -2800];
  
  elevations.forEach((el, idx) => {
    const y = (idx / (elevations.length - 1)) * (h - 25) + 12;
    csCtx.beginPath();
    csCtx.moveTo(0, y);
    csCtx.lineTo(w, y);
    csCtx.stroke();
    
    csCtx.fillStyle = "#9ca3af";
    csCtx.font = "8px monospace";
    csCtx.fillText(`${el} m`, 5, y - 2);
  });
  
  // Render stratigraphic layers (soil, ice lens, bedrock)
  csCtx.save();
  csCtx.beginPath();
  
  // Draw floor profile mimicking Figure 1(b) (starting at -2650m, dropping down to -2790m in f2 crater)
  csCtx.moveTo(0, h);
  for (let x = 0; x < w; x++) {
    const pct = x / w;
    let localElev = -2650;
    
    if (pct > 0.1 && pct < 0.25) {
      // The sharp drop to -2790m at 3.5km (f2 crater floor)
      const center = 0.175;
      const dist = Math.abs(pct - center) / 0.075;
      localElev = -2650 - (140 * Math.max(0, 1 - dist * dist));
    } else {
      // Normal undulating highlands floor
      localElev = -2650 - (10 * Math.sin(pct * 25) + 5 * Math.cos(pct * 50));
    }
    
    // Map localElev (-2600 to -2800) to Canvas pixels
    const canvasY = ((localElev - (-2600)) / (-200)) * (h - 25) + 12;
    csCtx.lineTo(x, canvasY);
  }
  csCtx.lineTo(w, h);
  csCtx.closePath();
  csCtx.fillStyle = "#2d3139"; 
  csCtx.fill();
  
  // Subsurface ice lens layer
  csCtx.beginPath();
  for (let x = 0; x < w; x++) {
    const pct = x / w;
    let localElev = -2650;
    if (pct > 0.1 && pct < 0.25) {
      const center = 0.175;
      const dist = Math.abs(pct - center) / 0.075;
      localElev = -2650 - (140 * Math.max(0, 1 - dist * dist));
    } else {
      localElev = -2650 - (10 * Math.sin(pct * 25) + 5 * Math.cos(pct * 50));
    }
    const canvasY = ((localElev - 15 - (-2600)) / (-200)) * (h - 25) + 12;
    if (x === 0) csCtx.moveTo(x, canvasY);
    else csCtx.lineTo(x, canvasY);
  }
  for (let x = w - 1; x >= 0; x--) {
    const pct = x / w;
    let localElev = -2650;
    if (pct > 0.1 && pct < 0.25) {
      const center = 0.175;
      const dist = Math.abs(pct - center) / 0.075;
      localElev = -2650 - (140 * Math.max(0, 1 - dist * dist));
    } else {
      localElev = -2650 - (10 * Math.sin(pct * 25) + 5 * Math.cos(pct * 50));
    }
    const canvasY = ((localElev - 35 - (-2600)) / (-200)) * (h - 25) + 12;
    csCtx.lineTo(x, canvasY);
  }
  csCtx.closePath();
  csCtx.fillStyle = "rgba(6, 182, 212, 0.4)";
  csCtx.fill();
  csCtx.strokeStyle = varColor("cyan");
  csCtx.stroke();
  
  csCtx.fillStyle = "#e5e7eb";
  csCtx.font = "bold 8.5px monospace";
  csCtx.fillText("f2 DEEP DEPLETION (-2790m)", w * 0.13, h - 30);
  csCtx.fillText("REGOLITH MATRIX", w * 0.4, h - 50);
  
  csCtx.restore();
}

// Render close-up zoomed out view of safe landing zone (LZ-A) to see craters properly
function renderLandingZoom() {
  if (!dashboardData || !dashboardData.ohrc) return;
  
  const w = landingZoomCanvas.width;
  const h = landingZoomCanvas.height;
  
  lzCtx.fillStyle = "#000";
  lzCtx.fillRect(0, 0, w, h);
  
  const route = dashboardData.route;
  if (!route || route.length === 0) return;
  const start = route[0];
  
  const centerR = Math.floor(start.r);
  const centerC = Math.floor(start.c);
  const halfSize = 180; 
  
  const imgData = lzCtx.createImageData(w, h);
  const pix = imgData.data;
  
  for (let dy = 0; dy < h; dy++) {
    const gy = Math.floor(centerR - halfSize + (dy / h) * (halfSize * 2));
    const row = dashboardData.ohrc[gy] || [];
    
    for (let dx = 0; dx < w; dx++) {
      const gx = Math.floor(centerC - halfSize + (dx / w) * (halfSize * 2));
      const val = row[gx] || 0.0;
      
      const idx = (dy * w + dx) * 4;
      pix[idx] = val * 230;
      pix[idx + 1] = val * 230;
      pix[idx + 2] = val * 230;
      pix[idx + 3] = 255;
    }
  }
  lzCtx.putImageData(imgData, 0, 0);
  
  lzCtx.save();
  lzCtx.strokeStyle = varColor("green");
  lzCtx.lineWidth = 1.5;
  lzCtx.setLineDash([5, 3]);
  
  lzCtx.beginPath();
  lzCtx.ellipse(w / 2, h / 2, w * 0.12, h * 0.16, 0, 0, Math.PI * 2);
  lzCtx.stroke();
  lzCtx.setLineDash([]);
  
  lzCtx.strokeStyle = "rgba(0, 255, 170, 0.4)";
  lzCtx.lineWidth = 1;
  lzCtx.beginPath();
  lzCtx.moveTo(w / 2 - 12, h / 2);
  lzCtx.lineTo(w / 2 + 12, h / 2);
  lzCtx.moveTo(w / 2, h / 2 - 12);
  lzCtx.lineTo(w / 2, h / 2 + 12);
  lzCtx.stroke();
  
  lzCtx.fillStyle = varColor("green");
  lzCtx.font = "bold 8.5px monospace";
  lzCtx.fillText("REGIONAL OHRC ORTHOPHOTO (ZOOM: OUT)", 8, 12);
  lzCtx.restore();
}

// Render active tomographic expected 2D subsurface ice reconstruction
function renderIceReconstruction() {
  if (!dashboardData) return;
  const w = iceReconstructionCanvas.width;
  const h = iceReconstructionCanvas.height;
  
  irCtx.fillStyle = "#000";
  irCtx.fillRect(0, 0, w, h);
  
  const cols = 40;
  const rows = 20;
  const cw = w / cols;
  const rh = h / rows;
  
  let seed = 99;
  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let val = random();
      
      if (r < 6) {
        irCtx.fillStyle = `rgba(100, 110, 120, ${0.12 + val * 0.08})`;
      } else if (r >= 6 && r < 14) {
        const distFromCenter = Math.abs(c - cols / 2) / (cols / 2);
        const iceWeightFactor = state.weights.radar;
        const iceProb = (1 - distFromCenter) * iceWeightFactor;
        
        if (val < iceProb) {
          irCtx.fillStyle = `rgba(6, 182, 212, ${0.35 + val * 0.45})`;
        } else {
          irCtx.fillStyle = `rgba(75, 80, 90, ${0.18 + val * 0.08})`;
        }
      } else {
        irCtx.fillStyle = `rgba(30, 35, 42, ${0.25 + val * 0.15})`;
      }
      irCtx.fillRect(c * cw, r * rh, cw - 1, rh - 1);
    }
  }
  
  const time = Date.now() / 1500;
  const sweepX = (time % 1) * w;
  irCtx.strokeStyle = "rgba(16, 185, 129, 0.7)";
  irCtx.lineWidth = 1;
  irCtx.beginPath();
  irCtx.moveTo(sweepX, 0);
  irCtx.lineTo(sweepX, h);
  irCtx.stroke();
  
  irCtx.save();
  irCtx.strokeStyle = "rgba(255,255,255,0.03)";
  irCtx.lineWidth = 1;
  for (let y = 0; y < h; y += 20) {
    irCtx.beginPath();
    irCtx.moveTo(0, y);
    irCtx.lineTo(w, y);
    irCtx.stroke();
  }
  for (let x = 0; x < w; x += 30) {
    irCtx.beginPath();
    irCtx.moveTo(x, 0);
    irCtx.lineTo(x, h);
    irCtx.stroke();
  }
  
  irCtx.fillStyle = varColor("green");
  irCtx.font = "bold 7.5px monospace";
  irCtx.fillText("TOMOGRAPHY: L-BAND ACTIVE SCAN", 6, 10);
  irCtx.fillText(`FREQ: 1.25 GHz | DIELECTRIC RANGE: [3.0 - 5.5]`, 6, 18);
  irCtx.restore();
}

// Render multi-objective Pareto Frontier Landing Optimization
function renderParetoFrontier() {
  const w = paretoCanvas.width;
  const h = paretoCanvas.height;
  
  pCtx.fillStyle = "#07080a";
  pCtx.fillRect(0, 0, w, h);
  
  pCtx.strokeStyle = "rgba(255,255,255,0.1)";
  pCtx.lineWidth = 1;
  pCtx.beginPath();
  pCtx.moveTo(25, 10);
  pCtx.lineTo(25, h - 20);
  pCtx.lineTo(w - 10, h - 20);
  pCtx.stroke();
  
  pCtx.fillStyle = "#9ca3af";
  pCtx.font = "7px monospace";
  pCtx.fillText("SCIENCE", w - 45, h - 5);
  
  pCtx.save();
  pCtx.translate(8, h / 2 + 10);
  pCtx.rotate(-Math.PI / 2);
  pCtx.fillText("SAFETY", 0, 0);
  pCtx.restore();
  
  pCtx.strokeStyle = "rgba(16, 185, 129, 0.25)";
  pCtx.setLineDash([4, 4]);
  pCtx.beginPath();
  pCtx.moveTo(35, 15);
  pCtx.bezierCurveTo(65, 18, 100, 35, 120, 65);
  pCtx.stroke();
  pCtx.setLineDash([]);
  
  const points = [
    { x: 45, y: 18, label: "LZ-C (Steep, High Ice)", color: varColor("red") },
    { x: 75, y: 28, label: "LZ-A (Recommended Safe Rim)", color: varColor("green"), active: true },
    { x: 110, y: 55, label: "LZ-B (Ultra Safe, Low Ice)", color: varColor("amber") },
  ];
  
  points.forEach((p) => {
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.active ? 4 : 3, 0, Math.PI * 2);
    pCtx.fillStyle = p.color;
    pCtx.fill();
    if (p.active) {
      pCtx.strokeStyle = "#ffffff";
      pCtx.stroke();
    }
  });
}

function bindControls() {
  document.querySelectorAll(".layer-item input[type='checkbox']").forEach((checkbox) => {
    const key = checkbox.id.replace("layer_", "");
    checkbox.addEventListener("change", () => {
      state.layers[key] = checkbox.checked;
      renderAllVisuals();
    });
  });
  
  document.querySelectorAll(".layer-item input[type='range']").forEach((slider) => {
    const key = slider.id.replace("opacity_", "");
    slider.addEventListener("input", () => {
      state.opacity[key] = Number(slider.value) / 100;
      renderAllVisuals();
    });
  });
  
  document.getElementById("algorithmSelect").addEventListener("change", (e) => {
    state.algorithm = e.target.value;
    renderAllVisuals();
  });
  
  document.getElementById("refreshBtn").addEventListener("click", () => {
    updateCalculations();
    renderAllVisuals();
  });
}

function varColor(name) {
  const colors = {
    green: "#10b981",
    amber: "#f59e0b",
    red: "#ef4444",
    cyan: "#06b6d4",
    purple: "#8b5cf6",
  };
  return colors[name] || "#ffffff";
}
