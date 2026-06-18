# SwiftUI Web Previewer

**Macなしで iPhone アプリの UI と動作を確認できる Web アプリです。**

実機の iPhone でそのまま動く本物の SwiftUI コード（`.swift`）をブラウザにアップロードすると、
iPhone 型フレームの中で UI のレイアウトと簡単な操作（ボタン・トグル・入力・画面遷移）をプレビューできます。
コードは無加工なので、同じファイルを Xcode に持っていけば実機でもそのままコンパイルできます。

> 仕組み: Swift をブラウザでコンパイルする代わりに、**SwiftUI のサブセットを TypeScript で解析・解釈するインタプリタ**
> （字句解析 → 構文解析 → 評価 → HTML/CSS 描画）を実装しています。完全クライアントサイドで動作するため、
> アップロードしたコードがサーバーに送信されることはありません。

## 使い方

```bash
npm install
npm run dev      # 開発サーバー（http://localhost:5173）
npm run build    # 静的ビルド（dist/ を任意の静的ホストに配置）
npm test         # インタプリタ・描画・操作のテスト
```

1. `.swift` ファイルをドラッグ＆ドロップ（または「サンプルを読み込む」から選択）
2. 右の iPhone フレームに UI が表示されます
3. ボタンを押す / トグルを切り替える / テキストを入力すると `@State` が更新され、再描画されます

## 対応している SwiftUI（MVP）

- `struct X: View { var body: some View { ... } }`、`@State` / `@Binding`（`$` バインディング）
- ビュー: `Text`（文字列補間可）/ `Image(systemName:)` / `Button` / `Toggle` / `TextField` / `SecureField` /
  `Spacer` / `Divider` / `VStack` / `HStack` / `ZStack` / `ScrollView` / `List` / `ForEach` /
  `NavigationStack` + `.navigationTitle` / `NavigationLink` / `Group`
- 制御構文: `if` / `else`、`ForEach`
- 修飾子: `.padding` `.foregroundColor` `.background` `.font` `.bold` `.cornerRadius` `.frame`
  `.opacity` `.shadow` `.border` `.multilineTextAlignment` ほか
- `.sheet(isPresented:)` / `.onTapGesture`、`Identifiable` なモデル struct と `ForEach`
- ボタン等のアクション: 代入（`count += 1`）、`x.toggle()`、`array.append(...)` など

## 未対応のもの

任意の Swift 実行（一般の `func` 本体・`for`/`while`・generics）、`ObservableObject` / `@Published`、
ネットワーク / `async`、`GeometryReader`、カスタム `ViewModifier`、高度なアニメーション・描画 など。

**未対応の構文に出会っても、プレビューはクラッシュしません。** 警告として一覧表示し、未対応のビューは
プレースホルダで表示します。これらの多くは実機 (Xcode) では問題なくコンパイルできます。

## 構成

```
src/
  interpreter/   tokenizer → parser(AST) → evaluator → ViewNode（描画ツリー）、@State ストア
  render/        ViewNode → React 描画、修飾子→CSS、SF Symbol→アイコン、usePreview フック
  components/    アップロード / コードパネル / iPhone フレーム / プレビュー / エラーパネル
examples/        同梱サンプル .swift
```
