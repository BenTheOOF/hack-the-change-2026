import assert from "node:assert/strict";
import { test } from "node:test";
import { siteOrigin } from "./site-origin.ts";

function h(entries: Record<string, string>) {
  return new Headers(entries);
}

test("uses the proxy's public host, not the internal address", () => {
  delete process.env.SITE_URL;
  assert.equal(
    siteOrigin(h({ host: "app.example.com", "x-forwarded-proto": "https" })),
    "https://app.example.com",
  );
});

test("defaults to https for a public host without a forwarded proto", () => {
  delete process.env.SITE_URL;
  assert.equal(siteOrigin(h({ host: "app.example.com" })), "https://app.example.com");
});

test("keeps http for local development", () => {
  delete process.env.SITE_URL;
  assert.equal(siteOrigin(h({ host: "localhost:3000" })), "http://localhost:3000");
});

test("SITE_URL wins and loses its trailing slash", () => {
  process.env.SITE_URL = "https://physio.example.org/";
  assert.equal(siteOrigin(h({ host: "127.0.0.1:3000" })), "https://physio.example.org");
  delete process.env.SITE_URL;
});
