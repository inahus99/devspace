import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MenuAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
}

/**
 * Same actions available from a "…" button and from right-click.
 * `children` receives the ready-made "…" menu button so it can be placed inside the row.
 */
export function ActionMenus({
  actions,
  trigger,
  children,
  align = "start",
}: {
  actions: MenuAction[];
  /** The "…" button element. */
  trigger: ReactNode;
  /** Renders the right-clickable element; place `menuButton` inside it. */
  children: (menuButton: ReactNode) => ReactNode;
  align?: "start" | "end";
}) {
  const menuButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-52" align={align}>
        {actions.map((a) => (
          <Fragment key={a.label}>
            {a.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem onSelect={a.onSelect} disabled={a.disabled} variant={a.destructive ? "destructive" : "default"}>
              {a.icon ? <a.icon /> : null}
              {a.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children(menuButton)}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {actions.map((a) => (
          <Fragment key={a.label}>
            {a.separatorBefore ? <ContextMenuSeparator /> : null}
            <ContextMenuItem onSelect={a.onSelect} disabled={a.disabled} variant={a.destructive ? "destructive" : "default"}>
              {a.icon ? <a.icon /> : null}
              {a.label}
            </ContextMenuItem>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
