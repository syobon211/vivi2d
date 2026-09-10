import {
  EnvironmentProtectionError,
  isReleaseEnvironment,
  validateDeclaredEnvironment,
  verifyLiveEnvironment,
} from "./lib/environment-protection-live.mjs";
import { readJson } from "./lib/repo.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    for (const environment of ["npm-alpha", "desktop-installer-alpha"]) {
      validateDeclaredEnvironment(
        readJson(`.github/release-environments/${environment}.json`),
        environment,
      );
    }
    console.log(
      "[environment-protection] declared policy passed (live settings not checked)",
    );
  } else {
    if (
      args.length !== 3 ||
      args[0] !== "--live" ||
      args[1] !== "--environment" ||
      !isReleaseEnvironment(args[2])
    ) {
      throw new EnvironmentProtectionError("invalid-arguments");
    }
    const environment = args[2];
    verifyLiveEnvironment(
      readJson(`.github/release-environments/${environment}.json`),
      environment,
    );
    console.log(
      `[environment-protection] live controls passed: ${environment} (secrets not inspected)`,
    );
  }
} catch (error) {
  const code =
    error instanceof EnvironmentProtectionError ? error.message : "verification-failed";
  console.error(`[environment-protection] failed: ${code}`);
  process.exitCode = 1;
}
