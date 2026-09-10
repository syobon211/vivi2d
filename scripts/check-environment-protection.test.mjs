import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EnvironmentProtectionError,
  validateDeclaredEnvironment,
  validateLiveEnvironment,
  verifyLiveEnvironment,
} from "./lib/environment-protection-live.mjs";

const checkerPath = path.resolve("scripts/check-environment-protection.mjs");

beforeEach(() => {
  vi.stubEnv("GITHUB_ACTIONS", "true");
  vi.stubEnv("GITHUB_REPOSITORY", "syobon211/vivi2d");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function runChecker(args = []) {
  return spawnSync(process.execPath, [checkerPath, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
}

describe("environment protection CLI boundaries", () => {
  it.each([
    ["--live"],
    ["--live", "--environment", "unapproved-environment"],
    ["--environment", "npm-alpha"],
    ["--live", "--environment", "npm-alpha", "--unexpected"],
  ])("rejects incomplete or unapproved live arguments: %j", (...args) => {
    const result = runChecker(args);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("[environment-protection] failed: invalid-arguments\n");
    expect(result.stdout).toBe("");
  });

  it("labels the default check as declared policy only, not live verification", () => {
    const result = runChecker();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "[environment-protection] declared policy passed (live settings not checked)\n",
    );
  });

  it.each([
    "npm-alpha",
    "desktop-installer-alpha",
  ])("pins the approved sole reviewer and self-review policy for %s", (environment) => {
    const policy = JSON.parse(
      fs.readFileSync(`.github/release-environments/${environment}.json`, "utf8"),
    );
    expect(policy.requiredReviewersMinimum).toBe(1);
    expect(policy.requiredReviewerIdentities).toEqual([{ type: "User", id: 288079945 }]);
    expect(policy.preventSelfReview).toBe(false);
  });
});

function liveFixture(environment = "npm-alpha") {
  const policy = JSON.parse(
    fs.readFileSync(`.github/release-environments/${environment}.json`, "utf8"),
  );
  const actual = {
    name: environment,
    can_admins_bypass: false,
    protection_rules: [
      {
        type: "required_reviewers",
        prevent_self_review: false,
        reviewers: [{ type: "User", reviewer: { id: 288079945 } }],
      },
      { type: "branch_policy" },
    ],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  };
  const branches = {
    total_count: 1,
    branch_policies: [
      { id: 123, type: "tag", name: policy.deploymentBranchPolicy.allowedRefs[0] },
    ],
  };
  return { policy, actual, branches };
}

describe("declared environment policy validation", () => {
  it.each([
    [
      "missing identity",
      (p) => {
        delete p.requiredReviewerIdentities;
      },
    ],
    [
      "duplicate identity",
      (p) => {
        p.requiredReviewerIdentities.push({ ...p.requiredReviewerIdentities[0] });
      },
    ],
    [
      "unknown identity type",
      (p) => {
        p.requiredReviewerIdentities[0].type = "Organization";
      },
    ],
    [
      "unsafe identity ID",
      (p) => {
        p.requiredReviewerIdentities[0].id = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      "zero identity ID",
      (p) => {
        p.requiredReviewerIdentities[0].id = 0;
      },
    ],
    [
      "unmet reviewer count",
      (p) => {
        p.requiredReviewersMinimum = 2;
      },
    ],
    [
      "missing self-review policy",
      (p) => {
        delete p.preventSelfReview;
      },
    ],
    [
      "enabled admin bypass",
      (p) => {
        p.adminBypassDisabled = false;
      },
    ],
    [
      "extra allowed ref",
      (p) => {
        p.deploymentBranchPolicy.allowedRefs.push("*");
      },
    ],
    [
      "missing secrets declaration",
      (p) => {
        delete p.requiredSecrets;
      },
    ],
    [
      "required long-lived secret",
      (p) => {
        p.requiredSecrets = ["SYNTHETIC_SECRET_NAME"];
      },
    ],
  ])("rejects %s before an API call", (_label, mutate) => {
    const { policy } = liveFixture();
    mutate(policy);
    const execute = vi.fn();
    expect(() => verifyLiveEnvironment(policy, "npm-alpha", execute)).toThrow(
      EnvironmentProtectionError,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not accept an arbitrary environment or missing policy", () => {
    expect(() => validateDeclaredEnvironment({}, "unapproved")).toThrow(
      "invalid-environment",
    );
    expect(() => validateDeclaredEnvironment(null, "npm-alpha")).toThrow(
      "invalid-declared-policy",
    );
  });
});

describe("actual environment policy projection", () => {
  it.each([
    "npm-alpha",
    "desktop-installer-alpha",
  ])("accepts exact controls for %s", (environment) => {
    const { policy, actual, branches } = liveFixture(environment);
    expect(() =>
      validateLiveEnvironment(policy, environment, actual, branches),
    ).not.toThrow();
  });

  it.each([
    [
      "missing environment",
      (f) => {
        f.actual = null;
      },
    ],
    [
      "wrong environment",
      (f) => {
        f.actual.name = "other";
      },
    ],
    [
      "admin bypass enabled",
      (f) => {
        f.actual.can_admins_bypass = true;
      },
    ],
    [
      "admin bypass missing",
      (f) => {
        delete f.actual.can_admins_bypass;
      },
    ],
    [
      "admin bypass string",
      (f) => {
        f.actual.can_admins_bypass = "false";
      },
    ],
    [
      "empty protection rules",
      (f) => {
        f.actual.protection_rules = [];
      },
    ],
    [
      "missing protection rules",
      (f) => {
        delete f.actual.protection_rules;
      },
    ],
    [
      "duplicate reviewer rule",
      (f) => {
        f.actual.protection_rules.push(f.actual.protection_rules[0]);
      },
    ],
    [
      "missing reviewer ID",
      (f) => {
        delete f.actual.protection_rules[0].reviewers[0].reviewer.id;
      },
    ],
    [
      "string reviewer ID",
      (f) => {
        f.actual.protection_rules[0].reviewers[0].reviewer.id = "288079945";
      },
    ],
    [
      "wrong reviewer ID",
      (f) => {
        f.actual.protection_rules[0].reviewers[0].reviewer.id = 123;
      },
    ],
    [
      "wrong reviewer namespace",
      (f) => {
        f.actual.protection_rules[0].reviewers[0].type = "Team";
      },
    ],
    [
      "duplicate reviewer ID",
      (f) => {
        f.actual.protection_rules[0].reviewers.push(
          f.actual.protection_rules[0].reviewers[0],
        );
      },
    ],
    [
      "extra reviewer",
      (f) => {
        f.actual.protection_rules[0].reviewers.push({
          type: "User",
          reviewer: { id: 123 },
        });
      },
    ],
    [
      "no reviewer",
      (f) => {
        f.actual.protection_rules[0].reviewers = [];
      },
    ],
    [
      "missing self-review setting",
      (f) => {
        delete f.actual.protection_rules[0].prevent_self_review;
      },
    ],
    [
      "self-review mismatch",
      (f) => {
        f.actual.protection_rules[0].prevent_self_review = true;
      },
    ],
    [
      "unrestricted refs",
      (f) => {
        f.actual.deployment_branch_policy = null;
      },
    ],
    [
      "broad protected branches",
      (f) => {
        f.actual.deployment_branch_policy.protected_branches = true;
      },
    ],
    [
      "custom refs disabled",
      (f) => {
        f.actual.deployment_branch_policy.custom_branch_policies = false;
      },
    ],
    [
      "missing ref response",
      (f) => {
        f.branches = null;
      },
    ],
    [
      "partial page",
      (f) => {
        f.branches.total_count = 2;
      },
    ],
    [
      "over-limit page",
      (f) => {
        f.branches.total_count = 101;
      },
    ],
    [
      "missing count",
      (f) => {
        delete f.branches.total_count;
      },
    ],
    [
      "no refs",
      (f) => {
        f.branches = { total_count: 0, branch_policies: [] };
      },
    ],
    [
      "extra allowed ref",
      (f) => {
        f.branches.branch_policies.push({ id: 124, name: "*", type: "tag" });
        f.branches.total_count = 2;
      },
    ],
    [
      "branch instead of tag",
      (f) => {
        f.branches.branch_policies[0].type = "branch";
      },
    ],
    [
      "missing ref type",
      (f) => {
        delete f.branches.branch_policies[0].type;
      },
    ],
    [
      "broader tag glob",
      (f) => {
        f.branches.branch_policies[0].name = "*";
      },
    ],
    [
      "wrong tag glob",
      (f) => {
        f.branches.branch_policies[0].name = "v*-alpha.*";
      },
    ],
    [
      "invalid ref ID",
      (f) => {
        f.branches.branch_policies[0].id = -1;
      },
    ],
  ])("rejects %s without inferring missing protection", (_label, mutate) => {
    const fixture = liveFixture();
    mutate(fixture);
    expect(() =>
      validateLiveEnvironment(
        fixture.policy,
        "npm-alpha",
        fixture.actual,
        fixture.branches,
      ),
    ).toThrow(EnvironmentProtectionError);
  });
});

describe("bounded authenticated gh API runner", () => {
  it.each([
    "npm-alpha",
    "desktop-installer-alpha",
  ])("reads only exact GET endpoints for %s", (environment) => {
    const { policy, actual, branches } = liveFixture(environment);
    const execute = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(actual) })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(branches) });
    expect(() => verifyLiveEnvironment(policy, environment, execute)).not.toThrow();
    expect(execute).toHaveBeenCalledTimes(2);
    const base = `repos/syobon211/vivi2d/environments/${environment}`;
    const endpoints = [base, `${base}/deployment-branch-policies?per_page=100&page=1`];
    for (const [index, [command, args, options]] of execute.mock.calls.entries()) {
      expect(command).toBe("gh");
      expect(args).toEqual([
        "api",
        "--hostname",
        "github.com",
        "--method",
        "GET",
        "--header",
        "Accept: application/vnd.github+json",
        "--header",
        "X-GitHub-Api-Version: 2022-11-28",
        endpoints[index],
      ]);
      expect(options).toMatchObject({
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(options.env.GH_PROMPT_DISABLED).toBe("1");
      expect(options.env.GH_DEBUG).toBeUndefined();
      expect(options.env.GH_FORCE_TTY).toBeUndefined();
    }
  });

  it.each([
    [
      "permission denial",
      {
        status: 1,
        stdout: "SYNTHETIC_PRIVATE_DETAIL",
        stderr: "SYNTHETIC_PRIVATE_DETAIL",
      },
      "github-api-unavailable",
    ],
    [
      "timeout",
      { status: null, error: new Error("SYNTHETIC_PRIVATE_DETAIL") },
      "github-api-unavailable",
    ],
    ["signal", { status: 0, signal: "SIGTERM" }, "github-api-unavailable"],
    [
      "malformed JSON",
      { status: 0, stdout: "SYNTHETIC_PRIVATE_DETAIL" },
      "invalid-github-response",
    ],
    ["missing output", { status: 0 }, "invalid-github-response"],
    [
      "oversize response",
      { status: 0, stdout: "x".repeat(1024 * 1024 + 1) },
      "invalid-github-response",
    ],
  ])("fails closed and suppresses raw output on %s", (_label, result, expected) => {
    const { policy } = liveFixture();
    const execute = vi.fn().mockReturnValue(result);
    expect(() => verifyLiveEnvironment(policy, "npm-alpha", execute)).toThrow(
      new EnvironmentProtectionError(expected),
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("does not forward thrown spawn details", () => {
    const { policy } = liveFixture();
    expect(() =>
      verifyLiveEnvironment(policy, "npm-alpha", () => {
        throw new Error("SYNTHETIC_PRIVATE_DETAIL");
      }),
    ).toThrow(new EnvironmentProtectionError("github-api-unavailable"));
  });

  it("rejects a failed second endpoint instead of trusting the environment alone", () => {
    const { policy, actual } = liveFixture();
    const execute = vi
      .fn()
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(actual) })
      .mockReturnValueOnce({ status: 1, stderr: "SYNTHETIC_PRIVATE_DETAIL" });
    expect(() => verifyLiveEnvironment(policy, "npm-alpha", execute)).toThrow(
      "github-api-unavailable",
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

describe("live environment repository identity", () => {
  it.each([
    ["canonical Actions repository", "true", "syobon211/vivi2d", false],
    ["fork Actions repository", "true", "synthetic-fixture/vivi2d", true],
    ["missing Actions repository", "true", undefined, true],
    ["local invocation without identity", undefined, undefined, false],
  ])("checks %s before API execution", (_label, actions, repository, rejected) => {
    try {
      vi.stubEnv("GITHUB_ACTIONS", actions);
      vi.stubEnv("GITHUB_REPOSITORY", repository);
      const { policy, actual, branches } = liveFixture();
      const execute = vi
        .fn()
        .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(actual) })
        .mockReturnValueOnce({ status: 0, stdout: JSON.stringify(branches) });
      const verify = () => verifyLiveEnvironment(policy, "npm-alpha", execute);
      if (rejected) {
        expect(verify).toThrow(
          new EnvironmentProtectionError("repository-identity-mismatch"),
        );
        expect(execute).not.toHaveBeenCalled();
      } else {
        expect(verify).not.toThrow();
        expect(execute).toHaveBeenCalledTimes(2);
        expect(execute.mock.calls[0][1].at(-1)).toBe(
          "repos/syobon211/vivi2d/environments/npm-alpha",
        );
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
