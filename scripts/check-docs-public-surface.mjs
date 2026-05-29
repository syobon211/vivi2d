import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const TEXT_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".txt",
  ".vtt",
  ".srt",
  ".svg",
  ".yaml",
  ".yml",
]);

const PUBLIC_PATHS = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "apps/vivi2d-com",
  "docs/developer",
  "docs/user",
];

const REFERENCE_DOC_ALLOWLIST = [
  "docs/developer/ip/",
  "docs/developer/quality/public-api-status.md",
  "docs/developer/quality/docs-migration-manifest.json",
  "docs/developer/documentation-architecture.md",
];

const THIRD_PARTY_CLAIM_PATTERNS = [
  /Live2D\s*(?:compatible|compatibility|style|like)/i,
  /Cubism\s*(?:compatible|compatibility|style|like)/i,
  /VTube\s*Studio\s*(?:compatible|compatibility|style|like)/i,
  /(?:Live2D|Cubism|VTube Studio)\s*(?:互換|風|対応|みたい)/i,
  /(?:Live2D|Cubism|VTube Studio)\s*(?:兼容|风格|类似|支持)/i,
  /(?:Live2D|Cubism|VTube Studio)\s*(?:호환|스타일|같은|지원)/i,
];

const PRIVATE_DEFORMATION_PATTERNS = [
  /\bBlendShape\b/i,
  /\bMorphTarget\b/i,
  /\bMeshPoseTrack\b/i,
  /\bLatticeDeformer\b/i,
  /\bLocalMotionDraft\b/i,
  /\bLocalPreviewSolver\b/i,
  /\bpreviewDeformedVertices\b/i,
  /\bguidedPreviewFit\b/i,
  /\bMLS\b/,
  /\bARAP\b/,
  /Moving\s+Least\s+Squares/i,
  /As[-\s]?Rigid[-\s]?As[-\s]?Possible/i,
  /キーフォーム|モーフターゲット|ブレンドシェイプ|ラティス|デフォーマ/i,
  /关键形|形变器|变形器|晶格|变形目标/i,
  /키폼|모프\s*타깃|블렌드\s*셰이프|래티스|디포머/i,
];

const USER_DOC_PRIVATE_COPY_PATTERNS = [
  /\bpreview\s+geometry\b/i,
  /\bpreview\s+shape\b/i,
  /プレビュー用の?形状/,
  /预览用形状/,
  /미리보기용\s*형상/,
];
const COMFYUI_INTEGRATION_ALLOWED_FILES = new Set([
  "docs/user/publication-manifest.json",
  "docs/user/en/index.md",
  "docs/user/ja/index.md",
  "docs/user/zh-Hans/index.md",
  "docs/user/ko-KR/index.md",
  "docs/user/en/integrations/comfyui.md",
  "docs/user/ja/integrations/comfyui.md",
  "docs/user/zh-Hans/integrations/comfyui.md",
  "docs/user/ko-KR/integrations/comfyui.md",
]);
const COMFYUI_CLAIM_PATTERNS = [
  /\bComfyUI[-\s]?compatible\b/i,
  /\bofficial\s+ComfyUI\s+support\b/i,
  /\bsupports\s+all\s+ComfyUI\s+workflows\b/i,
  /\bVivi2D\b.{0,80}\bofficially\s+supports\b.{0,80}\bComfyUI\b/i,
  /\bVivi2D\b.{0,80}\bsupports\s+all\b.{0,80}\bComfyUI\s+workflows?\b/i,
  /\bComfyUI\s+workflows?\s+are\s+safe\s+automatically\b/i,
  /\bone[-\s]?click\s+(?:ComfyUI\s+)?generation\b/i,
  /Vivi2D.{0,80}ComfyUI.{0,80}(公式サポート|公式対応|互換|すべてのワークフロー|自動的に安全|ワンクリック生成)/i,
  /Vivi2D.{0,80}ComfyUI.{0,80}(官方支持|官方兼容|兼容|所有工作流|自动安全|一键生成)/i,
  /Vivi2D.{0,80}ComfyUI.{0,80}(공식 지원|호환|모든 워크플로|자동으로 안전|원클릭 생성)/i,
  /ComfyUI\s*(?:互換|公式サポート|すべてのワークフロー|自動的に安全|ワンクリック生成)/i,
  /ComfyUI\s*(?:兼容|官方支持|所有工作流|自动安全|一键生成)/i,
  /ComfyUI\s*(?:호환|공식 지원|모든 워크플로|자동으로 안전|원클릭 생성)/i,
];
const COMFYUI_REQUIRED_PUBLIC_COPY_BY_LOCALE = {
  en: [
    /\boptional\s+local\s+(?:tool|workspace)\b/i,
    /\b(?:review|inspect)[^.\n]{0,120}\bbefore\s+(?:accepting|applying|saving)\b/i,
    /\bcustom\s+nodes?\b[^.\n]{0,160}\brun\s+(?:local\s+)?code\b/i,
    /\bComfyUI-See-through\b[\s\S]{0,800}\bvivi2d_compat_plugin\b/i,
    /\bvivi2d_compat_plugin\b/i,
    /ComfyUI\/custom_nodes/i,
    /\b(?:image\s+bytes|selected\s+image)\b/i,
  ],
  ja: [
    /任意のローカルツール/,
    /確認してから受け入れ|受け入れる前に確認/,
    /カスタムノード[^。\n]{0,160}コードを実行/,
    /\bComfyUI-See-through\b[\s\S]{0,800}\bvivi2d_compat_plugin\b/i,
    /\bvivi2d_compat_plugin\b/i,
    /ComfyUI\/custom_nodes/i,
    /画像バイト|選択した画像/,
  ],
  "zh-Hans": [
    /可选的本地工具/,
    /检查后再接受|接受前.*检查/,
    /自定义节点[^。\n]{0,160}执行代码/,
    /\bComfyUI-See-through\b[\s\S]{0,800}\bvivi2d_compat_plugin\b/i,
    /\bvivi2d_compat_plugin\b/i,
    /ComfyUI\/custom_nodes/i,
    /图像字节|所选图像/,
  ],
  "ko-KR": [
    /선택적인 로컬 도구/,
    /확인한 뒤에만 받아들이|받아들이기 전에.*확인/,
    /커스텀 노드[^.\n]{0,160}코드를 실행/,
    /\bComfyUI-See-through\b[\s\S]{0,800}\bvivi2d_compat_plugin\b/i,
    /\bvivi2d_compat_plugin\b/i,
    /ComfyUI\/custom_nodes/i,
    /이미지 바이트|선택한 이미지/,
  ],
};

function fail(message) {
  failures.push(message);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function listRepoFiles() {
  return runGit(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

function isPublicPath(file) {
  return PUBLIC_PATHS.some(
    (publicPath) => file === publicPath || file.startsWith(`${publicPath}/`),
  );
}

function isReferenceAllowed(file) {
  return REFERENCE_DOC_ALLOWLIST.some((allowed) =>
    allowed.endsWith("/") ? file.startsWith(allowed) : file === allowed,
  );
}

function localeFromUserDocFile(file) {
  return /^docs\/user\/([^/]+)\//.exec(file)?.[1] ?? null;
}

function shouldScan(file) {
  if (!isPublicPath(file)) return false;
  if (!TEXT_EXTENSIONS.has(path.extname(file))) return false;
  return fs.existsSync(path.join(root, file));
}

function selfTest() {
  const synthetic = [
    ["third-party", "Live2D compatible workflow", THIRD_PARTY_CLAIM_PATTERNS],
    ["private deformation", "LocalMotionDraft", PRIVATE_DEFORMATION_PATTERNS],
    ["user-doc private copy", "preview geometry", USER_DOC_PRIVATE_COPY_PATTERNS],
    ["user-doc private copy", "preview shape", USER_DOC_PRIVATE_COPY_PATTERNS],
    ["user-doc private copy", "プレビュー用の形状", USER_DOC_PRIVATE_COPY_PATTERNS],
    ["user-doc private copy", "预览用形状", USER_DOC_PRIVATE_COPY_PATTERNS],
    ["user-doc private copy", "미리보기용 형상", USER_DOC_PRIVATE_COPY_PATTERNS],
    ["ComfyUI claim", "ComfyUI-compatible workflow", COMFYUI_CLAIM_PATTERNS],
    ["ComfyUI claim", "official ComfyUI support", COMFYUI_CLAIM_PATTERNS],
    [
      "ComfyUI reverse claim",
      "Vivi2D officially supports ComfyUI",
      COMFYUI_CLAIM_PATTERNS,
    ],
    [
      "ComfyUI reverse claim",
      "Vivi2D supports all ComfyUI workflows",
      COMFYUI_CLAIM_PATTERNS,
    ],
    ["localized", "Live2D互換", THIRD_PARTY_CLAIM_PATTERNS],
    ["localized", "Live2D 호환", THIRD_PARTY_CLAIM_PATTERNS],
  ];
  for (const [label, text, patterns] of synthetic) {
    if (!patterns.some((pattern) => pattern.test(text))) {
      fail(`self-test did not catch ${label} forbidden phrase: ${text}`);
    }
  }
}

selfTest();

for (const file of listRepoFiles()) {
  if (!shouldScan(file)) continue;
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const pattern of THIRD_PARTY_CLAIM_PATTERNS) {
    if (pattern.test(text) && !isReferenceAllowed(file)) {
      fail(`${file}: contains unsafe third-party compatibility/product claim ${pattern}`);
    }
  }
  for (const pattern of PRIVATE_DEFORMATION_PATTERNS) {
    if (pattern.test(text) && !isReferenceAllowed(file)) {
      fail(`${file}: contains private deformation/research terminology ${pattern}`);
    }
  }
  if (file.startsWith("docs/user/")) {
    for (const pattern of USER_DOC_PRIVATE_COPY_PATTERNS) {
      if (pattern.test(text)) {
        fail(`${file}: contains user-doc private implementation wording ${pattern}`);
      }
    }
    if (/\bComfyUI\b/i.test(text) && !COMFYUI_INTEGRATION_ALLOWED_FILES.has(file)) {
      fail(
        `${file}: ComfyUI third-party name is only allowed on the dedicated optional local tool page until broader public-copy policy is approved.`,
      );
    }
    for (const pattern of COMFYUI_CLAIM_PATTERNS) {
      if (pattern.test(text)) {
        fail(`${file}: contains unsafe ComfyUI support/compatibility claim ${pattern}`);
      }
    }
    if (
      COMFYUI_INTEGRATION_ALLOWED_FILES.has(file) &&
      file.endsWith("/integrations/comfyui.md") &&
      !(COMFYUI_REQUIRED_PUBLIC_COPY_BY_LOCALE[localeFromUserDocFile(file)] ?? []).every(
        (pattern) => pattern.test(text),
      )
    ) {
      fail(
        `${file}: ComfyUI user page must describe the integration as optional/local, warn that custom nodes run local code, require review before applying results, and show the sibling plugin layout.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[docs-public-surface] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[docs-public-surface] passed");
