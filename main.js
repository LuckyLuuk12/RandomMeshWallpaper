const canvas = document.querySelector("canvas");
const clock = document.getElementById("clock");
const ctx = canvas.getContext("2d");

let config = {
  backgroundColor: "#050206",
  curveStrength: 100, // 1 = linear, >1 = more U-shaped, <1 = flatter
  leftMaxHeight: 1,
  middleMaxHeight: 0.2,
  rightMaxHeight: 1,
  maxEdgeWidthDistance: 200,
  maxEdgeHeightDistance: 200,
  maxNeighbors: 4,
  removalThreshold: 3,
  planeMinOpacity: 0.001,
  planeMaxOpacity: 0.0075,
  lineMinOpacity: 0.001,
  lineMaxOpacity: 0.03,
  lineWidth: 1,
  dotCount: 500,
  dotSize: 2,
  dotOpacity: 0.2,
  spikeAmplitude: 0.1,
  spikeFrequency: 800,
  frameRate: 1,
  animationAmplitude: 3,
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

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  page = {
    width: canvas.width,
    height: canvas.height * 1.1,
  };
  restart = true;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

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
    dots.push({ x, y, neighbors: [] });
  }
  return dots;
}
function connectDots() {
  lines = [];
  shapes = [];
  // Clear neighbors
  for (const dot of dots) dot.neighbors = [];
  // Build neighbors and lines
  for (let i = 0; i < dots.length; i++) {
    const a = dots[i];
    a.color = getRainbowColor(a.x, config.dotOpacity);
    for (let j = i + 1; j < dots.length; j++) {
      const b = dots[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx < config.maxEdgeWidthDistance && dy < config.maxEdgeHeightDistance) {
        if(a.neighbors.length >= config.maxNeighbors || b.neighbors.length >= config.maxNeighbors) continue;
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

function animateDots(time) {
  // Animate each dot's y position with a slow sine wave
  for (let i = 0; i < dots.length; i++) {
    let dot = dots[i];
    dot.animatedY = dot.y + Math.sin(time / 1000 + i) * config.animationAmplitude;
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = config.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawDots();
  drawLines();
  drawShapes();
}

// Animation loop
let lastTime = null;

async function loop(time) {
  // Just a safeguard to prevent overflow and use memory allocations efficiently
  const MODULO = 1_000_000_000;
  time = time % MODULO;
  if (lastTime !== null) lastTime = lastTime % MODULO;

  if (restart || dots.length === 0) {
    dots = generateDots();
    connectDots();
    restart = false;
  }
  if (lastTime == null || time - lastTime >= config.frameRate) {
    console.log(Math.floor(time/1000) + " | d: " + dots.length + " l: " + lines.length + " s: " + shapes.length);
    animateDots(time);
    draw();
    lastTime = time;
  }
  requestAnimationFrame(loop);
}
// Draw animated random rainbow mesh
requestAnimationFrame(loop);


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
/**
 * Uses the <div id=clock> element to display the current time.
 * positioned based on the config.clockPosition value using absolute positioning and px padding from edges
 */
async function drawClock() {
  if (config.clockPosition === "none") {
    clock.style.display = "none";
    return;
  }
  clock.style.display = "block";
  clock.style.position = "absolute";
  clock.style.webkitTextStroke = config.clockOutline && config.clockOutline !== 'none' ? `1px ${config.clockOutline}` : null;
  clock.style.fontFamily = config.clockFont;
  clock.style.padding = `${config.clockPadding}px`;
  clock.style.fontSize = config.clockFontSize;
  clock.innerHTML = formatDate(new Date(), config.clockFormat);

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
  Object.assign(clock.style, positions[config.clockPosition]);
  requestAnimationFrame(drawClock);
}
// Call drawClock initially to set the clock position
requestAnimationFrame(drawClock);

// Wallpaper Engine property listener
window.wallpaperPropertyListener = {
  applyUserProperties: function(properties) {
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
    if (properties.clockposition) config.clockPosition = properties.clockposition.value;
    if (properties.clockformat) config.clockFormat = properties.clockformat.value;
    if (properties.clockoutline) config.clockOutline = properties.clockoutline.value;
    if (properties.clockcolor) config.clockColor = properties.clockcolor.value;
    if (properties.clockopacity) config.clockOpacity = properties.clockopacity.value;
    if (properties.clockpadding) config.clockPadding = properties.clockpadding.value;
    if (properties.clockfontsize) config.clockFontSize = properties.clockfontsize.value;
    if (properties.clockfont) config.clockFont = properties.clockfont.value;
    draw();
    restart = true; // Restart to apply new properties
  }
};
