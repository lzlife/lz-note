import { type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { getUniquePath } from '@/lib/utils';
import {
  createNewMarkdownFileAndStartRename,
  importMarkdownFilesToTarget,
  moveFileToDirectory,
  switchActiveFileSafely
} from '@/lib/noteWorkspaceService';
import {
  exportFolderToSelectedDirectory,
  exportNoteFileByType,
  getExportMeta,
  type NoteFileExportType
} from '@/lib/noteExportService';
import { removeEditorDraftByPath } from '@/lib/editorDraft';
import type { FileNode } from '@/store/useNoteStore';

interface SetActiveFileFn {
  (path: string | null, content?: string): void;
}

interface UseSidebarNodeActionsParams {
  node: FileNode;
  isMarkdownFile: boolean;
  displayName: string;
  renameValue: string;
  setRenameValue: Dispatch<SetStateAction<string>>;
  activeFile: string | null;
  fileContent: string;
  setActiveFile: SetActiveFileFn;
  refreshFileTree: () => void;
  setExpandedMap: Dispatch<SetStateAction<Record<string, boolean>>>;
  setIsRenaming: Dispatch<SetStateAction<boolean>>;
  setIsCreatingFolder: Dispatch<SetStateAction<boolean>>;
  setIsDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  setIsDragOver: Dispatch<SetStateAction<boolean>>;
}

export function useSidebarNodeActions({
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
}: UseSidebarNodeActionsParams) {
  const handleNodeClick = () => {
    if (node.isDirectory) {
      setExpandedMap((prev) => ({
        ...prev,
        [node.path]: !prev[node.path]
      }));
      return;
    }
    if (!isMarkdownFile) {
      toast.error('不支持编辑该文件，请选择 Markdown 文件');
      return;
    }
    switchActiveFileSafely(setActiveFile, node.path);
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
    try {
      createNewMarkdownFileAndStartRename(node.path, setActiveFile, refreshFileTree);
      setExpandedMap((prev) => ({
        ...prev,
        [node.path]: true
      }));
    } catch (err) {
      toast.error(`创建失败: ${(err as Error).message}`);
    }
  };

  const handleStartCreateFolder = () => {
    setExpandedMap((prev) => ({
      ...prev,
      [node.path]: true
    }));
    setIsCreatingFolder(true);
  };

  const handleConfirmDelete = () => {
    try {
      if (node.isDirectory) {
        window.services.rmdir(node.path);
        removeEditorDraftByPath(node.path);
      } else {
        window.services.unlink(node.path);
        removeEditorDraftByPath(node.path);
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
      while (window.services.exists(newPath)) {
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

  const handleExportByType = async (type: NoteFileExportType) => {
    const exportMeta = getExportMeta(type);
    try {
      const outputPath = await exportNoteFileByType(node.path, node.name, type);
      if (outputPath) {
        toast.success(`${exportMeta.successPrefix}${outputPath}`);
      }
    } catch (err) {
      toast.error(`${exportMeta.errorPrefix}: ${(err as Error).message}`);
    }
  };

  const handleExportFolder = () => {
    try {
      const exported = exportFolderToSelectedDirectory(node.path, node.name);
      if (exported) {
        toast.success('导出文件夹成功');
      }
    } catch (err) {
      toast.error(`导出失败: ${(err as Error).message}`);
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
      moveFileToDirectory(sourcePath, node.path, activeFile, fileContent, setActiveFile);
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

  return {
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
  };
}
