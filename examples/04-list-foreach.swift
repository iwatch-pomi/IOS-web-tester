import SwiftUI

struct Fruit: Identifiable {
    let id: Int
    let name: String
    let emoji: String
}

struct ContentView: View {
    @State private var fruits = [
        Fruit(id: 1, name: "りんご", emoji: "🍎"),
        Fruit(id: 2, name: "ばなな", emoji: "🍌"),
        Fruit(id: 3, name: "ぶどう", emoji: "🍇"),
    ]

    var body: some View {
        List {
            ForEach(fruits) { fruit in
                HStack {
                    Text(fruit.emoji)
                        .font(.title)
                    Text(fruit.name)
                        .font(.headline)
                    Spacer()
                }
                .padding()
            }
        }
    }
}
