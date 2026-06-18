import SwiftUI

struct ContentView: View {
    @State private var name = ""
    @State private var isOn = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("プロフィール")
                .font(.title)
                .bold()

            TextField("お名前を入力", text: $name)
                .padding()
                .background(Color(red: 0.95, green: 0.95, blue: 0.97))
                .cornerRadius(10)

            Toggle("通知を受け取る", isOn: $isOn)

            if name.isEmpty {
                Text("名前が未入力です")
                    .foregroundColor(.secondary)
            } else {
                Text("こんにちは、\(name) さん！")
                    .foregroundColor(.blue)
            }

            if isOn {
                Text("🔔 通知はオンです")
                    .foregroundColor(.green)
            }

            Spacer()
        }
        .padding()
    }
}
