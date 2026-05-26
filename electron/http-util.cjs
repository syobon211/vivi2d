// Small HTTP helpers for main-process local-provider calls.
//
// Responses are capped while streaming so untrusted local tools cannot force the
// Electron main process to buffer unbounded bodies before validation.
const http = require("node:http");
const https = require("node:https");

const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const req = mod.get(url, { timeout: options.timeout || 10000 }, (res) => {
      const chunks = [];
      let total = 0;
      let rejected = false;
      const contentLength = Number(res.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        rejected = true;
        req.destroy();
        reject(new Error("HTTP response body is too large."));
        return;
      }
      res.on("data", (chunk) => {
        if (rejected) return;
        total += chunk.byteLength;
        if (total > maxBytes) {
          rejected = true;
          req.destroy();
          reject(new Error("HTTP response body is too large."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (rejected) return;
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, body });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out."));
    });
  });
}

function httpPost(url, data, headers = {}, timeout = 30000) {
  const options = typeof timeout === "object" && timeout !== null ? timeout : { timeout };
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const parsed = new URL(url);
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers,
        timeout: options.timeout ?? 30000,
      },
      (res) => {
        const chunks = [];
        let total = 0;
        let rejected = false;
        const contentLength = Number(res.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          rejected = true;
          req.destroy();
          reject(new Error("HTTP response body is too large."));
          return;
        }
        res.on("data", (chunk) => {
          if (rejected) return;
          total += chunk.byteLength;
          if (total > maxBytes) {
            rejected = true;
            req.destroy();
            reject(new Error("HTTP response body is too large."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          if (rejected) return;
          const body = Buffer.concat(chunks);
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out."));
    });
    req.write(data);
    req.end();
  });
}

module.exports = { DEFAULT_MAX_RESPONSE_BYTES, httpGet, httpPost };
