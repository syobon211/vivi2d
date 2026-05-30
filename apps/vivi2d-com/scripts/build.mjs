import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(siteRoot, "..", "..");
const defaultOutDir = path.join(siteRoot, "dist");
const locales = ["en", "ja", "zh-Hans", "ko-KR"];
const docsBaseUrl = argValue("--docs-base-url") ?? process.env.VIVI_DOCS_BASE_URL ?? "";
const githubUrl = "https://github.com/syobon211/vivi2d";
const releaseVersion = "0.1.0-alpha.1";
const releaseTag = `v${releaseVersion}`;
const releaseUrl = `${githubUrl}/releases/tag/${releaseTag}`;
const releasesUrl = `${githubUrl}/releases`;
const portalDocsUrl = docsBaseUrl ? docsUrl("en", "") : `${githubUrl}/tree/main/docs`;
const localeLabels = {
  en: "English",
  ja: "\u65e5\u672c\u8a9e",
  "zh-Hans": "\u7b80\u4f53\u4e2d\u6587",
  "ko-KR": "\ud55c\uad6d\uc5b4",
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const outDir = path.resolve(repoRoot, argValue("--out") ?? defaultOutDir);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function parseFrontmatter(text, file) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    throw new Error(`${file}: missing frontmatter`);
  }
  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closeIndex === -1) {
    throw new Error(`${file}: missing closing frontmatter`);
  }
  const data = {};
  for (const line of lines.slice(1, closeIndex)) {
    if (line.trim() === "" || line.startsWith("  ")) continue;
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      data[key] = JSON.parse(rawValue);
    } else if (rawValue === "true") {
      data[key] = true;
    } else if (rawValue === "false") {
      data[key] = false;
    } else {
      data[key] = rawValue;
    }
  }
  return {
    data,
    body: lines.slice(closeIndex + 1).join("\n").trim(),
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\n/);
  const chunks = [];
  let listItems = [];

  function flushList() {
    if (listItems.length === 0) return;
    chunks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const line of lines) {
    if (line.startsWith("- ")) {
      listItems.push(escapeHtml(line.slice(2)));
      continue;
    }
    flushList();
    if (line.startsWith("# ")) {
      chunks.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      chunks.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (/^\d+\. /.test(line)) {
      chunks.push(`<p>${escapeHtml(line)}</p>`);
    } else if (line.trim() !== "") {
      chunks.push(`<p>${escapeHtml(line)}</p>`);
    }
  }
  flushList();
  return chunks.join("\n");
}

function pagePath(locale, slug) {
  return slug === ""
    ? `docs/user/${locale}/index.md`
    : `docs/user/${locale}/${slug}.md`;
}

function routePath(locale, slug) {
  const suffix = slug === "" ? "" : `${slug}/`;
  return `/${locale}/latest/${suffix}`;
}

function docsUrl(locale, slug) {
  return `${docsBaseUrl.replace(/\/$/, "")}${routePath(locale, slug)}`;
}

function languageSelector({ locale = "en", slug = "", id = "language-selector", external = false } = {}) {
  const options = locales
    .map((candidate) => {
      const selected = candidate === locale ? " selected" : "";
      const value = external ? docsUrl(candidate, slug) : routePath(candidate, slug);
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(localeLabels[candidate])}</option>`;
    })
    .join("\n");
  const links = locales
    .map((candidate) => {
      const href = external ? docsUrl(candidate, slug) : routePath(candidate, slug);
      return `<a href="${escapeHtml(href)}">${escapeHtml(localeLabels[candidate])}</a>`;
    })
    .join(" ");
  return `<form class="language-selector" data-language-selector="${escapeHtml(id)}">
  <label for="${escapeHtml(id)}">Language</label>
  <select id="${escapeHtml(id)}" name="language">
${options}
  </select>
  <button type="button" data-language-submit>Open</button>
</form>
<noscript><p>${links}</p></noscript>
<script>
(() => {
  const form = document.querySelector("[data-language-selector='${escapeHtml(id)}']");
  if (!form) return;
  const select = form.querySelector("select");
  const submit = form.querySelector("[data-language-submit]");
  const go = () => {
    if (select?.value) window.location.href = select.value;
  };
  select?.addEventListener("change", go);
  submit?.addEventListener("click", go);
})();
</script>`;
}

function writeOutput(relativePath, text) {
  const file = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

function redirectHtml(target) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
  <title>Redirecting to Vivi2D Documentation</title>
  <link rel="canonical" href="${escapeHtml(target)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(target)}">Vivi2D documentation</a>.</p>
</body>
</html>
`;
}

function pageHtml(locale, slug) {
  const file = pagePath(locale, slug);
  const { data, body } = parseFrontmatter(readText(file), file);
  if (data.status !== "reviewed") {
    throw new Error(`${file}: published site routes require reviewed pages`);
  }
  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.title)} | Vivi2D</title>
  <meta name="description" content="${escapeHtml(data.description)}">
</head>
<body>
  <header>
${languageSelector({ locale, slug })}
  </header>
  <main>
${markdownToHtml(body)}
  </main>
</body>
</html>
`;
}

function rootHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Vivi2D</title>
  <meta name="description" content="Vivi2D public alpha portal for releases, documentation, and GitHub.">
  <style>
    :root {
      color-scheme: light;
      --paper: #f7f2e8;
      --paper-strong: #fffaf0;
      --ink: #17212d;
      --muted: #64717f;
      --line: rgba(23, 33, 45, 0.14);
      --line-strong: rgba(23, 33, 45, 0.22);
      --accent: #0f6e8f;
      --accent-soft: #dff3f7;
      --gold: #b87a19;
      --panel: rgba(255, 250, 240, 0.78);
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 0%, rgba(15, 110, 143, 0.15), transparent 28%),
        radial-gradient(circle at 94% 8%, rgba(184, 122, 25, 0.14), transparent 24%),
        linear-gradient(135deg, #f7f2e8 0%, #f4eadb 48%, #edf4f2 100%);
      font-family: "Aptos", "Segoe UI", sans-serif;
      overflow-x: hidden;
    }
    a { color: inherit; }
    .shell {
      width: min(1500px, calc(100vw - 56px));
      margin: 0 auto;
      min-height: 100vh;
      padding: clamp(24px, 3.5vw, 48px) 0;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: clamp(28px, 5vh, 48px);
    }
    .nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .brand {
      font-size: clamp(1.35rem, 2vw, 1.7rem);
      font-weight: 760;
      letter-spacing: 0.28em;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: clamp(12px, 2vw, 24px);
      color: var(--muted);
      font-size: clamp(0.88rem, 1.2vw, 1rem);
    }
    .nav-links a {
      text-decoration: none;
      transition: color 150ms ease;
    }
    .nav-links a:hover {
      color: var(--ink);
    }
    .nav-dot {
      width: 3px;
      height: 3px;
      border-radius: 999px;
      background: rgba(23, 33, 45, 0.28);
    }
    .github-link {
      display: inline-flex;
      width: 32px;
      height: 32px;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      border: 1px solid transparent;
      transition: border-color 150ms ease, background 150ms ease;
    }
    .github-link:hover {
      border-color: var(--line);
      background: rgba(255, 255, 255, 0.5);
    }
    .github-link svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 0.72fr);
      gap: clamp(24px, 4vw, 58px);
      align-items: center;
    }
    .hero-copy {
      max-width: 680px;
    }
    .eyebrow-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 0 22px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.48);
      color: rgba(23, 33, 45, 0.78);
      font-size: 0.75rem;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .badge-warning {
      border-color: rgba(184, 122, 25, 0.32);
      color: #80500e;
      background: rgba(255, 229, 180, 0.52);
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(3rem, 7vw, 7.25rem);
      font-weight: 780;
      line-height: 0.94;
      letter-spacing: -0.07em;
      text-wrap: balance;
    }
    .hero-lede {
      margin: 26px 0 0;
      color: rgba(23, 33, 45, 0.7);
      font-size: clamp(1rem, 1.5vw, 1.28rem);
      line-height: 1.72;
      max-width: 620px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 30px;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 18px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 700;
      letter-spacing: -0.01em;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.58);
      transition: transform 150ms ease, border-color 150ms ease, background 150ms ease;
    }
    .button:hover {
      transform: translateY(-1px);
      border-color: var(--line-strong);
      background: rgba(255, 255, 255, 0.84);
    }
    .button-primary {
      color: #fffaf0;
      background: linear-gradient(135deg, #17465e, #0f6e8f);
      border-color: transparent;
      box-shadow: 0 16px 42px rgba(15, 110, 143, 0.2);
    }
    .button-primary:hover {
      background: linear-gradient(135deg, #1c536f, #147da1);
    }
    .console-card {
      position: relative;
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid var(--line-strong);
      background: rgba(255, 250, 240, 0.78);
      box-shadow:
        0 28px 96px rgba(73, 50, 22, 0.12),
        0 0 0 1px rgba(255, 255, 255, 0.64);
      backdrop-filter: blur(16px);
    }
    .console-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
    }
    .console-title {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 760;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(23, 33, 45, 0.72);
    }
    .console-version {
      color: var(--accent);
      font-weight: 800;
      font-size: 0.9rem;
    }
    .release-ledger {
      display: grid;
      gap: 12px;
      align-content: start;
      padding: 20px;
    }
    .ledger-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-height: 48px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.5);
      color: rgba(23, 33, 45, 0.76);
      font-size: 0.86rem;
    }
    .ledger-row strong {
      color: var(--ink);
    }
    .ledger-ok {
      color: #0a6b46;
      font-weight: 800;
    }
    .ledger-warn {
      color: var(--gold);
      font-weight: 800;
    }
    .console-note {
      margin: 0;
      padding: 0 20px 20px;
      color: rgba(23, 33, 45, 0.62);
      font-size: 0.92rem;
      line-height: 1.6;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .info-card {
      min-height: 150px;
      padding: 22px;
      border-radius: 18px;
      border: 1px solid var(--line-soft);
      background: var(--panel);
      backdrop-filter: blur(14px);
    }
    .info-card h2 {
      margin: 0 0 12px;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
    }
    .info-card p,
    .info-card ul {
      margin: 0;
      color: rgba(23, 33, 45, 0.66);
      line-height: 1.65;
      font-size: 0.95rem;
    }
    .info-card ul {
      padding-left: 1.1rem;
    }
    .info-card a {
      color: var(--accent);
      text-decoration: none;
    }
    .info-card a:hover {
      text-decoration: underline;
    }
    .stage-shell {
      position: relative;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }
    .stage {
      position: relative;
      width: min(1240px, 100%);
      aspect-ratio: 16 / 9;
      min-height: 360px;
      overflow: hidden;
      display: grid;
      place-items: center;
      padding: clamp(32px, 7vw, 86px);
      border: 1px solid var(--line);
      border-radius: 14px;
      background:
        radial-gradient(circle at 50% 42%, rgba(15, 110, 143, 0.09), transparent 32%),
        rgba(255, 250, 240, 0.45);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.48),
        0 34px 90px rgba(73, 50, 22, 0.12);
    }
    .soon-card {
      max-width: 640px;
      text-align: center;
      transform: translateY(-2%);
    }
    .soon-kicker {
      margin: 0 0 18px;
      color: var(--accent);
      font-size: clamp(0.74rem, 1vw, 0.88rem);
      font-weight: 600;
      letter-spacing: 0.32em;
      text-transform: uppercase;
    }
    .soon-title {
      margin: 0;
      color: var(--ink);
      font-size: clamp(3.2rem, 8vw, 7.6rem);
      font-weight: 520;
      letter-spacing: -0.07em;
      line-height: 0.88;
    }
    .soon-copy {
      width: min(100%, 520px);
      margin: 26px auto 0;
      color: rgba(23, 33, 45, 0.6);
      font-size: clamp(0.94rem, 1.4vw, 1.15rem);
      line-height: 1.75;
    }
    .footer-note {
      color: rgba(23, 33, 45, 0.52);
      font-size: 0.85rem;
      text-align: center;
    }
    @media (max-width: 800px) {
      .shell {
        width: min(100vw - 28px, 720px);
        gap: 28px;
      }
      .nav {
        align-items: flex-start;
        flex-direction: column;
      }
      .nav-links {
        flex-wrap: wrap;
        gap: 10px;
        font-size: 0.84rem;
      }
      .nav-dot {
        display: none;
      }
      .hero {
        grid-template-columns: 1fr;
      }
      .info-grid {
        grid-template-columns: 1fr;
      }
      .stage {
        min-height: 520px;
        aspect-ratio: 9 / 14;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="nav">
      <div class="brand">Vivi2D</div>
      <nav class="nav-links" aria-label="Primary">
        <a href="${escapeHtml(releaseUrl)}">Release ${escapeHtml(releaseTag)}</a>
        <span class="nav-dot" aria-hidden="true"></span>
        <a href="${escapeHtml(portalDocsUrl)}">Docs</a>
        <span class="nav-dot" aria-hidden="true"></span>
        <a href="${escapeHtml(releasesUrl)}">All Releases</a>
        <span class="nav-dot" aria-hidden="true"></span>
        <a class="github-link" href="${escapeHtml(githubUrl)}" aria-label="GitHub">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.85.09-.67.35-1.12.64-1.38-2.22-.26-4.55-1.14-4.55-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.9c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.82-4.57 5.07.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.07 10.07 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" />
          </svg>
        </a>
      </nav>
    </header>
    <main class="hero">
      <section class="hero-copy" aria-labelledby="portal-title">
        <div class="eyebrow-row" aria-label="Project status">
          <span class="badge badge-warning">pre-1.0 alpha</span>
          <span class="badge">Apache-2.0</span>
          <span class="badge">source/provenance release</span>
          <span class="badge">character showcase coming soon</span>
        </div>
        <h1 id="portal-title">2D creation for everyone.</h1>
        <p class="hero-lede">
          Vivi2D is an experimental editor, viewer, and web SDK project for
          layered artwork workflows. The current public release is intended for
          source review, early developer evaluation, and docs-first exploration.
        </p>
        <div class="actions" aria-label="Primary actions">
          <a class="button button-primary" href="${escapeHtml(githubUrl)}">Open GitHub</a>
          <a class="button" href="${escapeHtml(releaseUrl)}">View ${escapeHtml(releaseTag)}</a>
          <a class="button" href="${escapeHtml(portalDocsUrl)}">Read Docs</a>
        </div>
      </section>
      <aside class="console-card" aria-label="Vivi2D release console">
        <div class="console-header">
          <p class="console-title">Release Console</p>
          <span class="console-version">${escapeHtml(releaseTag)}</span>
        </div>
        <div class="release-ledger" aria-label="Release status summary">
          <div class="ledger-row"><strong>Release</strong><span class="ledger-ok">Live</span></div>
          <div class="ledger-row"><strong>Checksums</strong><span class="ledger-ok">Yes</span></div>
          <div class="ledger-row"><strong>SBOM</strong><span class="ledger-ok">Yes</span></div>
          <div class="ledger-row"><strong>Installer</strong><span class="ledger-warn">Later</span></div>
          <div class="ledger-row"><strong>Docs</strong><span class="ledger-ok">GitHub</span></div>
        </div>
        <p class="console-note">The current alpha is source/provenance-only. One-click app packages will be added after installer gates are reviewed.</p>
      </aside>
    </main>
    <section class="info-grid" aria-label="Release information">
      <article class="info-card">
        <h2>Current Release</h2>
        <p>
          <a href="${escapeHtml(releaseUrl)}">${escapeHtml(releaseTag)}</a> is a
          source/provenance-only alpha with checksums, SBOM, third-party notices,
          and a source review archive.
        </p>
      </article>
      <article class="info-card">
        <h2>What To Try</h2>
        <ul>
          <li>Read the docs and release notes.</li>
          <li>Review source and package boundaries.</li>
          <li>Try local development from GitHub if you are comfortable with alpha software.</li>
        </ul>
      </article>
      <article class="info-card">
        <h2>Not Yet Included</h2>
        <ul>
          <li>One-click desktop installer.</li>
          <li>Stable public API guarantees.</li>
          <li>Bundled ComfyUI or model weights.</li>
        </ul>
      </article>
    </section>
    <section class="stage-shell">
      <section class="stage" aria-label="Vivi2D character placeholder">
        <div class="soon-card">
          <p class="soon-kicker">New Character</p>
          <h1 class="soon-title">Coming Soon</h1>
          <p class="soon-copy">A new Vivi2D portal character is being prepared. Until then, the portal stays focused on release links, docs, and alpha status.</p>
        </div>
      </section>
    </section>
    <footer class="footer-note">
      Vivi2D is independent software. Public artifacts use reviewed Vivi2D public-profile surfaces only.
    </footer>
  </div>
</body>
</html>
`;
}

function buildMetadata(manifest) {
  return {
    locales: manifest.locales,
    routes: manifest.routes
      .filter((route) => route.published)
      .map((route) => ({
        slug: route.slug,
        includeInNavigation: route.includeInNavigation,
        includeInSearch: route.includeInSearch,
        paths: locales.map((locale) => routePath(locale, route.slug)),
      }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
  };
}

function main() {
  const manifest = readJson("docs/user/publication-manifest.json");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  writeOutput("index.html", rootHtml());
  writeOutput("docs/index.html", redirectHtml(portalDocsUrl));
  const metadata = buildMetadata(manifest);
  writeOutput("route-metadata.json", `${JSON.stringify(metadata, null, 2)}\n`);

  for (const route of manifest.routes.filter((route) => route.published)) {
    for (const locale of locales) {
      const html = pageHtml(locale, route.slug);
      writeOutput(path.join(locale, "latest", route.slug || "", "index.html"), html);
    }
  }

  console.log(`[vivi2d-com] built ${metadata.routes.length} published route(s)`);
}

main();
