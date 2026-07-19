import git from "isomorphic-git";
import { remove } from "@tauri-apps/plugin-fs";
import {
  createIsomorphicGitFs,
  type IsomorphicGitFs,
} from "../fs/isomorphic-git-fs";
import { createTauriGitNativeFs } from "../fs/tauri-fs";
import { createOnAuth, createOnAuthFailure, formatGitError } from "./auth";
import { tauriGitHttp } from "./tauri-http";
import { normalizeRemoteUrl } from "./remote-url";
import { detectGit } from "./detect";
import { buildFileDiff, decodeBlob } from "./file-diff";
import {
  mergeLocalBranches,
  parseSymbolicHeadBranch,
} from "./head-branch";
import {
  mapStatusMatrixRow,
  type StatusMatrixRow,
} from "./status-map";
import type {
  GitCommitInfo,
  GitFileChange,
  GitFileStatus,
  GitOperations,
  GitRemote,
  GitRepoStatus,
} from "./types";

const DEFAULT_AUTHOR = {
  name: "Fishman",
  email: "fishman@localhost",
};

const lastFetchedAtByRepo = new Map<string, number>();
let sharedFs: IsomorphicGitFs | null = null;

function fs(): IsomorphicGitFs {
  if (!sharedFs) sharedFs = createIsomorphicGitFs();
  return sharedFs;
}

function dirOpts(projectPath: string) {
  return { fs: fs(), dir: projectPath };
}

async function resolveAuthor(projectPath: string) {
  try {
    const name =
      (await git.getConfig({
        ...dirOpts(projectPath),
        path: "user.name",
      })) ?? DEFAULT_AUTHOR.name;
    const email =
      (await git.getConfig({
        ...dirOpts(projectPath),
        path: "user.email",
      })) ?? DEFAULT_AUTHOR.email;
    return {
      name: typeof name === "string" && name ? name : DEFAULT_AUTHOR.name,
      email: typeof email === "string" && email ? email : DEFAULT_AUTHOR.email,
    };
  } catch {
    return DEFAULT_AUTHOR;
  }
}

async function computeAheadBehind(
  projectPath: string,
  branch: string | null,
  remotes: GitRemote[],
): Promise<{ ahead: number; behind: number; upstream: string | null }> {
  if (!branch || remotes.length === 0) {
    return { ahead: 0, behind: 0, upstream: null };
  }
  const remoteName = remotes[0]?.name ?? "origin";
  const upstream = `${remoteName}/${branch}`;
  try {
    const localOid = await git.resolveRef({
      ...dirOpts(projectPath),
      ref: `refs/heads/${branch}`,
    });
    const remoteOid = await git.resolveRef({
      ...dirOpts(projectPath),
      ref: `refs/remotes/${upstream}`,
    });

    const localLog = await git.log({
      ...dirOpts(projectPath),
      ref: localOid,
      depth: 100,
    });
    const remoteLog = await git.log({
      ...dirOpts(projectPath),
      ref: remoteOid,
      depth: 100,
    });

    const remoteSet = new Set(remoteLog.map((c) => c.oid));
    const localSet = new Set(localLog.map((c) => c.oid));

    let ahead = 0;
    for (const c of localLog) {
      if (remoteSet.has(c.oid)) break;
      ahead++;
    }
    let behind = 0;
    for (const c of remoteLog) {
      if (localSet.has(c.oid)) break;
      behind++;
    }
    return { ahead, behind, upstream };
  } catch {
    return { ahead: 0, behind: 0, upstream: null };
  }
}

async function withGitError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw new Error(formatGitError(error));
  }
}

/**
 * Read the branch name from `.git/HEAD` when it is a symbolic ref.
 * Works for unborn branches (no commits yet) where isomorphic-git's
 * `currentBranch` / `listBranches` return null / [].
 */
async function readSymbolicHeadBranch(
  projectPath: string,
): Promise<string | null> {
  try {
    const headPath = `${projectPath.replace(/\/$/, "")}/.git/HEAD`;
    const raw = await fs().promises.readFile(headPath, {
      encoding: "utf8",
    });
    return parseSymbolicHeadBranch(String(raw));
  } catch {
    return null;
  }
}

async function resolveCurrentBranch(
  projectPath: string,
): Promise<{ branch: string | null; detachedHead: boolean }> {
  const branchRaw = await git.currentBranch({
    ...dirOpts(projectPath),
    test: true,
  });
  if (typeof branchRaw === "string" && branchRaw.length > 0) {
    return { branch: branchRaw, detachedHead: false };
  }

  const symbolic = await readSymbolicHeadBranch(projectPath);
  if (symbolic) {
    return { branch: symbolic, detachedHead: false };
  }

  return { branch: null, detachedHead: true };
}

async function resolveHeadOid(projectPath: string): Promise<string | null> {
  try {
    const oid = await git.resolveRef({
      ...dirOpts(projectPath),
      ref: "HEAD",
    });
    return typeof oid === "string" && oid.length > 0 ? oid : null;
  } catch {
    return null;
  }
}

/** True when HEAD does not resolve to a commit yet. */
async function isUnbornRepo(projectPath: string): Promise<boolean> {
  return (await resolveHeadOid(projectPath)) == null;
}

/**
 * Recursively list branch names under `.git/refs/heads` as a FS fallback.
 * Nested names like `feature/foo` become `feature/foo`.
 */
async function listBranchNamesFromFs(projectPath: string): Promise<string[]> {
  const headsDir = `${projectPath.replace(/\/$/, "")}/.git/refs/heads`;
  const out: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: string[];
    try {
      entries = await fs().promises.readdir(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!name || name === "." || name === "..") continue;
      const abs = `${dir}/${name}`;
      let isDir = false;
      try {
        const st = await fs().promises.stat(abs);
        isDir = Boolean(st.isDirectory?.() ?? st.type === "dir");
      } catch {
        continue;
      }
      const rel = prefix ? `${prefix}/${name}` : name;
      if (isDir) {
        await walk(abs, rel);
      } else {
        out.push(rel);
      }
    }
  }

  await walk(headsDir, "");
  return out;
}

async function listLocalBranches(projectPath: string): Promise<string[]> {
  let fromGit: string[] = [];
  try {
    const listed = await git.listBranches({ ...dirOpts(projectPath) });
    fromGit = Array.isArray(listed) ? listed : [];
  } catch {
    fromGit = [];
  }

  const fromFs = await listBranchNamesFromFs(projectPath);
  const merged = Array.from(
    new Set(
      [...fromGit, ...fromFs].filter(
        (b): b is string => typeof b === "string" && b.trim().length > 0,
      ),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const symbolic = await readSymbolicHeadBranch(projectPath);
  return mergeLocalBranches(merged, symbolic);
}

async function writeUnbornHead(
  projectPath: string,
  branchName: string,
): Promise<void> {
  const headPath = `${projectPath.replace(/\/$/, "")}/.git/HEAD`;
  await fs().promises.writeFile(
    headPath,
    `ref: refs/heads/${branchName}\n`,
    { encoding: "utf8" },
  );
}

async function writeBranchRef(
  projectPath: string,
  branchName: string,
  oid: string,
): Promise<void> {
  const root = projectPath.replace(/\/$/, "");
  const parts = branchName.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("Invalid branch name");

  // Ensure parent dirs for nested branches (feature/foo).
  let dir = `${root}/.git/refs/heads`;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = `${dir}/${parts[i]}`;
    try {
      await fs().promises.mkdir(dir, { recursive: true });
    } catch {
      // exists
    }
  }

  const refPath = `${root}/.git/refs/heads/${parts.join("/")}`;
  await fs().promises.writeFile(refPath, `${oid.trim()}\n`, {
    encoding: "utf8",
  });
}

export function createGitOperations(): GitOperations {
  const httpOpts = {
    http: tauriGitHttp,
    onAuth: createOnAuth(),
    onAuthFailure: createOnAuthFailure(),
  };

  const ops: GitOperations = {
    async status(projectPath) {
      return withGitError(async () => {
        const detection = await detectGit(
          createTauriGitNativeFs(),
          projectPath,
        );

        if (!detection.hasGit) {
          return {
            enabled: false,
            projectPath,
            branch: null,
            detachedHead: false,
            changes: [],
            ahead: 0,
            behind: 0,
            hasRemote: false,
            remotes: [],
            upstream: null,
            lastFetchedAt: lastFetchedAtByRepo.get(projectPath) ?? null,
          } satisfies GitRepoStatus;
        }

        const { branch, detachedHead } = await resolveCurrentBranch(projectPath);

        const matrix = (await git.statusMatrix({
          ...dirOpts(projectPath),
        })) as StatusMatrixRow[];

        const changes: GitFileChange[] = [];
        for (const row of matrix) {
          changes.push(...mapStatusMatrixRow(row));
        }

        const remotes = await ops.listRemotes(projectPath);
        const { ahead, behind, upstream } = await computeAheadBehind(
          projectPath,
          branch,
          remotes,
        );

        return {
          enabled: true,
          projectPath,
          branch: branch ?? (detachedHead ? "HEAD" : null),
          detachedHead,
          changes,
          ahead,
          behind,
          hasRemote: remotes.length > 0,
          remotes,
          upstream,
          lastFetchedAt: lastFetchedAtByRepo.get(projectPath) ?? null,
        };
      });
    },

    async init(projectPath) {
      return withGitError(async () => {
        await git.init({
          ...dirOpts(projectPath),
          defaultBranch: "main",
        });
        await git.setConfig({
          ...dirOpts(projectPath),
          path: "user.name",
          value: DEFAULT_AUTHOR.name,
        });
        await git.setConfig({
          ...dirOpts(projectPath),
          path: "user.email",
          value: DEFAULT_AUTHOR.email,
        });
      });
    },

    async stage(projectPath, paths) {
      return withGitError(async () => {
        // Bulk stage avoids hundreds of parallel add IPC calls after a large export.
        if (paths.length > 30) {
          await git.add({ ...dirOpts(projectPath), filepath: "." });
          return;
        }
        for (const filepath of paths) {
          try {
            await git.add({ ...dirOpts(projectPath), filepath });
          } catch {
            await git.remove({ ...dirOpts(projectPath), filepath });
          }
        }
      });
    },

    async unstage(projectPath, paths) {
      return withGitError(async () => {
        for (const filepath of paths) {
          await git.resetIndex({ ...dirOpts(projectPath), filepath });
        }
      });
    },

    async commit(projectPath, message) {
      return withGitError(async () => {
        const author = await resolveAuthor(projectPath);
        const oid = await git.commit({
          ...dirOpts(projectPath),
          message: message.trim(),
          author,
          committer: author,
        });
        return oid;
      });
    },

    async discard(projectPath, paths) {
      return withGitError(async () => {
        const matrix = (await git.statusMatrix({
          ...dirOpts(projectPath),
          filepaths: paths,
        })) as StatusMatrixRow[];

        const untracked: string[] = [];
        const tracked: string[] = [];
        for (const [filepath, head, workdir, stage] of matrix) {
          if (head === 0 && workdir === 2 && stage === 0) {
            untracked.push(filepath);
          } else {
            tracked.push(filepath);
          }
        }

        if (tracked.length > 0) {
          await git.checkout({
            ...dirOpts(projectPath),
            force: true,
            filepaths: tracked,
          });
        }
        for (const filepath of untracked) {
          const abs = `${projectPath}/${filepath}`.replace(/\/+/g, "/");
          try {
            await remove(abs);
          } catch {
            // ignore missing
          }
        }
      });
    },

    async listRemotes(projectPath) {
      return withGitError(async () => {
        const remotes = await git.listRemotes({ ...dirOpts(projectPath) });
        return remotes.map((r) => ({ name: r.remote, url: r.url }));
      });
    },

    async addRemote(projectPath, name, url) {
      return withGitError(async () => {
        const normalized = normalizeRemoteUrl(url);
        if (!normalized) throw new Error("Remote URL is required");
        if (!/^https?:\/\//i.test(normalized)) {
          throw new Error(
            "Use an HTTPS remote URL (e.g. https://github.com/owner/repo.git). SSH remotes are converted when possible.",
          );
        }
        await git.addRemote({
          ...dirOpts(projectPath),
          remote: name,
          url: normalized,
        });
      });
    },
    async removeRemote(projectPath, name) {
      return withGitError(async () => {
        await git.deleteRemote({
          ...dirOpts(projectPath),
          remote: name,
        });
      });
    },

    async fetch(projectPath) {
      return withGitError(async () => {
        const remotes = await ops.listRemotes(projectPath);
        if (remotes.length === 0) {
          throw new Error("No remotes configured. Add a remote first.");
        }
        const remote = remotes[0]!;
        await git.fetch({
          ...dirOpts(projectPath),
          ...httpOpts,
          remote: remote.name,
          url: normalizeRemoteUrl(remote.url),
          singleBranch: false,
          tags: false,
        });
        lastFetchedAtByRepo.set(projectPath, Date.now());
      });
    },

    async pull(projectPath) {
      return withGitError(async () => {
        const remotes = await ops.listRemotes(projectPath);
        if (remotes.length === 0) {
          throw new Error("No remotes configured. Add a remote first.");
        }
        const author = await resolveAuthor(projectPath);
        const remote = remotes[0]!;
        const { branch } = await resolveCurrentBranch(projectPath);
        await git.pull({
          ...dirOpts(projectPath),
          ...httpOpts,
          author,
          remote: remote.name,
          url: normalizeRemoteUrl(remote.url),
          ref: branch ?? undefined,
          singleBranch: true,
        });
        lastFetchedAtByRepo.set(projectPath, Date.now());
      });
    },

    async push(projectPath) {
      return withGitError(async () => {
        const remotes = await ops.listRemotes(projectPath);
        if (remotes.length === 0) {
          throw new Error("No remotes configured. Add a remote first.");
        }
        const remote = remotes[0]!;
        const { branch } = await resolveCurrentBranch(projectPath);
        if (!branch) {
          throw new Error("Cannot push: no current branch.");
        }
        await git.push({
          ...dirOpts(projectPath),
          ...httpOpts,
          remote: remote.name,
          url: normalizeRemoteUrl(remote.url),
          ref: branch,
        });
      });
    },

    async currentBranch(projectPath) {
      return withGitError(async () => {
        const { branch } = await resolveCurrentBranch(projectPath);
        return branch;
      });
    },

    async listBranches(projectPath) {
      return withGitError(async () => listLocalBranches(projectPath));
    },

    async createBranch(projectPath, name) {
      return withGitError(async () => {
        const trimmed = name.trim().replace(/^refs\/heads\//i, "");
        if (!trimmed) throw new Error("Branch name is required");
        if (trimmed.includes("..") || trimmed.startsWith("/") || trimmed.endsWith("/")) {
          throw new Error("Invalid branch name");
        }

        const headOid = await resolveHeadOid(projectPath);
        const existing = await listLocalBranches(projectPath);

        // No commits yet — can only rename HEAD; there is nothing to fork.
        if (!headOid) {
          await writeUnbornHead(projectPath, trimmed);
          return;
        }

        if (existing.includes(trimmed)) {
          const { branch } = await resolveCurrentBranch(projectPath);
          if (branch === trimmed) return;
          await git.checkout({
            ...dirOpts(projectPath),
            ref: trimmed,
          });
          return;
        }

        // Create a real ref at the current commit, then switch — never rewrite
        // HEAD alone (that would look like the previous branch "vanished").
        try {
          await git.branch({
            ...dirOpts(projectPath),
            ref: trimmed,
            checkout: true,
          });
        } catch {
          await writeBranchRef(projectPath, trimmed, headOid);
          await git.checkout({
            ...dirOpts(projectPath),
            ref: trimmed,
          });
        }

        const after = await listLocalBranches(projectPath);
        if (!after.includes(trimmed)) {
          await writeBranchRef(projectPath, trimmed, headOid);
          await writeUnbornHead(projectPath, trimmed);
        }
      });
    },

    async checkout(projectPath, ref) {
      return withGitError(async () => {
        const headOid = await resolveHeadOid(projectPath);

        // Unborn repo: only symbolic HEAD exists.
        if (!headOid) {
          await writeUnbornHead(projectPath, ref);
          return;
        }

        const branches = await listLocalBranches(projectPath);
        if (!branches.includes(ref)) {
          throw new Error(
            `Branch "${ref}" does not exist. Create it first.`,
          );
        }

        await git.checkout({
          ...dirOpts(projectPath),
          ref,
        });
      });
    },

    async log(projectPath, limit = 50) {
      return withGitError(async () => {
        try {
          const localBranches = await listLocalBranches(projectPath);
          const { branch: currentBranch } =
            await resolveCurrentBranch(projectPath);

          const tipByBranch = new Map<string, string>();
          const oidsByBranch = new Map<string, Set<string>>();

          for (const b of localBranches) {
            try {
              const tip = await git.resolveRef({
                ...dirOpts(projectPath),
                ref: `refs/heads/${b}`,
              });
              if (typeof tip !== "string") continue;
              tipByBranch.set(b, tip);

              const branchLog = await git.log({
                ...dirOpts(projectPath),
                ref: b,
                depth: limit,
              });
              oidsByBranch.set(b, new Set(branchLog.map((c) => c.oid)));
            } catch {
              // Unborn or missing ref — skip.
            }
          }

          // Prefer current branch history; fall back to HEAD.
          const primaryRef =
            currentBranch && tipByBranch.has(currentBranch)
              ? currentBranch
              : "HEAD";

          let primary: Awaited<ReturnType<typeof git.log>>;
          try {
            primary = await git.log({
              ...dirOpts(projectPath),
              ref: primaryRef,
              depth: limit,
            });
          } catch {
            return [];
          }

          // Merge in commits that exist only on other branches so "All" works.
          const byOid = new Map<string, (typeof primary)[number]>();
          for (const c of primary) byOid.set(c.oid, c);

          for (const b of localBranches) {
            if (b === primaryRef) continue;
            try {
              const extra = await git.log({
                ...dirOpts(projectPath),
                ref: b,
                depth: limit,
              });
              for (const c of extra) {
                if (!byOid.has(c.oid)) byOid.set(c.oid, c);
              }
            } catch {
              // ignore
            }
          }

          const merged = Array.from(byOid.values()).sort(
            (a, b) => b.commit.author.timestamp - a.commit.author.timestamp,
          );

          return merged.slice(0, limit).map((c): GitCommitInfo => {
            const branches = localBranches.filter((b) =>
              oidsByBranch.get(b)?.has(c.oid),
            );
            const tips = localBranches.filter(
              (b) => tipByBranch.get(b) === c.oid,
            );
            return {
              oid: c.oid,
              message: c.commit.message,
              author: c.commit.author.name,
              email: c.commit.author.email,
              timestamp: c.commit.author.timestamp * 1000,
              branches,
              tips,
            };
          });
        } catch {
          return [];
        }
      });
    },

    async getFileDiff(projectPath, filepath, options) {
      return withGitError(async () => {
        const staged = Boolean(options?.staged);
        let status: GitFileStatus = options?.status ?? "modified";
        const abs = `${projectPath.replace(/\/$/, "")}/${filepath}`;

        // Discover status from matrix when not provided
        try {
          const matrix = (await git.statusMatrix({
            ...dirOpts(projectPath),
            filepaths: [filepath],
          })) as StatusMatrixRow[];
          const row = matrix.find((r) => r[0] === filepath);
          if (row) {
            const mapped = mapStatusMatrixRow(row);
            const match =
              mapped.find((c) => c.staged === staged) ?? mapped[0];
            if (match) status = match.status;
          }
        } catch {
          // keep default
        }

        const headText = await readRefFile(projectPath, "HEAD", filepath);
        const indexText = await readIndexFile(projectPath, filepath);
        const workText = await readWorkdirFile(projectPath, filepath);

        let oldText = "";
        let newText = "";

        if (staged) {
          // staged: HEAD → index
          oldText = headText ?? "";
          newText = indexText ?? workText ?? "";
          if (status === "deleted") {
            newText = "";
            oldText = headText ?? indexText ?? "";
          }
        } else if (status === "untracked" || status === "added") {
          oldText = "";
          newText = workText ?? indexText ?? "";
        } else if (status === "deleted") {
          oldText = indexText ?? headText ?? "";
          newText = "";
        } else {
          // unstaged modified: index (or HEAD) → workdir
          oldText = indexText ?? headText ?? "";
          newText = workText ?? "";
        }

        return buildFileDiff({
          path: filepath,
          absolutePath: abs,
          staged,
          status,
          oldText,
          newText,
        });
      });
    },

    async resolveConflict(projectPath, filepath, side) {
      return withGitError(async () => {
        const abs = `${projectPath.replace(/\/$/, "")}/${filepath}`;
        if (side === "ours") {
          // Reset working tree + index entry from HEAD
          await git.checkout({
            ...dirOpts(projectPath),
            force: true,
            filepaths: [filepath],
          });
        } else {
          let oid: string | null = null;
          try {
            oid = await git.resolveRef({
              ...dirOpts(projectPath),
              ref: "MERGE_HEAD",
            });
          } catch {
            try {
              oid = await git.resolveRef({
                ...dirOpts(projectPath),
                ref: "REBASE_HEAD",
              });
            } catch {
              oid = null;
            }
          }
          if (!oid) {
            throw new Error(
              "No MERGE_HEAD — cannot take theirs outside an active merge.",
            );
          }
          const { blob } = await git.readBlob({
            ...dirOpts(projectPath),
            oid,
            filepath,
          });
          const text = decodeBlob(blob);
          await fs().promises.writeFile(abs, text, { encoding: "utf8" });
        }
        await git.add({
          ...dirOpts(projectPath),
          filepath,
        });
      });
    },
  };

  return ops;
}

async function readWorkdirFile(
  projectPath: string,
  filepath: string,
): Promise<string | null> {
  try {
    const data = await fs().promises.readFile(
      `${projectPath.replace(/\/$/, "")}/${filepath}`,
      { encoding: "utf8" },
    );
    return typeof data === "string" ? data : decodeBlob(data);
  } catch {
    return null;
  }
}

async function readRefFile(
  projectPath: string,
  ref: string,
  filepath: string,
): Promise<string | null> {
  try {
    const { blob } = await git.readBlob({
      ...dirOpts(projectPath),
      oid: ref,
      filepath,
    });
    return decodeBlob(blob);
  } catch {
    return null;
  }
}

async function readIndexFile(
  projectPath: string,
  filepath: string,
): Promise<string | null> {
  try {
    // isomorphic-git: read from current index via resolve against ':' path is not
    // universal — walk STAGE by reading the blob oid from statusMatrix / TREE.
    // Prefer WORKDIR when file is newly staged from disk before first commit.
    const oid = await git.resolveRef({
      ...dirOpts(projectPath),
      ref: "HEAD",
    }).catch(() => null);

    // Read staged blob via `git.readBlob` with oid from index entry
    const matrix = (await git.statusMatrix({
      ...dirOpts(projectPath),
      filepaths: [filepath],
    })) as StatusMatrixRow[];
    const row = matrix.find((r) => r[0] === filepath);
    if (!row) {
      return oid ? readRefFile(projectPath, "HEAD", filepath) : null;
    }
    const [, head, workdir, stage] = row;

    // Staged-new (0,2,2) or similar — content is in workdir / index
    if (head === 0 && stage === 2) {
      return readWorkdirFile(projectPath, filepath);
    }
    // Staged delete
    if (workdir === 0 && stage === 0 && head === 1) {
      return readRefFile(projectPath, "HEAD", filepath);
    }
    // Staged modify — index holds new content; isomorphic doesn't expose index
    // blob by path easily after add. After `git.add`, workdir === index content.
    if (stage === 2 || stage === 3) {
      const work = await readWorkdirFile(projectPath, filepath);
      if (work != null) return work;
    }
    if (head === 1) {
      return readRefFile(projectPath, "HEAD", filepath);
    }
    return readWorkdirFile(projectPath, filepath);
  } catch {
    return readWorkdirFile(projectPath, filepath);
  }
}

let singleton: GitOperations | null = null;

export function getGitOperations(): GitOperations {
  if (!singleton) singleton = createGitOperations();
  return singleton;
}
