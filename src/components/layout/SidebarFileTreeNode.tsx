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
  FileCheck
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
import { SidebarNodeMenu, type MenuEntry } from '@/components/layout/SidebarNodeMenu';
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

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(0, name.length);
    }
  }, [name.length]);

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
  const canCreateFolder = level < 2;
  const isOpen = forceExpand || !!expandedMap[node.path];

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      const dotIndex = renameValue.lastIndexOf('.');
      renameInputRef.current.setSelectionRange(0, !node.isDirectory && dotIndex > 0 ? dotIndex : renameValue.length);
    }
  }, [isRenaming, node.isDirectory, renameValue]);

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
    { key: 'rename', label: '重命名', icon: Code2, onClick: () => setIsRenaming(true) },
    { key: 'delete-folder', label: '删除文件夹', icon: Trash2, onClick: () => setIsDeleteDialogOpen(true), destructive: true }
  ], [canCreateFolder, handleCreateFile, handleStartCreateFolder, handleImportToFolder, handleExportFolder]);

  const fileMenuItems: MenuEntry[] = useMemo(() => [
    { key: 'duplicate', label: '复制一份', icon: Copy, onClick: handleDuplicate },
    { key: 'sep-export', type: 'separator' },
    { key: 'export-md', label: '导出为 Markdown 文件', icon: FileCheck, onClick: () => void handleExportByType('markdown') },
    { key: 'export-html', label: '导出为 Html 文件', icon: Code2, onClick: () => void handleExportByType('html') },
    { key: 'export-pdf', label: '导出为 PDF 文件', icon: FileText, onClick: () => void handleExportByType('pdf') },
    { key: 'export-image', label: '导出为图片文件', icon: ImageIcon, onClick: () => void handleExportByType('image') },
    { key: 'sep-manage', type: 'separator' },
    { key: 'rename', label: '重命名', icon: Code2, onClick: () => setIsRenaming(true) },
    { key: 'delete-note', label: '删除笔记', icon: Trash2, onClick: () => setIsDeleteDialogOpen(true), destructive: true }
  ], [handleDuplicate, handleExportByType]);

  return (
    <div className="flex flex-col">
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={cn(
              "flex items-center gap-2 py-1 px-2 cursor-pointer hover:bg-accent/50 rounded-sm text-sm text-muted-foreground",
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
              <span className="truncate">{displayName}</span>
            )}
          </div>
        </ContextMenuTrigger>
        <SidebarNodeMenu menuItems={node.isDirectory ? folderMenuItems : fileMenuItems} />
      </ContextMenu>
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => open && setIsDeleteDialogOpen(true)}>
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
