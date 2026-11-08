import assert from "node:assert/strict";
import { test } from "node:test";
import { setupPrompt } from "./setup-prompt.ts";

const all = { body: true, light: true, distance: true };

test("says step into view when nobody is detected", () => {
  const p = setupPrompt({ body: false, light: false, distance: false }, "Step into view", null);
  assert.equal(p.title, "Step into view");
  assert.equal(p.showChecks, false);
});

test("asks for light before the body and distance", () => {
  const p = setupPrompt({ body: false, light: false, distance: false }, "", null);
  assert.equal(p.tone, "fix");
  assert.match(p.title, /light/);
});

test("asks for the whole body, and to step back when too close", () => {
  assert.match(setupPrompt({ ...all, body: false }, "", null).title, /whole body in the frame/);
  assert.match(
    setupPrompt({ ...all, body: false, distance: false }, "Step back a little", null).title,
    /Step back/,
  );
});

test("passes the distance hint through", () => {
  assert.equal(
    setupPrompt({ ...all, distance: false }, "Move a little closer", null).title,
    "Move a little closer",
  );
});

test("counts down once every check is ready", () => {
  const p = setupPrompt(all, "", 2);
  assert.equal(p.tone, "ready");
  assert.equal(p.title, "Hold still… 2");
});
