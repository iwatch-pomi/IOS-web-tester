import SwiftUI

struct ContentView: View {
    @State private var count = 0

    var body: some View {
        VStack(spacing: 24) {
            Text("カウント: \(count)")
                .font(.title)
                .bold()

            HStack(spacing: 16) {
                Button("−") {
                    count -= 1
                }
                .font(.title)
                .padding()
                .background(.red)
                .foregroundColor(.white)
                .cornerRadius(12)

                Button("＋") {
                    count += 1
                }
                .font(.title)
                .padding()
                .background(.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
            }

            Button("リセット") {
                count = 0
            }
            .foregroundColor(.secondary)
        }
        .padding()
    }
}
