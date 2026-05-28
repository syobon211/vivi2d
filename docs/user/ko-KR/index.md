---
title: "Vivi2D 사용자 가이드"
description: "Vivi2D를 시작하고 주요 제작 흐름을 이해하기 위한 안내입니다."
locale: "ko-KR"
slug: ""
status: "draft"
audience: ["artist","rigger","streamer","developer"]
---
# Vivi2D 사용자 가이드

## 번역 초안 안내

이 페이지는 번역 초안입니다. 가장 최신이고 자세한 절차는 같은 주제의 영어판에 먼저 반영됩니다. 공개 전에는 이 번역도 내용을 확장하고 다시 검토합니다.

이 가이드는 저장소 지식이 없어도 Vivi2D의 현재 작업 흐름을 이해할 수 있도록 아티스트, 리거, 스트리머, SDK 사용자를 위해 정리한 문서입니다.

## 먼저 읽기

1. [Vivi2D 설치](getting-started/install.md)에서 현재 배포 상태를 확인합니다.
2. [첫 실행](getting-started/first-launch.md)에서 기본 언어, 다크 테마, 빈 작업 공간을 확인합니다.
3. [첫 프로젝트 열기](getting-started/open-your-first-project.md)로 아트워크를 가져옵니다.
4. [아트워크에서 시작 리그까지](workflows/psd-to-rig.md)로 전체 제작 흐름을 따라갑니다.

## 주요 워크플로

- [Manual Image Split](workflows/manual-image-split.md)은 평면 이미지를 설정하기 쉬운 파트로 나눕니다.
- [Auto Setup](workflows/auto-setup.md)은 준비된 레이어에서 검토 가능한 시작 설정을 만듭니다.
- [Viewer에서 미리보기](workflows/viewer.md)는 내보내기나 연동 전에 모델을 확인합니다.
- [Viewer API 기본](workflows/viewer-api.md)은 외부 도구와의 로컬 페어링 흐름을 설명합니다.

## 선택적 연동

- [ComfyUI 설정](integrations/comfyui.md)은 로컬 ComfyUI를 연결하면서 Vivi2D의 검토 단계를 유지하는 방법을 설명합니다.

## 문서 상태

이 페이지들은 공개 준비 중인 사용자 문서 초안입니다. 최종 스크린샷과 동영상은 이후 미디어 작업에서 추가될 예정이므로, 각 페이지는 텍스트만으로도 이해할 수 있게 작성되어 있습니다.

## 도움이 필요할 때

앱 상태가 가이드와 다르다면 [가져오기 오류](troubleshooting/import-errors.md), [표시와 GPU](troubleshooting/display-and-gpu.md), [언어와 텍스트 표시](troubleshooting/localization.md)를 확인하세요.
