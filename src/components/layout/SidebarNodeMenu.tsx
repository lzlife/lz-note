import type { ComponentType } from 'react';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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

function MenuEntries({ menuItems, asDropdown = false }: { menuItems: MenuEntry[]; asDropdown?: boolean }) {
  return (
    <>
      {menuItems.map((item) => {
        if ('type' in item) {
          return asDropdown
            ? <DropdownMenuSeparator key={item.key} />
            : <ContextMenuSeparator key={item.key} />;
        }
        const Icon = item.icon;
        const variant = item.destructive ? 'destructive' : 'default';
        const content = (
          <>
            <Icon className="mr-2 w-4 h-4" /> {item.label}
          </>
        );
        return asDropdown
          ? <DropdownMenuItem key={item.key} onClick={item.onClick} variant={variant}>{content}</DropdownMenuItem>
          : <ContextMenuItem key={item.key} onClick={item.onClick} variant={variant}>{content}</ContextMenuItem>;
      })}
    </>
  );
}

export function SidebarNodeMenu({ menuItems }: SidebarNodeMenuProps) {
  return (
    <ContextMenuContent className="w-[212px]">
      <MenuEntries menuItems={menuItems} />
    </ContextMenuContent>
  );
}

export function SidebarNodeDropdownMenu({ menuItems }: SidebarNodeMenuProps) {
  return (
    <DropdownMenuContent align="end" className="w-[212px]">
      <MenuEntries menuItems={menuItems} asDropdown />
    </DropdownMenuContent>
  );
}
