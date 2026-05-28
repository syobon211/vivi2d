---
title: "ComfyUI 设置"
description: "把本地 ComfyUI 安全连接到 Vivi2D 的步骤。"
locale: "zh-Hans"
slug: "integrations/comfyui"
status: "draft"
audience: ["artist","rigger"]
---
# ComfyUI 设置

## 翻译草稿说明

本页是翻译草稿。最新且最详细的步骤会先反映在同一主题的英文版中。公开发布前，本翻译也会扩充并重新审核。

## 发布状态

本页是用于本地实验的草稿。在 Vivi2D release notes 列出固定的 ComfyUI-See-through 目标、Vivi2D compat plugin 包、checksum 或签名信息，以及支持的 Vivi2D build 范围之前，不要把本页当作公开版本的安装指南。

在这些发布信息齐全之前，请只使用可以丢弃的合成图像或项目副本进行测试。这里的合成图像指只用于设置验证的临时测试图，不是客户作品或私密正式素材。release notes 发布后，请从 Vivi2D 官方下载页或发布页进入。

本页说明如何把 ComfyUI 作为可选的本地工具和 Vivi2D 一起使用。ComfyUI 会在你的电脑上独立运行。即使不使用 ComfyUI，也可以继续使用 Manual Image Split、Auto Setup 和 Viewer。

把 ComfyUI 返回的结果当作提案处理。请在 Vivi2D 中检查后再接受。ComfyUI 返回了文件，并不代表 Vivi2D 应该自动修改你的项目。

## 先了解三个部分

这里有三个独立的部分。安装其中一个，并不会自动安装另外两个。

- **ComfyUI** 是运行图像工作流的本地应用。
- **ComfyUI-See-through** 是 [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through) 提供的第三方自定义节点插件。它在 ComfyUI 内运行，并添加 See-through 相关节点。
- **Vivi2D compat plugin** 与 ComfyUI-See-through 是不同的东西。它是 Vivi2D 专用的 ComfyUI 桥接插件，用来检查 Vivi2D 需要的节点、版本和返回结果。

请把两个插件作为 sibling 目录放在 ComfyUI 的 `custom_nodes` 文件夹下。

```text
ComfyUI/
  custom_nodes/
    ComfyUI-See-through/
    vivi2d_compat_plugin/
```

不要把 `ComfyUI-See-through/` 放进 `vivi2d_compat_plugin/`，也不要把 `vivi2d_compat_plugin/` 放进 `ComfyUI-See-through/`。

## 快速检查

打开 Vivi2D 前，先检查这几项。

- ComfyUI 可以在浏览器中通过本地地址打开，例如 `http://127.0.0.1:8188/`。
- `ComfyUI-See-through/` 位于 `ComfyUI/custom_nodes/` 中。
- `vivi2d_compat_plugin/` 也位于 `ComfyUI/custom_nodes/` 中，并且和 `ComfyUI-See-through/` 并列。
- 安装或更新任一插件后，已经重启 ComfyUI。
- ComfyUI 中能看到 See-through 节点，并且 Vivi2D 的连接检查能找到 compat plugin。

如果其中一项不满足，请先修正。最常见的问题是把两个插件互相嵌套、忘记重启 ComfyUI，或在 Vivi2D 中输入了错误的本地地址。

## 开始之前

- 复制一份原图或 Vivi2D 项目。
- 从 ComfyUI 的官方来源或官方桌面版安装 ComfyUI。
- 在本地启动 ComfyUI，并确认浏览器能打开类似 `http://127.0.0.1:8188/` 的地址。
- 只安装你信任来源的自定义节点。ComfyUI 自定义节点会在你的电脑上执行代码，也可能访问文件或网络。
- 关闭你不需要的外部访问设置，例如公开隧道、共享 URL 或云中继。
- 如果用于公开版 Vivi2D，请使用 Vivi2D release notes 中列出的 ComfyUI-See-through 版本和 `vivi2d_compat_plugin/`。

## 安装 ComfyUI

1. 选择适合你系统的官方安装方式。
2. 在 Windows 上，官方桌面版或便携版通常最容易开始。
3. 打开 Vivi2D 之前，先启动一次 ComfyUI。
4. 确认浏览器中能打开 ComfyUI 页面。
5. 在 ComfyUI 里运行一个很小的测试工作流，确认安装正常。

如果官方安装说明发生变化，请优先遵循 ComfyUI 官方文档。本页主要说明 Vivi2D 侧如何连接本地 ComfyUI。

官方参考:

- [ComfyUI Desktop for Windows](https://docs.comfy.org/installation/desktop)
- [ComfyUI Portable for Windows](https://docs.comfy.org/installation/comfyui_portable_windows)
- [ComfyUI GitHub README](https://github.com/comfyanonymous/ComfyUI)

## 安装 ComfyUI-See-through

1. 先查看 Vivi2D release notes。如果其中列出了固定的 upstream release tag 或 commit，请使用那个目标。
2. 确认 Vivi2D 是否指定了目标后，再打开 [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through) 仓库。
3. 如果只是本地实验，并且 Vivi2D 没有指定目标，请按照该仓库当前 README 操作。
4. 把它安装到 ComfyUI 的 custom-node 区域，不要安装到 Vivi2D 中。
5. 重启 ComfyUI。
6. 打开 Vivi2D 前，确认 ComfyUI 中能看到 See-through 节点。

ComfyUI-See-through 是第三方代码。请使用上游仓库，确认你安装的内容，并避免随机镜像。

## 安装 Vivi2D compat plugin

1. 找到与你当前 Vivi2D build 对应的 `vivi2d_compat_plugin/` 目录或包。
2. 公开版中，请先核对 Vivi2D release notes 中列出的 SHA-256 checksum 或签名 release artifact。
3. 把它作为 `ComfyUI/custom_nodes/vivi2d_compat_plugin/` 安装，并与 ComfyUI-See-through 分开。
4. 不要从随机镜像下载名字相似的副本。
5. 安装或更新后，重启 ComfyUI。
6. 稍后使用 Vivi2D 的连接检查，验证本地 ComfyUI 配置。
7. 如果 Vivi2D 报告 compat plugin 缺失或版本不匹配，请停止，并使用当前 build 文档中指定的包。

不要混用其他 Vivi2D 版本的 compat plugin 文件。如果你的 build 没有对应的 `vivi2d_compat_plugin/`，请在没有 compat plugin 的情况下继续，或使用 Manual Image Split 和 Auto Setup。

## Vivi2D 会发送什么到 ComfyUI

运行这个工作流时，Vivi2D 可能会向本地 ComfyUI 发送:

- 所选图像的图像字节，或所选图像的副本。
- 你输入的工作流选项或提示词。
- 用来把返回文件和当前运行匹配起来的本地 request metadata。

除非你明确选择了会发送整个项目的工作流，否则 Vivi2D 不应该发送整个项目文件。

ComfyUI 和它的自定义节点在你的电脑上运行。自定义节点可能根据自己的代码写入日志、缓存或文件。请先用项目副本测试，在信任本地配置之前，不要使用私密客户素材。

## 准备 Vivi2D

1. 打开 Vivi2D。
2. 打开项目副本，不要直接使用唯一的原始项目。
3. 开始本地工具操作前，先保存项目。
4. 如果当前 build 有 integration 或 local tool 页面，请打开它。
5. 只使用本地地址，例如 `http://127.0.0.1:8188/`。

如果你的 Vivi2D build 还没有 ComfyUI 功能，请在这里停止。请改用 [Manual Image Split](../workflows/manual-image-split.md) 和 [Auto Setup](../workflows/auto-setup.md)。不要安装非官方镜像里的随机桥接脚本。

## 连接到本地 ComfyUI

1. 保持 ComfyUI 正在运行。
2. 在 Vivi2D 中输入本地 ComfyUI 地址。
3. 如果 UI 提供 test 或 ping 操作，请先执行。
4. 如果连接成功，请在运行工作流前检查显示的 capabilities。
5. 如果 Vivi2D 提示找不到 Vivi2D compat plugin，请只使用当前 build 文档中指定的 compat plugin，或者不使用 ComfyUI 继续。

连接应保持在本地。不要连接到共享机器、公开 URL，或不是你自己启动的服务。

## 第一次安全运行

1. 选择小的测试图像，或复制后的图像。
2. 从低分辨率的辅助工作流开始。
3. 等待 ComfyUI 完成。
4. 通过 Vivi2D 的正常 review 路径导入返回文件。
5. 接受前，在 Vivi2D 中检查结果。
6. 如果 mask、layer 或 setup 出现 warning，请先修正再应用。
7. 接受已检查的结果后，另存为新的项目名。

## Vivi2D 应该显示什么

成功后，Vivi2D 应该在 review surface 中显示导入的提案或返回文件。应用应说明哪些内容会保存，哪些只是临时信息。如果你只看到输出文件夹里的原始文件，请不要不检查就拖入项目。

## 故障排查

### ComfyUI 无法打开

- 先确认 ComfyUI 本身可以启动，再从 Vivi2D 测试。
- 检查是否有其他应用正在使用 `8188` 端口。
- 重启 ComfyUI，并重新打开浏览器页面。

### Vivi2D 无法连接

- 使用 `127.0.0.1` 或 `localhost`，不要使用公开主机名。
- 确认端口号与 ComfyUI 窗口或启动输出一致。
- 检查防火墙是否阻止了本地应用通信。

### 找不到 See-through 节点

- 确认 `ComfyUI-See-through/` 已安装在 ComfyUI 的 `custom_nodes` 区域。
- 安装插件后重启 ComfyUI。
- 从 Vivi2D 测试前，先直接打开 ComfyUI，确认能看到 See-through 节点。

### 找不到 Vivi2D compat plugin 或版本不匹配

- 当前 Vivi2D build 可能不包含 compat plugin。
- compat plugin 可能安装到了错误目录。
- plugin 版本可能与当前 Vivi2D build 不匹配。
- 不要混用其他版本的 compat plugin 文件。
- 回到 [安装 Vivi2D compat plugin](#安装-vivi2d-compat-plugin)，然后再次运行 Vivi2D 的连接检查。

### 结果看起来不对

- 取消导入或 review 步骤。
- 尝试更小的输入、更清晰的图层拆分，或更简单的工作流。
- 如果重要区域变得模糊或难以判断，请回到 Manual Image Split。

### GPU 或内存错误

- 在 ComfyUI 中降低图像尺寸。
- 关闭其他大量使用 GPU 的应用。
- 从 Vivi2D 测试前，先单独运行同一个 ComfyUI 工作流。

## 安全检查

接受 ComfyUI 辅助输出前，请确认:

- endpoint 是本地且可信的。
- 原始图像已经备份。
- ComfyUI-See-through 来自预期仓库；如果 release notes 指定了版本，则使用指定版本。
- Vivi2D compat plugin 来自当前 Vivi2D build 的 `vivi2d_compat_plugin/`，如果提供 checksum，则已经核对一致。
- 返回文件已经在 Vivi2D 中检查。
- 不要在公开 issue 中包含私密提示词、本地路径或私密图像。
- 最终项目在不运行 ComfyUI 的情况下仍然可以打开。

## 下一步

[Auto Setup](../workflows/auto-setup.md)
