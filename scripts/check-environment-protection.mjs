import { readJson } from "./lib/repo.mjs";

const failures = [];

checkEnvironment(".github/release-environments/npm-alpha.json", {
  allowedRef: "web-v*",
  environment: "npm-alpha",
  minimumReviewers: 2,
  noSecretsMessage:
    "npm-alpha environment must not require long-lived npm token secrets.",
});
checkEnvironment(".github/release-environments/desktop-installer-alpha.json", {
  allowedRef: "v*-alpha.*",
  environment: "desktop-installer-alpha",
  minimumReviewers: 1,
  noSecretsMessage:
    "desktop-installer-alpha environment must not require long-lived signing secrets before a signing ADR is approved.",
});

if (failures.length > 0) {
  console.error("[environment-protection] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[environment-protection] passed");

function checkEnvironment(policyPath, options) {
  const policy = readJson(policyPath);
  if (policy.environment !== options.environment) {
    failures.push(`${policyPath}: environment must be named ${options.environment}.`);
  }
  if (
    !Number.isInteger(policy.requiredReviewersMinimum) ||
    policy.requiredReviewersMinimum < options.minimumReviewers
  ) {
    failures.push(
      `${policy.environment}: environment must require at least ${options.minimumReviewers} reviewer(s).`,
    );
  }
  if (policy.adminBypassDisabled !== true) {
    failures.push(
      `${policy.environment}: environment must disable admin bypass when supported.`,
    );
  }
  if (policy.deploymentBranchPolicy?.customBranchPolicies !== true) {
    failures.push(
      `${policy.environment}: environment must use custom branch/tag policies.`,
    );
  }
  if (policy.deploymentBranchPolicy?.protectedBranches !== false) {
    failures.push(
      `${policy.environment}: environment must not rely on broad protected branch deployment.`,
    );
  }
  if (!policy.deploymentBranchPolicy?.allowedRefs?.includes(options.allowedRef)) {
    failures.push(
      `${policy.environment}: environment must limit deployment refs to ${options.allowedRef}.`,
    );
  }
  if (Array.isArray(policy.requiredSecrets) && policy.requiredSecrets.length > 0) {
    failures.push(options.noSecretsMessage);
  }
}
