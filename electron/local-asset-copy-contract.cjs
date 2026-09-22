// Cell IDs and an opaque main-owned copy ID are the entire renderer authority.
function validateLocalAssetCopy(_channel, args) {
  const fail = () => {
    throw new Error("Invalid local Asset copy command.");
  };
  if (
    args.length !== 1 ||
    !args[0] ||
    typeof args[0] !== "object" ||
    Array.isArray(args[0])
  )
    fail();
  const input = args[0];
  const fields = Object.getOwnPropertyDescriptors(input);
  const operation = fields.operation?.value;
  const keys =
    operation === "prepare"
      ? ["operation", "sourceCellId", "receiverCellId"]
      : operation === "commit" || operation === "cancel"
        ? ["operation", "copyId"]
        : operation === "preview"
          ? ["operation", "cellId"]
          : operation === "cancelPreview"
            ? ["operation"]
            : null;
  if (
    !keys ||
    Reflect.ownKeys(fields).length !== keys.length ||
    keys.some((key) => !fields[key] || !Object.hasOwn(fields[key], "value"))
  )
    fail();
  const matches = (key, pattern) =>
    typeof fields[key].value === "string" && pattern.test(fields[key].value);
  if (operation === "prepare") {
    if (
      !matches("sourceCellId", /^[a-f0-9]{64}$/) ||
      !matches("receiverCellId", /^[a-f0-9]{64}$/)
    )
      fail();
  } else if (operation === "preview") {
    if (!matches("cellId", /^[a-f0-9]{64}$/)) fail();
  } else if (
    operation !== "cancelPreview" &&
    !matches(
      "copyId",
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    )
  )
    fail();
}
module.exports = { validateLocalAssetCopy };
