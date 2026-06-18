// Eagerly bundle the user's own SwiftUI app sources from the repo's app/ folder.
// Edit app/*.swift and push — the deployed preview reflects it automatically.
const modules = import.meta.glob('../app/**/*.swift', { query: '?raw', import: 'default', eager: true });

export interface UserFile {
  name: string;
  code: string;
}

export const userAppFiles: UserFile[] = Object.entries(modules)
  .map(([path, code]) => ({ name: path.split('/').pop()!, code: code as string }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const hasUserApp = userAppFiles.length > 0;
