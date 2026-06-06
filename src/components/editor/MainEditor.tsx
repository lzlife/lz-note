import { useCallback, useEffect, useRef, useState } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { useNoteStore } from "@/store/useNoteStore";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  readEditorDraft,
  removeEditorDraft,
  removeEditorDraftByPath,
  saveEditorDraft,
} from "@/lib/editorDraft";
import { NOTE_EDITOR_BEFORE_SWITCH_EVENT } from "@/lib/noteEditorEvents";
import { SlashCommandMenu } from "./SlashCommandMenu";

type EditorThemeConfig = {
  editorTheme: "dark" | "classic";
  contentTheme: "dark" | "light";
  codeTheme: string;
};
const DRAFT_RECOVERY_FRESH_WINDOW_MS = 1 * 60 * 1000;

function resolveEditorImagePaths(
  container: HTMLElement | null,
  filePath: string | null,
) {
  if (!container || !filePath) return;
  const dir = window.services.dirname(filePath);
  const selector = ".vditor-ir, .vditor-wysiwyg, .vditor-sv, .vditor-preview";
  const areas = container.querySelectorAll(selector);
  const targets = areas.length ? areas : [container];
  targets.forEach((area) => {
    area.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (
        !src ||
        src.startsWith("file://") ||
        src.startsWith("http") ||
        src.startsWith("data:")
      )
        return;
      const absPath = window.services.joinPath(dir, src);
      img.setAttribute("src", "file:///" + absPath.replace(/\\/g, "/"));
    });
  });
}

function readFileModifiedTimestamp(path: string): number | null {
  try {
    const servicesWithStat = window.services as unknown as {
      stat?: (targetPath: string) => {
        mtimeMs?: number;
        mtime?: number | string | Date;
      };
      lstat?: (targetPath: string) => {
        mtimeMs?: number;
        mtime?: number | string | Date;
      };
    };
    const statResult =
      servicesWithStat.stat?.(path) ?? servicesWithStat.lstat?.(path);
    if (!statResult) {
      return null;
    }
    if (
      typeof statResult.mtimeMs === "number" &&
      Number.isFinite(statResult.mtimeMs)
    ) {
      return statResult.mtimeMs;
    }
    if (
      typeof statResult.mtime === "number" &&
      Number.isFinite(statResult.mtime)
    ) {
      return statResult.mtime;
    }
    if (
      typeof statResult.mtime === "string" ||
      statResult.mtime instanceof Date
    ) {
      const parsed = new Date(statResult.mtime).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

function getEditorThemeConfig(resolvedTheme?: string): EditorThemeConfig {
  const isDark = resolvedTheme === "dark";
  return {
    editorTheme: isDark ? "dark" : "classic",
    contentTheme: isDark ? "dark" : "light",
    codeTheme: isDark ? "github-dark" : "github",
  };
}

export function MainEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const isVditorReadyRef = useRef(false);
  const pendingValueRef = useRef("");
  const { activeFile, setFileContent } = useNoteStore();
  const { resolvedTheme } = useTheme();
  const isEditableMarkdown = activeFile ? /\.md$/i.test(activeFile) : false;
  const latestContentRef = useRef("");
  const currentFileRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const editorInstanceIdRef = useRef(0);
  const isProgrammaticUpdateRef = useRef(false);
  const themeConfigRef = useRef<EditorThemeConfig>(
    getEditorThemeConfig(resolvedTheme),
  );
  const debouncedFlushTimerRef = useRef<number | null>(null);

  // 斜杠命令状态（使用 ref 避免闭包问题）
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const slashActiveRef = useRef(false);
  const slashFilterRef = useRef("");
  const slashMenuVisibleRef = useRef(false);
  // 记录斜杠所在文本节点和偏移，用于选中后删除
  const slashNodeRef = useRef<Text | null>(null);
  const slashOffsetRef = useRef(0);

  // 同步 ref 和 state
  const showSlashMenu = useCallback(
    (filter: string, pos: { top: number; left: number }) => {
      slashFilterRef.current = filter;
      slashActiveRef.current = true;
      slashMenuVisibleRef.current = true;
      setSlashFilter(filter);
      setSlashPosition(pos);
      setSlashMenuVisible(true);
    },
    [],
  );

  const hideSlashMenu = useCallback(() => {
    slashActiveRef.current = false;
    slashFilterRef.current = "";
    slashMenuVisibleRef.current = false;
    slashNodeRef.current = null;
    slashOffsetRef.current = 0;
    setSlashFilter("");
    setSlashMenuVisible(false);
  }, []);

  themeConfigRef.current = getEditorThemeConfig(resolvedTheme);

  const getLiveContent = useCallback(() => {
    if (
      vditorRef.current &&
      isVditorReadyRef.current &&
      !isProgrammaticUpdateRef.current
    ) {
      return vditorRef.current.getValue();
    }
    return latestContentRef.current;
  }, []);

  const saveFileNow = useCallback(
    (targetPath: string | null, silent = false, force = false) => {
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
      const content =
        targetPath === currentFileRef.current
          ? getLiveContent()
          : latestContentRef.current;

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
          toast.success("已自动保存");
        }
      } catch (err) {
        toast.error(`自动保存失败: ${(err as Error).message}`);
      }
    },
    [getLiveContent, setFileContent],
  );

  const clearDebouncedFlush = useCallback(() => {
    if (debouncedFlushTimerRef.current) {
      window.clearTimeout(debouncedFlushTimerRef.current);
      debouncedFlushTimerRef.current = null;
    }
  }, []);

  const scheduleDebouncedFlush = useCallback(
    (targetPath: string | null, delayMs = 400) => {
      if (!targetPath || !/\.md$/i.test(targetPath)) {
        return;
      }
      clearDebouncedFlush();
      debouncedFlushTimerRef.current = window.setTimeout(() => {
        debouncedFlushTimerRef.current = null;
        saveFileNow(targetPath, true, true);
      }, delayMs);
    },
    [clearDebouncedFlush, saveFileNow],
  );

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
        latestContentRef.current = "";
        setFileContent("");
        pendingValueRef.current = "";
        if (vditorRef.current && isVditorReadyRef.current) {
          isProgrammaticUpdateRef.current = true;
          vditorRef.current.setValue("");
          isProgrammaticUpdateRef.current = false;
        }
        return;
      }

      if (!isEditableMarkdown) {
        currentFileRef.current = null;
        dirtyRef.current = false;
        latestContentRef.current = "";
        setFileContent("");
        pendingValueRef.current = "";
        if (vditorRef.current && isVditorReadyRef.current) {
          isProgrammaticUpdateRef.current = true;
          vditorRef.current.setValue("");
          isProgrammaticUpdateRef.current = false;
        }
        return;
      }

      const diskContent = window.services.readFile(activeFile);
      const fileModifiedTimestamp = readFileModifiedTimestamp(activeFile);
      const draft = readEditorDraft(activeFile);
      const shouldRecoverDraft =
        !!draft &&
        (() => {
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
          toast.success("已恢复未保存的编辑内容");
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
        resolveEditorImagePaths(containerRef.current, activeFile);
      }
    } catch (err) {
      toast.error(`读取文件失败: ${(err as Error).message}`);
    }
  }, [
    activeFile,
    clearDebouncedFlush,
    isEditableMarkdown,
    saveFileNow,
    setFileContent,
  ]);

  useEffect(() => {
    if (
      !activeFile ||
      !isEditableMarkdown ||
      !containerRef.current ||
      vditorRef.current
    ) {
      return;
    }
    const instanceId = editorInstanceIdRef.current + 1;
    editorInstanceIdRef.current = instanceId;
    const boundFilePath = activeFile;

    // 原生 keydown 监听器（在 after 中绑定到编辑器元素）
    const handleNativeKeydown = (event: KeyboardEvent) => {
      if (instanceId !== editorInstanceIdRef.current) return;

      // 如果斜杠菜单已打开，不处理（由 SlashCommandMenu 处理）
      if (slashMenuVisibleRef.current) return;

      // 检测是否输入了 /
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range.collapsed) return;

        // / 还没被插入 DOM，记录当前光标位置
        // / 插入后，文本节点会变为 ".../"，光标在最后
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          slashNodeRef.current = node as Text;
          slashOffsetRef.current = range.startOffset; // / 将插入到这个位置之后
        } else {
          slashNodeRef.current = null;
          slashOffsetRef.current = 0;
        }

        // 延迟到 / 被插入 DOM 之后再计算菜单位置
        requestAnimationFrame(() => {
          const newRange = sel.getRangeAt(0);
          const rect = newRange.getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect && rect.height > 0) {
            showSlashMenu("", {
              top: rect.bottom + 4,
              left: rect.left,
            });
          } else {
            showSlashMenu("", { top: 0, left: 0 });
          }
        });
      }
    };

    vditorRef.current = new Vditor(containerRef.current, {
      ...themeConfigRef.current,
      height: "100%",
      cache: { enable: false },
      mode: "wysiwyg",
      value: pendingValueRef.current,
      counter: {
        enable: true,
        type: "markdown",
      },
      preview: {
        theme: {
          current: themeConfigRef.current.contentTheme,
        },
        hljs: {
          style: themeConfigRef.current.codeTheme,
        },
      },
      // 图片上传配置
      upload: {
        accept: "image/*",
        handler: async (files: File[]) => {
          if (!activeFile) return null;
          const workspace = useNoteStore.getState().workspace;
          if (!workspace) return null;

          const dir = window.services.dirname(activeFile);
          const resourcesDir = window.services.joinPath(dir, ".resources");
          window.services.mkdir(resourcesDir);

          for (const file of files) {
            const timestamp = Date.now();
            const safeName = file.name.replace(/[^\w.\u4e00-\u9fa5]/g, "_");
            const fileName = `${timestamp}_${safeName}`;
            const filePath = window.services.joinPath(resourcesDir, fileName);

            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
              new Uint8Array(arrayBuffer).reduce(
                (data, byte) => data + String.fromCharCode(byte),
                "",
              ),
            );
            window.services.writeFileBase64(filePath, base64);

            const relativePath = ".resources/" + fileName;
            const imageMarkdown = `![${file.name}](${relativePath})`;
            if (vditorRef.current) {
              vditorRef.current.insertValue(imageMarkdown);
            }
          }

          return "";
        },
        filename: (name: string) => name.replace(/[^\w.\u4e00-\u9fa5]/g, "_"),
        multiple: true,
      },
      customWysiwygToolbar: () => {},
      toolbar: [
        { name: "undo", tipPosition: "s", tip: "撤销" },
        { name: "redo", tipPosition: "s", tip: "重做" },
        { name: "insert-after", tipPosition: "s", tip: "向下插入行" },
        { name: "insert-before", tipPosition: "s", tip: "向上插入行" },
        "|",
        { name: "headings", tipPosition: "s", tip: "标题" },
        { name: "bold", tipPosition: "s", tip: "粗体" },
        { name: "italic", tipPosition: "s", tip: "斜体" },
        { name: "strike", tipPosition: "s", tip: "删除线" },
        { name: "line", tipPosition: "s", tip: "分割线" },
        { name: "quote", tipPosition: "s", tip: "引用" },
        "|",
        { name: "list", tipPosition: "s", tip: "无序列表" },
        { name: "ordered-list", tipPosition: "s", tip: "有序列表" },
        { name: "check", tipPosition: "s", tip: "任务列表" },
        "|",
        { name: "code", tipPosition: "s", tip: "代码块" },
        { name: "inline-code", tipPosition: "s", tip: "行内代码" },
        { name: "emoji", tipPosition: "s", tip: "表情" },
        "|",
        { name: "upload", tipPosition: "s", tip: "上传图片" },
        { name: "link", tipPosition: "s", tip: "链接" },
        { name: "table", tipPosition: "s", tip: "表格" },
        "|",
        { name: "edit-mode", tipPosition: "s", tip: "编辑模式" },
        { name: "both", tipPosition: "s", tip: "双栏预览" },
        { name: "preview", tipPosition: "s", tip: "全屏预览" },
        { name: "fullscreen", tipPosition: "s", tip: "全屏" },
        { name: "outline", tipPosition: "s", tip: "大纲" },
      ],
      after: () => {
        if (instanceId !== editorInstanceIdRef.current) {
          return;
        }
        isVditorReadyRef.current = true;
        if (vditorRef.current) {
          const themeConfig = themeConfigRef.current;
          vditorRef.current.setTheme(
            themeConfig.editorTheme,
            themeConfig.contentTheme,
            themeConfig.codeTheme,
          );
        }
        if (pendingValueRef.current && vditorRef.current) {
          isProgrammaticUpdateRef.current = true;
          vditorRef.current.setValue(pendingValueRef.current);
          isProgrammaticUpdateRef.current = false;
        }
        resolveEditorImagePaths(containerRef.current, boundFilePath);

        // 绑定原生 keydown 到编辑器内容区域
        const editorElement = containerRef.current?.querySelector(
          ".vditor-wysiwyg, .vditor-ir, .vditor-sv",
        );
        if (editorElement) {
          editorElement.addEventListener("keydown", handleNativeKeydown);
          // 原生 input 事件（同步触发，绕过 Vditor 的 800ms undoDelay）
          const handleSlashInput = () => {
            if (!slashMenuVisibleRef.current) return;
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) { hideSlashMenu(); return; }
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
              const text = (node as Text).textContent || "";
              const offset = range.startOffset;
              if (!text.substring(0, offset).includes("/")) {
                hideSlashMenu();
              }
            } else {
              // 光标在 <wbr> 等非文本节点 → Lute 已重绘，/ 已不在
              hideSlashMenu();
            }
          };
          editorElement.addEventListener("input", handleSlashInput);
          // ★ 保存引用供 cleanup 使用
          (editorElement as any).__slashInputHandler = handleSlashInput;
        }
      },
      blur: () => {
        if (instanceId !== editorInstanceIdRef.current) {
          return;
        }
        saveFileNow(boundFilePath, true, true);
        hideSlashMenu();
      },
      input: (val) => {
        if (instanceId !== editorInstanceIdRef.current) {
          return;
        }
        if (
          isProgrammaticUpdateRef.current ||
          currentFileRef.current !== boundFilePath
        ) {
          return;
        }
        latestContentRef.current = val;
        dirtyRef.current = true;
        saveEditorDraft(boundFilePath, val);
        setFileContent(val);
        scheduleDebouncedFlush(boundFilePath);
        resolveEditorImagePaths(containerRef.current, boundFilePath);

        // 更新斜杠命令过滤
        if (slashActiveRef.current) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const node = range.startContainer;
            if (node.nodeType === Node.TEXT_NODE) {
              const text = (node as Text).textContent || "";
              const cursorOffset = range.startOffset;
              // 在文本中找斜杠
              const textBefore = text.substring(0, cursorOffset);
              const slashIdx = textBefore.lastIndexOf("/");
              if (slashIdx >= 0) {
                const filter = textBefore.substring(slashIdx + 1);
                if (filter.includes(" ") || filter.includes("\n")) {
                  hideSlashMenu();
                } else {
                  slashFilterRef.current = filter;
                  setSlashFilter(filter);
                }
              } else {
                hideSlashMenu();
              }
            } else {
              hideSlashMenu();
            }
          }
        }
      },
    });

    return () => {
      if (instanceId === editorInstanceIdRef.current) {
        editorInstanceIdRef.current = instanceId + 1;
      }
      // 解绑原生 keydown
      const editorElement = containerRef.current?.querySelector(
        ".vditor-wysiwyg, .vditor-ir, .vditor-sv",
      );
      if (editorElement) {
        editorElement.removeEventListener("keydown", handleNativeKeydown);
        const slashInputHandler = (editorElement as any).__slashInputHandler;
        if (slashInputHandler) {
          editorElement.removeEventListener("input", slashInputHandler);
          delete (editorElement as any).__slashInputHandler;
        }
      }
      clearDebouncedFlush();
      saveFileNow(boundFilePath, true, true);
      vditorRef.current?.destroy();
      vditorRef.current = null;
      isVditorReadyRef.current = false;
    };
  }, [
    activeFile,
    clearDebouncedFlush,
    isEditableMarkdown,
    saveFileNow,
    scheduleDebouncedFlush,
    setFileContent,
    showSlashMenu,
    hideSlashMenu,
  ]);

  useEffect(() => {
    const handleWindowBlur = () => {
      saveFileNow(currentFileRef.current, true, true);
    };
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [saveFileNow]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      clearDebouncedFlush();
      saveFileNow(currentFileRef.current, true, true);
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
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
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(
      NOTE_EDITOR_BEFORE_SWITCH_EVENT,
      handleBeforeSwitch,
    );
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        NOTE_EDITOR_BEFORE_SWITCH_EVENT,
        handleBeforeSwitch,
      );
    };
  }, [clearDebouncedFlush, saveFileNow]);

  useEffect(() => {
    if (!vditorRef.current) {
      return;
    }
    const themeConfig = getEditorThemeConfig(resolvedTheme);
    vditorRef.current.setTheme(
      themeConfig.editorTheme,
      themeConfig.contentTheme,
      themeConfig.codeTheme,
    );
  }, [resolvedTheme]);

  const handleSlashSelect = useCallback(
    (value: string) => {
      const vditor = vditorRef.current;
      if (!vditor) {
        hideSlashMenu();
        return;
      }

      // 找到当前选区，删除从 / 到光标的内容，然后插入命令
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node as Text).textContent || "";
          const cursorOffset = range.startOffset;
          const textBefore = text.substring(0, cursorOffset);
          const slashIdx = textBefore.lastIndexOf("/");
          if (slashIdx >= 0) {
            // 选中从 / 到光标的内容并删除
            range.setStart(node, slashIdx);
            range.setEnd(node, cursorOffset);
            range.deleteContents();
            range.collapse(false);
          }
        }
      }

      // 插入命令内容
      // 分割线用 insertMD 确保 --- 被正确转为 <hr>，其他用 insertValue
      vditor.insertValue(value);
      hideSlashMenu();
    },
    [hideSlashMenu],
  );

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
      <div
        ref={containerRef}
        className="w-full h-full border-none vditor-container"
      />
      <SlashCommandMenu
        visible={slashMenuVisible}
        filter={slashFilter}
        position={slashPosition}
        onSelect={handleSlashSelect}
        onClose={hideSlashMenu}
      />
    </div>
  );
}
