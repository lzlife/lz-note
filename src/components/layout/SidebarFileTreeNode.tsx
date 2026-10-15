import { useNoteStore, type FileNode } from '@/store/useNoteStore';
import {
  FolderPlus,
  FilePlus,
  Download,
  FileText,
  ChevronRight,
  ChevronDown,
  FileBox,
  Copy,
  Trash2,
  Image as ImageIcon,
  Code2,
  FileCheck,
  MoreHorizontal
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { cn, getNextIndexedName, getUniquePath } from '@/lib/utils';
import {
  switchActiveFileSafely
} from '@/lib/noteWorkspaceService';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarNodeMenu, SidebarNodeDropdownMenu, type MenuEntry } from '@/components/layout/SidebarNodeMenu';
import { useSidebarNodeActions } from '@/hooks/useSidebarNodeActions';

export function InlineCreator({ parentPath, onComplete }: { parentPath: string; onComplete: () => void }) {
  const getDefaultName = () => {
    const siblings = (window.services.readDir(parentPath) || []) as FileNode[];
    const folderNames = siblings.filter(item => item.isDirectory).map(item => item.name);
    return getNextIndexedName(folderNames, '新建文件夹');
  };

  const [name, setName] = useState(() => getDefaultName());
  const { refreshFileTree } = useNoteStore();
  const inputRef = useRef<HTMLInputElement>(null);

  // 仅在挂载时聚焦并全选默认名，方便直接改名；输入过程中不再重新全选，否则每次输入都会打断光标。
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.setSelectionRange(0, input.value.length);
    }
  }, []);

  const handleCreate = () => {
    if (!name.trim()) {
      onComplete();
      return;
    }
    try {
      const newPath = getUniquePath(parentPath, name, true);
      window.services.mkdir(newPath);
      refreshFileTree();
    } catch (err) {
      toast.error(`创建失败: ${(err as Error).message}`);
    }
    onComplete();
  };

  return (
    <div className="flex items-center gap-2 py-1 px-2 text-sm text-foreground bg-accent/50" style={{ paddingLeft: '8px' }}>
      <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
      <Input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={handleCreate}
        onKeyDown={e => {
          if (e.key === 'Enter') handleCreate();
          if (e.key === 'Escape') onComplete();
        }}
        className="h-6 py-0 px-1 text-sm bg-background"
      />
    </div>
  );
}

interface SidebarFileTreeNodeProps {
  node: FileNode;
  level?: number;
  expandedMap: Record<string, boolean>;
  setExpandedMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  forceExpand?: boolean;
}

export function SidebarFileTreeNode({
  node,
  level = 0,
  expandedMap,
  setExpandedMap,
  forceExpand = false
}: SidebarFileTreeNodeProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const isMarkdownFile = !node.isDirectory && /\.md$/i.test(node.name);
  const displayName = isMarkdownFile ? node.name.replace(/\.md$/i, '') : node.name;
  const [renameValue, setRenameValue] = useState(displayName);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const { activeFile, setActiveFile, refreshFileTree, fileContent } = useNoteStore();
  const renameInputRef = useRef<HTMLInputElement>(null);
  // 标记"进入重命名"这一次需要全选，避免输入内容变化时反复全选。
  const renameSelectPendingRef = useRef(false);
  const canCreateFolder = level < 2;
  const isOpen = forceExpand || !!expandedMap[node.path];

  useEffect(() => {
    if (!isRenaming || !renameSelectPendingRef.current) {
      return;
    }
    renameSelectPendingRef.current = false;
    const input = renameInputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    const dotIndex = input.value.lastIndexOf('.');
    const end = !node.isDirectory && dotIndex > 0 ? dotIndex : input.value.length;
    input.setSelectionRange(0, end);
  }, [isRenaming, node.isDirectory]);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(displayName);
    }
  }, [displayName, isRenaming]);

  const {
    handleNodeClick,
    handleRename,
    handleCreateFile,
    handleStartCreateFolder,
    handleConfirmDelete,
    handleDuplicate,
    handleExportByType,
    handleExportFolder,
    handleImportToFolder,
    handleDragStart,
    handleDropToFolder
  } = useSidebarNodeActions({
    node,
    isMarkdownFile,
    displayName,
    renameValue,
    setRenameValue,
    activeFile,
    fileContent,
    setActiveFile,
    refreshFileTree,
    setExpandedMap,
    setIsRenaming,
    setIsCreatingFolder,
    setIsDeleteDialogOpen,
    setIsDragOver
  });

  const folderMenuItems: MenuEntry[] = useMemo(() => [
    { key: 'create-file', label: '新建笔记', icon: FilePlus, onClick: handleCreateFile },
    ...(canCreateFolder ? [{
      key: 'create-folder',
      label: '新建文件夹',
      icon: FolderPlus,
      onClick: handleStartCreateFolder
    }] : []),
    { key: 'sep-import', type: 'separator' },
    { key: 'import', label: '导入 Markdown 文件', icon: Download, onClick: handleImportToFolder },
    { key: 'export-folder', label: '导出文件夹', icon: FileBox, onClick: handleExportFolder },
    { key: 'sep-manage', type: 'separator' },
    { key: 'rename', label: '重命名', icon: Code2, onClick: () => { renameSelectPendingRef.current = true; setIsRenaming(true); } },
    { key: 'delete-folder', label: '删除文件夹', icon: Trash2, onClick: () => setIsDeleteDialogOpen(true), destructive: true }
  ], [canCreateFolder, handleCreateFile, handleStartCreateFolder, handleImportToFolder, handleExportFolder]);

  const fileMenuItems: MenuEntry[] = useMemo(() => [
    { key: 'duplicate', label: '复制一份', icon: Copy, onClick: handleDuplicate },
    { key: 'sep-export', type: 'separator' },
    { key: 'export-md', label: '导出为Markdown', icon: FileCheck, onClick: () => void handleExportByType('markdown') },
    { key: 'export-html', label: '导出为Html', icon: Code2, onClick: () => void handleExportByType('html') },
    { key: 'export-pdf', label: '导出为PDF', icon: FileText, onClick: () => void handleExportByType('pdf') },
    { key: 'export-image', label: '导出为图片', icon: ImageIcon, onClick: () => void handleExportByType('image') },
    { key: 'sep-manage', type: 'separator' },
    { key: 'rename', label: '重命名', icon: Code2, onClick: () => { renameSelectPendingRef.current = true; setIsRenaming(true); } },
    { key: 'delete-note', label: '删除笔记', icon: Trash2, onClick: () => setIsDeleteDialogOpen(true), destructive: true }
  ], [handleDuplicate, handleExportByType]);

  return (
    <div className="flex flex-col">
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "group flex items-center gap-2 py-1 px-2 cursor-pointer hover:bg-accent/50 rounded-sm text-sm text-muted-foreground",
              node.isDirectory && isDragOver && "bg-accent/70",
              activeFile === node.path && "bg-accent text-accent-foreground font-medium"
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => {
              if (isRenaming) {
                return;
              }
              handleNodeClick();
            }}
            draggable={!node.isDirectory}
            onDragStart={handleDragStart}
            onDragOver={(event) => {
              if (!node.isDirectory) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setIsDragOver(true);
            }}
            onDragLeave={() => {
              if (node.isDirectory) {
                setIsDragOver(false);
              }
            }}
            onDrop={handleDropToFolder}
          >
            {node.isDirectory ? (
              isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 shrink-0 opacity-70" />
            )}

            {isRenaming ? (
              <Input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') {
                    setIsRenaming(false);
                    setRenameValue(displayName);
                  }
                }}
                className="h-6 py-0 px-1 text-sm bg-background"
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="truncate flex-1 min-w-0">{displayName}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100 hover:bg-accent cursor-pointer outline-none"
                    title="更多操作"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </DropdownMenuTrigger>
                  <SidebarNodeDropdownMenu menuItems={node.isDirectory ? folderMenuItems : fileMenuItems} />
                </DropdownMenu>
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <SidebarNodeMenu menuItems={node.isDirectory ? folderMenuItems : fileMenuItems} />
      </ContextMenu>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[360px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              {`确定要删除${node.isDirectory ? '文件夹' : '笔记'}“${node.name}”吗？`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {node.isDirectory && isOpen && (
        <div className="flex flex-col">
          {isCreatingFolder && (
            <div style={{ paddingLeft: `${(level + 1) * 12}px` }}>
              <InlineCreator
                parentPath={node.path}
                onComplete={() => setIsCreatingFolder(false)}
              />
            </div>
          )}
          {node.children && node.children.map((child) => (
            <SidebarFileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expandedMap={expandedMap}
              setExpandedMap={setExpandedMap}
              forceExpand={forceExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}
