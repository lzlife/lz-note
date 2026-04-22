import type { ComponentType } from 'react';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

interface MenuActionItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
}

interface MenuSeparatorItem {
  key: string;
  type: 'separator';
}

export type MenuEntry = MenuActionItem | MenuSeparatorItem;

interface SidebarNodeMenuProps {
  menuItems: MenuEntry[];
}

export function SidebarNodeMenu({ menuItems }: SidebarNodeMenuProps) {
  return (
    <ContextMenuContent className="w-[212px]">
      {menuItems.map((item) => {
        if ('type' in item) {
          return <ContextMenuSeparator key={item.key} />;
        }
        const Icon = item.icon;
        return (
          <ContextMenuItem
            key={item.key}
            onClick={item.onClick}
            className={item.destructive ? 'text-destructive' : undefined}
          >
            <Icon className="mr-2 w-4 h-4" /> {item.label}
          </ContextMenuItem>
        );
      })}
    </ContextMenuContent>
  );
}
