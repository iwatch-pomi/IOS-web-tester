import SwiftUI

// ここにあなたの SwiftUI アプリのコードを書きます。
// このファイルを編集して push すると、デプロイされたプレビューに自動で反映されます。
// （複数ファイルに分けてもOK。app/ 配下の .swift がまとめて読み込まれます）

struct ContentView: View {
    @State private var tapCount = 0

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "hand.wave")
                    .font(.largeTitle)
                    .foregroundColor(.blue)

                Text("あなたのアプリ")
                    .font(.title)
                    .bold()

                Text("app/ContentView.swift を編集して push すると、ここに反映されます。")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)

                Button("タップ: \(tapCount)") {
                    tapCount += 1
                }
                .padding()
                .background(.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .padding()
            .navigationTitle("My App")
        }
    }
}
