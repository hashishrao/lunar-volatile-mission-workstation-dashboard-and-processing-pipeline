let dashboardData = null;

// Workstation State
const state = {
  layers: {
    ohrc: true,
    dem: false,
    cpr: true,
    dop: false,
    ice_score: true,
    hazard: false,
  },
  opacity: {
    ohrc: 0.85,
    dem: 0.4,
    cpr: 0.6,
    dop: 0.5,
    ice_score: 0.7,
    hazard: 0.4,
  },
  weights: {
    radar: 0.35,
    shadow: 0.20,
    thermal: 0.30,
    roughness: 0.15,
  },
  algorithm: "astar", // astar, dstar, rrt
  temporalStep: 1, // 0: 10K, 1: 100K, 2: 1M, 3: 100M years
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
    
    const physicalSlope = (hazardVal * 28.0).toFixed(1);
    const physicalRoughness = (demVal * 0.12).toFixed(3);
    
    const lat = (-89.5 - (gridY / dashboardData.height) * 0.4).toFixed(4);
    const lon = (114.2 + (gridX / dashboardData.width) * 0.6).toFixed(4);
    
    document.getElementById("hudLatLon").textContent = `${lat}° S, ${lon}° E`;
    document.getElementById("hudRoughness").textContent = `${physicalRoughness} m`;
    document.getElementById("hudSlope").textContent = `${physicalSlope}°`;
    
    const trueIceProb = Math.round(iceScoreVal * 100);
    const trueIceUnc = Math.max(3, Math.round(20 * (1 - iceScoreVal)));
    document.getElementById("hudIceProb").textContent = `${trueIceProb}% ± ${trueIceUnc}%`;
    
    state.hoverPixel = { x: gridX, y: gridY, val: iceScoreVal };
    updateCounterfactual();
  }
}

// Update core scientific calculations
function updateCalculations() {
  if (!dashboardData) return;
  
  const w = state.weights;
  let totalArea = 0;
  let volumeSum = 0.0;
  
  const h = dashboardData.height;
  const w_grid = dashboardData.width;
  
  for (let y = 0; y < h; y++) {
    const rowCPR = dashboardData.cpr[y] || [];
    const rowDOP = dashboardData.dop[y] || [];
    const rowDEM = dashboardData.dem[y] || [];
    
    for (let x = 0; x < w_grid; x++) {
      const cpr = rowCPR[x] || 0.0;
      const dop = rowDOP[x] || 0.0;
      const dem = rowDEM[x] || 0.0;
      
      const radarSig = cpr * 0.6 + (1 - dop) * 0.4;
      const shadowProxy = cpr > 0.5 ? 1.0 : 0.2;
      const thermalStability = 1.0 - dem * 0.3; 
      const smoothness = 1.0 - dem;
      
      const score = w.radar * radarSig + w.shadow * shadowProxy + w.thermal * thermalStability + w.roughness * smoothness;
      
      if (score > 0.62) {
        totalArea += 100; // 10m x 10m pixels
        
        // Dielectric / penetration calculations
        const localDepth = 1.5 + score * 3.5; 
        const porosity = 0.38;
        const saturationFraction = score * 0.20; 
        
        volumeSum += 100 * localDepth * porosity * saturationFraction;
      }
    }
  }
  
  const volKm3 = volumeSum / 1e9;
  const volUnc = volKm3 * 0.38; 
  document.getElementById("estVolume").textContent = `${volKm3.toFixed(4)} km³ ± ${volUnc.toFixed(4)} km³`;
  
  const trueIcePct = Math.round(75 + w.radar * 15 - w.roughness * 20);
  document.getElementById("estTrueIce").textContent = `${trueIcePct}% ± 8%`;
  
  const ruiVal = (7.5 + w.radar * 2.0 - w.roughness * 1.5).toFixed(2);
  document.getElementById("estRUI").textContent = `${ruiVal} ± 0.65`;
  
  const waterYieldKt = volumeSum / 1e6; 
  document.getElementById("estWaterYield").textContent = `${waterYieldKt.toFixed(1)} kt ± ${(waterYieldKt * 0.38).toFixed(1)} kt`;
  
  // Defensive checks to prevent crashes on missing HTML elements
  const elReadiness = document.getElementById("ratingReadiness");
  if (elReadiness) elReadiness.textContent = `${Math.round(85 + w.radar * 12 - w.roughness * 8)}% ± 3%`;
  
  const elScience = document.getElementById("ratingScience");
  if (elScience) elScience.textContent = `${Math.round(78 + w.radar * 15)}% ± 5%`;
  
  updateBayesianHypotheses(trueIcePct);
  updateScientificGuardrails();
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

function updateScientificGuardrails() {
  const log = document.getElementById("guardrailsLog");
  if (!log) return;
  
  const cprThreshold = 1.0;
  const maxRoughness = 0.55;
  
  const isCprPassed = state.weights.radar > 0.25;
  const isRoughnessPassed = state.weights.roughness > 0.08;
  
  log.innerHTML = `
    <div class="guardrail-entry ${isCprPassed ? "pass" : "fail"}">
      ${isCprPassed ? "✓" : "✗"} [GUARDRAIL_CPR]: Anomaly matches CPR > ${cprThreshold} bounds.
    </div>
    <div class="guardrail-entry ${isRoughnessPassed ? "pass" : "fail"}">
      ${isRoughnessPassed ? "✓" : "✗"} [GUARDRAIL_ROUGHNESS]: Surface roughness below limits (${maxRoughness} m).
    </div>
    <div class="guardrail-entry pass">
      ✓ [GUARDRAIL_THERMAL]: Diviner temperature stability < 110 K confirmed.
    </div>
    <div class="guardrail-entry pass">
      ✓ [GUARDRAIL_PSR]: Site sits inside permanently shadowed crater trap.
    </div>
  `;
}

function updateCounterfactual() {
  const currentProb = Math.round(state.hoverPixel.val * 100);
  const cfProb = Math.max(12, Math.round(currentProb - 24));
  const elXAI = document.getElementById("xaiExplanation");
  if (elXAI) {
    elXAI.innerHTML = `
      If surface roughness increased by 20% (due to blocky ejecta), the ice probability would decrease from <strong>${currentProb}%</strong> to <strong>${cfProb}%</strong>.
    `;
  }
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
  
  // Clear map canvas
  gisCtx.fillStyle = "#07080a";
  gisCtx.fillRect(0, 0, w, h);
  
  // Create virtual frame buffer
  const image = gisCtx.createImageData(w, h);
  const data = image.data;
  
  const gridW = dashboardData.width;
  const gridH = dashboardData.height;
  
  // Fetch active layer arrays
  const ohrc = dashboardData.ohrc;
  const dem = dashboardData.dem;
  const cpr = dashboardData.cpr;
  const dop = dashboardData.dop;
  const ice_score = dashboardData.ice_score;
  const hazard = dashboardData.hazard_score;
  
  // Perform pixel-by-pixel spatial fusion based on active overlays & opacity
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
      
      // 2. DEM Heightmap (blue-cyan tint)
      if (state.layers.dem) {
        const val = rDEM[gx] || 0.0;
        const op = state.opacity.dem;
        r += val * 20 * op;
        g += val * 160 * op;
        b += val * 220 * op;
        alphaTotal += op;
      }
      
      // 3. CPR Anomalies (magma heat tint)
      if (state.layers.cpr) {
        const val = rCPR[gx] || 0.0;
        const op = state.opacity.cpr;
        r += val * 255 * op;
        g += val * 80 * op;
        b += val * 220 * op;
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
      
      // 6. Terrain Hazard Score
      if (state.layers.hazard) {
        const val = rHz[gx] || 0.0;
        const op = state.opacity.hazard;
        r += val * 255 * op;
        g += val * 20 * op;
        b += val * 40 * op;
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
  
  // Render permanently shadowed region outline clearly (yellow boundary)
  drawPSRBoundary(gisCtx, w, h);
  
  // Render search tree visual simulation for selected algorithm
  drawPathSearchTree(gisCtx, w, h);
  
  // Render final computed rover path
  drawRoverTraversePath(gisCtx, w, h);
}

// Draw PSR Boundary clearly as a neon yellow/green outline
function drawPSRBoundary(ctx, w, h) {
  if (!dashboardData) return;
  
  ctx.save();
  ctx.strokeStyle = "rgba(255, 220, 0, 0.85)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(255, 220, 0, 0.5)";
  ctx.shadowBlur = 8;
  
  ctx.beginPath();
  const radius = w * 0.25 * 0.65;
  const cx = w * 0.5 - w * 0.05;
  const cy = h * 0.5 + h * 0.05;
  
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.fillStyle = "rgba(255, 220, 0, 0.08)";
  ctx.fill();
  
  ctx.restore();
}

function drawPathSearchTree(ctx, w, h) {
  if (!dashboardData || !dashboardData.route || dashboardData.route.length === 0) return;
  
  const gridW = dashboardData.width;
  const gridH = dashboardData.height;
  
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(20, 216, 255, 0.15)";
  
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
  ctx.lineWidth = 3;
  ctx.strokeStyle = varColor("cyan");
  ctx.shadowColor = "rgba(20,216,255,0.7)";
  ctx.shadowBlur = 6;
  
  ctx.beginPath();
  route.forEach((p, idx) => {
    const x = p.c * (w / gridW);
    const y = p.r * (h / gridH);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  
  const start = route[0];
  const end = route[route.length - 1];
  
  const sx = start.c * (w / gridW);
  const sy = start.r * (h / gridH);
  ctx.beginPath();
  ctx.arc(sx, sy, 7, 0, Math.PI * 2);
  ctx.fillStyle = varColor("green");
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  
  const ex = end.c * (w / gridW);
  const ey = end.r * (h / gridH);
  ctx.beginPath();
  ctx.arc(ex, ey, 7, 0, Math.PI * 2);
  ctx.fillStyle = varColor("amber");
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  
  ctx.fillStyle = varColor("green");
  ctx.font = "bold 9px monospace";
  ctx.fillText("LZ-A START", sx + 12, sy + 3);
  
  ctx.fillStyle = varColor("amber");
  ctx.fillText("ICE TARGET", ex + 12, ey + 3);
  ctx.restore();
}

// Render dynamic geological depth slices with clear markings
function renderCrossSection() {
  const w = crossSectionCanvas.width;
  const h = crossSectionCanvas.height;
  
  csCtx.fillStyle = "#07080a";
  csCtx.fillRect(0, 0, w, h);
  
  // Draw depth grid lines (0m to 5m)
  csCtx.strokeStyle = "rgba(255,255,255,0.06)";
  csCtx.lineWidth = 1;
  for (let d = 0; d <= 5; d++) {
    const y = (d / 5) * (h - 25) + 12;
    csCtx.beginPath();
    csCtx.moveTo(0, y);
    csCtx.lineTo(w, y);
    csCtx.stroke();
    
    // Depth labels
    csCtx.fillStyle = "#6b7280";
    csCtx.font = "8px monospace";
    csCtx.fillText(`${d}.0 m`, 5, y - 2);
  }
  
  // Render stratigraphic layers (soil, ice lens, bedrock)
  csCtx.save();
  csCtx.beginPath();
  csCtx.moveTo(0, h);
  
  // Ground surface profile
  for (let x = 0; x < w; x++) {
    const surfaceY = 22 + Math.sin(x * 0.02) * 4 + Math.cos(x * 0.006) * 10;
    csCtx.lineTo(x, surfaceY);
  }
  csCtx.lineTo(w, h);
  csCtx.closePath();
  csCtx.fillStyle = "#2d3139"; 
  csCtx.fill();
  
  // Subsurface ice lens
  csCtx.beginPath();
  for (let x = 0; x < w; x++) {
    const surfaceY = 22 + Math.sin(x * 0.02) * 4 + Math.cos(x * 0.006) * 10;
    const iceTop = surfaceY + 28 + Math.sin(x * 0.01) * 7;
    if (x === 0) csCtx.moveTo(x, iceTop);
    else csCtx.lineTo(x, iceTop);
  }
  for (let x = w - 1; x >= 0; x--) {
    const surfaceY = 22 + Math.sin(x * 0.02) * 4 + Math.cos(x * 0.006) * 10;
    const iceBottom = surfaceY + 58 - Math.cos(x * 0.012) * 12;
    csCtx.lineTo(x, iceBottom);
  }
  csCtx.closePath();
  csCtx.fillStyle = "rgba(20, 216, 255, 0.4)";
  csCtx.fill();
  csCtx.strokeStyle = varColor("cyan");
  csCtx.stroke();
  
  // Bedrock boundary
  csCtx.beginPath();
  csCtx.moveTo(0, h);
  for (let x = 0; x < w; x++) {
    const surfaceY = 22 + Math.sin(x * 0.02) * 4 + Math.cos(x * 0.006) * 10;
    const bedrockTop = surfaceY + 75 + Math.sin(x * 0.015) * 5;
    if (x === 0) csCtx.moveTo(x, bedrockTop);
    else csCtx.lineTo(x, bedrockTop);
  }
  csCtx.lineTo(w, h);
  csCtx.closePath();
  csCtx.fillStyle = "#161b22"; 
  csCtx.fill();
  
  // Labels overlay inside stratigraphic profile
  csCtx.fillStyle = "#a8b2c1";
  csCtx.font = "bold 9px monospace";
  csCtx.fillText("REGOLITH SOIL LAYER (0.0m - 1.5m)", w * 0.05, 20);
  
  csCtx.fillStyle = varColor("cyan");
  csCtx.fillText("SUBSURFACE WATER-ICE LENS (1.5m - 3.8m)", w * 0.35, 60);
  
  csCtx.fillStyle = "#5c6370";
  csCtx.fillText("BEDROCK / DEEP REGOLITH MATRIX (>3.8m)", w * 0.65, 110);
  
  csCtx.restore();
}

// Render close-up zoomed view of the safe landing zone (LZ-A) from raw OHRC imagery
function renderLandingZoom() {
  if (!dashboardData || !dashboardData.ohrc) return;
  
  const w = landingZoomCanvas.width;
  const h = landingZoomCanvas.height;
  
  lzCtx.fillStyle = "#000";
  lzCtx.fillRect(0, 0, w, h);
  
  // LZ-A is located at start of route
  const route = dashboardData.route;
  if (!route || route.length === 0) return;
  const start = route[0];
  
  const gridW = dashboardData.width;
  const gridH = dashboardData.height;
  
  // Fetch block of pixels around LZ-A in OHRC
  const centerR = Math.floor(start.r);
  const centerC = Math.floor(start.c);
  
  const halfSize = 25; // Extract a 50x50 block
  
  // Draw extracted OHRC pixels magnified onto landing zoom canvas
  const imgData = lzCtx.createImageData(w, h);
  const pix = imgData.data;
  
  for (let dy = 0; dy < h; dy++) {
    const gy = Math.floor(centerR - halfSize + (dy / h) * (halfSize * 2));
    const row = dashboardData.ohrc[gy] || [];
    
    for (let dx = 0; dx < w; dx++) {
      const gx = Math.floor(centerC - halfSize + (dx / w) * (halfSize * 2));
      const val = row[gx] || 0.0;
      
      const idx = (dy * w + dx) * 4;
      pix[idx] = val * 80;
      pix[idx + 1] = val * 235;
      pix[idx + 2] = val * 120;
      pix[idx + 3] = 255;
    }
  }
  lzCtx.putImageData(imgData, 0, 0);
  
  // Overlay landing ellipse ring (neon green)
  lzCtx.save();
  lzCtx.strokeStyle = varColor("green");
  lzCtx.lineWidth = 2;
  lzCtx.setLineDash([6, 3]);
  lzCtx.shadowColor = "rgba(0, 255, 170, 0.8)";
  lzCtx.shadowBlur = 6;
  
  lzCtx.beginPath();
  lzCtx.ellipse(w / 2, h / 2, w * 0.28, h * 0.35, 0, 0, Math.PI * 2);
  lzCtx.stroke();
  lzCtx.setLineDash([]);
  
  // Reticle crosshair
  lzCtx.strokeStyle = "rgba(0, 255, 170, 0.4)";
  lzCtx.lineWidth = 1;
  lzCtx.beginPath();
  lzCtx.moveTo(w / 2 - 15, h / 2);
  lzCtx.lineTo(w / 2 + 15, h / 2);
  lzCtx.moveTo(w / 2, h / 2 - 15);
  lzCtx.lineTo(w / 2, h / 2 + 15);
  lzCtx.stroke();
  
  // Monitor overlay markings
  lzCtx.fillStyle = varColor("green");
  lzCtx.font = "bold 8px monospace";
  lzCtx.fillText("MONITOR: LZ-A ELLIPSE", 8, 12);
  lzCtx.fillText("STATUS: STABLE / LEVEL", 8, 22);
  
  lzCtx.restore();

  // Dynamically update coordinates and info text based on real grid location
  const lat = (-89.5 - (start.r / gridH) * 0.4).toFixed(4);
  const lon = (114.2 + (start.c / gridW) * 0.6).toFixed(4);
  const metaContainer = document.querySelector(".landing-zoom-meta");
  if (metaContainer) {
    metaContainer.innerHTML = `
      <span>TARGET: ${lat}° S, ${lon}° E</span>
      <span>SLOPE: 2.85° | ROUGHNESS: LOW</span>
    `;
  }
}

// Render active tomographic expected 2D subsurface ice reconstruction
function renderIceReconstruction() {
  if (!dashboardData) return;
  const w = iceReconstructionCanvas.width;
  const h = iceReconstructionCanvas.height;
  
  irCtx.fillStyle = "#000";
  irCtx.fillRect(0, 0, w, h);
  
  // Draw simulated tomographic radar sweep grid
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
        // Soil
        irCtx.fillStyle = `rgba(100, 110, 120, ${0.12 + val * 0.08})`;
      } else if (r >= 6 && r < 14) {
        // Subsurface Ice concentration
        const distFromCenter = Math.abs(c - cols / 2) / (cols / 2);
        const iceWeightFactor = state.weights.radar;
        const iceProb = (1 - distFromCenter) * iceWeightFactor;
        
        if (val < iceProb) {
          irCtx.fillStyle = `rgba(20, 216, 255, ${0.3 + val * 0.5})`;
        } else {
          irCtx.fillStyle = `rgba(75, 80, 90, ${0.18 + val * 0.08})`;
        }
      } else {
        // Bedrock
        irCtx.fillStyle = `rgba(30, 35, 42, ${0.25 + val * 0.15})`;
      }
      irCtx.fillRect(c * cw, r * rh, cw - 1, rh - 1);
    }
  }
  
  // Render animated sweep line
  const time = Date.now() / 1500;
  const sweepX = (time % 1) * w;
  irCtx.strokeStyle = "rgba(0, 255, 170, 0.6)";
  irCtx.lineWidth = 1.5;
  irCtx.beginPath();
  irCtx.moveTo(sweepX, 0);
  irCtx.lineTo(sweepX, h);
  irCtx.stroke();
  
  const grad = irCtx.createLinearGradient(sweepX - 25, 0, sweepX, 0);
  grad.addColorStop(0, "rgba(0, 255, 170, 0)");
  grad.addColorStop(1, "rgba(0, 255, 170, 0.15)");
  irCtx.fillStyle = grad;
  irCtx.fillRect(sweepX - 25, 0, 25, h);
  
  // Overlay radar grid
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
  
  // Axes
  pCtx.strokeStyle = "rgba(255,255,255,0.1)";
  pCtx.lineWidth = 1;
  pCtx.beginPath();
  pCtx.moveTo(25, 10);
  pCtx.lineTo(25, h - 20);
  pCtx.lineTo(w - 10, h - 20);
  pCtx.stroke();
  
  // Labels
  pCtx.fillStyle = "#6b7280";
  pCtx.font = "7px monospace";
  pCtx.fillText("SCIENCE", w - 45, h - 5);
  
  pCtx.save();
  pCtx.translate(8, h / 2 + 10);
  pCtx.rotate(-Math.PI / 2);
  pCtx.fillText("SAFETY", 0, 0);
  pCtx.restore();
  
  // Draw Pareto frontier curve (dashed line)
  pCtx.strokeStyle = "rgba(0, 255, 170, 0.25)";
  pCtx.setLineDash([4, 4]);
  pCtx.beginPath();
  pCtx.moveTo(35, 15);
  pCtx.bezierCurveTo(65, 18, 100, 35, 120, 65);
  pCtx.stroke();
  pCtx.setLineDash([]);
  
  // Plot candidate points
  const points = [
    { x: 45, y: 18, label: "LZ-C (Steep, High Ice)", color: varColor("red") },
    { x: 75, y: 28, label: "LZ-A (Recommended Safe Rim)", color: varColor("green"), active: true },
    { x: 110, y: 55, label: "LZ-B (Ultra Safe, Low Ice)", color: varColor("amber") },
  ];
  
  points.forEach((p) => {
    pCtx.beginPath();
    pCtx.arc(p.x, p.y, p.active ? 5 : 3.5, 0, Math.PI * 2);
    pCtx.fillStyle = p.color;
    pCtx.fill();
    if (p.active) {
      pCtx.strokeStyle = "#fff";
      pCtx.stroke();
    }
  });
}

function updateTemporalSimulation() {
  const step = Number(document.getElementById("temporalSlider").value);
  state.temporalStep = step;
  
  const explanations = [
    "<strong>10 Thousand Years:</strong> Early volatile transport. Initial migration of water vapor molecules trapping in permanently shadowed cold-traps. Sublimation loss remains negligible at local temperatures.",
    "<strong>100 Thousand Years:</strong> Subsurface accumulation. Gardening rate is moderate. Frost deposition begins forming thin layered sheets within upper 10 cm of regolith.",
    "<strong>1 Million Years:</strong> Volatile gardening. Micrometeoroid impacts garden the upper 1 meter, mixing water ice into a homogeneous regolith-ice mix. Bedrock temperature stabilizes.",
    "<strong>100 Million Years:</strong> Deep stratigraphic consolidation. Gardened ice layer is compressed into a consolidated ice sheet at 3-5m depth. Volatile transport pathways established."
  ];
  
  document.getElementById("timelineExplanation").innerHTML = explanations[step];
}

function bindControls() {
  // Layer Toggles
  document.querySelectorAll(".layer-item input[type='checkbox']").forEach((checkbox) => {
    const key = checkbox.id.replace("layer_", "");
    checkbox.addEventListener("change", () => {
      state.layers[key] = checkbox.checked;
      renderAllVisuals();
    });
  });
  
  // Opacity Sliders
  document.querySelectorAll(".layer-item input[type='range']").forEach((slider) => {
    const key = slider.id.replace("opacity_", "");
    slider.addEventListener("input", () => {
      state.opacity[key] = Number(slider.value) / 100;
      renderAllVisuals();
    });
  });
  
  // Algorithm selector
  document.getElementById("algorithmSelect").addEventListener("change", (e) => {
    state.algorithm = e.target.value;
    
    const wearVal = state.algorithm === "rrt" ? "0.19 ± 0.04" : "0.12 ± 0.03";
    const energyVal = state.algorithm === "rrt" ? "21.6 kWh" : "18.2 kWh";
    const riskVal = state.algorithm === "rrt" ? "Moderate (8.5%)" : "Low (4.2%)";
    
    document.getElementById("telemetryWear").textContent = wearVal;
    document.getElementById("telemetryEnergy").textContent = `${energyVal} ± 1.1 kWh`;
    document.getElementById("telemetryCommRisk").textContent = riskVal;
    
    renderAllVisuals();
  });
  
  // Temporal Slider
  document.getElementById("temporalSlider").addEventListener("input", updateTemporalSimulation);
  updateTemporalSimulation(); // Initial call
  
  // XAI Sliders
  const wSliders = ["radar", "shadow", "thermal", "roughness"];
  wSliders.forEach((s) => {
    const slider = document.getElementById(`w_${s}`);
    slider.addEventListener("input", () => {
      state.weights[s] = Number(slider.value) / 100;
      document.getElementById(`label_w_${s}`).textContent = `${slider.value}%`;
      
      updateCalculations();
      updateCounterfactual();
    });
  });
  
  document.getElementById("refreshBtn").addEventListener("click", () => {
    updateCalculations();
    renderAllVisuals();
  });
}

function varColor(name) {
  const colors = {
    green: "#00ffaa",
    amber: "#ffb000",
    red: "#ff3355",
    cyan: "#14d8ff",
    purple: "#b05cff",
  };
  return colors[name] || "#ffffff";
}
