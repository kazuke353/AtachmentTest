// Checks for scripts/serve.mjs, the static server the suite runs against.
// No browser involved, so this file runs in the "desktop" project only.
import http from "node:http";
import { test, expect } from "@playwright/test";

/** Send a raw request so the path is not normalised by a URL parser first. */
function rawRequest(baseURL, rawPath, method = "GET") {
  const { hostname, port } = new URL(baseURL);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: rawPath, method }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

test.describe("static server", () => {
  test("serves the quiz page at / and /index.html as HTML", async ({ baseURL }) => {
    for (const p of ["/", "/index.html", "/?utm=1", "/index.html#top"]) {
      const res = await rawRequest(baseURL, p);
      expect(res.status, p).toBe(200);
      expect(res.headers["content-type"], p).toBe("text/html; charset=utf-8");
      expect(res.body, p).toContain("<title>The Attachment Style Test</title>");
    }
  });

  test("answers HEAD without a body and rejects other methods", async ({ baseURL }) => {
    const head = await rawRequest(baseURL, "/", "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect(Number(head.headers["content-length"])).toBeGreaterThan(1000);

    const post = await rawRequest(baseURL, "/", "POST");
    expect(post.status).toBe(405);
    expect(post.headers.allow).toBe("GET, HEAD");
  });

  test("returns 404 for missing files", async ({ baseURL }) => {
    for (const p of ["/missing.html", "/favicon.ico", "/nested/dir/", "/index.html/extra"]) {
      const res = await rawRequest(baseURL, p);
      expect(res.status, p).toBe(404);
    }
  });

  test("never serves files outside site/", async ({ baseURL }) => {
    const attempts = [
      "/../package.json",
      "/../../../../../../etc/passwd",
      "/%2e%2e/package.json",
      "/%2E%2E/%2E%2E/etc/passwd",
      "/..%2fpackage.json",
      "/..%2f..%2f..%2f..%2fetc%2fpasswd",
      "/..%5cpackage.json",
      "/....//package.json",
      "//etc/passwd",
      "/scripts/serve.mjs",
      "/site/index.html",
    ];
    for (const p of attempts) {
      const res = await rawRequest(baseURL, p);
      expect([400, 404], `${p} -> ${res.status}`).toContain(res.status);
      expect(res.body, p).not.toContain("devDependencies");
      expect(res.body, p).not.toContain("root:");
      expect(res.body, p).not.toContain("createServer");
    }
  });

  test("rejects malformed paths", async ({ baseURL }) => {
    for (const p of ["/%E0%A4%A", "/index.html%00", "/%"]) {
      const res = await rawRequest(baseURL, p);
      expect(res.status, p).toBe(400);
    }
  });
});
