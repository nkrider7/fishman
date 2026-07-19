import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { addGitRemote } from "@/store/thunks/gitThunks";
import { normalizeRemoteUrl } from "@/git-native";

interface AddRemoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRemoteDialog({ open, onOpenChange }: AddRemoteDialogProps) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((s) => s.git.busy);
  const [name, setName] = useState("origin");
  const [url, setUrl] = useState("");

  const handleAdd = async () => {
    if (!url.trim()) return;
    const normalized = normalizeRemoteUrl(url);
    await dispatch(
      addGitRemote({ name: name.trim() || "origin", url: normalized }),
    );
    setUrl("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Remote</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="origin"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
              onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !url.trim()} onClick={() => void handleAdd()}>
            Add Remote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
