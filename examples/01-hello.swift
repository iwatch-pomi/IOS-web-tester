import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "swift")
                .font(.largeTitle)
                .foregroundColor(.orange)
            Text("Hello, iPhone!")
                .font(.title)
                .bold()
            Text("Macなしで SwiftUI をプレビュー")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding()
    }
}
