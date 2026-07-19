import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setCookiesManagerOpen } from "@/store/slices/uiSlice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CookiesManager } from "@/components/cookies/CookiesManager";

export function CookiesManagerDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((s) => s.ui.cookiesManagerOpen);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => dispatch(setCookiesManagerOpen(next))}
    >
      <DialogContent className="flex h-[min(88vh,900px)] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Cookies</DialogTitle>
          <DialogDescription>
            Manage cookies stored from HTTP responses and manual entries.
          </DialogDescription>
        </DialogHeader>
        <CookiesManager />
      </DialogContent>
    </Dialog>
  );
}
