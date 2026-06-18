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

1. `.swift` ファイルをドラッグ＆ドロップ（または「読み込む…」から選択）
2. 右の iPhone フレームに UI が表示されます
3. ボタンを押す / トグルを切り替える / テキストを入力すると `@State` が更新され、再描画されます

## Mac不要・ブラウザだけの開発ループ（Git編集 → 自動プレビュー）

ローカルに何もインストールせず、**コードはGit上で編集 → push → デプロイされたプレビューで確認**するワークフローです。

1. **自分のアプリのコードを `app/` フォルダに置く**（`app/ContentView.swift` がスターター）。
   複数ファイルに分けてもOK（`app/**/*.swift` がまとめて読み込まれます）。
2. `app/*.swift` を編集して push すると、GitHub Actions（`.github/workflows/deploy.yml`）が
   **GitHub Pages に自動デプロイ**します。
3. 公開URL（`https://<ユーザー名>.github.io/<リポジトリ名>/`）を**iPhone / PC のブラウザ**で開くと、
   起動時に `app/` のコードが自動で読み込まれ、UI と操作を確認できます。

```
app/*.swift を編集 → push → CI が再デプロイ → ブラウザでプレビュー＆操作 → また編集…
```

### 初回セットアップ（1回だけ）
- このリポジトリを `main` にマージ後、GitHub の **Settings → Pages → Source** を「**GitHub Actions**」に設定。
- 以降はアプリ開発を `main` 上で行えば、push のたびに自動で反映されます。
- 画面右上の「読み込む…」から、自分のアプリ（`app/`）と同梱サンプルを切り替えられます。

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
