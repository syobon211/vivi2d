import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const checker = path.resolve("scripts/check-user-docs-media.mjs");
const tempRoots = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function makeTempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vivi-user-docs-media-"));
  tempRoots.push(root);
  const result = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return root;
}

function writeFile(root, relativePath, contents) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function writeManifest(root, overrides = {}) {
  const manifest = {
    id: "getting-started.first-project",
    kind: "image",
    status: "placeholder",
    topicSlugs: [""],
    variants: {
      neutral: {
        path: "docs/user/assets/images/first-project.neutral.svg",
        alt: {
          en: "English alt",
          ja: "Japanese alt",
          "zh-Hans": "Chinese alt",
          "ko-KR": "Korean alt",
        },
        caption: {
          en: "English caption",
          ja: "Japanese caption",
          "zh-Hans": "Chinese caption",
          "ko-KR": "Korean caption",
        },
      },
    },
    ...overrides,
  };
  writeFile(
    root,
    "docs/user/assets/images/getting-started/manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function writeManifestJson(root, contents) {
  writeFile(root, "docs/user/assets/images/getting-started/manifest.json", contents);
}

function runChecker(root) {
  return spawnSync(process.execPath, [checker], {
    cwd: root,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function pngWithTextChunk() {
  return pngWithMetadataChunk("tEXt", Buffer.from("Software\0Local Tool", "utf8"));
}

function pngWithMetadataChunk(type, data) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk(type, data),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngWithDimensions(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IEND", Buffer.alloc(0))]);
}

function jpegWithMarker(marker) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, marker, 0x00, 0x04, 0x00, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function jpegWithPaddedMarker(marker) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xff, marker, 0x00, 0x04, 0x00, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function jpegWithApp1AfterSos() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xda, 0x00, 0x04, 0x00, 0x00]),
    Buffer.from([0x11, 0x22, 0xff, 0x00, 0x33]),
    Buffer.from([0xff, 0xe1, 0x00, 0x04, 0x00, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function webpWithChunk(type) {
  const payload = Buffer.from("metadata", "utf8");
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(payload.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), chunkSize, payload]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + body.length);
  return Buffer.concat([Buffer.from("RIFF", "ascii"), riffSize, Buffer.from("WEBP", "ascii"), body]);
}

function webpVp8WithDimensions(width, height) {
  const payload = Buffer.alloc(10);
  payload[3] = 0x9d;
  payload[4] = 0x01;
  payload[5] = 0x2a;
  payload.writeUInt16LE(width & 0x3fff, 6);
  payload.writeUInt16LE(height & 0x3fff, 8);
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(payload.length);
  const body = Buffer.concat([Buffer.from("VP8 ", "ascii"), chunkSize, payload]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + body.length);
  return Buffer.concat([Buffer.from("RIFF", "ascii"), riffSize, Buffer.from("WEBP", "ascii"), body]);
}

function webpVp8lWithDimensions(width, height) {
  const bits = (width - 1) | ((height - 1) << 14);
  const payload = Buffer.alloc(5);
  payload[0] = 0x2f;
  payload.writeUInt32LE(bits, 1);
  const chunkSize = Buffer.alloc(4);
  chunkSize.writeUInt32LE(payload.length);
  const padding = payload.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  const body = Buffer.concat([
    Buffer.from("VP8L", "ascii"),
    chunkSize,
    payload,
    padding,
  ]);
  const riffSize = Buffer.alloc(4);
  riffSize.writeUInt32LE(4 + body.length);
  return Buffer.concat([Buffer.from("RIFF", "ascii"), riffSize, Buffer.from("WEBP", "ascii"), body]);
}

function ebmlElement(id, data) {
  if (data.length > 126) throw new Error("test EBML helper supports small payloads only");
  return Buffer.concat([Buffer.from(id), Buffer.from([0x80 | data.length]), data]);
}

function webmWithMuxingApp() {
  const muxingApp = ebmlElement([0x4d, 0x80], Buffer.from("libwebm", "utf8"));
  const info = ebmlElement([0x15, 0x49, 0xa9, 0x66], muxingApp);
  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], info);
  const ebmlHeader = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0));
  return Buffer.concat([ebmlHeader, segment]);
}

function webmWithDateUtc() {
  const dateUtc = ebmlElement([0x44, 0x61], Buffer.alloc(8));
  const info = ebmlElement([0x15, 0x49, 0xa9, 0x66], dateUtc);
  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], info);
  const ebmlHeader = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0));
  return Buffer.concat([ebmlHeader, segment]);
}

function webmWithTrackName() {
  const trackName = ebmlElement([0x53, 0x6e], Buffer.from("Private user track", "utf8"));
  const trackEntry = ebmlElement([0xae], trackName);
  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], trackEntry);
  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], tracks);
  const ebmlHeader = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0));
  return Buffer.concat([ebmlHeader, segment]);
}

function webmWithChapterString() {
  const chapterString = ebmlElement([0x85], Buffer.from("Private chapter title", "utf8"));
  const chapterDisplay = ebmlElement([0x80], chapterString);
  const chapterAtom = ebmlElement([0xb6], chapterDisplay);
  const editionEntry = ebmlElement([0x45, 0xb9], chapterAtom);
  const chapters = ebmlElement([0x10, 0x43, 0xa7, 0x70], editionEntry);
  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], chapters);
  const ebmlHeader = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0));
  return Buffer.concat([ebmlHeader, segment]);
}

function webmWithAttachmentFileName() {
  const fileName = ebmlElement([0x46, 0x6e], Buffer.from("private-note.txt", "utf8"));
  const attachedFile = ebmlElement([0x61, 0xa7], fileName);
  const attachments = ebmlElement([0x19, 0x41, 0xa4, 0x69], attachedFile);
  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], attachments);
  const ebmlHeader = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(0));
  return Buffer.concat([ebmlHeader, segment]);
}

function mp4WithBody(body) {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom", "ascii"),
    Buffer.alloc(12),
    body,
  ]);
}

describe("check-user-docs-media", () => {
  it("accepts a safe SVG placeholder media manifest", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/images/first-project.neutral.svg", "<svg />\n");
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("[user-docs-media] passed");
  });

  it("rejects media paths outside docs/user/assets", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/outside.svg", "<svg />\n");
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/../outside.svg",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("path must be canonical under docs/user/assets");
  });

  it("rejects image manifests that point to non-image files", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/images/not-image.txt", "not an image\n");
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/not-image.txt",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("unsupported extension .txt");
  });

  it("rejects manifest JSON that is not an object", () => {
    for (const [json, label] of [
      ['"placeholder"', "scalar"],
      ["null", "null"],
      ["[]", "array"],
    ]) {
      const root = makeTempRepo();
      writeManifestJson(root, `${json}\n`);

      const result = runChecker(root);

      expect(result.status, label).not.toBe(0);
      expect(outputOf(result)).toContain("media manifest must be a JSON object");
    }
  });

  it("rejects manifests with empty or non-object variants", () => {
    for (const [variants, message] of [
      [{}, "variants object must contain at least one variant"],
      [[], "variants object is required"],
    ]) {
      const root = makeTempRepo();
      writeManifest(root, { variants });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(message);
    }
  });

  it("rejects PNG textual metadata chunks", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/images/with-metadata.png", pngWithTextChunk());
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/with-metadata.png",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("forbidden metadata chunk tEXt");
  });

  it("rejects PNG timestamp metadata chunks", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/with-time.png",
      pngWithMetadataChunk("tIME", Buffer.from([0x07, 0xe5, 0x01, 0x01, 0x00, 0x00, 0x00])),
    );
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/with-time.png",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("forbidden metadata chunk tIME");
  });

  it("rejects unsafe SVG markup", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<svg><script>alert("nope")</script></svg>\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG contains unsafe markup");
  });

  it("rejects SVG files with a UTF-8 BOM", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("<svg />\n", "utf8")]),
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG must not contain a UTF-8 BOM");
  });

  it("rejects SVG doctype and entity declarations", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><svg />\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG contains unsafe markup");
  });

  it("rejects SVG xml-stylesheet processing instructions", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<?xml-stylesheet href="https://example.com/style.css"?><svg />\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG contains unsafe markup");
  });

  it("rejects SVG event handlers and external hrefs", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<svg><a href="javascript:alert(1)" onclick="alert(1)">bad</a></svg>\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG contains unsafe markup");
  });

  it("rejects SVG external url references in presentation attributes and src", () => {
    for (const svg of [
      '<svg><rect style="fill:url(https://example.com/pattern.svg)" /></svg>\n',
      '<svg><rect filter="url(https://example.com/filter.svg)" /></svg>\n',
      '<svg><rect clip-path="url(//example.com/clip.svg)" /></svg>\n',
      '<svg><image src="https://example.com/image.png" /></svg>\n',
    ]) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/images/first-project.neutral.svg", svg);
      writeManifest(root);

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("SVG contains unsafe markup");
    }
  });

  it("rejects SVG URI schemes hidden behind character references", () => {
    for (const svg of [
      '<svg><a href="javascript&#x3A;alert(1)">bad</a></svg>\n',
      '<svg><rect style="fill:url(java&#115;cript:alert(1))" /></svg>\n',
    ]) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/images/first-project.neutral.svg", svg);
      writeManifest(root);

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("SVG contains unsafe markup");
    }
  });

  it("rejects SVG URI schemes split by encoded URL whitespace", () => {
    for (const svg of [
      '<svg><a href="java&#xA;script:alert(1)">bad</a></svg>\n',
      '<svg><a xlink:href="da&#9;ta:text/plain,bad">bad</a></svg>\n',
      '<svg><image src="ht&#13;tps://example.com/image.png" /></svg>\n',
      '<svg><image src="file&#10;:///tmp/private.png" /></svg>\n',
    ]) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/images/first-project.neutral.svg", svg);
      writeManifest(root);

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("SVG contains unsafe markup");
    }
  });

  it("rejects SVG hrefs with leading whitespace or protocol-relative URLs", () => {
    for (const href of [' javascript:alert(1)', "//example.com/asset.svg"]) {
      const root = makeTempRepo();
      writeFile(
        root,
        "docs/user/assets/images/first-project.neutral.svg",
        `<svg><a href="${href}">bad</a></svg>\n`,
      );
      writeManifest(root);

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("SVG contains unsafe markup");
    }
  });

  it("rejects SVG style blocks", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<svg><style>@import url("https://example.com/style.css");</style></svg>\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG contains unsafe markup");
  });

  it("rejects SVG dimensions with non-px units", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<svg width="100in" height="100in" />\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG width must be a unitless px value");
    expect(outputOf(result)).toContain("SVG height must be a unitless px value");
  });

  it("rejects English UI instructions in neutral SVG variants", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      "<svg><text>Click Save</text></svg>\n",
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("neutral SVG variant contains English UI");
  });

  it("rejects English UI instructions hidden by SVG character references or CDATA", () => {
    for (const svg of [
      "<svg><text>&#67;lick &#83;ave</text></svg>\n",
      "<svg><text><![CDATA[Click Save]]></text></svg>\n",
    ]) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/images/first-project.neutral.svg", svg);
      writeManifest(root);

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("neutral SVG variant contains English UI");
    }
  });

  it("rejects SVG presentation url references including local fragments", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/first-project.neutral.svg",
      '<svg><defs><linearGradient id="g" /></defs><rect fill="url(#g)" /></svg>\n',
    );
    writeManifest(root);

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("SVG contains unsafe markup");
  });

  it("rejects video container metadata tokens", () => {
    const root = makeTempRepo();
    const mp4 = mp4WithBody(Buffer.from("udta", "ascii"));
    writeFile(root, "docs/user/assets/videos/sample.mp4", mp4);
    writeManifest(root, {
      kind: "video",
      variants: {
        neutral: {
          path: "docs/user/assets/videos/sample.mp4",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("metadata token udta");
  });

  it("rejects MP4 XMP metadata markers without rejecting a short XMP byte sequence", () => {
    const xmpUuid = Buffer.from("BE7ACFCB97A942E89C71999491E3AFAC", "hex");
    const cases = [
      [mp4WithBody(Buffer.from("payload XMP payload", "utf8")), 0, ""],
      [mp4WithBody(xmpUuid), 1, "MP4 contains XMP metadata"],
      [
        mp4WithBody(Buffer.from("http://ns.adobe.com/xap/1.0/", "utf8")),
        1,
        "MP4 contains XMP metadata",
      ],
    ];
    for (const [mp4, shouldFail, message] of cases) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/videos/sample.mp4", mp4);
      writeManifest(root, {
        kind: "video",
        variants: {
          neutral: {
            path: "docs/user/assets/videos/sample.mp4",
          },
        },
      });

      const result = runChecker(root);

      if (shouldFail) {
        expect(result.status).not.toBe(0);
        expect(outputOf(result)).toContain(message);
      } else {
        expect(result.status).toBe(0);
      }
    }
  });

  it("rejects reviewed video manifests until captions and transcripts are enforced", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/videos/sample.mp4", mp4WithBody(Buffer.alloc(0)));
    writeManifest(root, {
      kind: "video",
      status: "reviewed",
      variants: {
        neutral: {
          path: "docs/user/assets/videos/sample.mp4",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("reviewed videos remain blocked");
  });

  it("rejects JPEG Exif, ICC, IPTC, and comment metadata markers", () => {
    const cases = [
      [0xe1, "APP1 Exif/XMP metadata"],
      [0xe2, "APP2 ICC/MPF metadata"],
      [0xed, "APP13 Photoshop/IPTC metadata"],
      [0xfe, "JPEG comment metadata"],
    ];
    for (const [marker, message] of cases) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/images/metadata.jpg", jpegWithMarker(marker));
      writeManifest(root, {
        variants: {
          neutral: {
            path: "docs/user/assets/images/metadata.jpg",
          },
        },
      });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(message);
    }
  });

  it("rejects JPEG metadata markers after fill bytes", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/images/metadata.jpg", jpegWithPaddedMarker(0xe1));
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/metadata.jpg",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("APP1 Exif/XMP metadata");
  });

  it("rejects JPEG metadata markers after scan data", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/images/metadata.jpg", jpegWithApp1AfterSos());
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/metadata.jpg",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("APP1 Exif/XMP metadata");
  });

  it("rejects WebP EXIF, XMP, and ICC metadata chunks", () => {
    for (const [chunk, message] of [
      ["EXIF", "WebP contains forbidden metadata chunk EXIF"],
      ["XMP ", "WebP contains forbidden metadata chunk XMP"],
      ["ICCP", "WebP contains forbidden metadata chunk ICCP"],
    ]) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/images/metadata.webp", webpWithChunk(chunk));
      writeManifest(root, {
        variants: {
          neutral: {
            path: "docs/user/assets/images/metadata.webp",
          },
        },
      });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(message);
    }
  });

  it("rejects oversized WebP VP8 and VP8L dimensions", () => {
    for (const [bytes, label] of [
      [webpVp8WithDimensions(4097, 1), "VP8"],
      [webpVp8lWithDimensions(4097, 1), "VP8L"],
    ]) {
      const root = makeTempRepo();
      writeFile(root, `docs/user/assets/images/too-large-${label}.webp`, bytes);
      writeManifest(root, {
        variants: {
          neutral: {
            path: `docs/user/assets/images/too-large-${label}.webp`,
          },
        },
      });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("image dimensions exceed 4096px");
    }
  });

  it("rejects WebM binary metadata elements", () => {
    const cases = [
      [webmWithMuxingApp(), "forbidden MuxingApp metadata element"],
      [webmWithDateUtc(), "forbidden DateUTC metadata element"],
    ];
    for (const [webm, message] of cases) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/videos/sample.webm", webm);
      writeManifest(root, {
        kind: "video",
        variants: {
          neutral: {
            path: "docs/user/assets/videos/sample.webm",
          },
        },
      });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(message);
    }
  });

  it("rejects WebM track-level metadata elements", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/videos/sample.webm", webmWithTrackName());
    writeManifest(root, {
      kind: "video",
      variants: {
        neutral: {
          path: "docs/user/assets/videos/sample.webm",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("forbidden TrackName metadata element");
  });

  it("rejects WebM chapter and attachment metadata elements", () => {
    const cases = [
      [webmWithChapterString(), "forbidden ChapString metadata element"],
      [webmWithAttachmentFileName(), "forbidden FileName metadata element"],
    ];
    for (const [webm, message] of cases) {
      const root = makeTempRepo();
      writeFile(root, "docs/user/assets/videos/sample.webm", webm);
      writeManifest(root, {
        kind: "video",
        variants: {
          neutral: {
            path: "docs/user/assets/videos/sample.webm",
          },
        },
      });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain(message);
    }
  });

  it("rejects image dimensions above the maximum", () => {
    const root = makeTempRepo();
    writeFile(root, "docs/user/assets/images/too-large.png", pngWithDimensions(4097, 1));
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/too-large.png",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("image dimensions exceed 4096px");
  });

  it("rejects media files above the byte limit", () => {
    const root = makeTempRepo();
    writeFile(
      root,
      "docs/user/assets/images/huge.svg",
      `<svg>${" ".repeat(512 * 1024)}</svg>`,
    );
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/huge.svg",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("media file exceeds byte limit");
  });

  it("rejects directories and symlinks as media assets", () => {
    const directoryRoot = makeTempRepo();
    fs.mkdirSync(path.join(directoryRoot, "docs/user/assets/images/not-a-file.svg"), {
      recursive: true,
    });
    writeManifest(directoryRoot, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/not-a-file.svg",
        },
      },
    });

    const directoryResult = runChecker(directoryRoot);

    expect(directoryResult.status).not.toBe(0);
    expect(outputOf(directoryResult)).toContain("media asset must be a regular file");

    const symlinkRoot = makeTempRepo();
    writeFile(symlinkRoot, "outside.svg", "<svg />\n");
    fs.mkdirSync(path.join(symlinkRoot, "docs/user/assets/images"), { recursive: true });
    try {
      fs.symlinkSync(
        path.join(symlinkRoot, "outside.svg"),
        path.join(symlinkRoot, "docs/user/assets/images/link.svg"),
      );
    } catch {
      return;
    }
    writeManifest(symlinkRoot, {
      variants: {
        neutral: {
          path: "docs/user/assets/images/link.svg",
        },
      },
    });

    const symlinkResult = runChecker(symlinkRoot);

    expect(symlinkResult.status).not.toBe(0);
    expect(outputOf(symlinkResult)).toContain("media asset must not be a symlink");
  });

  it("rejects backslashes and null bytes in media paths", () => {
    for (const badPath of [
      "docs\\user\\assets\\images\\bad.svg",
      "docs/user/assets/images/bad\u0000.svg",
    ]) {
      const root = makeTempRepo();
      writeManifest(root, {
        variants: {
          neutral: {
            path: badPath,
          },
        },
      });

      const result = runChecker(root);

      expect(result.status).not.toBe(0);
      expect(outputOf(result)).toContain("path must be canonical under docs/user/assets");
    }
  });

  it("rejects image manifests that point at video files", () => {
    const root = makeTempRepo();
    const mp4 = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypisom", "ascii"),
      Buffer.alloc(12),
    ]);
    writeFile(root, "docs/user/assets/videos/sample.mp4", mp4);
    writeManifest(root, {
      variants: {
        neutral: {
          path: "docs/user/assets/videos/sample.mp4",
        },
      },
    });

    const result = runChecker(root);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("unsupported extension .mp4");
  });
});
