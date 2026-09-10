// Small HTTP helpers for main-process local-provider calls.
//
// Responses are capped while streaming so untrusted local tools cannot force the
// Electron main process to buffer unbounded bodies before validation.
// Positive timeouts bound one HTTP request through response-body completion,
// in addition to socket inactivity; they are not whole-workflow deadlines.
const http = require("node:http");
const https = require("node:https");

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const timeoutMs = options.timeout || 10000;
    let timer;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      let total = 0;
      const rejectIncompleteResponse = () => {
        fail(new Error("HTTP response body was interrupted."));
      };
      res.once("aborted", rejectIncompleteResponse);
      res.once("error", rejectIncompleteResponse);
      const contentLength = Number(res.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        fail(new Error("HTTP response body is too large."));
        req.destroy();
        return;
      }
      res.on("data", (chunk) => {
        if (settled) return;
        total += chunk.byteLength;
        if (total > maxBytes) {
          fail(new Error("HTTP response body is too large."));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (settled) return;
        const body = Buffer.concat(chunks);
        settled = true;
        clearTimeout(timer);
        resolve({ status: res.statusCode, body });
      });
    });
    const onTimeout = () => {
      if (settled) return;
      fail(new Error("Request timed out."));
      req.destroy();
    };
    req.on("error", fail);
    req.on("timeout", onTimeout);
    // Keep the socket-idle timeout and also bound the complete response.
    if (timeoutMs > 0) timer = setTimeout(onTimeout, timeoutMs);
  });
}

function httpPost(url, data, headers = {}, timeout = 30000) {
  const options = typeof timeout === "object" && timeout !== null ? timeout : { timeout };
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const parsed = new URL(url);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const timeoutMs = options.timeout ?? 30000;
    let timer;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        let total = 0;
        const rejectIncompleteResponse = () => {
          fail(new Error("HTTP response body was interrupted."));
        };
        res.once("aborted", rejectIncompleteResponse);
        res.once("error", rejectIncompleteResponse);
        const contentLength = Number(res.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          fail(new Error("HTTP response body is too large."));
          req.destroy();
          return;
        }
        res.on("data", (chunk) => {
          if (settled) return;
          total += chunk.byteLength;
          if (total > maxBytes) {
            fail(new Error("HTTP response body is too large."));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (settled) return;
          const body = Buffer.concat(chunks);
          settled = true;
          clearTimeout(timer);
          resolve({ status: res.statusCode, body });
        });
      },
    );
    const onTimeout = () => {
      if (settled) return;
      fail(new Error("Request timed out."));
      req.destroy();
    };
    req.on("error", fail);
    req.on("timeout", onTimeout);
    // A zero POST timeout retains Node's existing disabled-timeout behavior.
    if (timeoutMs > 0) timer = setTimeout(onTimeout, timeoutMs);
    try {
      req.write(data);
      req.end();
    } catch (error) {
      fail(error);
      req.destroy();
    }
  });
}

module.exports = { DEFAULT_MAX_RESPONSE_BYTES, httpGet, httpPost };
