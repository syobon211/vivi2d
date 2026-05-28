if (process.env.VIVI2D_VERIFIED_WEB_NPM_ALPHA_PUBLISH !== "1") {
  console.error(
    [
      "[web-npm-alpha-direct-publish] Direct npm publish is blocked.",
      "Use scripts/publish-web-npm-alpha.mjs after generating and verifying",
      "web-pack-result.json and web-npm-alpha-release-record.json.",
    ].join(" "),
  );
  process.exit(1);
}

console.log("[web-npm-alpha-direct-publish] verified publish wrapper detected");
