import SwiftUI

struct ContentView: View {
    @State private var showSheet = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("ようこそ")
                    .font(.largeTitle)
                    .bold()

                Button("詳細を表示") {
                    showSheet = true
                }
                .padding()
                .background(.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .padding()
            .navigationTitle("ホーム")
            .sheet(isPresented: $showSheet) {
                DetailView()
            }
        }
    }
}

struct DetailView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "star.fill")
                .font(.largeTitle)
                .foregroundColor(.yellow)
            Text("詳細画面")
                .font(.title)
                .bold()
            Text("これはシート（モーダル）で表示されています。")
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
