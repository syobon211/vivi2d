// Release-only template check, not a YAML parser. Keep setup-node in the current
// six-space block-step form; new input/step syntax requires policy review.
export function checkReleaseNodeCachePolicy(workflow, workflowPath) {
  const failures = [];
  const lines = workflow
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*#/.test(line));
  const fail = (message) => failures.push(`${workflowPath}: ${message}`);
  if (/^\s+cache:\s*['"]?npm['"]?(?:\s|$)/m.test(workflow)) {
    fail("release workflows must not restore npm caches.");
  }
  let count = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // Aliased/flow steps and quoted action references could hide setup-node.
    if (/^ {6}-\s*[*&{[]|^ {8}<<:|^ {6}(?:- | {2})uses:\s*["'*&{[]/.test(line)) {
      fail("release action steps must use explicit block syntax without aliases.");
    }
    if (!/actions\/setup-node/i.test(line)) continue;
    count += 1;
    if (!/^ {6}- uses: actions\/setup-node@[a-f0-9]{40}(?: +#.*)?$/.test(line)) {
      fail("setup-node must use the reviewed pinned block-step syntax.");
      continue;
    }
    const body = [];
    for (
      let next = index + 1;
      next < lines.length && /^ {7}/.test(lines[next]);
      next += 1
    ) {
      body.push(lines[next]);
    }
    if (body.shift() !== "        with:") {
      fail("each setup-node step must have its own explicit with block.");
      continue;
    }
    const inputs = new Set();
    for (const input of body) {
      const match =
        /^ {10}(node-version|registry-url|package-manager-cache): (\S+)(?: +#.*)?$/.exec(
          input,
        );
      if (!match || inputs.has(match[1])) {
        fail(
          "setup-node has an unsupported or duplicate input; explicit cache inputs are forbidden.",
        );
        continue;
      }
      inputs.add(match[1]);
      if (match[1] === "package-manager-cache") {
        if (match[2] !== "false")
          fail("setup-node package-manager-cache must be literal false.");
      } else if (!/^[\w./:@+-]+$/.test(match[2])) {
        fail("setup-node inputs must use the reviewed literal scalar syntax.");
      }
    }
    if (!inputs.has("package-manager-cache")) {
      fail("each setup-node step must explicitly set package-manager-cache: false.");
    }
  }
  if (count === 0) fail("release workflow must contain an explicit setup-node step.");
  return failures;
}
