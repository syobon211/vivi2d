import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "tmp", "vivi2d-com-check");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function normalizeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function routeFile(locale, slug) {
  return path.join(outDir, locale, "latest", slug || "", "index.html");
}

function htmlAttributeValue(html, pattern) {
  const match = pattern.exec(html);
  return match?.[1] ?? null;
}

function compareStringSet(name, actual, expected) {
  const actualText = [...actual].sort().join("\n");
  const expectedText = [...expected].sort().join("\n");
  if (actualText !== expectedText) {
    fail(`${name} mismatch.\nExpected:\n${expectedText}\nActual:\n${actualText}`);
  }
}

fs.rmSync(outDir, { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  ["apps/vivi2d-com/scripts/build.mjs", "--out", outDir],
  {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

const manifest = readJson("docs/user/publication-manifest.json");
const wranglerConfig = readJson("wrangler.jsonc");
const metadata = JSON.parse(fs.readFileSync(path.join(outDir, "route-metadata.json"), "utf8"));
const trackedMetadata = readJson("apps/vivi2d-com/route-metadata.json");

if (wranglerConfig.name !== "vivi2d") {
  fail("wrangler.jsonc must deploy the vivi2d Worker.");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(wranglerConfig.compatibility_date ?? "")) {
  fail("wrangler.jsonc must pin a compatibility_date.");
}
if (typeof wranglerConfig.main !== "undefined") {
  fail("vivi2d.com should remain a static-assets-only Worker until a Worker script is reviewed.");
}
if (wranglerConfig.assets?.directory !== "./apps/vivi2d-com/dist") {
  fail("wrangler.jsonc must deploy apps/vivi2d-com/dist as the static assets directory.");
}
if (typeof wranglerConfig.assets?.binding !== "undefined") {
  fail("wrangler.jsonc should not expose an assets binding without a reviewed Worker script.");
}

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  fail("root portal was not generated.");
} else {
  const rootHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  const requiredRootSnippets = [
    "https://github.com/syobon211/vivi2d",
    "https://github.com/syobon211/vivi2d/releases/tag/v0.1.0-alpha.1",
    "https://github.com/syobon211/vivi2d/tree/main/docs",
    "pre-1.0 alpha",
    "source/provenance-only alpha",
    "Coming Soon",
  ];
  for (const snippet of requiredRootSnippets) {
    if (!rootHtml.includes(snippet)) {
      fail(`root portal is missing expected public-alpha content: ${snippet}`);
    }
  }
  for (const removedDemoSnippet of [
    "/assets/readme/vivi2d-workflow-demo.gif",
    "/assets/readme/vivi2d-workflow-demo.webm",
  ]) {
    if (rootHtml.includes(removedDemoSnippet)) {
      fail(`root portal should not include README workflow demo media: ${removedDemoSnippet}`);
    }
  }
}

const docsRedirect = path.join(outDir, "docs", "index.html");
if (!fs.existsSync(docsRedirect)) {
  fail("vivi2d.com/docs compatibility redirect was not generated.");
} else {
  const redirectHtml = fs.readFileSync(docsRedirect, "utf8");
  const expectedDocsUrl = new URL("https://github.com/syobon211/vivi2d/tree/main/docs").href;
  const canonicalHref = htmlAttributeValue(
    redirectHtml,
    /<link rel="canonical" href="([^"]+)">/,
  );
  const bodyHref = htmlAttributeValue(redirectHtml, /<a href="([^"]+)">Vivi2D documentation<\/a>/);
  if (canonicalHref !== expectedDocsUrl || bodyHref !== expectedDocsUrl) {
    fail("vivi2d.com/docs compatibility redirect must target the public docs entry point.");
  }
}

if (normalizeJson(metadata) !== normalizeJson(trackedMetadata)) {
  fail("apps/vivi2d-com/route-metadata.json is out of sync with generated metadata.");
}

const robotsPath = path.join(outDir, "robots.txt");
if (!fs.existsSync(robotsPath)) {
  fail("robots.txt was not generated.");
} else {
  const robots = fs.readFileSync(robotsPath, "utf8");
  const expectedRobots = "User-agent: *\nAllow: /\nSitemap: https://vivi2d.com/sitemap.xml\n";
  if (robots !== expectedRobots) {
    fail("robots.txt must allow the portal and point at the canonical sitemap.");
  }
}

const sitemapPath = path.join(outDir, "sitemap.xml");
if (!fs.existsSync(sitemapPath)) {
  fail("sitemap.xml was not generated.");
} else {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const actualUrls = new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
  );
  const expectedUrls = new Set([
    "https://vivi2d.com/",
    "https://vivi2d.com/docs/",
    ...metadata.routes.flatMap((route) =>
      route.paths.map((routePath) => `https://vivi2d.com${routePath}`),
    ),
  ]);
  compareStringSet("sitemap.xml URL set", actualUrls, expectedUrls);
  for (const sitemapUrl of actualUrls) {
    const parsedUrl = new URL(sitemapUrl);
    if (parsedUrl.origin !== "https://vivi2d.com") {
      fail(`sitemap.xml must only include canonical vivi2d.com URLs: ${sitemapUrl}`);
    }
  }
}

const headersPath = path.join(outDir, "_headers");
if (!fs.existsSync(headersPath)) {
  fail("_headers was not generated.");
} else {
  const headers = fs.readFileSync(headersPath, "utf8");
  const expectedHeaders = [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
    "  X-Frame-Options: DENY",
    "  Strict-Transport-Security: max-age=31536000",
    "  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'none'; connect-src 'none'; font-src 'self'; manifest-src 'self'; upgrade-insecure-requests",
  ].join("\n") + "\n";
  if (headers !== expectedHeaders) {
    fail("_headers must pin the reviewed vivi2d.com security headers.");
  }
}

const metadataSlugs = new Set(metadata.routes.map((route) => route.slug));
for (const route of manifest.routes) {
  if (!route.published && metadataSlugs.has(route.slug)) {
    fail(`unpublished route ${route.slug || "<index>"} appears in route metadata.`);
  }
  if (!route.published) {
    for (const locale of manifest.locales) {
      if (fs.existsSync(routeFile(locale, route.slug))) {
        fail(`unpublished route ${route.slug || "<index>"} was generated for ${locale}.`);
      }
    }
  }
}

fs.rmSync(outDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error("[vivi2d-com-site] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[vivi2d-com-site] passed");
