export const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
export const LEFT_EYE = [362, 385, 387, 263, 373, 380];

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return value;
}

function pointDistance(first, second, width, height) {
  const dx = (first.x - second.x) * width;
  const dy = (first.y - second.y) * height;
  return Math.hypot(dx, dy);
}

export function eyeAspectRatio(landmarks, indices, width = 1, height = 1) {
  if (!Array.isArray(landmarks) || !Array.isArray(indices) || indices.length !== 6) {
    throw new TypeError("eyeAspectRatio expects landmarks and six eye indices");
  }

  finiteNumber(width, "width");
  finiteNumber(height, "height");
  if (width <= 0 || height <= 0) {
    throw new RangeError("width and height must be positive");
  }

  const eye = indices.map((index) => {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new TypeError(`missing eye landmark at index ${index}`);
    }
    return point;
  });

  const verticalOne = pointDistance(eye[1], eye[5], width, height);
  const verticalTwo = pointDistance(eye[2], eye[4], width, height);
  const horizontal = pointDistance(eye[0], eye[3], width, height);
  if (horizontal === 0) {
    throw new RangeError("eye horizontal distance must be greater than zero");
  }

  return (verticalOne + verticalTwo) / (2 * horizontal);
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("median expects at least one value");
  }
  const sorted = values.map((value) => finiteNumber(value, "sample")).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function calibratedThreshold(samples, ratio = 0.72, minimum = 0.12, maximum = 0.35) {
  finiteNumber(ratio, "ratio");
  finiteNumber(minimum, "minimum");
  finiteNumber(maximum, "maximum");
  if (ratio <= 0 || minimum <= 0 || maximum <= minimum) {
    throw new RangeError("invalid threshold configuration");
  }

  return Math.min(maximum, Math.max(minimum, median(samples) * ratio));
}

export function estimatedBlinksPerMinute(totalBlinks, startedAt, now) {
  finiteNumber(totalBlinks, "totalBlinks");
  finiteNumber(startedAt, "startedAt");
  finiteNumber(now, "now");
  const elapsedMinutes = (now - startedAt) / 60_000;
  if (elapsedMinutes <= 0 || totalBlinks <= 0) {
    return 0;
  }
  return totalBlinks / elapsedMinutes;
}

export class BlinkCounter {
  constructor({ threshold, minimumClosedFrames = 2, maximumClosedMs = 1_500 }) {
    finiteNumber(threshold, "threshold");
    finiteNumber(minimumClosedFrames, "minimumClosedFrames");
    finiteNumber(maximumClosedMs, "maximumClosedMs");
    if (threshold <= 0 || minimumClosedFrames < 1 || maximumClosedMs <= 0) {
      throw new RangeError("invalid blink counter configuration");
    }

    this.threshold = threshold;
    this.minimumClosedFrames = Math.floor(minimumClosedFrames);
    this.maximumClosedMs = maximumClosedMs;
    this.totalBlinks = 0;
    this.closedFrames = 0;
    this.closedAt = null;
    this.state = "open";
  }

  update(ear, now) {
    finiteNumber(ear, "ear");
    finiteNumber(now, "now");

    if (ear < this.threshold) {
      if (this.closedFrames === 0) {
        this.closedAt = now;
      }
      this.closedFrames += 1;
      this.state = "closed";
      return { blink: false, state: this.state, totalBlinks: this.totalBlinks };
    }

    const closedDuration = this.closedAt === null ? 0 : now - this.closedAt;
    const blink = this.closedFrames >= this.minimumClosedFrames
      && closedDuration <= this.maximumClosedMs;

    if (blink) {
      this.totalBlinks += 1;
    }

    this.closedFrames = 0;
    this.closedAt = null;
    this.state = "open";
    return { blink, state: this.state, totalBlinks: this.totalBlinks };
  }

  resetPartial() {
    this.closedFrames = 0;
    this.closedAt = null;
    this.state = "unknown";
  }
}
