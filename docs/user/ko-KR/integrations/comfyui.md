---
title: "ComfyUI 설정"
description: "로컬 ComfyUI를 Vivi2D와 안전하게 연결하는 절차입니다."
locale: "ko-KR"
slug: "integrations/comfyui"
status: "draft"
audience: ["artist","rigger"]
---
# ComfyUI 설정

## 번역 초안 안내

이 페이지는 번역 초안입니다. 가장 최신이고 자세한 절차는 같은 주제의 영어판에 먼저 반영됩니다. 공개 전에는 이 번역도 내용을 확장하고 다시 검토합니다.

## 릴리스 상태

이 페이지는 로컬 실험용 초안입니다. Vivi2D release notes에 고정된 ComfyUI-See-through 대상, Vivi2D compat plugin 패키지, checksum 또는 서명 정보, 지원되는 Vivi2D build 범위가 적히기 전까지는 공개 릴리스용 설치 안내로 사용하지 마세요.

그런 릴리스 정보가 준비되기 전에는 버려도 되는 합성 이미지나 복사한 프로젝트로만 테스트하세요. 여기서 합성 이미지는 설정 확인만을 위한 임시 테스트 그림이며, 의뢰 작업물이나 비공개 제작용 아트워크가 아닙니다. release notes가 공개되면 공식 Vivi2D 다운로드 페이지나 릴리스 페이지에서 연결된 문서를 따르세요.

이 페이지는 ComfyUI를 Vivi2D와 함께 사용하고 싶을 때의 절차입니다. ComfyUI는 선택적인 로컬 도구입니다. ComfyUI를 사용하지 않아도 Manual Image Split, Auto Setup, Viewer는 계속 사용할 수 있습니다.

ComfyUI에서 돌아온 결과는 제안으로 다루세요. Vivi2D에서 확인한 뒤에만 받아들이세요. ComfyUI가 파일을 반환했다는 이유만으로 Vivi2D 프로젝트가 자동으로 바뀌어서는 안 됩니다.

## 먼저 세 부분을 구분하기

필요한 것은 세 가지입니다. 하나를 설치해도 나머지가 자동으로 설치되지는 않습니다.

- **ComfyUI**는 이미지 워크플로를 실행하는 로컬 앱입니다.
- **ComfyUI-See-through**는 [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through)의 서드파티 커스텀 노드 플러그인입니다. ComfyUI 안에서 실행되며 See-through 관련 노드를 추가합니다.
- **Vivi2D compat plugin**은 ComfyUI-See-through와 별개입니다. Vivi2D가 기대하는 노드, 버전, 반환 결과를 확인하기 위한 Vivi2D용 브리지입니다.

두 플러그인은 ComfyUI의 `custom_nodes` 폴더 아래에 sibling 디렉터리로 나란히 둡니다.

```text
ComfyUI/
  custom_nodes/
    ComfyUI-See-through/
    vivi2d_compat_plugin/
```

`ComfyUI-See-through/` 안에 `vivi2d_compat_plugin/`을 넣거나, `vivi2d_compat_plugin/` 안에 `ComfyUI-See-through/`를 넣지 마세요.

## 빠른 폴더 확인

Vivi2D를 열기 전에 먼저 확인하세요.

- ComfyUI가 `http://127.0.0.1:8188/` 같은 로컬 주소로 브라우저에서 열린다.
- `ComfyUI-See-through/`가 `ComfyUI/custom_nodes/` 안에 있다.
- `vivi2d_compat_plugin/`도 `ComfyUI/custom_nodes/` 안에 있으며, `ComfyUI-See-through/`와 나란히 있다.
- 어느 플러그인이든 설치하거나 업데이트한 뒤 ComfyUI를 다시 시작했다.
- ComfyUI에서 See-through 노드가 보이고, Vivi2D의 연결 확인에서 compat plugin을 찾을 수 있다.

문제가 있다면 먼저 이 목록을 고치세요. 대부분의 설정 실패는 두 플러그인을 서로의 폴더 안에 넣었거나, ComfyUI를 다시 시작하지 않았거나, Vivi2D에 잘못된 로컬 주소를 입력한 경우입니다.

## 시작하기 전에

- 원본 이미지나 Vivi2D 프로젝트를 복사해 둡니다.
- ComfyUI는 공식 출처나 공식 데스크톱 패키지에서 설치합니다.
- ComfyUI를 로컬에서 실행하고, 브라우저에서 `http://127.0.0.1:8188/` 같은 주소가 열리는지 확인합니다.
- 신뢰할 수 있는 출처의 커스텀 노드만 설치하세요. ComfyUI 커스텀 노드는 사용자의 컴퓨터에서 코드를 실행하며, 파일이나 네트워크에 접근할 수 있습니다.
- 공개 터널, 공유 URL, 클라우드 릴레이처럼 의도하지 않은 외부 접근 설정은 꺼 둡니다.
- 공개 Vivi2D 릴리스에서 사용할 때는 Vivi2D release notes에 적힌 ComfyUI-See-through 버전과 `vivi2d_compat_plugin/` 패키지를 사용하세요.

## ComfyUI 설치

1. 자신의 환경에 맞는 공식 설치 방법을 선택합니다.
2. Windows에서는 공식 데스크톱 버전이나 포터블 버전이 보통 가장 시작하기 쉽습니다.
3. Vivi2D를 열기 전에 ComfyUI를 한 번 실행합니다.
4. 브라우저에서 ComfyUI 화면이 열리는지 확인합니다.
5. ComfyUI 안에서 작은 테스트 워크플로를 실행해 설치가 정상인지 확인합니다.

공식 설치 방법이 바뀌었다면 ComfyUI 공식 문서를 우선하세요. 이 페이지는 Vivi2D 쪽에서 로컬 ComfyUI에 연결하는 흐름을 설명합니다.

공식 참고:

- [ComfyUI Desktop for Windows](https://docs.comfy.org/installation/desktop)
- [ComfyUI Portable for Windows](https://docs.comfy.org/installation/comfyui_portable_windows)
- [ComfyUI GitHub README](https://github.com/comfyanonymous/ComfyUI)

## ComfyUI-See-through 설치

1. 먼저 Vivi2D release notes를 확인합니다. 고정된 upstream release tag나 commit이 적혀 있으면 그 대상을 사용합니다.
2. Vivi2D가 지정한 대상이 있는지 확인한 뒤 [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through) 저장소를 엽니다.
3. Vivi2D가 고정한 대상이 없는 로컬 실험이라면 해당 저장소의 현재 README를 따릅니다.
4. Vivi2D가 아니라 ComfyUI의 custom-node 영역에 설치합니다.
5. ComfyUI를 다시 시작합니다.
6. Vivi2D를 열기 전에 ComfyUI에서 See-through 노드가 보이는지 확인합니다.

ComfyUI-See-through는 서드파티 코드입니다. upstream 저장소를 사용하고, 설치하는 내용을 확인하며, 임의의 미러는 피하세요.

## Vivi2D compat plugin 설치

1. 사용 중인 Vivi2D build에 맞는 `vivi2d_compat_plugin/` 디렉터리나 패키지를 찾습니다.
2. 공개 릴리스에서는 Vivi2D release notes에 적힌 SHA-256 checksum 또는 서명된 release artifact를 먼저 확인합니다.
3. ComfyUI-See-through와 별도로 `ComfyUI/custom_nodes/vivi2d_compat_plugin/`에 설치합니다.
4. 비슷한 이름의 복사본을 임의의 미러에서 다운로드하지 마세요.
5. 설치하거나 업데이트한 뒤 ComfyUI를 다시 시작합니다.
6. 이후 Vivi2D의 연결 확인으로 로컬 ComfyUI 구성을 검증합니다.
7. Vivi2D가 compat plugin 누락이나 버전 불일치를 표시하면 멈추고, 현재 build 문서에 있는 패키지만 사용하세요.

서로 다른 Vivi2D 버전의 compat plugin 파일을 섞지 마세요. 자신의 build용 `vivi2d_compat_plugin/`이 없다면 compat plugin 없이 계속하거나 Manual Image Split과 Auto Setup을 사용하세요.

## Vivi2D가 ComfyUI로 보내는 것

이 워크플로를 실행하면 Vivi2D가 로컬 ComfyUI로 다음 정보를 보낼 수 있습니다.

- 선택한 이미지 바이트 또는 선택한 이미지의 복사본.
- 사용자가 입력한 워크플로 옵션이나 프롬프트.
- 반환 파일을 현재 실행과 맞추기 위한 로컬 request metadata.

그런 워크플로를 명시적으로 선택하지 않는 한, Vivi2D가 전체 프로젝트 파일을 보내서는 안 됩니다.

ComfyUI와 그 커스텀 노드는 사용자의 컴퓨터에서 실행됩니다. 커스텀 노드는 코드에 따라 로그, 캐시, 파일 출력을 만들 수 있습니다. 먼저 프로젝트 사본으로 시험하고, 로컬 구성을 신뢰하기 전에는 비공개 의뢰 자료를 사용하지 마세요.

## Vivi2D 준비

1. Vivi2D를 엽니다.
2. 원본이 아니라 복사한 프로젝트를 엽니다.
3. 로컬 도구 작업을 시작하기 전에 프로젝트를 저장합니다.
4. 사용 중인 build에 integration 또는 local tool 화면이 있다면 엽니다.
5. 연결 주소는 `http://127.0.0.1:8188/` 같은 로컬 주소만 사용합니다.

사용 중인 Vivi2D build에 ComfyUI 기능이 없다면 여기서 멈추세요. 대신 [Manual Image Split](../workflows/manual-image-split.md)과 [Auto Setup](../workflows/auto-setup.md)을 사용합니다. 비공식 미러의 임의 브리지 스크립트는 설치하지 마세요.

## 로컬 ComfyUI에 연결

1. ComfyUI를 실행한 상태로 둡니다.
2. Vivi2D에 로컬 ComfyUI 주소를 입력합니다.
3. UI에 test 또는 ping 동작이 있으면 실행합니다.
4. 연결되면 워크플로를 실행하기 전에 표시된 capabilities를 확인합니다.
5. Vivi2D compat plugin을 찾을 수 없다는 경고가 나오면, 현재 build에 문서화된 compat plugin만 사용하거나 ComfyUI 없이 계속합니다.

연결은 로컬로 유지하세요. 공유 머신, 공개 URL, 직접 시작하지 않은 서비스에는 연결하지 마세요.

## 첫 번째 안전한 워크플로

1. 작은 테스트 이미지나 복사한 이미지를 선택합니다.
2. 낮은 해상도의 보조 워크플로부터 시작합니다.
3. ComfyUI 처리가 끝날 때까지 기다립니다.
4. Vivi2D의 일반 review 경로로 반환 파일을 가져옵니다.
5. 받아들이기 전에 Vivi2D에서 결과를 확인합니다.
6. mask, layer, setup warning이 나오면 적용하기 전에 수정합니다.
7. 확인한 결과를 받아들인 뒤에는 새 프로젝트 이름으로 저장합니다.

## Vivi2D에 보여야 하는 것

성공하면 Vivi2D는 가져온 제안 또는 반환 파일을 review surface로 보여야 합니다. 앱은 무엇이 저장되고 무엇이 임시 정보인지 설명해야 합니다. 출력 폴더의 원본 파일만 보인다면 확인 없이 프로젝트로 끌어 넣지 마세요.

## 문제 해결

### ComfyUI가 열리지 않음

- Vivi2D에서 테스트하기 전에 ComfyUI 자체가 실행되는지 확인합니다.
- 다른 앱이 `8188` 포트를 사용 중인지 확인합니다.
- ComfyUI를 다시 시작하고 브라우저 페이지를 다시 엽니다.

### Vivi2D에서 연결할 수 없음

- 공개 호스트 이름이 아니라 `127.0.0.1` 또는 `localhost`를 사용합니다.
- 포트 번호가 ComfyUI 창이나 실행 출력과 일치하는지 확인합니다.
- 방화벽이 로컬 앱 통신을 막고 있지 않은지 확인합니다.

### See-through 노드가 보이지 않음

- `ComfyUI-See-through/`가 ComfyUI의 `custom_nodes` 영역에 설치되어 있는지 확인합니다.
- 플러그인을 설치한 뒤 ComfyUI를 다시 시작합니다.
- Vivi2D에서 테스트하기 전에 ComfyUI에서 See-through 노드가 보이는지 확인합니다.

### Vivi2D compat plugin이 없거나 맞지 않음

- 현재 Vivi2D build에 compat plugin이 포함되어 있지 않을 수 있습니다.
- compat plugin을 설치한 디렉터리가 잘못되었을 수 있습니다.
- plugin 버전이 현재 Vivi2D build와 맞지 않을 수 있습니다.
- 관련 없는 버전의 compat plugin 파일을 섞지 마세요.
- [Vivi2D compat plugin 설치](#vivi2d-compat-plugin-설치)로 돌아가 Vivi2D의 연결 확인을 다시 실행합니다.

### 결과가 이상함

- 가져오기 또는 review 단계를 취소합니다.
- 입력 이미지를 작게 하거나, 레이어를 더 명확히 나누거나, 워크플로를 단순하게 해 봅니다.
- 중요한 영역이 모호해지면 Manual Image Split으로 돌아갑니다.

### GPU 또는 메모리 오류

- ComfyUI에서 이미지 크기를 낮춥니다.
- GPU를 많이 쓰는 다른 앱을 닫습니다.
- Vivi2D에서 테스트하기 전에 같은 ComfyUI 워크플로를 단독으로 실행합니다.

## 안전 체크

ComfyUI 보조 출력을 받아들이기 전에 확인하세요.

- endpoint가 로컬이고 신뢰할 수 있다.
- 원본 이미지가 백업되어 있다.
- ComfyUI-See-through는 예상 저장소에서 왔고, 지정된 release가 있으면 그 release를 사용했다.
- Vivi2D compat plugin은 현재 Vivi2D build용 `vivi2d_compat_plugin/`에서 왔고, checksum이 제공되면 일치한다.
- 반환 파일을 Vivi2D에서 확인했다.
- 공개 issue에 private prompt, 로컬 경로, 비공개 이미지를 포함하지 않는다.
- 최종 프로젝트가 ComfyUI 없이도 열린다.

## 다음

[Auto Setup](../workflows/auto-setup.md)
