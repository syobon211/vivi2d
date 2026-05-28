---
title: "ComfyUI セットアップ"
description: "ローカルの ComfyUI を Vivi2D と安全につなぐための手順です。"
locale: "ja"
slug: "integrations/comfyui"
status: "draft"
audience: ["artist","rigger"]
---
# ComfyUI セットアップ

## 翻訳ドラフトについて

このページは翻訳ドラフトです。最新かつ最も詳しい手順は、同じトピックの英語版に先に反映されます。公開前に、この翻訳も内容を広げてレビューします。

## リリース状態

このページはローカル実験用のドラフトです。Vivi2D のリリースノートに、固定された ComfyUI-See-through の対象、Vivi2D compat plugin パッケージ、checksum または署名情報、対応する Vivi2D ビルド範囲が記載されるまでは、公開版のインストール手順として使わないでください。

それらのリリース情報がそろうまでは、破棄してもよい合成画像またはコピーしたプロジェクトだけで試してください。ここでいう合成画像は、動作確認だけに使うテスト用の絵であり、依頼素材や本番用の非公開アートワークではありません。リリースノートが公開されたら、公式の Vivi2D ダウンロードページまたはリリースページからたどってください。

このページは、ComfyUI を Vivi2D と一緒に使いたいときの手順です。ComfyUI は任意のローカルツールです。使わなくても Manual Image Split、Auto Setup、Viewer は利用できます。

ComfyUI から返ってきた結果は、Vivi2D で確認してから受け入れてください。ComfyUI がファイルを返しただけで、Vivi2D のプロジェクトが自動で変更されるべきではありません。

## まず全体像

必要なものは3つです。1つを入れても、残りが自動で入るわけではありません。

- **ComfyUI** は画像ワークフローを動かすローカルアプリです。
- **ComfyUI-See-through** は [`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through) のサードパーティ製カスタムノードです。ComfyUI の中で動き、See-through 系の処理を追加します。
- **Vivi2D compat plugin** は ComfyUI-See-through とは別物です。Vivi2D が期待するノード、バージョン、返却結果を確認するための Vivi2D 側ブリッジです。

2つのプラグインは、ComfyUI の `custom_nodes` の下に sibling ディレクトリとして並べます。

```text
ComfyUI/
  custom_nodes/
    ComfyUI-See-through/
    vivi2d_compat_plugin/
```

`ComfyUI-See-through/` の中に `vivi2d_compat_plugin/` を入れたり、逆に `vivi2d_compat_plugin/` の中に `ComfyUI-See-through/` を入れたりしないでください。

## クイック確認

Vivi2D を開く前に、ここだけ確認します。

- ComfyUI が `http://127.0.0.1:8188/` のようなローカルアドレスで開く。
- `ComfyUI-See-through/` が `ComfyUI/custom_nodes/` の中にある。
- `vivi2d_compat_plugin/` も `ComfyUI/custom_nodes/` の中にあり、`ComfyUI-See-through/` と横並びになっている。
- どちらかのプラグインを追加または更新したあと、ComfyUI を再起動した。
- ComfyUI 上で See-through ノードが見え、Vivi2D の接続確認で compat plugin が見つかる。

うまくいかない原因の多くは、2つのプラグインを入れ子にしてしまうこと、ComfyUI の再起動忘れ、または Vivi2D に入力したローカルアドレスの間違いです。

## 始める前に

- 元画像や Vivi2D プロジェクトをコピーしておきます。
- ComfyUI は公式の配布元または公式デスクトップ版から入手します。
- ComfyUI をローカルで起動し、ブラウザで `http://127.0.0.1:8188/` のようなアドレスが開くことを確認します。
- 信頼できる提供元のカスタムノードだけを入れてください。ComfyUI のカスタムノードは、あなたの PC 上でコードを実行し、ファイルやネットワークにアクセスできる場合があります。
- 公開トンネル、共有 URL、クラウド中継など、意図しない外部アクセス設定は閉じてください。
- 公開版の Vivi2D で使う場合は、Vivi2D のリリースノートに書かれた ComfyUI-See-through のバージョンと `vivi2d_compat_plugin/` を使ってください。

## ComfyUI を入れる

1. 自分の環境に合う公式のインストール方法を選びます。
2. Windows では、公式デスクトップ版またはポータブル版が始めやすいです。
3. Vivi2D を開く前に、ComfyUI を一度起動します。
4. ブラウザで ComfyUI の画面が開くことを確認します。
5. ComfyUI 単体で小さなテストワークフローを動かし、インストールが動作していることを確認します。

公式の手順が変わっている場合は、ComfyUI 側の公式ドキュメントを優先してください。このページは、Vivi2D からローカルの ComfyUI へつなぐ流れを説明します。

公式参照:

- [ComfyUI Desktop for Windows](https://docs.comfy.org/installation/desktop)
- [ComfyUI Portable for Windows](https://docs.comfy.org/installation/comfyui_portable_windows)
- [ComfyUI GitHub README](https://github.com/comfyanonymous/ComfyUI)

## ComfyUI-See-through を入れる

1. まず Vivi2D のリリースノートを確認します。固定された upstream の release tag や commit が書かれている場合は、それを使います。
2. Vivi2D 側で固定対象があるか確認してから、[`jtydhr88/ComfyUI-See-through`](https://github.com/jtydhr88/ComfyUI-See-through) を開きます。
3. 固定対象がないローカル実験では、そのリポジトリの現在の README に従います。
4. Vivi2D ではなく、ComfyUI の custom-node 領域に入れます。
5. ComfyUI を再起動します。
6. Vivi2D を開く前に、ComfyUI 上で See-through ノードが表示されることを確認します。

ComfyUI-See-through はサードパーティ製のコードです。内容を確認し、無関係なミラーや見知らぬ配布元は避けてください。

## Vivi2D compat plugin を入れる

1. 使っている Vivi2D ビルドに対応する `vivi2d_compat_plugin/` ディレクトリまたはパッケージを探します。
2. 公開版では、Vivi2D のリリースノートにある SHA-256 checksum または署名付き release artifact を確認してから入れます。
3. `ComfyUI/custom_nodes/vivi2d_compat_plugin/` として、ComfyUI-See-through とは別に入れます。
4. 似た名前のコピーをランダムなミラーから入れないでください。
5. 入れた後、または更新した後は ComfyUI を再起動します。
6. Vivi2D の接続確認で、ローカル ComfyUI の構成を確認します。
7. Vivi2D が compat plugin の不足やバージョン不一致を表示した場合は、そこで止まり、その Vivi2D ビルド用に文書化されたものだけを使います。

関係のない Vivi2D バージョンの compat plugin を混ぜないでください。自分のビルド用の `vivi2d_compat_plugin/` がない場合は、compat plugin なしで続けるか、Manual Image Split と Auto Setup を使ってください。

## Vivi2D が ComfyUI に送るもの

このワークフローを実行すると、Vivi2D は次のものを ComfyUI に送る場合があります。

- 選択した画像バイト、または選択した画像のコピー。
- 入力したワークフロー設定やプロンプト。
- 返ってきたファイルと現在の実行を対応させるためのローカル request metadata。

明示的にそういうワークフローを選ばない限り、Vivi2D プロジェクト全体を送るべきではありません。

ComfyUI とそのカスタムノードは、あなたの PC 上で動きます。カスタムノードは、コードの内容によってログ、キャッシュ、ファイル出力を行うことがあります。まずはコピーしたプロジェクトで試し、ローカル構成を信頼できるまでは非公開の依頼素材を使わないでください。

## Vivi2D 側を準備する

1. Vivi2D を開きます。
2. 元データそのものではなく、コピーしたプロジェクトを開きます。
3. ローカルツール作業を始める前にプロジェクトを保存します。
4. ビルドに integration または local tool の画面がある場合は開きます。
5. 接続先は `http://127.0.0.1:8188/` のようなローカルアドレスだけにします。

使用中の Vivi2D ビルドに ComfyUI 連携がない場合は、ここで止めてください。その場合は [Manual Image Split](../workflows/manual-image-split.md) と [Auto Setup](../workflows/auto-setup.md) を使います。

## ローカル ComfyUI に接続する

1. ComfyUI を起動したままにします。
2. Vivi2D にローカルの ComfyUI アドレスを入力します。
3. UI に test または ping がある場合は実行します。
4. 接続できたら、ワークフローを実行する前に表示された機能情報を確認します。
5. Vivi2D compat plugin が見つからない警告が出た場合は、そのビルド用に文書化された compat plugin だけを使うか、ComfyUI なしで作業します。

接続はローカルに限定してください。共有マシン、公開 URL、自分で起動していないサービスには接続しないでください。

## 最初の安全なワークフロー

1. 小さなテスト画像、またはコピーした画像を選びます。
2. 低解像度の補助ワークフローから始めます。
3. ComfyUI の処理が終わるまで待ちます。
4. Vivi2D の通常のレビュー手順で返ってきたファイルを読み込みます。
5. 受け入れる前に Vivi2D 上で結果を確認します。
6. マスク、レイヤー、セットアップに警告が出た場合は、適用前に修正します。
7. 確認して受け入れた後は、別名で保存します。

## Vivi2D に表示されるべきもの

成功した場合、Vivi2D には読み込まれた提案または返却ファイルがレビュー画面として表示されます。アプリは、何が保存され、何が一時的な情報なのかを説明する必要があります。出力フォルダの生ファイルだけが見えている場合は、確認せずにプロジェクトへドラッグしないでください。

## トラブルシューティング

### ComfyUI が開かない

- Vivi2D から試す前に、ComfyUI 単体で起動できるか確認します。
- 他のアプリが `8188` ポートを使っていないか確認します。
- ComfyUI を再起動し、ブラウザで開き直します。

### Vivi2D から接続できない

- 公開ホスト名ではなく、`127.0.0.1` または `localhost` を使います。
- ポート番号が ComfyUI の表示と一致しているか確認します。
- ファイアウォールがローカル通信を止めていないか確認します。

### See-through ノードが見つからない

- `ComfyUI-See-through/` が ComfyUI の `custom_nodes` の中にあるか確認します。
- 入れた後に ComfyUI を再起動します。
- Vivi2D から試す前に、ComfyUI 上で See-through ノードが見えるか確認します。

### Vivi2D compat plugin が見つからない、または一致しない

- 現在の Vivi2D ビルドに compat plugin が含まれていない可能性があります。
- compat plugin を入れる場所が間違っている可能性があります。
- plugin のバージョンが Vivi2D ビルドと一致していない可能性があります。
- 関係のないバージョンの compat plugin ファイルを混ぜないでください。
- [Vivi2D compat plugin を入れる](#vivi2d-compat-plugin-を入れる) に戻り、Vivi2D の接続確認をもう一度実行します。

### 結果がおかしい

- 読み込みまたはレビュー手順をキャンセルします。
- 入力画像を小さくする、レイヤーを分ける、ワークフローを単純にする、などを試します。
- 重要な領域があいまいになる場合は、Manual Image Split に戻ります。

### GPU またはメモリのエラーが出る

- ComfyUI 側で画像サイズを下げます。
- 他の GPU を使うアプリを閉じます。
- Vivi2D から試す前に、同じ ComfyUI ワークフローを単体で実行します。

## 安全チェック

受け入れる前に、次を確認してください。

- 接続先がローカルで信頼できる。
- 元画像のバックアップがある。
- ComfyUI-See-through は期待されるリポジトリから入り、指定がある場合は固定された release を使っている。
- Vivi2D compat plugin は、その Vivi2D ビルド用の `vivi2d_compat_plugin/` から入り、指定がある場合は checksum と一致している。
- 返ってきたファイルを Vivi2D 上で確認した。
- 公開 issue にプロンプト、ローカルパス、非公開画像を載せない。
- 最終プロジェクトが ComfyUI なしでも開ける。

## 次へ

[Auto Setup](../workflows/auto-setup.md)
