import { spawnSync } from "node:child_process";

const REPOSITORY = "syobon211/vivi2d";
const MAX_API_BYTES = 1024 * 1024;
const ALLOWED_TAGS = Object.freeze({
  "npm-alpha": "web-v*",
  "desktop-installer-alpha": "v*-alpha.*",
});

export class EnvironmentProtectionError extends Error {
  constructor(code) {
    super(code);
    this.name = "EnvironmentProtectionError";
  }
}

function requireCondition(condition, code) {
  if (!condition) throw new EnvironmentProtectionError(code);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isReleaseEnvironment(environment) {
  return Object.hasOwn(ALLOWED_TAGS, environment);
}

function reviewerKeys(reviewers, code) {
  requireCondition(Array.isArray(reviewers) && reviewers.length <= 6, code);
  const keys = reviewers.map((reviewer) => {
    requireCondition(
      isRecord(reviewer) &&
        (reviewer.type === "User" || reviewer.type === "Team") &&
        Number.isSafeInteger(reviewer.id) &&
        reviewer.id > 0,
      code,
    );
    return `${reviewer.type}:${reviewer.id}`;
  });
  requireCondition(new Set(keys).size === keys.length, code);
  return keys.sort();
}

export function validateDeclaredEnvironment(policy, environment) {
  requireCondition(isReleaseEnvironment(environment), "invalid-environment");
  requireCondition(
    isRecord(policy) && policy.environment === environment,
    "invalid-declared-policy",
  );
  requireCondition(
    Number.isInteger(policy.requiredReviewersMinimum) &&
      policy.requiredReviewersMinimum >= 1 &&
      policy.requiredReviewersMinimum <= 6 &&
      typeof policy.preventSelfReview === "boolean",
    "invalid-declared-reviewers",
  );
  const reviewers = reviewerKeys(
    policy.requiredReviewerIdentities,
    "invalid-declared-reviewers",
  );
  requireCondition(
    reviewers.length >= policy.requiredReviewersMinimum,
    "invalid-declared-reviewers",
  );
  requireCondition(policy.adminBypassDisabled === true, "invalid-declared-bypass");
  const refs = policy.deploymentBranchPolicy;
  requireCondition(
    isRecord(refs) &&
      refs.protectedBranches === false &&
      refs.customBranchPolicies === true &&
      Array.isArray(refs.allowedRefs) &&
      refs.allowedRefs.length === 1 &&
      refs.allowedRefs[0] === ALLOWED_TAGS[environment],
    "invalid-declared-refs",
  );
  requireCondition(
    Array.isArray(policy.requiredSecrets) && policy.requiredSecrets.length === 0,
    "invalid-declared-secrets",
  );
}

// GitHub's native rule is one approval from the list, not N approvals.
// This checks point-in-time controls, not secrets or future configuration changes.
export function validateLiveEnvironment(policy, environment, actual, branchList) {
  validateDeclaredEnvironment(policy, environment);
  requireCondition(
    isRecord(actual) && actual.name === environment,
    "invalid-live-environment",
  );
  requireCondition(actual.can_admins_bypass === false, "live-admin-bypass");
  requireCondition(
    Array.isArray(actual.protection_rules) &&
      actual.protection_rules.every(
        (rule) => isRecord(rule) && typeof rule.type === "string",
      ),
    "invalid-live-reviewers",
  );
  const rules = actual.protection_rules.filter(
    (rule) => rule.type === "required_reviewers",
  );
  requireCondition(rules.length === 1, "invalid-live-reviewers");
  const rule = rules[0];
  requireCondition(
    rule.prevent_self_review === policy.preventSelfReview,
    "live-self-review-mismatch",
  );
  requireCondition(Array.isArray(rule.reviewers), "invalid-live-reviewers");
  const actualReviewers = reviewerKeys(
    rule.reviewers.map((entry) => ({ type: entry?.type, id: entry?.reviewer?.id })),
    "invalid-live-reviewers",
  );
  const expectedReviewers = reviewerKeys(
    policy.requiredReviewerIdentities,
    "invalid-declared-reviewers",
  );
  requireCondition(
    actualReviewers.length >= policy.requiredReviewersMinimum &&
      actualReviewers.length === expectedReviewers.length &&
      actualReviewers.every((key, index) => key === expectedReviewers[index]),
    "live-reviewer-mismatch",
  );
  requireCondition(
    isRecord(actual.deployment_branch_policy) &&
      actual.deployment_branch_policy.protected_branches === false &&
      actual.deployment_branch_policy.custom_branch_policies === true,
    "invalid-live-refs",
  );
  // One bounded page covers the exact one-tag policy; never accept a partial page.
  requireCondition(
    isRecord(branchList) &&
      Number.isSafeInteger(branchList.total_count) &&
      branchList.total_count >= 0 &&
      branchList.total_count <= 100 &&
      Array.isArray(branchList.branch_policies) &&
      branchList.branch_policies.length === branchList.total_count &&
      branchList.total_count === 1,
    "invalid-live-refs",
  );
  const branch = branchList.branch_policies[0];
  requireCondition(
    isRecord(branch) &&
      Number.isSafeInteger(branch.id) &&
      branch.id > 0 &&
      branch.type === "tag" &&
      branch.name === ALLOWED_TAGS[environment],
    "invalid-live-refs",
  );
}

export function verifyLiveEnvironment(policy, environment, execute = spawnSync) {
  if (process.env.GITHUB_ACTIONS === "true") {
    requireCondition(
      process.env.GITHUB_REPOSITORY === REPOSITORY,
      "repository-identity-mismatch",
    );
  }
  validateDeclaredEnvironment(policy, environment);
  const endpoint = `repos/${REPOSITORY}/environments/${environment}`;
  const actual = readGitHubJson(endpoint, execute);
  const branchList = readGitHubJson(
    `${endpoint}/deployment-branch-policies?per_page=100&page=1`,
    execute,
  );
  validateLiveEnvironment(policy, environment, actual, branchList);
}

function readGitHubJson(endpoint, execute) {
  const env = { ...process.env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };
  delete env.GH_DEBUG;
  delete env.GH_FORCE_TTY;
  let result;
  try {
    result = execute(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        "--header",
        "Accept: application/vnd.github+json",
        "--header",
        "X-GitHub-Api-Version: 2022-11-28",
        endpoint,
      ],
      {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: MAX_API_BYTES,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    throw new EnvironmentProtectionError("github-api-unavailable");
  }
  requireCondition(
    result?.status === 0 && !result.error && !result.signal,
    "github-api-unavailable",
  );
  requireCondition(
    typeof result.stdout === "string" &&
      Buffer.byteLength(result.stdout) <= MAX_API_BYTES,
    "invalid-github-response",
  );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new EnvironmentProtectionError("invalid-github-response");
  }
}
