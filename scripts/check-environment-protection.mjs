import { readJson } from "./lib/repo.mjs";

const failures = [];
const policy = readJson(".github/release-environments/npm-alpha.json");

if (policy.environment !== "npm-alpha") {
  failures.push("npm alpha environment policy must be named npm-alpha.");
}
if (
  !Number.isInteger(policy.requiredReviewersMinimum) ||
  policy.requiredReviewersMinimum < 2
) {
  failures.push("npm-alpha environment must require at least two reviewers.");
}
if (policy.adminBypassDisabled !== true) {
  failures.push("npm-alpha environment must disable admin bypass when supported.");
}
if (policy.deploymentBranchPolicy?.customBranchPolicies !== true) {
  failures.push("npm-alpha environment must use custom branch/tag policies.");
}
if (policy.deploymentBranchPolicy?.protectedBranches !== false) {
  failures.push(
    "npm-alpha environment must not rely on broad protected branch deployment.",
  );
}
if (!policy.deploymentBranchPolicy?.allowedRefs?.includes("web-v*")) {
  failures.push("npm-alpha environment must limit deployment refs to web-v* tags.");
}
if (Array.isArray(policy.requiredSecrets) && policy.requiredSecrets.length > 0) {
  failures.push("npm-alpha environment must not require long-lived npm token secrets.");
}

if (failures.length > 0) {
  console.error("[environment-protection] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[environment-protection] passed");
