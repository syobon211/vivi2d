import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(siteRoot, "..", "..");
const defaultOutDir = path.join(siteRoot, "dist");
const locales = ["en", "ja", "zh-Hans", "ko-KR"];
const docsBaseUrl = argValue("--docs-base-url") ?? process.env.VIVI_DOCS_BASE_URL ?? "";
const githubUrl = "https://github.com/vivi2d/vivi2d";
const downloadUrl = `${githubUrl}/releases`;
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
  <meta name="description" content="Vivi2D portal for the editor, viewer, SDK, and documentation.">
  <style>
    :root {
      color-scheme: dark;
      --bg: #050609;
      --text: #f4f6fb;
      --muted: #8c94a4;
      --line: rgba(217, 227, 242, 0.25);
      --line-soft: rgba(217, 227, 242, 0.11);
      --accent: #6ed6ff;
    }
    * { box-sizing: border-box; }
    body {
      min-height: 100vh;
      margin: 0;
      color: var(--text);
      background: #020306;
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
      grid-template-rows: auto 1fr;
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
      font-weight: 500;
      letter-spacing: 0.28em;
      text-shadow: 0 0 22px rgba(255, 255, 255, 0.14);
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
      color: var(--text);
    }
    .nav-dot {
      width: 3px;
      height: 3px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.45);
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
      border-color: var(--line-soft);
      background: rgba(255, 255, 255, 0.06);
    }
    .github-link svg {
      width: 18px;
      height: 18px;
      fill: currentColor;
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
      min-height: 430px;
      overflow: hidden;
      --breath-scale: 1.011;
      --eye-scale: 0.82;
      --gaze-x-px: 8px;
      --gaze-y-px: 0px;
      --head-x-px: 0px;
      --head-y-px: -2px;
      --body-x-px: 0px;
      --hair-px: 5px;
      --hair-small-px: 2px;
      --hair-deg: 2deg;
      --mouth-scale: 1;
      --mouth-open-scale: 1;
      --smile-y-px: 0px;
      --brow-y-px: 0px;
      --physics-px: 0px;
      --angle-deg: -3.8deg;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #030408;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.02),
        0 34px 90px rgba(0, 0, 0, 0.42);
    }
    .avatar {
      position: absolute;
      left: 39%;
      bottom: clamp(-720px, -62vw, -560px);
      width: min(94vw, 1100px);
      min-width: 820px;
      transform:
        translate(calc(-50% + var(--head-x-px) + var(--body-x-px)), var(--head-y-px))
        rotate(var(--angle-deg))
        scaleY(var(--breath-scale));
      transform-origin: 50% 82%;
      filter: drop-shadow(0 32px 52px rgba(0, 0, 0, 0.48));
      opacity: 0.95;
      transition: transform 120ms ease-out;
    }
    .avatar .eye {
      transform: translate(var(--gaze-x-px), var(--gaze-y-px)) scaleY(var(--eye-scale));
      transform-box: fill-box;
      transform-origin: center;
      transition: transform 120ms ease-out;
    }
    .avatar .brow {
      transform: translateY(var(--brow-y-px));
      transform-box: fill-box;
      transform-origin: center;
      transition: transform 120ms ease-out;
    }
    .avatar .hair-motion {
      transform: translateX(calc(var(--hair-small-px) + var(--physics-px))) rotate(var(--hair-deg));
      transform-box: fill-box;
      transform-origin: 50% 12%;
      transition: transform 120ms ease-out;
    }
    .avatar .mouth {
      transform: translateY(var(--smile-y-px)) scale(var(--mouth-scale), var(--mouth-open-scale));
      transform-box: fill-box;
      transform-origin: center;
      transition: transform 120ms ease-out;
    }
    .sliders {
      position: absolute;
      right: clamp(28px, 4vw, 54px);
      top: 50%;
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      width: min(280px, 28%);
      max-height: calc(100% - 72px);
      padding: 0;
      overflow: hidden;
      transform: translateY(-50%);
      color: rgba(235, 241, 249, 0.72);
      font-size: 0.76rem;
      text-shadow: 0 1px 12px rgba(0, 0, 0, 0.72);
      z-index: 2;
    }
    .slider {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
    }
    .slider span:first-child {
      min-width: 72px;
    }
    .slider-value {
      min-width: 34px;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .slider input {
      width: 100%;
      min-width: 120px;
      height: 18px;
      margin: 0;
      appearance: none;
      background: transparent;
      cursor: pointer;
    }
    .slider input::-webkit-slider-runnable-track {
      height: 1px;
      background:
        linear-gradient(90deg, var(--accent) 0 var(--progress, 50%), rgba(255, 255, 255, 0.22) var(--progress, 50%) 100%);
    }
    .slider input::-moz-range-track {
      height: 1px;
      background:
        linear-gradient(90deg, var(--accent) 0 var(--progress, 50%), rgba(255, 255, 255, 0.22) var(--progress, 50%) 100%);
    }
    .slider input::-webkit-slider-thumb {
      width: 8px;
      height: 8px;
      margin-top: -3.5px;
      appearance: none;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 16px rgba(110, 214, 255, 0.58);
    }
    .slider input::-moz-range-thumb {
      width: 8px;
      height: 8px;
      border: 0;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 16px rgba(110, 214, 255, 0.58);
    }
    @media (max-width: 800px) {
      .shell {
        width: min(100vw - 28px, 720px);
        gap: 28px;
      }
      .nav-links {
        gap: 10px;
        font-size: 0.84rem;
      }
      .nav-dot {
        display: none;
      }
      .stage {
        min-height: 560px;
        aspect-ratio: 9 / 14;
      }
      .avatar {
        left: 50%;
        bottom: -150px;
        width: 220%;
        min-width: 920px;
      }
      .sliders {
        right: 22px;
        top: auto;
        width: calc(100% - 44px);
        grid-template-columns: 1fr;
        bottom: 72px;
        max-height: 178px;
        overflow-y: auto;
        transform: none;
        gap: 11px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="nav">
      <div class="brand">Vivi2D</div>
      <nav class="nav-links" aria-label="Primary">
        <a href="${escapeHtml(downloadUrl)}">Download</a>
        <span class="nav-dot" aria-hidden="true"></span>
        <a href="${escapeHtml(docsUrl("en", ""))}">Docs</a>
        <span class="nav-dot" aria-hidden="true"></span>
        <a class="github-link" href="${escapeHtml(githubUrl)}" aria-label="GitHub">
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.22-3.37-1.22-.45-1.19-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.85.09-.67.35-1.12.64-1.38-2.22-.26-4.55-1.14-4.55-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.36 9.36 0 0 1 12 6.9c.85 0 1.7.12 2.5.34 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.82-4.57 5.07.36.32.68.94.68 1.9 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.07 10.07 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z" />
          </svg>
        </a>
      </nav>
    </header>
    <main class="stage-shell">
      <section class="stage" aria-label="Vivi2D preview stage" data-preview-stage>
        <svg class="avatar" viewBox="0 0 420 560" role="img" aria-label="Placeholder character preview">
          <defs>
            <linearGradient id="hair" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stop-color="#3d4553" />
              <stop offset="1" stop-color="#0f131b" />
            </linearGradient>
            <linearGradient id="skin" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stop-color="#f0d9cd" />
              <stop offset="1" stop-color="#b99489" />
            </linearGradient>
            <linearGradient id="suit" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stop-color="#202838" />
              <stop offset="1" stop-color="#06080d" />
            </linearGradient>
          </defs>
          <path d="M87 560c12-106 42-164 123-164s111 58 123 164H87Z" fill="url(#suit)" />
          <path d="M165 392h90l13 168H152l13-168Z" fill="#080b11" opacity=".92" />
          <path d="M183 332h54v84c0 16-12 29-27 29s-27-13-27-29v-84Z" fill="url(#skin)" />
          <path d="M118 162c0-84 44-128 94-128s91 42 91 128c0 83-33 151-92 151s-93-68-93-151Z" fill="url(#skin)" />
          <path class="hair-motion" d="M106 181C92 89 139 25 212 20c74 2 117 62 105 163-13-48-35-77-66-93-14 41-69 58-125 69-8 8-14 15-20 22Z" fill="url(#hair)" />
          <path class="hair-motion" d="M116 150c35-25 86-24 130-63 27 18 48 44 58 76-45-28-95-31-188-13Z" fill="#121823" opacity=".66" />
          <path class="brow" d="M133 188c34-13 49-12 69 2" fill="none" stroke="#485769" stroke-width="4" stroke-linecap="round" />
          <path class="brow" d="M220 190c22-13 42-14 67-2" fill="none" stroke="#485769" stroke-width="4" stroke-linecap="round" />
          <circle class="eye" cx="172" cy="207" r="10" fill="#7f97ad" />
          <circle class="eye" cx="254" cy="207" r="10" fill="#7f97ad" />
          <path class="mouth" d="M186 262c20 12 40 12 58 0" fill="none" stroke="#7b5c58" stroke-width="3" stroke-linecap="round" opacity=".55" />
          <path d="M115 235c-18-20-31-17-30 4 1 24 19 39 38 38" fill="#b99489" />
          <path d="M307 235c18-20 31-17 30 4-1 24-19 39-38 38" fill="#b99489" />
          <path d="M122 334c35 32 78 45 139 0" fill="none" stroke="#1d2635" stroke-width="16" stroke-linecap="round" />
          <path d="M95 526c29-34 57-52 91-58M326 526c-29-34-57-52-91-58" fill="none" stroke="#2e3a4f" stroke-width="8" opacity=".58" />
          <path d="M206 388v151" stroke="#354258" stroke-width="3" />
          <path d="M293 419l17 1 5 62-17 1-5-64Z" fill="#5bc8ee" opacity=".62" />
        </svg>
        <div class="sliders" aria-label="Preview controls">
          <label class="slider"><span>Eye Open</span><input type="range" min="0" max="1" step="0.01" value="0.82" data-preview-slider="eyeOpen" aria-label="Eye Open"><span class="slider-value">0.82</span></label>
          <label class="slider"><span>Eye Smile</span><input type="range" min="0" max="1" step="0.01" value="0.18" data-preview-slider="eyeSmile" aria-label="Eye Smile"><span class="slider-value">0.18</span></label>
          <label class="slider"><span>Smile</span><input type="range" min="-1" max="1" step="0.01" value="0.24" data-preview-slider="smile" aria-label="Smile"><span class="slider-value">0.24</span></label>
          <label class="slider"><span>Mouth</span><input type="range" min="0" max="1" step="0.01" value="0.36" data-preview-slider="mouthOpen" aria-label="Mouth"><span class="slider-value">0.36</span></label>
          <label class="slider"><span>Brow</span><input type="range" min="-1" max="1" step="0.01" value="0.16" data-preview-slider="brow" aria-label="Brow"><span class="slider-value">0.16</span></label>
          <label class="slider"><span>Gaze X</span><input type="range" min="-1" max="1" step="0.01" value="0.44" data-preview-slider="gazeX" aria-label="Gaze X"><span class="slider-value">0.44</span></label>
          <label class="slider"><span>Gaze Y</span><input type="range" min="-1" max="1" step="0.01" value="-0.12" data-preview-slider="gazeY" aria-label="Gaze Y"><span class="slider-value">-0.12</span></label>
          <label class="slider"><span>Head X</span><input type="range" min="-1" max="1" step="0.01" value="0.08" data-preview-slider="headX" aria-label="Head X"><span class="slider-value">0.08</span></label>
          <label class="slider"><span>Head Y</span><input type="range" min="-1" max="1" step="0.01" value="-0.07" data-preview-slider="headY" aria-label="Head Y"><span class="slider-value">-0.07</span></label>
          <label class="slider"><span>Face Angle</span><input type="range" min="-15" max="15" step="0.1" value="-3.8" data-preview-slider="angle" aria-label="Face Angle"><span class="slider-value">-3.8</span></label>
        </div>
      </section>
    </main>
  </div>
  <script>
    (() => {
      const stage = document.querySelector("[data-preview-stage]");
      if (!stage) return;

      const sliders = new Map(
        [...document.querySelectorAll("[data-preview-slider]")].map((input) => [
          input.dataset.previewSlider,
          input,
        ]),
      );

      const numberOf = (name) => Number(sliders.get(name)?.value ?? 0);
      const updateTrack = (input) => {
        const min = Number(input.min);
        const max = Number(input.max);
        const value = Number(input.value);
        const progress = ((value - min) / (max - min)) * 100;
        input.style.setProperty("--progress", progress + "%");
        const display = input.nextElementSibling;
        if (display) display.textContent = input.dataset.previewSlider === "angle" ? value.toFixed(1) : value.toFixed(2);
      };

      const render = () => {
        const eyeOpen = numberOf("eyeOpen");
        const eyeSmile = numberOf("eyeSmile");
        const smile = numberOf("smile");
        const mouthOpen = numberOf("mouthOpen");
        const brow = numberOf("brow");
        const gazeX = numberOf("gazeX");
        const gazeY = numberOf("gazeY");
        const headX = numberOf("headX");
        const headY = numberOf("headY");
        const angle = numberOf("angle");

        stage.style.setProperty("--breath-scale", String(1 + smile * 0.012));
        stage.style.setProperty("--eye-scale", String(Math.max(0.08, eyeOpen * (1 - eyeSmile * 0.42))));
        stage.style.setProperty("--gaze-x-px", gazeX * 18 + "px");
        stage.style.setProperty("--gaze-y-px", gazeY * 10 + "px");
        stage.style.setProperty("--head-x-px", headX * 18 + "px");
        stage.style.setProperty("--head-y-px", headY * 22 + "px");
        stage.style.setProperty("--body-x-px", "0px");
        stage.style.setProperty("--hair-px", "0px");
        stage.style.setProperty("--hair-small-px", "0px");
        stage.style.setProperty("--hair-deg", "0deg");
        stage.style.setProperty("--mouth-scale", String(1 + smile * 0.36));
        stage.style.setProperty("--mouth-open-scale", String(1 + mouthOpen * 0.58));
        stage.style.setProperty("--smile-y-px", smile * -5 + "px");
        stage.style.setProperty("--brow-y-px", brow * -8 + "px");
        stage.style.setProperty("--physics-px", "0px");
        stage.style.setProperty("--angle-deg", angle + "deg");

        for (const input of sliders.values()) updateTrack(input);
      };

      for (const input of sliders.values()) {
        input.addEventListener("input", render);
      }
      render();
    })();
  </script>
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
  writeOutput("docs/index.html", redirectHtml(docsUrl("en", "")));
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
