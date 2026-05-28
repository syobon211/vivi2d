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
const metadata = JSON.parse(fs.readFileSync(path.join(outDir, "route-metadata.json"), "utf8"));
const trackedMetadata = readJson("apps/vivi2d-com/route-metadata.json");

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  fail("root portal was not generated.");
}

const docsRedirect = path.join(outDir, "docs", "index.html");
if (!fs.existsSync(docsRedirect)) {
  fail("vivi2d.com/docs compatibility redirect was not generated.");
} else {
  const redirectHtml = fs.readFileSync(docsRedirect, "utf8");
  if (!redirectHtml.includes("/en/latest/")) {
    fail("vivi2d.com/docs compatibility redirect must target the English latest docs route.");
  }
}

if (normalizeJson(metadata) !== normalizeJson(trackedMetadata)) {
  fail("apps/vivi2d-com/route-metadata.json is out of sync with generated metadata.");
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
