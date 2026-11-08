import test from "node:test";
import assert from "node:assert/strict";
import { clampTrim, formatTime } from "./trim.ts";

test("a demo trim stays inside the video and between 2 and 60 seconds", () => {
  assert.deepEqual(clampTrim({ start: 0, end: 300 }, 300), { start: 0, end: 60 });
  assert.deepEqual(clampTrim({ start: 10, end: 90 }, 300, "end"), { start: 30, end: 90 });
  assert.deepEqual(clampTrim({ start: 20, end: 20.5 }, 300, "start"), { start: 20, end: 22 });
  assert.deepEqual(clampTrim({ start: 9.5, end: 10 }, 300, "end"), { start: 8, end: 10 });
  assert.deepEqual(clampTrim({ start: 299, end: 300 }, 300, "start"), { start: 298, end: 300 });
  assert.deepEqual(clampTrim({ start: -5, end: 4 }, 3), { start: 0, end: 3 });
  assert.equal(formatTime(75.25), "1:15.3");
  assert.equal(formatTime(4), "0:04.0");
});
