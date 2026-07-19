import { useCallback } from "react";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setEnvironmentManagerOpen } from "@/store/slices/uiSlice";
import { EnvironmentManager } from "@/components/environments/EnvironmentManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EnvironmentManagerDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.environmentManagerOpen);
  const dirty = useAppSelector((s) => s.environments.dirty);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && dirty) {
        const discard = window.confirm(
          "You have unsaved environment changes. Discard them?",
        );
        if (!discard) return;
      }
      dispatch(setEnvironmentManagerOpen(next));
    },
    [dispatch, dirty],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[min(88vh,900px)] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base font-semibold">
            Manage Environments
          </DialogTitle>
          <DialogDescription className="text-xs">
            Define variables for global or collection-scoped requests. Changes
            preview live before you save.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <EnvironmentManager />
        </div>
      </DialogContent>
    </Dialog>
  );
}
