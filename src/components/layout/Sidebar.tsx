import { useNoteStore } from '@/store/useNoteStore';
import {
  FolderPlus,
  FilePlus,
  Download,
  ChevronsUpDown,
  RefreshCw,
} from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { cn } from '@/lib/utils';
import { collectDirectoryPaths, filterFileTreeByName } from '@/lib/fileTreeUtils';
import {
  createNewMarkdownFileAndStartRename,
  importMarkdownFilesToTarget,
  moveFileToDirectory,
} from '@/lib/noteWorkspaceService';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { InlineCreator, SidebarFileTreeNode } from '@/components/layout/SidebarFileTreeNode';

export function Sidebar() {
  const {
    fileTree,
    refreshFileTree,
    workspace,
    activeFile,
    setActiveFile,
    fileContent,
    isFileTreeLoading,
    fileTreeFilter
  } = useNoteStore();
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [isCreatingRootFolder, setIsCreatingRootFolder] = useState(false);
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const filteredFileTree = useMemo(() => filterFileTreeByName(fileTree, fileTreeFilter), [fileTree, fileTreeFilter]);
  const isFiltering = fileTreeFilter.trim().length > 0;

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
    try {
      createNewMarkdownFileAndStartRename(workspace, setActiveFile, refreshFileTree);
    } catch (err) {
      toast.error(`创建失败: ${(err as Error).message}`);
    }
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
      moveFileToDirectory(sourcePath, workspace, activeFile, fileContent, setActiveFile);
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
          <button onClick={refreshFileTree} className="p-1 hover:bg-accent rounded-md transition-colors cursor-pointer" title="刷新文件树">
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
            <SidebarFileTreeNode
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
