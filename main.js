const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

let config = {
  backgroundColor: "#06040e",
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
};

let page = {
  width: canvas.width * 1.005,
  height: canvas.height * 1.1,
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  page = {
    width: canvas.width * 1.005,
    height: canvas.height * 1.1,
  };
  draw();
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


function connectDots(dots) {
  for (let i = 0; i < dots.length; i++) {
    const a = dots[i];
    for (let j = i + 1; j < dots.length; j++) {
      const b = dots[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (
        dx < config.maxEdgeWidthDistance &&
        dy < config.maxEdgeHeightDistance
      ) {
        if (a.neighbors.length < config.maxNeighbors) a.neighbors.push(b);
        if (b.neighbors.length < config.maxNeighbors) b.neighbors.push(a);
      }
    }
  }
}

function drawDots(dots) {
  ctx.save();
  for (const a of dots) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, config.dotSize / 2, 0, 2 * Math.PI);
    ctx.fillStyle = getRainbowColor(a.x, config.dotOpacity);
    ctx.fill();
  }
  ctx.restore();
}

function drawLines(dots) {
  ctx.save();
  ctx.lineWidth = config.lineWidth;
  for (const a of dots) {
    for (const b of a.neighbors) {
      // To avoid drawing the same line twice
      if (a.x < b.x || (a.x === b.x && a.y < b.y)) {
        const avgX = (a.x + b.x) / 2;
        const opacity = config.lineMinOpacity + Math.random() * (config.lineMaxOpacity - config.lineMinOpacity);
        ctx.strokeStyle = getRainbowColor(avgX, opacity);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawTriangles(dots) {
  for (const a of dots) {
    const neighbors = a.neighbors.slice(0, config.maxNeighbors);
    for (let i = 0; i < neighbors.length; i++) {
      for (let j = i + 1; j < neighbors.length; j++) {
        const b = neighbors[i];
        const c = neighbors[j];

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();

        const avgX = (a.x + b.x + c.x) / 3;
        const opacity = config.planeMinOpacity + Math.random() * (config.planeMaxOpacity - config.planeMinOpacity);
        ctx.fillStyle = getRainbowColor(avgX, opacity);
        ctx.fill();
      }
    }
  }
}

function draw() {
  canvas.style.background = config.backgroundColor;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dots = generateDots();
  connectDots(dots);
  drawDots(dots);
  drawLines(dots);
  drawTriangles(dots);
}

draw();

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
    draw();
  }
};
