import { create } from "zustand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolve: ((ok: boolean) => void) | null;
}

const useConfirmStore = create<ConfirmState>(() => ({ open: false, options: { title: "" }, resolve: null }));

/** Promise-based confirmation: `if (await confirm({ title: "Delete?" })) …` */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.getState().resolve?.(false);
    useConfirmStore.setState({ open: true, options, resolve });
  });
}

export function ConfirmHost() {
  const { open, options, resolve } = useConfirmStore();
  const close = (ok: boolean) => {
    resolve?.(ok);
    useConfirmStore.setState({ open: false, resolve: null });
  };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && close(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title}</AlertDialogTitle>
          {options.description ? <AlertDialogDescription>{options.description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={options.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            onClick={() => close(true)}
          >
            {options.confirmLabel ?? (options.destructive ? "Delete" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
