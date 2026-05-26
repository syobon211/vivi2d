import { describe, expect, it } from "vitest";
import { parseViviViewerEndpoint } from "../endpoint.js";
import { ViviViewerApiClientError } from "../errors.js";

describe("parseViviViewerEndpoint", () => {
  it("accepts literal browser loopback endpoints", () => {
    expect(
      parseViviViewerEndpoint("ws://127.0.0.1:49152", {
        environment: "browser",
      }).port,
    ).toBe(49152);
    expect(
      parseViviViewerEndpoint("ws://[::1]:49152", {
        environment: "browser",
      }).hostname,
    ).toContain("::1");
  });

  it("rejects non-loopback and non-ws endpoints before WebSocket injection", () => {
    for (const endpoint of ["wss://127.0.0.1:1", "ws://example.com:1"]) {
      expect(() =>
        parseViviViewerEndpoint(endpoint, { environment: "browser" }),
      ).toThrow(ViviViewerApiClientError);
    }
  });

  it("rejects credentials, query, and fragment material", () => {
    for (const endpoint of [
      "ws://user@127.0.0.1:1",
      "ws://127.0.0.1:1/?token=x",
      "ws://127.0.0.1:1/#secret",
    ]) {
      expect(() =>
        parseViviViewerEndpoint(endpoint, { environment: "node" }),
      ).toThrow(/must not include/);
    }
  });
});
