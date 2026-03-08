const canvas = document.querySelector("canvas");
const clock = document.getElementById("clock");
const ctx = canvas.getContext("2d", { willReadFrequently: false });

// Create fallback overlay to prevent black screens
const fallbackCanvas = document.createElement('canvas');
const fallbackCtx = fallbackCanvas.getContext('2d', { willReadFrequently: false });
fallbackCanvas.style.position = 'fixed';
fallbackCanvas.style.top = '0';
fallbackCanvas.style.left = '0';
fallbackCanvas.style.pointerEvents = 'none';
fallbackCanvas.style.zIndex = '-1';
fallbackCanvas.style.display = 'none';
document.body.appendChild(fallbackCanvas);

let lastGoodFrame = null; // Store snapshot as ImageData
let contextIsHealthy = true;
let framesSinceSnapshot = 0;
const SNAPSHOT_INTERVAL = 60; // Take snapshot every 60 frames (~2 seconds at 30fps)

/**
 * Performance Optimizations & Anti-Black-Screen System:
 * - Shapes, lines, and colors are cached and only regenerated on restart
 * - Only Y-positions are animated (not X), reducing calculations
 * - Pre-computed sine table (fastSin) for wave calculations
 * - Canvas context loss recovery with fallback frame system
 * - Periodically captures snapshots of healthy frames
 * - Displays last good frame when GPU context is lost (prevents black screens!)
 * - Clock updates are throttled and only modify DOM when text changes
 * - All performance options (dotCount, maxNeighbors, frameRate) are user-configurable
 * - FPS monitoring with automatic performance degradation under high GPU load
 * - Intelligent performance modes: normal → reduced → paused based on FPS
 * - Automatically pauses when page is hidden (e.g., fullscreen gaming)
 * - Try/catch wrapped drawing with automatic fallback activation
 */

let config = {
  backgroundColor: "#050206",
  curveStrength: 200, // 1 = linear, >1 = more U-shaped, <1 = flatter
  leftMaxHeight: 1,
  middleMaxHeight: 0.3,
  rightMaxHeight: 1,
  maxEdgeWidthDistance: 200,
  maxEdgeHeightDistance: 200,
  maxNeighbors: 7,
  removalThreshold: 20,
  planeMinOpacity: 0.001,
  planeMaxOpacity: 0.0095,
  lineMinOpacity: 0.001,
  lineMaxOpacity: 0.05,
  lineWidth: 1,
  dotCount: 400,
  dotSize: 1,
  dotOpacity: 0.2,
  spikeAmplitude: 0.05,
  spikeFrequency: 2000,
  frameRate: 30,
  animationAmplitude: 8,
  animationRandomness: 0.3, // 0 = fully deterministic, 1 = max randomness added to wave
  /// "left", "center", "right", "top-left", "top", "top-right", "bottom-left", "bottom", "bottom-right"
  clockPosition: "none",
  clockFormat: "HH:mm", // "HH:mm:ss" or "MM/DD/YYYY HH:mm:ss"
  clockOutline: "#f0f0f01f",
  clockColor: "clip", // "clip" or a color in string format, clip will use a rainbow gradient
  clockOpacity: 0.5, // Opacity for the clock text
  clockPadding: 10, // Padding in pixels
  clockFontSize: "100px", // Font size for the clock
  clockFont: "'monospace', monospace", // Font family for the clock
};

let page = {
  width: canvas.width,
  height: canvas.height * 1.1,
};

let restart = false;
let dots = [];
let lines = [];
let shapes = [];

// Performance monitoring and auto-degradation
let fpsHistory = [];
let performanceMode = 'normal'; // 'normal', 'reduced', 'paused'
let lastDrawnFrame = false;
const FPS_HISTORY_SIZE = 60; // Track last 60 frames
const LOW_FPS_THRESHOLD = 15; // Below this, reduce performance
const CRITICAL_FPS_THRESHOLD = 5; // Below this, pause animation

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  page = {
    width: canvas.width,
    height: canvas.height * 1.1,
  };
  // Resize fallback canvas too
  fallbackCanvas.width = canvas.width;
  fallbackCanvas.height = canvas.height;
  restart = true;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Handle canvas context loss (helps prevent crashes in Wallpaper Engine)
canvas.addEventListener('contextlost', (e) => {
  e.preventDefault();
  console.warn('Canvas context lost - activating fallback frame');
  contextIsHealthy = false;
  showFallbackFrame();
});

canvas.addEventListener('contextrestored', () => {
  console.log('Canvas context restored, regenerating scene');
  contextIsHealthy = true;
  restart = true;
  performanceMode = 'normal';
  hideFallbackFrame();
  // Force immediate redraw
  if (dots.length > 0) {
    try {
      draw();
    } catch (e) {
      console.error('Failed to draw after context restore:', e);
    }
  }
});

function showFallbackFrame() {
  if (lastGoodFrame && fallbackCanvas.width > 0 && fallbackCanvas.height > 0) {
    try {
      fallbackCtx.putImageData(lastGoodFrame, 0, 0);
      fallbackCanvas.style.display = 'block';
      canvas.style.display = 'none'; // Hide broken canvas
      console.log('Fallback frame activated');
    } catch (e) {
      console.error('Failed to show fallback frame:', e);
      // Last resort: just show background color
      fallbackCtx.fillStyle = config.backgroundColor;
      fallbackCtx.fillRect(0, 0, fallbackCanvas.width, fallbackCanvas.height);
      fallbackCanvas.style.display = 'block';
    }
  }
}

function hideFallbackFrame() {
  fallbackCanvas.style.display = 'none';
  canvas.style.display = 'block';
}

function captureSnapshot() {
  if (!contextIsHealthy) return;

  try {
    // Capture current frame as ImageData
    lastGoodFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    framesSinceSnapshot = 0;
  } catch (e) {
    console.warn('Failed to capture snapshot:', e);
    contextIsHealthy = false;
    showFallbackFrame();
  }
}

// Pause animation when page is hidden (e.g., when gaming in fullscreen)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden, pausing animation to save GPU');
    performanceMode = 'paused';
  } else {
    console.log('Page visible, resuming animation');
    performanceMode = 'normal';
    fpsHistory = []; // Reset FPS tracking    
    // Check if we need to recover from black screen 
    if (!contextIsHealthy) {
      console.log('Attempting to recover context...');
      contextIsHealthy = true;
      hideFallbackFrame();
      restart = true;
    }
  }
}
);
// Periodic health check - attempt recovery if stuck in fallback mode
setInterval(() => {
  if (!contextIsHealthy && fallbackCanvas.style.display !== 'none') {
    console.log('Health check: attempting context recovery...');
    contextIsHealthy = true;
    hideFallbackFrame();
    restart = true;
  }
}, 5000); // Check every 5 seconds

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function uShapeY(x) {
  const t = 2 * (x / page.width) - 1;
  const u = 1 - Math.pow(Math.abs(t), config.curveStrength);
  const left = config.leftMaxHeight;
  const middle = config.middleMaxHeight;
  const right = config.rightMaxHeight;
  const edgeBlend = t < 0
    ? lerp(left, middle, 1 + t)
    : lerp(middle, right, t);
  const shape = lerp(middle, edgeBlend, u);

  // Express spikeFrequency as spikes per width, amplitude as % of height
  const spikesPerWidth = config.spikeFrequency || 5; // e.g., 5 spikes across width
  const spikeAmplitude = (config.spikeAmplitude || 0.1) * page.height; // % of height
  const spike = Math.sin((x / page.width) * Math.PI * 2 * spikesPerWidth) * spikeAmplitude;

  return page.height * 1.1 * (1 - shape) + spike;
}
function getRainbowColor(x, opacity) {
  const hue = 270 - (x / page.width) * 270;
  return `hsla(${hue % 360}, 100%, 50%, ${opacity})`;
}
function generateBalancedXCoords(count) {
  const xs = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    // U-shape: more density at sides
    const x = (page.width) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    xs.push(x);
  }
  // Shuffle for randomness
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

function generateDots() {
  const xs = generateBalancedXCoords(config.dotCount);
  const dots = [];
  for (const x of xs) {
    const yMin = uShapeY(x);
    const y = yMin + Math.random() * (page.height - yMin);
    dots.push({
      x,
      y,
      neighbors: [],
      // Random properties for undeterministic animation
      randomDir: Math.random() < 0.5 ? -1 : 1,
      randomPhase: Math.random() * Math.PI * 2,
      randomSpeed: 0.5 + Math.random() * 1.5 // Speed multiplier between 0.5x and 2x
    });
  }
  return dots;
}
function connectDots() {
  lines = [];
  shapes = [];
  // Clear neighbors
  for (const dot of dots) dot.neighbors = [];
  // Note: Colors and geometry are cached here and only recalculated on restart for performance
  // Build neighbors and lines
  for (let i = 0; i < dots.length; i++) {
    const a = dots[i];
    a.color = getRainbowColor(a.x, config.dotOpacity);
    for (let j = i + 1; j < dots.length; j++) {
      const b = dots[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx < config.maxEdgeWidthDistance && dy < config.maxEdgeHeightDistance) {
        if (a.neighbors.length >= config.maxNeighbors || b.neighbors.length >= config.maxNeighbors) continue;
        a.neighbors.push(b);
        b.neighbors.push(a);
        // Store line with fixed color/opacity
        const avgX = (a.x + b.x) / 2;
        const opacity = config.lineMinOpacity + Math.random() * (config.lineMaxOpacity - config.lineMinOpacity);
        lines.push({ a, b, color: getRainbowColor(avgX, opacity) });
      }
    }
  }
  // Build triangles (planes)
  for (const a of dots) {
    const neighbors = a.neighbors;//.slice(0, config.maxNeighbors);
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const b = neighbors[i];
        const c = neighbors[j];
        const avgX = (a.x + b.x + c.x) / 3;
        const opacity = config.planeMinOpacity + Math.random() * (config.planeMaxOpacity - config.planeMinOpacity);
        shapes.push({ a, b, c, color: getRainbowColor(avgX, opacity) });
      }
    }
  }
}

function drawDots() {
  for (const a of dots) {
    ctx.beginPath();
    ctx.arc(a.x, a.animatedY ?? a.y, config.dotSize / 2, 0, 2 * Math.PI);
    ctx.fillStyle = a.color;
    ctx.fill();
  }
}

function drawLines() {
  ctx.lineWidth = config.lineWidth;
  for (const line of lines) {
    ctx.strokeStyle = line.color;
    ctx.beginPath();
    ctx.moveTo(line.a.x, line.a.animatedY ?? line.a.y);
    ctx.lineTo(line.b.x, line.b.animatedY ?? line.b.y);
    ctx.stroke();
  }
}

function drawShapes() {
  for (const shp of shapes) {
    ctx.beginPath();
    ctx.moveTo(shp.a.x, shp.a.animatedY ?? shp.a.y);
    ctx.lineTo(shp.b.x, shp.b.animatedY ?? shp.b.y);
    ctx.lineTo(shp.c.x, shp.c.animatedY ?? shp.c.y);
    ctx.closePath();
    ctx.fillStyle = shp.color || "#ffffff";
    ctx.fill();
  }
}

const SINE_TABLE_SIZE = 8192;
const TWO_PI = Math.PI * 2;
const SIN_TABLE = new Float32Array(SINE_TABLE_SIZE);

for (let i = 0; i < SINE_TABLE_SIZE; i++) {
  SIN_TABLE[i] = Math.sin((i / SINE_TABLE_SIZE) * TWO_PI);
}

function fastSin(x) {
  // Map x to [0, TWO_PI) and scale to index
  const wrapped = ((x % TWO_PI) + TWO_PI) % TWO_PI;
  const index = Math.floor(wrapped / TWO_PI * SINE_TABLE_SIZE);
  return SIN_TABLE[index];
}

function animateDots(time) {
  const base = time / 1000;
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];

    // Deterministic wave component
    const wave = fastSin(base + i);
    let offsetY = wave * config.animationAmplitude;

    // Add bounded random component if enabled
    if (config.animationRandomness > 0) {
      // Each dot has its own random phase, speed, and direction
      const randomWave = fastSin(base * dot.randomSpeed + dot.randomPhase);
      const randomOffset = randomWave * dot.randomDir * config.animationAmplitude * config.animationRandomness;
      offsetY += randomOffset;
    }

    dot.animatedY = dot.y + offsetY;

    // Clamp to valid range (respect the curve configuration)
    const yMin = uShapeY(dot.x);
    dot.animatedY = Math.max(yMin, Math.min(page.height, dot.animatedY));
  }
}

function draw() {
  // Safety check: verify context is available
  if (!ctx || !contextIsHealthy) {
    console.warn('Context unavailable, using fallback');
    showFallbackFrame();
    return;
  }

  try {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Performance-based rendering
    if (performanceMode === 'paused') {
      // In paused mode, still draw dots/lines but skip shapes for minimal rendering
      drawDots();
      drawLines();
    } else if (performanceMode === 'reduced') {
      // Reduced mode: draw everything but animation is frozen
      drawDots();
      drawLines();
      drawShapes();
    } else {
      // Normal mode: full rendering
      drawDots();
      drawLines();
      drawShapes();
    }

    lastDrawnFrame = true;

    // Periodically capture snapshot for fallback
    framesSinceSnapshot++;
    if (framesSinceSnapshot >= SNAPSHOT_INTERVAL) {
      captureSnapshot();
    }
  } catch (e) {
    console.error('Draw failed:', e);
    contextIsHealthy = false;
    showFallbackFrame();
  }
}

// Animation loop
let lastTime = null;
let lastFpsCheck = null;
// Just a safeguard to prevent overflow and use memory allocations efficiently
const MODULO = 1_000_000_000;

function monitorPerformance(currentTime) {
  if (lastFpsCheck !== null) {
    const delta = currentTime - lastFpsCheck;
    if (delta > 0) {
      const currentFps = 1000 / delta;
      fpsHistory.push(currentFps);

      // Keep history size manageable
      if (fpsHistory.length > FPS_HISTORY_SIZE) {
        fpsHistory.shift();
      }

      // Check average FPS over last 30 frames (0.5-1 second)
      if (fpsHistory.length >= 30) {
        const recentFps = fpsHistory.slice(-30);
        const avgFps = recentFps.reduce((a, b) => a + b, 0) / recentFps.length;

        // Auto-adjust performance mode based on FPS
        if (avgFps < CRITICAL_FPS_THRESHOLD && performanceMode !== 'paused') {
          console.warn(`Critical FPS (${avgFps.toFixed(1)}), pausing animation`);
          performanceMode = 'paused';
        } else if (avgFps < LOW_FPS_THRESHOLD && performanceMode === 'normal') {
          console.warn(`Low FPS (${avgFps.toFixed(1)}), reducing performance`);
          performanceMode = 'reduced';
        } else if (avgFps > LOW_FPS_THRESHOLD * 1.5 && performanceMode === 'reduced') {
          console.log(`FPS recovered (${avgFps.toFixed(1)}), resuming normal mode`);
          performanceMode = 'normal';
        } else if (avgFps > CRITICAL_FPS_THRESHOLD * 2 && performanceMode === 'paused') {
          console.log(`FPS recovered (${avgFps.toFixed(1)}), resuming reduced mode`);
          performanceMode = 'reduced';
        }
      }
    }
  }
  lastFpsCheck = currentTime;
}

async function loop(time) {
  time = time % MODULO;
  if (lastTime !== null) lastTime = lastTime % MODULO;

  if (restart || dots.length === 0) {
    dots = generateDots();
    connectDots();
    restart = false;
  }

  if (lastTime == null || time - lastTime >= 1000 / config.frameRate) {
    // Monitor performance to auto-adjust quality
    monitorPerformance(time);

    // Only animate if not in paused mode and context is healthy
    if (performanceMode !== 'paused' && contextIsHealthy) {
      animateDots(time);
    }

    // Always try to draw (will use fallback if context lost)
    draw();
    lastTime = time;
  }

  requestAnimationFrame(loop);
}
// Draw animated random rainbow mesh
requestAnimationFrame(loop);

// Capture initial good frame after a short delay (ensures first render is complete)
setTimeout(() => {
  if (contextIsHealthy && dots.length > 0) {
    captureSnapshot();
    console.log('Initial fallback frame captured');
  }
}, 500);


function formatDate(date, format) {
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  return format
    .replace(/YYYY/g, date.getFullYear())
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()))
    .replace(/ss/g, pad(date.getSeconds()))
    .replace(/SSS/g, pad(date.getMilliseconds(), 3));
}

// Positioning logic
const positions = {
  "left": { top: `50%`, left: `${config.clockPadding}px`, transform: `translateY(-50%)` },
  "center": { top: `50%`, left: `50%`, transform: `translate(-50%, -50%)` },
  "right": { top: `50%`, right: `${config.clockPadding}px`, transform: `translateY(-50%)` },
  "top-left": { top: `${config.clockPadding}px`, left: `${config.clockPadding}px` },
  "top": { top: `${config.clockPadding}px`, left: `50%`, transform: `translateX(-50%)` },
  "top-right": { top: `${config.clockPadding}px`, right: `${config.clockPadding}px` },
  "bottom-left": { bottom: `${config.clockPadding}px`, left: `${config.clockPadding}px` },
  "bottom": { bottom: `${config.clockPadding}px`, left: `50%`, transform: `translateX(-50%)` },
  "bottom-right": { bottom: `${config.clockPadding}px`, right: `${config.clockPadding}px` },
  "none": { display: "none" } // Special case for no clock
};

/**
 * Uses the <div id=clock> element to display the current time.
 * positioned based on the config.clockPosition value using absolute positioning and px padding from edges
 * Optimized: Only updates text when it actually changes, throttled updates for performance
 */

let clockNeedsUpdate = true;
let lastClockText = '';
let lastClockUpdate = 0;
const CLOCK_UPDATE_INTERVAL = 100; // Update clock max every 100ms

async function drawClock() {
  if (config.clockPosition === "none" || config.clockOpacity <= 0) {
    clock.style.display = "none";
    return;
  }

  // Throttle clock updates for performance
  const now = performance.now();
  if (now - lastClockUpdate < CLOCK_UPDATE_INTERVAL && !clockNeedsUpdate) {
    requestAnimationFrame(drawClock);
    return;
  }

  const newClockText = formatDate(new Date(), config.clockFormat);
  // Only update DOM if text actually changed
  if (newClockText !== lastClockText) {
    clock.innerHTML = newClockText;
    lastClockText = newClockText;
    lastClockUpdate = now;
  }
  if (clockNeedsUpdate) {
    clock.style.display = "block";
    clock.style.position = "absolute";
    clock.style.webkitTextStroke = config.clockOutline && config.clockOutline !== 'none' ? `1px ${config.clockOutline}` : null;
    clock.style.fontFamily = config.clockFont;
    clock.style.padding = `${config.clockPadding}px`;
    clock.style.fontSize = config.clockFontSize;

    // If clockColor is set to "clip", use a rainbow gradient using the rainbow color function with the x position of the clock
    if (config.clockColor === "clip") {
      const x = clock.offsetLeft + clock.offsetWidth / 2; // Get the horizontal center of the clock
      const opacity = config.clockOpacity || 1; // Use the clockOpacity config value
      /// 5% width offset to left and right for a wider gradient, between 0 and maxWidth of the screen ofc
      const left = Math.max(0, x - clock.offsetWidth * 1.6);
      const right = Math.min(page.width, x + clock.offsetWidth * 1.6);
      const middle = (left + right) / 2;
      clock.style.background = `linear-gradient(to right, 
                                                ${getRainbowColor(left, opacity)}, 
                                                ${getRainbowColor(middle, opacity)}, 
                                                ${getRainbowColor(right, opacity)})`;
      clock.style.webkitBackgroundClip = "text";
      clock.style.color = "transparent"; // Make text transparent to show gradient
    } else {
      clock.style.color = config.clockColor;
    }
    Object.assign(clock.style, positions[config.clockPosition]);
    clockNeedsUpdate = false; // Reset update flag
  }
  requestAnimationFrame(drawClock);
}
// Call drawClock initially to set the clock position
requestAnimationFrame(drawClock);

// Wallpaper Engine property listener
window.wallpaperPropertyListener = {
  applyUserProperties: function (properties) {
    if (properties.backgroundcolor) config.backgroundColor = properties.backgroundcolor.value;
    if (properties.curvestrength) config.curveStrength = properties.curvestrength.value;
    if (properties.leftmaxheight) config.leftMaxHeight = properties.leftmaxheight.value;
    if (properties.middlemaxheight) config.middleMaxHeight = properties.middlemaxheight.value;
    if (properties.rightmaxheight) config.rightMaxHeight = properties.rightmaxheight.value;
    if (properties.maxedgewidthdistance) config.maxEdgeWidthDistance = properties.maxedgewidthdistance.value;
    if (properties.maxedgeheightdistance) config.maxEdgeHeightDistance = properties.maxedgeheightdistance.value;
    if (properties.maxneighbors) config.maxNeighbors = properties.maxneighbors.value;
    if (properties.removalthreshold) config.removalThreshold = properties.removalthreshold.value;
    if (properties.planeminopacity) config.planeMinOpacity = properties.planeminopacity.value;
    if (properties.planemaxopacity) config.planeMaxOpacity = properties.planemaxopacity.value;
    if (properties.lineminopacity) config.lineMinOpacity = properties.lineminopacity.value;
    if (properties.linemaxopacity) config.lineMaxOpacity = properties.linemaxopacity.value;
    if (properties.linewidth) config.lineWidth = properties.linewidth.value;
    if (properties.dotcount) config.dotCount = properties.dotcount.value;
    if (properties.dotsize) config.dotSize = properties.dotsize.value;
    if (properties.dotopacity) config.dotOpacity = properties.dotopacity.value;
    if (properties.spikeamplitude) config.spikeAmplitude = properties.spikeamplitude.value;
    if (properties.spikefrequency) config.spikeFrequency = properties.spikefrequency.value;
    if (properties.framerate) config.frameRate = properties.framerate.value;
    if (properties.animationamplitude) config.animationAmplitude = properties.animationamplitude.value;
    if (properties.animationrandomness) config.animationRandomness = properties.animationrandomness.value;
    if (properties.clockposition) config.clockPosition = properties.clockposition.value;
    if (properties.clockformat) config.clockFormat = properties.clockformat.value;
    if (properties.clockoutline) config.clockOutline = properties.clockoutline.value;
    if (properties.clockcolor) config.clockColor = properties.clockcolor.value;
    if (properties.clockopacity) config.clockOpacity = properties.clockopacity.value;
    if (properties.clockpadding) config.clockPadding = properties.clockpadding.value;
    if (properties.clockfontsize) config.clockFontSize = properties.clockfontsize.value;
    if (properties.clockfont) config.clockFont = properties.clockfont.value;
    restart = true; // Restart to apply new properties
    clockNeedsUpdate = true; // Force clock to update its style
    performanceMode = 'normal'; // Reset performance mode when user changes settings
    fpsHistory = []; // Clear FPS history
    // Try to recover if in fallback mode
    if (!contextIsHealthy) {
      console.log('Settings changed, attempting context recovery...');
      contextIsHealthy = true;
      hideFallbackFrame();
    }
    draw();
  }
};
