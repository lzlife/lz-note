import { useCallback, useEffect, useRef } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { useNoteStore } from '@/store/useNoteStore';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  readEditorDraft,
  removeEditorDraft,
  removeEditorDraftByPath,
  saveEditorDraft
} from '@/lib/editorDraft';
import { NOTE_EDITOR_BEFORE_SWITCH_EVENT } from '@/lib/noteEditorEvents';

type EditorThemeConfig = {
  editorTheme: 'dark' | 'classic';
  contentTheme: 'dark' | 'light';
  codeTheme: string;
};
const DRAFT_RECOVERY_FRESH_WINDOW_MS = 1 * 60 * 1000;

function getEditorThemeConfig(resolvedTheme?: string): EditorThemeConfig {
  const isDark = resolvedTheme === 'dark';
  return {
    editorTheme: isDark ? 'dark' : 'classic',
    contentTheme: isDark ? 'dark' : 'light',
    // 3.11.2 版本不支持 native，暗色使用 github-dark
    codeTheme: isDark ? 'github-dark' : 'github'
  };
}

function readFileModifiedTimestamp(path: string): number | null {
  try {
    const servicesWithStat = window.services as unknown as {
      stat?: (targetPath: string) => { mtimeMs?: number; mtime?: number | string | Date };
      lstat?: (targetPath: string) => { mtimeMs?: number; mtime?: number | string | Date };
    };
    const statResult = servicesWithStat.stat?.(path) ?? servicesWithStat.lstat?.(path);
    if (!statResult) {
      return null;
    }
    if (typeof statResult.mtimeMs === 'number' && Number.isFinite(statResult.mtimeMs)) {
      return statResult.mtimeMs;
    }
    if (typeof statResult.mtime === 'number' && Number.isFinite(statResult.mtime)) {
      return statResult.mtime;
    }
    if (typeof statResult.mtime === 'string' || statResult.mtime instanceof Date) {
      const parsed = new Date(statResult.mtime).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function MainEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const isVditorReadyRef = useRef(false);
  const pendingValueRef = useRef('');
  const { activeFile, setFileContent } = useNoteStore();
  const { resolvedTheme } = useTheme();
  const isEditableMarkdown = activeFile ? /\.md$/i.test(activeFile) : false;
  const latestContentRef = useRef('');
  const currentFileRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const editorInstanceIdRef = useRef(0);
  const isProgrammaticUpdateRef = useRef(false);
  const themeConfigRef = useRef<EditorThemeConfig>(getEditorThemeConfig(resolvedTheme));
  const debouncedFlushTimerRef = useRef<number | null>(null);

  themeConfigRef.current = getEditorThemeConfig(resolvedTheme);

  const getLiveContent = useCallback(() => {
    if (vditorRef.current && isVditorReadyRef.current && !isProgrammaticUpdateRef.current) {
      return vditorRef.current.getValue();
    }
    return latestContentRef.current;
  }, []);

  const saveFileNow = useCallback((targetPath: string | null, silent = false, force = false) => {
    if (!targetPath || !/\.md$/i.test(targetPath)) {
      return;
    }
    if (!force && !dirtyRef.current) {
      return;
    }
    if (!window.services.exists(targetPath)) {
      removeEditorDraftByPath(targetPath);
      return;
    }
    const content = targetPath === currentFileRef.current ? getLiveContent() : latestContentRef.current;

    try {
      saveEditorDraft(targetPath, content);
      const diskContent = window.services.readFile(targetPath);
      if (diskContent !== content) {
        window.services.writeFile(targetPath, content);
      }
      removeEditorDraft(targetPath);
      if (currentFileRef.current === targetPath) {
        latestContentRef.current = content;
        setFileContent(content);
        dirtyRef.current = false;
      }
      if (!silent) {
        toast.success('已自动保存');
      }
    } catch (err) {
      toast.error(`自动保存失败: ${(err as Error).message}`);
    }
  }, [getLiveContent, setFileContent]);

  const clearDebouncedFlush = useCallback(() => {
    if (debouncedFlushTimerRef.current) {
      window.clearTimeout(debouncedFlushTimerRef.current);
      debouncedFlushTimerRef.current = null;
    }
  }, []);

  const scheduleDebouncedFlush = useCallback((targetPath: string | null, delayMs = 400) => {
    if (!targetPath || !/\.md$/i.test(targetPath)) {
      return;
    }
    clearDebouncedFlush();
    debouncedFlushTimerRef.current = window.setTimeout(() => {
      debouncedFlushTimerRef.current = null;
      saveFileNow(targetPath, true, true);
    }, delayMs);
  }, [clearDebouncedFlush, saveFileNow]);

  useEffect(() => {
    try {
      const previousFile = currentFileRef.current;
      if (previousFile && previousFile !== activeFile) {
        clearDebouncedFlush();
        saveFileNow(previousFile, true, true);
      }

      if (!activeFile) {
        currentFileRef.current = null;
        dirtyRef.current = false;
        latestContentRef.current = '';
        setFileContent('');
        pendingValueRef.current = '';
        if (vditorRef.current && isVditorReadyRef.current) {
          isProgrammaticUpdateRef.current = true;
          vditorRef.current.setValue('');
          isProgrammaticUpdateRef.current = false;
        }
        return;
      }

      if (!isEditableMarkdown) {
        currentFileRef.current = null;
        dirtyRef.current = false;
        latestContentRef.current = '';
        setFileContent('');
        pendingValueRef.current = '';
        if (vditorRef.current && isVditorReadyRef.current) {
          isProgrammaticUpdateRef.current = true;
          vditorRef.current.setValue('');
          isProgrammaticUpdateRef.current = false;
        }
        return;
      }

      const diskContent = window.services.readFile(activeFile);
      const fileModifiedTimestamp = readFileModifiedTimestamp(activeFile);
      const draft = readEditorDraft(activeFile);
      const shouldRecoverDraft = !!draft && (() => {
        if (draft.content === diskContent) {
          return false;
        }
        if (fileModifiedTimestamp !== null) {
          return draft.updatedAt > fileModifiedTimestamp;
        }
        return Date.now() - draft.updatedAt <= DRAFT_RECOVERY_FRESH_WINDOW_MS;
      })();
      const recoveredContent = draft?.content ?? diskContent;
      const content = shouldRecoverDraft ? recoveredContent : diskContent;
      if (shouldRecoverDraft) {
        try {
          window.services.writeFile(activeFile, recoveredContent);
          removeEditorDraft(activeFile);
          toast.success('已恢复未保存的编辑内容');
        } catch (recoverErr) {
          toast.error(`恢复未保存内容失败: ${(recoverErr as Error).message}`);
        }
      } else {
        removeEditorDraft(activeFile);
      }
      currentFileRef.current = activeFile;
      dirtyRef.current = false;
      latestContentRef.current = content;
      setFileContent(content);
      pendingValueRef.current = content;
      if (vditorRef.current && isVditorReadyRef.current) {
        isProgrammaticUpdateRef.current = true;
        vditorRef.current.setValue(content);
        isProgrammaticUpdateRef.current = false;
      }
    } catch (err) {
      toast.error(`读取文件失败: ${(err as Error).message}`);
    }
  }, [activeFile, clearDebouncedFlush, isEditableMarkdown, saveFileNow, setFileContent]);

  useEffect(() => {
    if (!activeFile || !isEditableMarkdown || !containerRef.current || vditorRef.current) {
      return;
    }
    const instanceId = editorInstanceIdRef.current + 1;
    editorInstanceIdRef.current = instanceId;
    const boundFilePath = activeFile;

    vditorRef.current = new Vditor(containerRef.current, {
      ...themeConfigRef.current,
      height: '100%',
      cache: { enable: false },
      // 使用所见即所得模式，表格等块元素可显示内置浮层操作菜单
      mode: 'wysiwyg',
      value: pendingValueRef.current,
      // 启用编辑器内置统计能力，避免自行维护统计状态
      counter: {
        enable: true,
        type: 'markdown',
      },
      preview: {
        theme: {
          current: themeConfigRef.current.contentTheme
        },
        hljs: {
          style: themeConfigRef.current.codeTheme
        }
      },
      // 兜底空实现：3.11.2 在 wysiwyg 下会直接调用该函数
      customWysiwygToolbar: () => {},
      toolbar: [
        { name: 'undo', tipPosition: 's', tip: '撤销' },
        { name: 'redo', tipPosition: 's', tip: '重做' },
        { name: 'insert-after', tipPosition: 's', tip: '向下插入行' },
        { name: 'insert-before', tipPosition: 's', tip: '向上插入行' },
        '|',
        { name: 'headings', tipPosition: 's', tip: '标题' },
        { name: 'bold', tipPosition: 's', tip: '粗体' },
        { name: 'italic', tipPosition: 's', tip: '斜体' },
        { name: 'strike', tipPosition: 's', tip: '删除线' },
        { name: 'line', tipPosition: 's', tip: '分割线' },
        { name: 'quote', tipPosition: 's', tip: '引用' },
        '|',
        { name: 'list', tipPosition: 's', tip: '无序列表' },
        { name: 'ordered-list', tipPosition: 's', tip: '有序列表' },
        { name: 'check', tipPosition: 's', tip: '任务列表' },
        '|',
        { name: 'code', tipPosition: 's', tip: '代码块' },
        { name: 'inline-code', tipPosition: 's', tip: '行内代码' },
        { name: 'emoji', tipPosition: 's', tip: '表情' },
        '|',
        { name: 'upload', tipPosition: 's', tip: '上传图片' },
        { name: 'link', tipPosition: 's', tip: '链接' },
        { name: 'table', tipPosition: 's', tip: '表格' },
        '|',
        { name: 'edit-mode', tipPosition: 's', tip: '编辑模式' },
        { name: 'both', tipPosition: 's', tip: '双栏预览' },
        { name: 'preview', tipPosition: 's', tip: '全屏预览' },
        { name: 'fullscreen', tipPosition: 's', tip: '全屏' },
      ],
      after: () => {
        if (instanceId !== editorInstanceIdRef.current) {
          return;
        }
        isVditorReadyRef.current = true;
        if (vditorRef.current) {
          const themeConfig = themeConfigRef.current;
          vditorRef.current.setTheme(themeConfig.editorTheme, themeConfig.contentTheme, themeConfig.codeTheme);
        }
        if (pendingValueRef.current && vditorRef.current) {
          isProgrammaticUpdateRef.current = true;
          vditorRef.current.setValue(pendingValueRef.current);
          isProgrammaticUpdateRef.current = false;
        }
      },
      blur: () => {
        if (instanceId !== editorInstanceIdRef.current) {
          return;
        }
        saveFileNow(boundFilePath, true, true);
      },
      input: (val) => {
        if (instanceId !== editorInstanceIdRef.current) {
          return;
        }
        if (isProgrammaticUpdateRef.current || currentFileRef.current !== boundFilePath) {
          return;
        }
        latestContentRef.current = val;
        dirtyRef.current = true;
        saveEditorDraft(boundFilePath, val);
        setFileContent(val);
        scheduleDebouncedFlush(boundFilePath);
      }
    });

    return () => {
      if (instanceId === editorInstanceIdRef.current) {
        editorInstanceIdRef.current = instanceId + 1;
      }
      clearDebouncedFlush();
      saveFileNow(boundFilePath, true, true);
      vditorRef.current?.destroy();
      vditorRef.current = null;
      isVditorReadyRef.current = false;
    };
  }, [activeFile, clearDebouncedFlush, isEditableMarkdown, saveFileNow, scheduleDebouncedFlush, setFileContent]);

  useEffect(() => {
    const handleWindowBlur = () => {
      saveFileNow(currentFileRef.current, true, true);
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [saveFileNow]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      clearDebouncedFlush();
      saveFileNow(currentFileRef.current, true, true);
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const handlePageHide = () => {
      clearDebouncedFlush();
      saveFileNow(currentFileRef.current, true, true);
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearDebouncedFlush();
        saveFileNow(currentFileRef.current, true, true);
      }
    };
    const handleBeforeSwitch = () => {
      clearDebouncedFlush();
      saveFileNow(currentFileRef.current, true, true);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener(NOTE_EDITOR_BEFORE_SWITCH_EVENT, handleBeforeSwitch);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener(NOTE_EDITOR_BEFORE_SWITCH_EVENT, handleBeforeSwitch);
    };
  }, [clearDebouncedFlush, saveFileNow]);

  useEffect(() => {
    if (!vditorRef.current) {
      return;
    }
    const themeConfig = getEditorThemeConfig(resolvedTheme);
    vditorRef.current.setTheme(themeConfig.editorTheme, themeConfig.contentTheme, themeConfig.codeTheme);
  }, [resolvedTheme]);

  if (!activeFile) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background h-full">
        从侧边栏选择一个文件开始编辑
      </div>
    );
  }

  if (!isEditableMarkdown) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground bg-background h-full">
        当前文件不是 Markdown 文件，暂不支持编辑
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full bg-background overflow-hidden relative">
      <div ref={containerRef} className="w-full h-full border-none vditor-container" />
    </div>
  );
}
