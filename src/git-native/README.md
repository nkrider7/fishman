# Git-native module

Filesystem-first Fishman workspaces: `project/fishman/**` with `.fish` JSON requests.

See [docs/git-native.md](../../docs/git-native.md).

```ts
import {
  createMemoryFs,
  createFishmanWorkspace,
  parseWorkspaceDir,
  detectGit,
} from "@/git-native";

const fs = createMemoryFs();
await createFishmanWorkspace(fs, { projectPath: "api", name: "Backend" });
const graph = await parseWorkspaceDir(fs, "api/fishman");
const git = await detectGit(fs, "api");
```
