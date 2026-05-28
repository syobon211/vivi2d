import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const UPDATE_PERF_BASELINES_ENV = "VIVI2D_UPDATE_PERF_BASELINES";

export function writePerfBaseline(baselinePath: string, summary: unknown): void {
  const payload = `${JSON.stringify(summary, null, 2)}\n`;
  const artifactPath = path.resolve(
    process.cwd(),
    "test-results/perf-baselines",
    path.basename(baselinePath),
  );

  mkdirSync(path.dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, payload, "utf8");

  if (process.env[UPDATE_PERF_BASELINES_ENV] === "1") {
    writeFileSync(baselinePath, payload, "utf8");
  }
}
