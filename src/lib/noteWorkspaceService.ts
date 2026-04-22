import type { FileNode } from '@/store/useNoteStore';
import { getNextIndexedName, getUniquePath } from '@/lib/utils';
import { NOTE_EDITOR_BEFORE_SWITCH_EVENT, NOTE_EDITOR_START_RENAME_EVENT } from '@/lib/noteEditorEvents';

interface SetActiveFileFn {
  (path: string | null, content?: string): void;
}

export function switchActiveFileSafely(
  setActiveFile: SetActiveFileFn,
  path: string | null,
  content?: string
): void {
  window.dispatchEvent(new Event(NOTE_EDITOR_BEFORE_SWITCH_EVENT));
  setActiveFile(path, content);
}

export function createNewMarkdownFileAndStartRename(
  parentPath: string,
  setActiveFile: SetActiveFileFn,
  refreshFileTree: () => void
): string {
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
  window.dispatchEvent(new CustomEvent(NOTE_EDITOR_START_RENAME_EVENT, { detail: { path: newPath } }));
  return newPath;
}

export function importMarkdownFilesToTarget(targetPath: string): number {
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

export function moveFileToDirectory(
  sourcePath: string,
  targetDirectory: string,
  activeFile: string | null,
  fileContent: string,
  setActiveFile: SetActiveFileFn
): string | null {
  const sourceName = window.services.basename(sourcePath);
  const destinationPath = getUniquePath(targetDirectory, sourceName, false);
  if (destinationPath === sourcePath) {
    return null;
  }
  window.services.rename(sourcePath, destinationPath);
  if (activeFile === sourcePath) {
    switchActiveFileSafely(setActiveFile, destinationPath, fileContent);
  }
  return destinationPath;
}
