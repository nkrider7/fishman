import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useCallback, useEffect, useRef, type MouseEvent, type MutableRefObject } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Play,
  Radio,
  Star,
  Trash2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import {
  createFolder,
  deleteFolder,
  deleteRequestFromDb,
  duplicateRequestInDb,
  reorderFolder,
  reorderRequest,
  renameFolder,
  renameRequest,
  saveRequestToDb,
  setSearchQuery,
  setSelectedFolder,
} from "@/store/slices/collectionsSlice";
import { openRequestTab } from "@/store/thunks/openRequestTab";
import { openCollectionRunner } from "@/store/thunks/runnerThunks";
import { openCollectionSettings } from "@/store/thunks/collectionSettingsThunks";
import type { CollectionFolder, SavedRequest } from "@/types/collection";
import { buildFolderChain, resolveNearestPresets } from "@/collections/inheritance";
import { AutoDetectApisCta } from "@/components/collections/AutoDetectApisCta";
import { CollectionHeader } from "@/components/collections/CollectionHeader";
import { CollectionSearchResults } from "@/components/collections/CollectionSearchResults";
import { ImportDialog } from "@/components/import-export/ImportDialog";
import { ExportDialog } from "@/components/import-export/ExportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { createEmptyRequest, createWebSocketRequest } from "@/types/request";
import { getMethodClass } from "@/utils/requestBuilder";
import { matchesMethodSearch, parseMethodSearch } from "@/http-methods";
import { cn } from "@/utils/cn";
import { findRootCollectionId } from "@/utils/collectionUtils";

type DragItem = { type: "folder" | "request"; id: string };
type TreeContextTarget =
  | { kind: "folder"; folder: CollectionFolder }
  | { kind: "request"; request: SavedRequest };
type DropData =
  | { type: "root"; id: null }
  | { type: "nest"; folderId: string }
  | {
      type: "reorder";
      itemType: "folder" | "request";
      id: string;
      parentId: string | null;
    };

const bySortOrder = <T extends { sort_order: number; created_at: number }>(
  a: T,
  b: T,
) => a.sort_order - b.sort_order || a.created_at - b.created_at;

const treeCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (collisions.length === 0) return collisions;

  const nestHit = collisions.find((c) =>
    String(c.id).startsWith("drop:nest:folder:"),
  );
  if (nestHit) return [nestHit];

  const reorderHit = collisions.find((c) =>
    String(c.id).startsWith("drop:reorder:"),
  );
  if (reorderHit) return [reorderHit];

  return collisions;
};

const TREE_INDENT = 16;

/** Vertical guide lines showing tree depth (Postman-style) */
function TreeIndent({ guides }: { guides: boolean[] }) {
  if (guides.length === 0) return null;

  return (
    <div className="flex shrink-0 self-stretch" aria-hidden>
      {guides.map((showLine, index) => (
        <span
          key={index}
          className="relative shrink-0"
          style={{ width: TREE_INDENT }}
        >
          {showLine && (
            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/60" />
          )}
        </span>
      ))}
    </div>
  );
}

function DraggableTreeItem({
  id,
  type,
  guides,
  children,
  className,
}: {
  id: string;
  type: "folder" | "request";
  guides: boolean[];
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: `${type}:${id}`, data: { type, id } });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group flex min-h-[28px] items-center gap-1", className)}
    >
      <TreeIndent guides={guides} />
      <button
        type="button"
        className="cursor-grab shrink-0 opacity-0 group-hover:opacity-60 active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </button>
      {children}
    </div>
  );
}

/** Drop on folder icon/name to move items inside the folder */
function DroppableFolderNest({
  folderId,
  children,
  className,
}: {
  folderId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { active, setNodeRef, isOver } = useDroppable({
    id: `drop:nest:folder:${folderId}`,
    data: { type: "nest", folderId } satisfies DropData,
  });

  const activeId = String(active?.id ?? "");
  const isDragOver =
    isOver &&
    active != null &&
    (activeId.startsWith("folder:") || activeId.startsWith("request:")) &&
    activeId !== `folder:${folderId}`;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isDragOver && "rounded bg-primary/15 ring-1 ring-inset ring-primary/40",
      )}
    >
      {children}
    </div>
  );
}

/** Drop target for reordering on a tree row */
function DroppableTreeRow({
  itemType,
  id,
  parentId,
  children,
  className,
}: {
  itemType: "folder" | "request";
  id: string;
  parentId: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const { active, setNodeRef, isOver } = useDroppable({
    id: `drop:reorder:${itemType}:${id}`,
    data: { type: "reorder", itemType, id, parentId } satisfies DropData,
  });

  const isDragOver =
    isOver && active?.id !== `${itemType}:${id}` && active != null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        className,
        isDragOver && "bg-primary/10 ring-1 ring-inset ring-primary/30",
      )}
    >
      {children}
    </div>
  );
}

function TreeScrollRoot({
  children,
  isDragging,
  onFileDrop,
}: {
  children: React.ReactNode;
  isDragging: boolean;
  onFileDrop?: (file: File) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "drop:root",
    data: { type: "root", id: null },
  });

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onFileDrop) return;
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) onFileDrop(file);
    },
    [onFileDrop],
  );

  return (
    <div
      ref={setNodeRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto pb-2 pt-1 pr-1",
        isDragging && "rounded-md border border-dashed border-transparent",
        isOver && "border-primary/40 bg-primary/5",
      )}
    >
      {isDragging && (
        <p className="mb-2 px-1 text-[10px] text-muted-foreground">
          Drop on a folder name to move inside · on a row edge to reorder · empty
          space for root
        </p>
      )}
      {children}
    </div>
  );
}

export function CollectionTree() {
  const dispatch = useAppDispatch();
  const folders = useAppSelector((s) => s.collections.folders);
  const requests = useAppSelector((s) => s.collections.requests);
  const selectedFolderId = useAppSelector((s) => s.collections.selectedFolderId);
  const searchQuery = useAppSelector((s) => s.collections.searchQuery);
  const activeRequestId = useAppSelector((s) => {
    const tab = s.tabs.tabs.find((t) => t.id === s.tabs.activeTabId);
    return tab?.requestId ?? null;
  });
  const treeCollapseKey = useAppSelector((s) => s.collections.treeCollapseKey);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  useEffect(() => {
    if (treeCollapseKey === 0) return;
    setExpanded(
      Object.fromEntries(foldersRef.current.map((f) => [f.id, false])),
    );
  }, [treeCollapseKey]);
  const [renaming, setRenaming] = useState<{
    type: "folder" | "request";
    id: string;
  } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeDrag, setActiveDrag] = useState<DragItem | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCollectionId, setExportCollectionId] = useState<string | null>(
    null,
  );
  const [droppedImport, setDroppedImport] = useState<{
    content: string;
    filename?: string;
  } | null>(null);
  const menuApiRef = useRef<TreeContextMenuApi | null>(null);

  const openTreeContextMenu = useCallback(
    (event: MouseEvent, target: TreeContextTarget) => {
      event.preventDefault();
      event.stopPropagation();
      menuApiRef.current?.open(event.clientX, event.clientY, target);
    },
    [],
  );

  const selectedCollectionId = useMemo(() => {
    if (!selectedFolderId) return null;
    return findRootCollectionId(selectedFolderId, folders);
  }, [selectedFolderId, folders]);

  const handleFileDrop = useCallback(async (file: File) => {
    const content = await file.text();
    setDroppedImport({ content, filename: file.name });
    setImportOpen(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const rootFolders = useMemo(() => {
    let roots = folders
      .filter((f) => !f.parent_id)
      .sort(bySortOrder);
    if (searchQuery.trim()) {
      const { textQuery } = parseMethodSearch(searchQuery);
      const matchingFolderIds = new Set(
        folders
          .filter(
            (f) => textQuery && f.name.toLowerCase().includes(textQuery),
          )
          .map((f) => f.id),
      );
      const matchingRequestFolderIds = new Set(
        requests
          .filter((r) => matchesMethodSearch(r.method, r.name, r.url, searchQuery))
          .map((r) => r.collection_id)
          .filter(Boolean) as string[],
      );
      const includeIds = new Set([
        ...matchingFolderIds,
        ...matchingRequestFolderIds,
      ]);
      const ancestorIds = new Set<string>();
      for (const id of includeIds) {
        let current = folders.find((f) => f.id === id);
        while (current) {
          ancestorIds.add(current.id);
          current = folders.find((f) => f.id === current?.parent_id);
        }
      }
      roots = roots.filter(
        (f) =>
          (textQuery && f.name.toLowerCase().includes(textQuery)) ||
          ancestorIds.has(f.id) ||
          requests.some(
            (r) =>
              r.collection_id === f.id &&
              matchesMethodSearch(r.method, r.name, r.url, searchQuery),
          ),
      );
    }
    return roots;
  }, [folders, requests, searchQuery]);

  // O(n) indexes — renderFolder used to filter+sort the full arrays per node
  // (O(folders × (folders+requests))), which froze the UI on every right-click
  // when context-menu state lived in this parent.
  const childFoldersByParentId = useMemo(() => {
    const map = new Map<string | null, CollectionFolder[]>();
    for (const folder of folders) {
      const key = folder.parent_id;
      const list = map.get(key);
      if (list) list.push(folder);
      else map.set(key, [folder]);
    }
    for (const list of map.values()) list.sort(bySortOrder);
    return map;
  }, [folders]);

  const childRequestsByCollectionId = useMemo(() => {
    const map = new Map<string | null, SavedRequest[]>();
    const querying = Boolean(searchQuery.trim());
    for (const request of requests) {
      if (
        querying &&
        !matchesMethodSearch(
          request.method,
          request.name,
          request.url,
          searchQuery,
        )
      ) {
        continue;
      }
      const key = request.collection_id;
      const list = map.get(key);
      if (list) list.push(request);
      else map.set(key, [request]);
    }
    for (const list of map.values()) list.sort(bySortOrder);
    return map;
  }, [requests, searchQuery]);

  const openSavedRequest = (request: SavedRequest) => {
    dispatch(openRequestTab({ savedRequest: request }));
  };

  const isFolderExpanded = useCallback(
    (id: string) => expanded[id] ?? false,
    [expanded],
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !isFolderExpanded(id) }));
  };

  const selectFolder = (folderId: string) => {
    dispatch(setSelectedFolder(folderId));
    if (!isFolderExpanded(folderId)) {
      setExpanded((prev) => ({ ...prev, [folderId]: true }));
    }
    void dispatch(openCollectionSettings(folderId));
  };

  const handleNewFolder = (parentId?: string | null) => {
    dispatch(createFolder({ name: "New Folder", parentId }));
    if (parentId) setExpanded((prev) => ({ ...prev, [parentId]: true }));
  };

  const handleNewRequest = async (collectionId?: string | null) => {
    const draft = createEmptyRequest("New Request");
    if (collectionId) {
      draft.collectionId = collectionId;
      setExpanded((prev) => ({ ...prev, [collectionId]: true }));

      const chain = buildFolderChain(collectionId, folders);
      const presets = resolveNearestPresets(chain);
      if (presets.defaultMethod) draft.method = presets.defaultMethod;
      if (presets.baseUrl) draft.url = presets.baseUrl;
      if (presets.hasAuth) draft.auth = { type: "inherit" };
    }
    dispatch(setSelectedFolder(collectionId ?? null));

    try {
      const saved = await dispatch(
        saveRequestToDb({ request: draft, collectionId }),
      ).unwrap();
      await dispatch(
        openRequestTab({ savedRequest: saved, forceNew: true }),
      );
    } catch (error) {
      console.error("[fishman] failed to create request", error);
      dispatch(openRequestTab({ request: draft, forceNew: true }));
    }
  };

  const handleNewWebSocketRequest = async (collectionId?: string | null) => {
    const draft = createWebSocketRequest("New WebSocket");
    if (collectionId) {
      draft.collectionId = collectionId;
      setExpanded((prev) => ({ ...prev, [collectionId]: true }));
      if (resolveNearestPresets(buildFolderChain(collectionId, folders)).hasAuth) {
        draft.auth = { type: "inherit" };
      }
    }
    dispatch(setSelectedFolder(collectionId ?? null));

    try {
      const saved = await dispatch(
        saveRequestToDb({ request: draft, collectionId }),
      ).unwrap();
      await dispatch(
        openRequestTab({ savedRequest: saved, forceNew: true }),
      );
    } catch (error) {
      console.error("[fishman] failed to create WebSocket request", error);
      dispatch(openRequestTab({ request: draft, forceNew: true }));
    }
  };

  const startRename = (
    type: "folder" | "request",
    id: string,
    name: string,
  ) => {
    setRenaming({ type, id });
    setRenameValue(name);
  };

  const commitRename = () => {
    if (!renaming || !renameValue.trim()) {
      setRenaming(null);
      return;
    }
    if (renaming.type === "folder") {
      dispatch(renameFolder({ id: renaming.id, name: renameValue.trim() }));
    } else {
      dispatch(renameRequest({ id: renaming.id, name: renameValue.trim() }));
    }
    setRenaming(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DragItem | undefined;
    if (data) setActiveDrag(data);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current as DragItem | undefined;
    const dropData = over.data.current as DropData | undefined;
    if (!dragData || !dropData) return;

    if (dropData.type === "root") {
      if (dragData.type === "folder") {
        dispatch(reorderFolder({ id: dragData.id, parentId: null, beforeId: null }));
      } else {
        dispatch(
          reorderRequest({ id: dragData.id, collectionId: null, beforeId: null }),
        );
      }
      return;
    }

    if (dropData.type === "nest") {
      if (dragData.id === dropData.folderId) return;

      if (dragData.type === "folder") {
        dispatch(
          reorderFolder({
            id: dragData.id,
            parentId: dropData.folderId,
            beforeId: null,
          }),
        );
      } else {
        dispatch(
          reorderRequest({
            id: dragData.id,
            collectionId: dropData.folderId,
            beforeId: null,
          }),
        );
      }
      setExpanded((prev) => ({ ...prev, [dropData.folderId]: true }));
      return;
    }

    if (dropData.type !== "reorder") return;
    if (dragData.id === dropData.id) return;

    if (dragData.type === "folder" && dropData.itemType === "folder") {
      const target = folders.find((f) => f.id === dropData.id);
      if (!target) return;

      dispatch(
        reorderFolder({
          id: dragData.id,
          parentId: target.parent_id,
          beforeId: dropData.id,
        }),
      );
      return;
    }

    if (dragData.type === "folder" && dropData.itemType === "request") {
      const targetRequest = requests.find((r) => r.id === dropData.id);
      dispatch(
        reorderFolder({
          id: dragData.id,
          parentId: targetRequest?.collection_id ?? null,
          beforeId: null,
        }),
      );
      if (targetRequest?.collection_id) {
        setExpanded((prev) => ({
          ...prev,
          [targetRequest.collection_id!]: true,
        }));
      }
      return;
    }

    if (dragData.type === "request" && dropData.itemType === "folder") {
      dispatch(
        reorderRequest({
          id: dragData.id,
          collectionId: dropData.id,
          beforeId: null,
        }),
      );
      setExpanded((prev) => ({ ...prev, [dropData.id]: true }));
      return;
    }

    if (dragData.type === "request" && dropData.itemType === "request") {
      const targetRequest = requests.find((r) => r.id === dropData.id);
      if (!targetRequest) return;
      dispatch(
        reorderRequest({
          id: dragData.id,
          collectionId: targetRequest.collection_id,
          beforeId: dropData.id,
        }),
      );
      if (targetRequest.collection_id) {
        setExpanded((prev) => ({
          ...prev,
          [targetRequest.collection_id!]: true,
        }));
      }
    }
  };

  const renderFolder = (folder: CollectionFolder, guides: boolean[] = []) => {
    const childFolders = childFoldersByParentId.get(folder.id) ?? [];
    const childRequests = childRequestsByCollectionId.get(folder.id) ?? [];
    const isExpanded = isFolderExpanded(folder.id);
    const isRenaming =
      renaming?.type === "folder" && renaming.id === folder.id;
    const childEntries = [
      ...childFolders.map((item) => ({ type: "folder" as const, item })),
      ...childRequests.map((item) => ({ type: "request" as const, item })),
    ];

    return (
      <div key={folder.id}>
        <DroppableTreeRow
          itemType="folder"
          id={folder.id}
          parentId={folder.parent_id}
        >
          <DraggableTreeItem
            id={folder.id}
            type="folder"
            guides={guides}
            className={cn(
              "rounded-none py-0.5 pr-1 text-sm",
              selectedFolderId === folder.id && "bg-accent",
            )}
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-1"
              onContextMenu={(e) =>
                openTreeContextMenu(e, { kind: "folder", folder })
              }
            >
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-accent/80"
                aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(folder.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {isRenaming ? (
                <Input
                  className="h-6 flex-1"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <DroppableFolderNest
                  folderId={folder.id}
                  className="min-w-0 flex-1"
                >
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-center gap-1 rounded px-0.5 text-left hover:bg-accent/80"
                    onClick={() => selectFolder(folder.id)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      startRename("folder", folder.id, folder.name);
                    }}
                  >
                    {isExpanded ? (
                      <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                    ) : (
                      <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span className="truncate">{folder.name}</span>
                  </button>
                </DroppableFolderNest>
              )}
            </div>
          </DraggableTreeItem>
        </DroppableTreeRow>

        {isExpanded &&
          childEntries.map((entry, index) => {
            const childGuides = [...guides, index < childEntries.length - 1];
            if (entry.type === "folder") {
              return renderFolder(entry.item, childGuides);
            }
            return renderRequest(entry.item, childGuides);
          })}
      </div>
    );
  };

  const renderRequest = (request: SavedRequest, guides: boolean[] = []) => {
    const isRenaming =
      renaming?.type === "request" && renaming.id === request.id;

    return (
      <DroppableTreeRow
        key={request.id}
        itemType="request"
        id={request.id}
        parentId={request.collection_id}
      >
        <DraggableTreeItem
          id={request.id}
          type="request"
          guides={guides}
          className={cn(
            "rounded-none py-0.5 pr-1 text-sm",
            activeRequestId === request.id && "bg-accent",
          )}
        >
          {isRenaming ? (
            <Input
              className="h-6 flex-1"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 text-left hover:bg-accent/80"
              onClick={() => openSavedRequest(request)}
              onContextMenu={(e) =>
                openTreeContextMenu(e, { kind: "request", request })
              }
              onDoubleClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startRename("request", request.id, request.name);
              }}
            >
              <span className="w-4 shrink-0" aria-hidden />
              <span
                className={cn(
                  "shrink-0 font-semibold text-xs pt-0.5",
                  request.protocol === "websocket"
                    ? "text-violet-600 dark:text-violet-400"
                    : getMethodClass(request.method),
                )}
              >
                {request.protocol === "websocket" ? "WS" : request.method}
              </span>
              <span className="truncate">{request.name}</span>
              {request.is_favorite === 1 && (
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </button>
          )}
        </DraggableTreeItem>
      </DroppableTreeRow>
    );
  };

  const rootRequests = useMemo(
    () => childRequestsByCollectionId.get(null) ?? [],
    [childRequestsByCollectionId],
  );

  const rootEntries = useMemo(
    () => [
      ...rootFolders.map((item) => ({ type: "folder" as const, item })),
      ...rootRequests.map((item) => ({ type: "request" as const, item })),
    ],
    [rootFolders, rootRequests],
  );

  const dragOverlayLabel = useMemo(() => {
    if (!activeDrag) return null;
    if (activeDrag.type === "folder") {
      return folders.find((f) => f.id === activeDrag.id)?.name;
    }
    return requests.find((r) => r.id === activeDrag.id)?.name;
  }, [activeDrag, folders, requests]);

  return (
    <div className="flex h-full flex-col">
      <CollectionHeader
        searchQuery={searchQuery}
        onSearchChange={(q) => dispatch(setSearchQuery(q))}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch((s) => !s)}
        selectedCollectionId={selectedCollectionId}
      />

      {searchQuery.trim() || requests.length > 200 ? (
        <CollectionSearchResults query={searchQuery.trim() ? searchQuery : ""} />
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={treeCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <TreeScrollRoot isDragging={!!activeDrag} onFileDrop={handleFileDrop}>
          {rootEntries.map((entry) =>
            entry.type === "folder"
              ? renderFolder(entry.item)
              : renderRequest(entry.item),
          )}
          {rootEntries.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No collections yet. Click + to create, or open a Git project.
            </p>
          )}
        </TreeScrollRoot>

        <DragOverlay>
          {activeDrag && (
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-sm shadow-lg">
              {activeDrag.type === "folder" && (
                <Folder className="h-4 w-4 text-teal-500" />
              )}
              {dragOverlayLabel}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      )}

      <AutoDetectApisCta />

      <ImportDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setDroppedImport(null);
        }}
        initialContent={droppedImport?.content}
        initialFilename={droppedImport?.filename}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        collectionId={exportCollectionId ?? selectedCollectionId}
      />

      <TreeContextMenu
        apiRef={menuApiRef}
        folders={folders}
        onSelectFolder={selectFolder}
        onNewRequest={handleNewRequest}
        onNewWebSocketRequest={handleNewWebSocketRequest}
        onNewFolder={handleNewFolder}
        onStartRename={startRename}
        onOpenRequest={openSavedRequest}
        onExportCollection={(rootId) => {
          setExportCollectionId(rootId);
          setExportOpen(true);
        }}
      />
    </div>
  );
}

type TreeContextMenuApi = {
  open: (x: number, y: number, target: TreeContextTarget) => void;
};

function TreeContextMenu({
  apiRef,
  folders,
  onSelectFolder,
  onNewRequest,
  onNewWebSocketRequest,
  onNewFolder,
  onStartRename,
  onOpenRequest,
  onExportCollection,
}: {
  apiRef: MutableRefObject<TreeContextMenuApi | null>;
  folders: CollectionFolder[];
  onSelectFolder: (folderId: string) => void;
  onNewRequest: (collectionId?: string | null) => void;
  onNewWebSocketRequest: (collectionId?: string | null) => void;
  onNewFolder: (parentId?: string | null) => void;
  onStartRename: (
    type: "folder" | "request",
    id: string,
    name: string,
  ) => void;
  onOpenRequest: (request: SavedRequest) => void;
  onExportCollection: (rootId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [treeMenu, setTreeMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    target: TreeContextTarget | null;
  }>({ open: false, x: 0, y: 0, target: null });

  useEffect(() => {
    apiRef.current = {
      open: (x, y, target) => setTreeMenu({ open: true, x, y, target }),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  const folderMenuTarget =
    treeMenu.target?.kind === "folder" ? treeMenu.target.folder : null;
  const requestMenuTarget =
    treeMenu.target?.kind === "request" ? treeMenu.target.request : null;
  const folderMenuRootId = folderMenuTarget
    ? findRootCollectionId(folderMenuTarget.id, folders)
    : null;

  return (
      <DropdownMenu
        open={treeMenu.open}
        onOpenChange={(open) =>
          setTreeMenu((prev) => ({
            ...prev,
            open,
            target: open ? prev.target : null,
          }))
        }
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden
            className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
            style={{ left: treeMenu.x, top: treeMenu.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {folderMenuTarget ? (
            <>
              <DropdownMenuItem
                onClick={() => onSelectFolder(folderMenuTarget.id)}
              >
                <FolderOpen className="text-muted-foreground" />
                Open
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onNewRequest(folderMenuTarget.id)}
              >
                <FilePlus2 className="text-muted-foreground" />
                Add request
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNewWebSocketRequest(folderMenuTarget.id)}
              >
                <Radio className="text-violet-500" />
                Add WebSocket
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onNewFolder(folderMenuTarget.id)}
              >
                <FolderPlus className="text-muted-foreground" />
                Add folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  const rootIdForRun =
                    findRootCollectionId(folderMenuTarget.id, folders) ??
                    folderMenuTarget.id;
                  void dispatch(
                    openCollectionRunner({
                      collectionId: rootIdForRun,
                      folderId: folderMenuTarget.parent_id
                        ? folderMenuTarget.id
                        : null,
                    }),
                  );
                }}
              >
                <Play className="text-emerald-500" />
                Run collection
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onStartRename(
                    "folder",
                    folderMenuTarget.id,
                    folderMenuTarget.name,
                  )
                }
              >
                <Pencil className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
              {folderMenuRootId ? (
                <DropdownMenuItem
                  onClick={() => onExportCollection(folderMenuRootId)}
                >
                  <Download className="text-muted-foreground" />
                  Export collection
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => dispatch(deleteFolder(folderMenuTarget.id))}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </>
          ) : requestMenuTarget ? (
            <>
              <DropdownMenuItem
                onClick={() => onOpenRequest(requestMenuTarget)}
              >
                {requestMenuTarget.protocol === "websocket" ? (
                  <Radio className="text-violet-500" />
                ) : (
                  <FileText className="text-muted-foreground" />
                )}
                Open
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onStartRename(
                    "request",
                    requestMenuTarget.id,
                    requestMenuTarget.name,
                  )
                }
              >
                <Pencil className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  dispatch(duplicateRequestInDb(requestMenuTarget.id))
                }
              >
                <Copy className="text-muted-foreground" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() =>
                  dispatch(deleteRequestFromDb(requestMenuTarget.id))
                }
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
  );
}
