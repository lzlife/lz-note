import { exportHtmlFile, exportImageFile, exportMarkdownFile, exportPdfFile } from '@/lib/exportManager';

export type NoteFileExportType = 'markdown' | 'html' | 'pdf' | 'image';

interface ExportMeta {
  successPrefix: string;
  errorPrefix: string;
}

interface ExportConfig extends ExportMeta {
  run: (filePath: string, fileName: string) => Promise<string | null | undefined>;
}

const EXPORT_CONFIG_MAP: Record<NoteFileExportType, ExportConfig> = {
  markdown: {
    run: exportMarkdownFile,
    successPrefix: '导出 Markdown 成功：',
    errorPrefix: '导出失败'
  },
  html: {
    run: exportHtmlFile,
    successPrefix: '导出 HTML 成功：',
    errorPrefix: '导出失败'
  },
  pdf: {
    run: exportPdfFile,
    successPrefix: '导出 PDF 成功：',
    errorPrefix: '导出 PDF 失败'
  },
  image: {
    run: exportImageFile,
    successPrefix: '导出图片成功：',
    errorPrefix: '导出图片失败'
  }
};

export async function exportNoteFileByType(
  filePath: string,
  fileName: string,
  type: NoteFileExportType
): Promise<string | null | undefined> {
  return EXPORT_CONFIG_MAP[type].run(filePath, fileName);
}

export function getExportMeta(type: NoteFileExportType): ExportMeta {
  return {
    successPrefix: EXPORT_CONFIG_MAP[type].successPrefix,
    errorPrefix: EXPORT_CONFIG_MAP[type].errorPrefix
  };
}

export function exportFolderToSelectedDirectory(sourcePath: string, folderName: string): boolean {
  const paths = window.ztools?.showOpenDialog({
    title: '选择导出位置',
    properties: ['openDirectory']
  });
  if (!paths || paths.length === 0) {
    return false;
  }
  const destinationPath = window.services.joinPath(paths[0], folderName);
  window.services.copy(sourcePath, destinationPath);
  return true;
}
