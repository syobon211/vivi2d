import { describe, expect, it, vi } from "vitest";
import type { ComfyUIClient } from "../client";
import type { GenerateProgress, HistoryEntry, PromptGenerateOptions } from "../types";

vi.mock("../psd-assembler", () => ({
  assemblePsd: vi.fn(
    (layers: Array<unknown>, w: number, h: number) =>
      new ArrayBuffer(w * h * Math.max(1, layers.length)),
  ),
  assemblePositionedPsd: vi.fn(async () => new ArrayBuffer(48)),
}));

const { decomposeImageToPsd, generateFromPromptToPsd } = await import("../orchestrator");
const { assemblePositionedPsd, assemblePsd } = await import("../psd-assembler");

function buildFakePng(width = 64, height = 48): ArrayBuffer {
  const buf = new Uint8Array(24);
  // PNG signature
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  const view = new DataView(buf.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf.buffer;
}

function makeClientStub(overrides: Partial<ComfyUIClient> = {}): ComfyUIClient {
  const base = {
    uploadImage: vi.fn(async (_buf: ArrayBuffer, name: string) => name),
    enqueue: vi.fn(async () => ({ prompt_id: "p-123", number: 1 })),
    waitForCompletion: vi.fn(
      async (
        _id: string,
        onStep?: (step: number, total: number) => void,
      ): Promise<HistoryEntry> => {
        onStep?.(5, 10);
        onStep?.(10, 10);
        return {
          outputs: {},
          status: { completed: true },
        };
      },
    ),
    downloadOutput: vi.fn(async () => new ArrayBuffer(32)),
  };
  return { ...base, ...overrides } as unknown as ComfyUIClient;
}

describe("orchestrator", () => {
  describe("decomposeImageToPsd", () => {
    it("アップロード→キュー→完了待機→PSDダウンロードの流れで実行される", async () => {
      const psdBuffer = new ArrayBuffer(1024);
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {
            node1: {
              text: ["/output/result_0001.psd"],
            },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: vi.fn(
          async () => psdBuffer,
        ) as unknown as ComfyUIClient["downloadOutput"],
      });

      const imageBuffer = new ArrayBuffer(128);
      const result = await decomposeImageToPsd(client, imageBuffer);

      expect(client.uploadImage).toHaveBeenCalledTimes(1);
      expect(client.enqueue).toHaveBeenCalledTimes(1);
      expect(client.waitForCompletion).toHaveBeenCalledWith(
        "p-123",
        expect.any(Function),
      );
      expect(client.downloadOutput).toHaveBeenCalledWith("result_0001.psd", "", "output");
      expect(result).toBe(psdBuffer);
    });

    it("アップロードファイル名は vivi2d_input_ プレフィックスを持つ", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {
            n: { text: ["a.psd"] },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
      });

      await decomposeImageToPsd(client, new ArrayBuffer(8));
      const call = (client.uploadImage as ReturnType<typeof vi.fn>).mock.calls[0]!;
      const filename = call[1] as string;
      expect(filename).toMatch(/^vivi2d_input_\d+\.png$/);
    });

    it("進捗コールバックが各フェーズで呼ばれる", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(
          async (_id: string, onStep?: (s: number, t: number) => void) => {
            onStep?.(1, 2);
            onStep?.(2, 2);
            return {
              outputs: { n: { text: ["x.psd"] } },
              status: { completed: true },
            };
          },
        ) as unknown as ComfyUIClient["waitForCompletion"],
      });

      const progresses: GenerateProgress[] = [];
      await decomposeImageToPsd(client, new ArrayBuffer(8), undefined, (p) =>
        progresses.push(p),
      );

      expect(progresses.length).toBeGreaterThanOrEqual(4);
      expect(progresses[0]!.phase).toBe("uploading");
      expect(progresses.some((p) => p.phase === "decomposing")).toBe(true);
      expect(progresses.some((p) => p.phase === "downloading")).toBe(true);
      for (let i = 1; i < progresses.length; i++) {
        expect(progresses[i]!.step).toBeGreaterThanOrEqual(progresses[i - 1]!.step);
      }
    });

    it("text 出力に .psd が無くても images 出力の .psd を使う", async () => {
      const psdBuffer = new ArrayBuffer(256);
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {
            n1: {
              text: ["not-a-psd.txt"],
              images: [{ filename: "result.psd", subfolder: "sub", type: "output" }],
            },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: vi.fn(
          async () => psdBuffer,
        ) as unknown as ComfyUIClient["downloadOutput"],
      });

      const result = await decomposeImageToPsd(client, new ArrayBuffer(8));

      expect(client.downloadOutput).toHaveBeenCalledWith("result.psd", "sub", "output");
      expect(result).toBe(psdBuffer);
    });

    it("PSD が見つからない場合は PNG レイヤー群から assemblePsd に渡される", async () => {
      const pngA = buildFakePng(128, 96);
      const pngB = buildFakePng(128, 96);
      const downloadOutput = vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(pngA)
        .mockResolvedValueOnce(pngB);

      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {
            n1: {
              images: [
                { filename: "vivi2d_seethrough_hair.png", subfolder: "", type: "output" },
                { filename: "vivi2d_seethrough_body.png", subfolder: "", type: "output" },
              ],
            },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
      });

      vi.mocked(assemblePsd).mockClear();
      const result = await decomposeImageToPsd(client, new ArrayBuffer(8));

      expect(downloadOutput).toHaveBeenCalledTimes(2);
      expect(assemblePsd).toHaveBeenCalledTimes(1);
      const call = vi.mocked(assemblePsd).mock.calls[0]!;
      expect(call[0]).toHaveLength(2);
      expect(call[1]).toBe(128);
      expect(call[2]).toBe(96);
      expect((call[0] as Array<{ name: string }>)[0]!.name).toBe("hair");
      expect((call[0] as Array<{ name: string }>)[1]!.name).toBe("body");
      expect(result.byteLength).toBeGreaterThan(0);
    });

    it("出力が完全に空なら例外を投げる", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {},
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
      });

      await expect(decomposeImageToPsd(client, new ArrayBuffer(8))).rejects.toThrow(
        /No output/,
      );
    });

    it("options を渡してもエラー無く実行できる", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: { n: { text: ["out.psd"] } },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
      });

      await expect(
        decomposeImageToPsd(client, new ArrayBuffer(8), {
          seed: 12345,
          resolution: 1536,
          numSteps: 20,
          tblrSplit: false,
          useLama: false,
          quantMode: "nf4",
          groupOffload: true,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("generateFromPromptToPsd", () => {
    it("アップロード無しでキュー→完了待機→ダウンロードを実行する", async () => {
      const psd = new ArrayBuffer(64);
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: { n: { text: ["prompt.psd"] } },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: vi.fn(
          async () => psd,
        ) as unknown as ComfyUIClient["downloadOutput"],
      });

      const options: PromptGenerateOptions = { prompt: "1girl, cute" };
      const result = await generateFromPromptToPsd(client, options);

      expect(client.uploadImage).not.toHaveBeenCalled();
      expect(client.enqueue).toHaveBeenCalledTimes(1);
      expect(client.downloadOutput).toHaveBeenCalledWith("prompt.psd", "", "output");
      expect(result).toBe(psd);
    });

    it("進捗コールバックが最初 decomposing フェーズから始まる", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(
          async (_id: string, onStep?: (s: number, t: number) => void) => {
            onStep?.(5, 10);
            return {
              outputs: { n: { text: ["p.psd"] } },
              status: { completed: true },
            };
          },
        ) as unknown as ComfyUIClient["waitForCompletion"],
      });

      const progresses: GenerateProgress[] = [];
      await generateFromPromptToPsd(client, { prompt: "x" }, (p) => progresses.push(p));

      expect(progresses.some((p) => p.phase === "uploading")).toBe(false);
      expect(progresses[0]!.phase).toBe("decomposing");
      expect(progresses.at(-1)!.phase).toBe("downloading");
    });

    it("プロンプト生成でも出力空なら例外", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {},
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
      });

      await expect(generateFromPromptToPsd(client, { prompt: "empty" })).rejects.toThrow(
        /No output/,
      );
    });

    it("ネガティブプロンプトや詳細パラメータを渡してもエラー無し", async () => {
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: { n: { text: ["o.psd"] } },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
      });

      await expect(
        generateFromPromptToPsd(client, {
          prompt: "1girl, smiling",
          negativePrompt: "lowres, bad quality",
          imageSteps: 30,
          cfg: 7.5,
          seed: 999,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("downloadPsdFromHistory (内部)", () => {
    it("複数ノードに分散していても最初に見つかった .psd を使う", async () => {
      const psd = new ArrayBuffer(8);
      const downloadOutput = vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(psd);
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {
            n1: { text: ["not-psd.txt"] },
            n2: { text: ["found.psd"] },
            n3: { text: ["another.psd"] },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
      });

      await decomposeImageToPsd(client, new ArrayBuffer(8));

      expect(downloadOutput).toHaveBeenCalledTimes(1);
      expect(downloadOutput.mock.calls[0]![0]).toBe("found.psd");
    });

    it("text に /path/to/x.psd が含まれる場合はファイル名のみ抽出", async () => {
      const downloadOutput = vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(new ArrayBuffer(4));
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: { n: { text: ["/some/deep/path/final_0001.psd"] } },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
      });

      await decomposeImageToPsd(client, new ArrayBuffer(8));
      expect(downloadOutput.mock.calls[0]![0]).toBe("final_0001.psd");
    });

    it("images 出力に .psd 以外が含まれても PNG のみ収集される", async () => {
      const pngA = buildFakePng(32, 32);
      const downloadOutput = vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(pngA);
      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          outputs: {
            n: {
              images: [
                { filename: "preview.jpg", subfolder: "", type: "output" },
                { filename: "layer_0.png", subfolder: "", type: "output" },
              ],
            },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
      });

      vi.mocked(assemblePsd).mockClear();
      await decomposeImageToPsd(client, new ArrayBuffer(8));
      expect(downloadOutput).toHaveBeenCalledTimes(1);
      expect(downloadOutput.mock.calls[0]![0]).toBe("layer_0.png");
      expect(assemblePsd).toHaveBeenCalledTimes(1);
      const call = vi.mocked(assemblePsd).mock.calls[0]!;
      expect((call[0] as Array<unknown>).length).toBe(1);
    });

    it("assembles current See-through layer JSON output before using preview images", async () => {
      const prefix = "vivi2d_prompt_123";
      const infoFilename = `${prefix}_20260530_abcd1234_layers.json`;
      const legacyInfo = {
        width: 768,
        height: 768,
        layers: [
          {
            name: "front hair",
            filename: `${prefix}_front_hair.png`,
            left: 10,
            top: 20,
            right: 210,
            bottom: 420,
          },
        ],
      };
      const downloadOutput = vi
        .fn<ComfyUIClient["downloadOutput"]>()
        .mockResolvedValueOnce(new TextEncoder().encode(infoFilename).buffer)
        .mockResolvedValueOnce(
          new TextEncoder().encode(JSON.stringify(legacyInfo)).buffer,
        )
        .mockResolvedValueOnce(buildFakePng(200, 400));

      const client = makeClientStub({
        waitForCompletion: vi.fn(async () => ({
          prompt: [
            1,
            "prompt-id",
            {
              "12": {
                class_type: "SeeThrough_SavePSD",
                inputs: { filename_prefix: prefix },
              },
            },
          ],
          outputs: {
            sourcePreview: {
              images: [
                {
                  filename: "generated_source.png",
                  subfolder: "",
                  type: "output",
                },
              ],
            },
          },
          status: { completed: true },
        })) as unknown as ComfyUIClient["waitForCompletion"],
        downloadOutput: downloadOutput as unknown as ComfyUIClient["downloadOutput"],
      });

      vi.mocked(assemblePsd).mockClear();
      vi.mocked(assemblePositionedPsd).mockClear();
      const result = await generateFromPromptToPsd(client, { prompt: "test" });

      expect(downloadOutput).toHaveBeenNthCalledWith(
        1,
        "seethrough_psd_info.log",
        "",
        "output",
      );
      expect(downloadOutput).toHaveBeenNthCalledWith(2, infoFilename, "", "output");
      expect(downloadOutput).toHaveBeenNthCalledWith(
        3,
        `${prefix}_front_hair.png`,
        "",
        "output",
      );
      expect(assemblePsd).not.toHaveBeenCalled();
      expect(assemblePositionedPsd).toHaveBeenCalledOnce();
      const call = vi.mocked(assemblePositionedPsd).mock.calls[0]!;
      expect(call[1]).toBe(768);
      expect(call[2]).toBe(768);
      expect((call[0] as Array<{ name: string; left: number }>)[0]).toMatchObject({
        name: "front hair",
        left: 10,
      });
      expect(result.byteLength).toBe(48);
    });
  });
});
