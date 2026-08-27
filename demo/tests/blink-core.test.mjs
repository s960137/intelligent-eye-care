import assert from "node:assert/strict";
import test from "node:test";

import {
  BlinkCounter,
  calibratedThreshold,
  estimatedBlinksPerMinute,
  eyeAspectRatio,
  median,
} from "../blink-core.mjs";

test("calculates EAR from six landmarks", () => {
  const landmarks = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 4, y: 0 },
    { x: 3, y: -1 },
    { x: 1, y: -1 },
  ];

  assert.equal(eyeAspectRatio(landmarks, [0, 1, 2, 3, 4, 5]), 0.5);
});

test("uses the median open-eye EAR for calibration", () => {
  assert.equal(median([0.31, 0.29, 0.3, 0.1, 0.32]), 0.3);
  assert.equal(calibratedThreshold([0.31, 0.29, 0.3, 0.1, 0.32]), 0.216);
});

test("clamps calibrated thresholds to a safe demo range", () => {
  assert.equal(calibratedThreshold([0.1, 0.1, 0.1]), 0.12);
  assert.equal(calibratedThreshold([0.6, 0.6, 0.6]), 0.35);
});

test("counts a blink after enough closed frames and reopening", () => {
  const counter = new BlinkCounter({ threshold: 0.22, minimumClosedFrames: 2 });
  counter.update(0.18, 0);
  counter.update(0.17, 70);
  const event = counter.update(0.3, 140);

  assert.equal(event.blink, true);
  assert.equal(counter.totalBlinks, 1);
});

test("ignores a single low-EAR frame", () => {
  const counter = new BlinkCounter({ threshold: 0.22, minimumClosedFrames: 2 });
  counter.update(0.18, 0);
  const event = counter.update(0.3, 70);

  assert.equal(event.blink, false);
  assert.equal(counter.totalBlinks, 0);
});

test("does not count a long eye closure as a normal blink", () => {
  const counter = new BlinkCounter({
    threshold: 0.22,
    minimumClosedFrames: 2,
    maximumClosedMs: 1_000,
  });
  counter.update(0.18, 0);
  counter.update(0.17, 100);
  const event = counter.update(0.3, 1_500);

  assert.equal(event.blink, false);
  assert.equal(counter.totalBlinks, 0);
});

test("discards a partial blink when face tracking is lost", () => {
  const counter = new BlinkCounter({ threshold: 0.22, minimumClosedFrames: 2 });
  counter.update(0.18, 0);
  counter.update(0.17, 70);
  counter.resetPartial();

  assert.equal(counter.update(0.3, 140).blink, false);
});

test("estimates blinks per minute from elapsed session time", () => {
  assert.equal(estimatedBlinksPerMinute(6, 0, 30_000), 12);
  assert.equal(estimatedBlinksPerMinute(0, 0, 30_000), 0);
});
