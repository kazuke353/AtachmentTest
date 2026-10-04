// Zero-dependency static file server for site/, used by the Playwright suite
// and for local preview (`npm run serve`). It serves exactly what GitHub Pages
// publishes: the files in site/, with no build step.
//
//   PORT=4173 node scripts/serve.mjs   -> http://127.0.0.1:4173/
//   HOST overrides the bind address (default 127.0.0.1).

import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "4173", 10);

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const contentType = (file) => TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";

// The real site root, so symlinks inside site/ cannot point outside it.
const ROOT = await realpath(SITE_DIR);

const isInside = (p) => p === ROOT || p.startsWith(ROOT + path.sep);

function sendText(req, res, status, message, extraHeaders = {}) {
  const body = `${message}\n`;
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

// Map a request path to a file inside ROOT, or return null (404) / "bad" (400).
async function resolveFile(rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return "bad";
  }
  if (decoded.includes("\0")) return "bad";

  // Normalize against a fixed root first; anything that climbs out is rejected.
  const candidate = path.resolve(ROOT, "." + path.posix.normalize("/" + decoded.replaceAll("\\", "/")));
  if (!isInside(candidate)) return null;

  let target = candidate;
  let info;
  try {
    info = await stat(target);
    if (info.isDirectory()) {
      // Mirror GitHub Pages: /dir redirects are not needed here, just serve /dir/index.html.
      target = path.join(target, "index.html");
      info = await stat(target);
    }
  } catch {
    return null;
  }
  if (!info.isFile()) return null;

  // Follow symlinks and make sure the final file is still inside site/.
  let real;
  try {
    real = await realpath(target);
  } catch {
    return null;
  }
  if (!isInside(real)) return null;
  return { file: real, size: info.size };
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(req, res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
      return;
    }

    const rawPath = (req.url || "/").split(/[?#]/, 1)[0] || "/";
    if (!rawPath.startsWith("/")) {
      sendText(req, res, 400, "Bad Request");
      return;
    }

    const found = await resolveFile(rawPath);
    if (found === "bad") {
      sendText(req, res, 400, "Bad Request");
      return;
    }
    if (!found) {
      sendText(req, res, 404, "Not Found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType(found.file),
      "Content-Length": found.size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(found.file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(req, res, 500, "Internal Server Error");
    else res.destroy();
  }
});

server.on("error", (err) => {
  console.error(`Could not start server on ${HOST}:${PORT}: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  console.log(`Serving ${path.relative(process.cwd(), SITE_DIR) || "."} at http://${HOST}:${port}/`);
});

// Nothing to flush: exit straight away so keep-alive sockets cannot hold the process open.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => process.exit(0));
}
