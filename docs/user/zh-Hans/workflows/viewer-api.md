---
title: "Viewer API 基础"
description: "通过公开客户端流程，把外部控制连接到 Viewer。"
locale: "zh-Hans"
slug: "workflows/viewer-api"
status: "draft"
audience: ["developer","streamer"]
workflow: "viewer-api"
media:
  - "viewer-api.browser-sample"
---
# Viewer API 基础

## 翻译草稿说明

本页是翻译草稿。最新且最详细的步骤会先反映在同一主题的英文版中。公开发布前，本翻译也会扩充并重新审核。

当本地工具需要控制或观察 Viewer 状态时，可以使用 Viewer API。

## 你需要准备

- 本地正在运行的 Viewer。
- 使用公开 Viewer API 客户端流程的客户端。
- 与 Viewer 会话配对的权限。

## 步骤

1. 打开 Viewer，并在配对过程中保持可见。
2. 启动连接 Viewer 的浏览器示例或工具。
3. 配对前确认端点是本地且符合预期。
4. 完成 Viewer 或客户端显示的配对确认。
5. 在允许控制前，检查请求的作用域。
6. 发送控制命令前，先发送一个小而安全的请求，例如读取状态。
7. 测试结束后撤销或关闭会话。

## 检查结果

客户端应显示已配对或已认证状态，Viewer 只应响应已授权作用域覆盖的请求。

## 如果出现问题

不要在公开报告中粘贴令牌、带有秘密的端点 URL 或原始通信内容。请描述可见状态和失败的操作。

## 下一步

[FAQ](../faq.md)
