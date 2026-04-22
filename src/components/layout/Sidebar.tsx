import { useNoteStore, FileNode } from '@/store/useNoteStore';
import { 
  FolderPlus, 
  FilePlus, 
  Download,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  RefreshCw,
  FileBox,
  Copy,
  Trash2,
  Image as ImageIcon,
  Code2,
  FileCheck
} from 'lucide-react';
import { useState, useRef, useEffect, useMemo, type Dispatch, type SetStateAction, type DragEvent } from 'react';
import { cn, getNextIndexedName, getUniquePath } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { exportHtmlFile, exportImageFile, exportMarkdownFile, exportPdfFile } from '@/lib/exportManager';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"

function switchActiveFileSafely(
  setActiveFile: (path: string | null, content?: string) => void,
  path: string | null,
  content?: string
) {
  window.dispatchEvent(new Event('note-editor-before-switch'));
  setActiveFile(path, content);
}

function createNewFileAndStartRename(
  parentPath: string,
  setActiveFile: (path: string | null, content?: string) => void,
  refreshFileTree: () => void
) {
  try {
    const siblings = (window.services.readDir(parentPath) || []) as FileNode[];
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const fileNames = siblings
      .filter(item => !item.isDirectory)
      .map(item => item.name.replace(/\.md$/i, ''));
    const baseName = getNextIndexedName(fileNames, `新建文件 ${dateStr}`);
    const newPath = getUniquePath(parentPath, `${baseName}.md`, false);

    window.services.writeFile(newPath, '');
    switchActiveFileSafely(setActiveFile, newPath, '');
    refreshFileTree();
    window.dispatchEvent(new CustomEvent('note-editor-start-rename', { detail: { path: newPath } }));
  } catch (err) {
    toast.error(`创建失败: ${(err as Error).message}`);
  }
}

function filterFileTreeByName(nodes: FileNode[], keyword: string): FileNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return nodes;
  }
  return nodes.reduce<FileNode[]>((result, node) => {
    const selfMatched = node.name.toLowerCase().includes(normalizedKeyword);
    const filteredChildren = node.children?.length ? filterFileTreeByName(node.children, normalizedKeyword) : [];
    if (!selfMatched && filteredChildren.length === 0) {
      return result;
    }
    result.push({
      ...node,
      children: selfMatched ? node.children : filteredChildren
    });
    return result;
  }, []);
}

function importMarkdownFilesToTarget(targetPath: string): number {
  const paths = window.ztools?.showOpenDialog({
    title: '导入 Markdown 文件',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['openFile', 'multiSelections']
  });
  if (!paths || paths.length === 0) {
    return 0;
  }
  paths.forEach((sourcePath: string) => {
    const fileName = window.services.basename(sourcePath);
    const dest = getUniquePath(targetPath, fileName, false);
    window.services.copy(sourcePath, dest);
  });
  return paths.length;
}

const InlineCreator = ({ parentPath, onComplete }: { parentPath: string, onComplete: () => void }) => {
  const getDefaultName = () => {
    const siblings = (window.services.readDir(parentPath) || []) as FileNode[];
    const folderNames = siblings.filter(item => item.isDirectory).map(item => item.name);
    return getNextIndexedName(folderNames, '新建文件夹');
  };

  const [name, setName] = useState(() => {
    return getDefaultName();
  });
  const { refreshFileTree } = useNoteStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.setSelectionRange(0, name.length);
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
};

const FileTreeNode = ({
  node,
  level = 0,
  expandedMap,
  setExpandedMap,
  forceExpand = false
}: {
  node: FileNode;
  level?: number;
  expandedMap: Record<string, boolean>;
  setExpandedMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  forceExpand?: boolean;
}) => {
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
  }, [isRenaming]);

  useEffect(() => {
    if (!isRenaming) {
      setRenameValue(displayName);
    }
  }, [displayName, isRenaming]);

  const handleNodeClick = () => {
    if (isRenaming) return;
    if (node.isDirectory) {
      setExpandedMap((prev) => ({
        ...prev,
        [node.path]: !prev[node.path]
      }));
    } else {
      if (!isMarkdownFile) {
        toast.error('不支持编辑该文件，请选择 Markdown 文件');
        return;
      }
      switchActiveFileSafely(setActiveFile, node.path);
    }
  };

  const handleRename = () => {
    setIsRenaming(false);
    if (!renameValue.trim() || renameValue === displayName) {
      setRenameValue(displayName);
      return;
    }
    try {
      const dir = window.services.dirname(node.path);
      let finalName = renameValue;
      if (!node.isDirectory && isMarkdownFile && !finalName.endsWith('.md')) {
        finalName += '.md';
      }
      
      const newPath = getUniquePath(dir, finalName, node.isDirectory);

      window.services.rename(node.path, newPath);
      if (activeFile === node.path) {
        switchActiveFileSafely(setActiveFile, newPath, fileContent);
      }
      refreshFileTree();
    } catch (err) {
      toast.error(`重命名失败: ${(err as Error).message}`);
      setRenameValue(displayName);
    }
  };

  const handleCreateFile = () => {
    createNewFileAndStartRename(node.path, setActiveFile, refreshFileTree);
    setExpandedMap((prev) => ({
      ...prev,
      [node.path]: true
    }));
  };

  const handleDelete = () => {
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    try {
      if (node.isDirectory) {
        window.services.rmdir(node.path);
      } else {
        window.services.unlink(node.path);
        if (activeFile === node.path) {
          switchActiveFileSafely(setActiveFile, null);
        }
      }
      refreshFileTree();
      setIsDeleteDialogOpen(false);
    } catch (err) {
      toast.error(`删除失败: ${(err as Error).message}`);
    }
  };

  const handleDuplicate = () => {
    try {
      const dir = window.services.dirname(node.path);
      const ext = window.services.extname(node.path);
      const base = window.services.basename(node.path).replace(ext, '');
      let newPath = window.services.joinPath(dir, `${base} 副本${ext}`);
      let counter = 1;
      while(window.services.exists(newPath)) {
        newPath = window.services.joinPath(dir, `${base} 副本 ${counter}${ext}`);
        counter++;
      }
      const content = window.services.readFile(node.path);
      window.services.writeFile(newPath, content);
      refreshFileTree();
    } catch (err) {
      toast.error(`复制失败: ${(err as Error).message}`);
    }
  };

  const handleExportMarkdown = async () => {
    try {
      const savePath = await exportMarkdownFile(node.path, node.name)
      if (savePath) {
        toast.success(`导出 Markdown 成功：${savePath}`)
      }
    } catch (err) {
      toast.error(`导出失败: ${(err as Error).message}`);
    }
  };
  
  const handleExportHtml = async () => {
    try {
      const savePath = await exportHtmlFile(node.path, node.name);
      if (savePath) {
        toast.success(`导出 HTML 成功：${savePath}`);
      }
    } catch (err) {
      toast.error(`导出失败: ${(err as Error).message}`);
    }
  };

  const handleExportFolder = () => {
    const paths = window.ztools?.showOpenDialog({
      title: '选择导出位置',
      properties: ['openDirectory']
    });
    if (paths && paths.length > 0) {
      try {
        const dest = window.services.joinPath(paths[0], node.name);
        window.services.copy(node.path, dest);
        toast.success('导出文件夹成功');
      } catch (err) {
        toast.error(`导出失败: ${(err as Error).message}`);
      }
    }
  };

  const handleExportPDF = async () => {
    try {
      const outputPath = await exportPdfFile(node.path, node.name);
      if (outputPath) toast.success(`导出 PDF 成功：${outputPath}`);
    } catch (err) {
      toast.error(`导出 PDF 失败: ${(err as Error).message}`);
    }
  };

  const handleExportImage = async () => {
    try {
      const outputPath = await exportImageFile(node.path, node.name);
      if (outputPath) toast.success(`导出图片成功：${outputPath}`);
    } catch (err) {
      toast.error(`导出图片失败: ${(err as Error).message}`);
    }
  };

  const handleImportToFolder = () => {
    try {
      const importedCount = importMarkdownFilesToTarget(node.path);
      if (importedCount > 0) {
        refreshFileTree();
        toast.success(`成功导入 ${importedCount} 个文件`);
      }
    } catch (err) {
      toast.error(`导入失败: ${(err as Error).message}`);
    }
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    if (node.isDirectory) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.path);
  };

  const handleDropToFolder = (event: DragEvent<HTMLDivElement>) => {
    if (!node.isDirectory) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const sourcePath = event.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === node.path) {
      return;
    }

    try {
      const sourceName = window.services.basename(sourcePath);
      const destinationPath = getUniquePath(node.path, sourceName, false);
      if (destinationPath === sourcePath) {
        return;
      }
      window.services.rename(sourcePath, destinationPath);
      if (activeFile === sourcePath) {
        switchActiveFileSafely(setActiveFile, destinationPath, fileContent);
      }
      refreshFileTree();
      setExpandedMap((prev) => ({
        ...prev,
        [node.path]: true
      }));
      toast.success('文件已移动');
    } catch (err) {
      toast.error(`移动失败: ${(err as Error).message}`);
    }
  };

  const FolderMenu = (
    <ContextMenuContent className="w-[212px]">
      <ContextMenuItem onClick={handleCreateFile}>
        <FilePlus className="mr-2 w-4 h-4" /> 新建笔记
      </ContextMenuItem>
      {canCreateFolder && (
        <ContextMenuItem onClick={() => {
          setExpandedMap((prev) => ({
            ...prev,
            [node.path]: true
          }));
          setIsCreatingFolder(true);
        }}>
          <FolderPlus className="mr-2 w-4 h-4" /> 新建文件夹
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleImportToFolder}>
        <Download className="mr-2 w-4 h-4" /> 导入 Markdown 文件
      </ContextMenuItem>
      <ContextMenuItem onClick={handleExportFolder}>
        <FileBox className="mr-2 w-4 h-4" /> 导出文件夹
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => setIsRenaming(true)}>
        <Code2 className="mr-2 w-4 h-4" /> 重命名
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} className="text-destructive">
        <Trash2 className="mr-2 w-4 h-4" /> 删除文件夹
      </ContextMenuItem>
    </ContextMenuContent>
  );

  const FileMenu = (
    <ContextMenuContent className="w-[212px]">
      <ContextMenuItem onClick={handleDuplicate}>
        <Copy className="mr-2 w-4 h-4" /> 复制一份
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleExportMarkdown}>
        <FileCheck className="mr-2 w-4 h-4" /> 导出为 Markdown 文件
      </ContextMenuItem>
      <ContextMenuItem onClick={handleExportHtml}>
        <Code2 className="mr-2 w-4 h-4" /> 导出为 Html 文件
      </ContextMenuItem>
      <ContextMenuItem onClick={handleExportPDF}>
        <FileText className="mr-2 w-4 h-4" /> 导出为 PDF 文件
      </ContextMenuItem>
      <ContextMenuItem onClick={handleExportImage}>
        <ImageIcon className="mr-2 w-4 h-4" /> 导出为图片文件
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => setIsRenaming(true)}>
        <Code2 className="mr-2 w-4 h-4" /> 重命名
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} className="text-destructive">
        <Trash2 className="mr-2 w-4 h-4" /> 删除笔记
      </ContextMenuItem>
    </ContextMenuContent>
  );

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
            onClick={handleNodeClick}
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
        {node.isDirectory ? FolderMenu : FileMenu}
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
            <FileTreeNode 
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
};

export function Sidebar() {
  const { fileTree, refreshFileTree, workspace, activeFile, setActiveFile, fileContent, isFileTreeLoading, fileTreeFilter } = useNoteStore();
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false);
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const filteredFileTree = useMemo(() => filterFileTreeByName(fileTree, fileTreeFilter), [fileTree, fileTreeFilter]);
  const isFiltering = fileTreeFilter.trim().length > 0;

  const collectDirectoryPaths = (nodes: FileNode[]): string[] => {
    return nodes.reduce<string[]>((paths, item) => {
      if (item.isDirectory) {
        paths.push(item.path);
        if (item.children?.length) {
          paths.push(...collectDirectoryPaths(item.children));
        }
      }
      return paths;
    }, []);
  };

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedMap({});
      setAllExpanded(false);
      return;
    }
    const allDirectoryPaths = collectDirectoryPaths(fileTree);
    const nextExpandedMap = allDirectoryPaths.reduce<Record<string, boolean>>((acc, path) => {
      acc[path] = true;
      return acc;
    }, {});
    setExpandedMap(nextExpandedMap);
    setAllExpanded(true);
  };

  const handleRefreshTree = () => {
    refreshFileTree();
  };

  const handleImport = () => {
    if (!workspace) return;
    try {
      const importedCount = importMarkdownFilesToTarget(workspace);
      if (importedCount > 0) {
        refreshFileTree();
        toast.success(`成功导入 ${importedCount} 个文件`);
      }
    } catch (err) {
      toast.error(`导入失败: ${(err as Error).message}`);
    }
  };

  const handleCreateRootFile = () => {
    if (!workspace) {
      return;
    }
    createNewFileAndStartRename(workspace, setActiveFile, refreshFileTree);
  };

  const handleDropToRoot = (event: DragEvent<HTMLDivElement>) => {
    if (!workspace) return;
    event.preventDefault();
    event.stopPropagation();
    setIsRootDragOver(false);
    const sourcePath = event.dataTransfer.getData('text/plain');
    if (!sourcePath) {
      return;
    }
    try {
      const sourceParent = window.services.dirname(sourcePath);
      if (sourceParent === workspace) {
        return;
      }
      const sourceName = window.services.basename(sourcePath);
      const destinationPath = getUniquePath(workspace, sourceName, false);
      window.services.rename(sourcePath, destinationPath);
      if (activeFile === sourcePath) {
        switchActiveFileSafely(setActiveFile, destinationPath, fileContent);
      }
      refreshFileTree();
      toast.success('文件已移动到根目录');
    } catch (err) {
      toast.error(`移动失败: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      <div className="flex items-center justify-between h-12 px-2 border-b border-border text-muted-foreground shrink-0">
        <div className="font-semibold text-sm px-2 text-foreground flex items-center gap-2">
          <span>资源管理器</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={handleRefreshTree} className="p-1 hover:bg-accent rounded-md transition-colors cursor-pointer" title="刷新文件树">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={toggleExpandAll} className="p-1 hover:bg-accent rounded-md transition-colors cursor-pointer" title="展开/收缩文件夹">
            <ChevronsUpDown className="w-4 h-4" />
          </button>
          <button onClick={handleImport} className="p-1 hover:bg-accent rounded-md transition-colors cursor-pointer" title="导入 Markdown 文件">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={() => setIsCreatingRootFolder(true)} className="p-1 hover:bg-accent rounded-md transition-colors cursor-pointer" title="新建文件夹">
            <FolderPlus className="w-4 h-4" />
          </button>
          <button onClick={handleCreateRootFile} className="p-1 hover:bg-accent rounded-md transition-colors cursor-pointer" title="新建文件">
            <FilePlus className="w-4 h-4" />
          </button>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0 p-2">
        <div
          className={cn("flex flex-col gap-0.5 rounded-sm", isRootDragOver && "bg-accent/40")}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setIsRootDragOver(true);
          }}
          onDragLeave={() => setIsRootDragOver(false)}
          onDrop={handleDropToRoot}
        >
          {isCreatingRootFolder && workspace && (
            <InlineCreator 
              parentPath={workspace} 
              onComplete={() => setIsCreatingRootFolder(false)} 
            />
          )}
          {filteredFileTree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              expandedMap={expandedMap}
              setExpandedMap={setExpandedMap}
              forceExpand={isFiltering}
            />
          ))}
          {!isFileTreeLoading && filteredFileTree.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              {fileTreeFilter ? `没有找到“${fileTreeFilter}”相关的文件或文件夹` : '当前目录为空'}
            </div>
          )}
          {isFileTreeLoading && <div className="px-2 py-1 text-xs text-muted-foreground">文件树加载中...</div>}
        </div>
      </ScrollArea>
    </div>
  );
}
