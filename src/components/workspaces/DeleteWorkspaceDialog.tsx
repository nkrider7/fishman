import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
  collectionsCount: number;
  environmentsCount: number;
  onConfirm: () => Promise<void> | void;
}

export function DeleteWorkspaceDialog({
  open,
  onOpenChange,
  workspaceName,
  collectionsCount,
  environmentsCount,
  onConfirm,
}: DeleteWorkspaceDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete workspace?</DialogTitle>
          <DialogDescription>
            Delete <span className="font-medium text-foreground">{workspaceName}</span>{" "}
            and all of its data. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-inside list-disc text-sm text-muted-foreground">
          <li>
            {collectionsCount} collection{collectionsCount === 1 ? "" : "s"}
          </li>
          <li>
            {environmentsCount} environment{environmentsCount === 1 ? "" : "s"}
          </li>
          <li>History and cookies for this workspace</li>
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
