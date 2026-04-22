import { useNoteStore } from "@/store/useNoteStore";
import { MoreVertical, Send, FileText, Menu, Settings, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useState, useEffect, useMemo, useRef } from "react";
import { getUniquePath } from "@/lib/utils";
import { type GitSyncDecisions, type GitSyncReport, runGitSync } from "@/lib/gitSync";
import { loadGitSyncConfigFromStorage } from "@/lib/gitConfig";

interface PathTreeNode {
  name: string;
  path: string;
  children: PathTreeNode[];
}

interface StartRenameEventDetail {
  path?: string;
}

function buildPathTree(paths: string[]): PathTreeNode[] {
  const roots: PathTreeNode[] = [];
  const rootMap = new Map<string, PathTreeNode>();
  const sortedPaths = [...new Set(paths.map((item) => item.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  sortedPaths.forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    let currentChildren = roots;
    let currentMap = rootMap;
    let currentPath = "";

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (!currentMap.has(currentPath)) {
        const node: PathTreeNode = {
          name: part,
          path: currentPath,
          children: [],
        };
        currentMap.set(currentPath, node);
        currentChildren.push(node);
      }
      const node = currentMap.get(currentPath)!;
      if (index < parts.length - 1) {
        currentChildren = node.children;
      }
    });
  });

  const sortNodes = (nodes: PathTreeNode[]) => {
    nodes.sort((a, b) => {
      const aIsDir = a.children.length > 0;
      const bIsDir = b.children.length > 0;
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });
    nodes.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

function PathTreeItem({ node, level = 0 }: { node: PathTreeNode; level?: number }) {
  const [expanded, setExpanded] = useState(true);
  const isDirectory = node.children.length > 0;
  return (
    <div>
      <button
        type="button"
        className="w-full text-left flex items-center gap-1 py-0.5 hover:bg-accent/50 rounded-sm"
        style={{ paddingLeft: `${level * 12 + 4}px` }}
        onClick={() => isDirectory && setExpanded(!expanded)}
      >
        {isDirectory ? expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" /> : <span className="inline-block w-3 h-3 shrink-0" />}
        <span className="truncate">{node.name}</span>
      </button>
      {isDirectory && expanded && (
        <div>
          {node.children.map((child) => (
            <PathTreeItem key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function PathTreePanel({ paths }: { paths: string[] }) {
  const tree = useMemo(() => buildPathTree(paths), [paths]);
  if (tree.length === 0) {
    return <p className="text-sm text-muted-foreground">无</p>;
  }
  return (
    <div className="max-h-[100px] overflow-auto rounded-md border border-border p-2 text-sm">
      {tree.map((node) => (
        <PathTreeItem key={node.path} node={node} />
      ))}
    </div>
  );
}

export function EditorTopBar() {
  const { activeFile, toggleSidebar, setSettingsOpen, setLocalStoreOpen, gitStatus, workspace, setActiveFile, refreshFileTree, pendingSyncPreviewReport, setPendingSyncPreviewReport } = useNoteStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [isSyncPreviewOpen, setIsSyncPreviewOpen] = useState(false);
  const [syncExecutionMode, setSyncExecutionMode] = useState<"manual" | "startup">("manual");
  const [isConfirmingSync, setIsConfirmingSync] = useState(false);
  const [syncPreviewReport, setSyncPreviewReport] = useState<GitSyncReport | null>(null);
  const [syncDecisions, setSyncDecisions] = useState<GitSyncDecisions>({
    remoteMissingTrackedAction: "keep_local",
    localMissingTrackedAction: "restore_local",
  });
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pendingRenamePathRef = useRef<string | null>(null);
  const gitSyncLockRef = useRef(false);
  const confirmSyncLockRef = useRef(false);
  const previewRemoteMissingTracked = (syncPreviewReport?.remoteMissingTracked || []).map((path) => path.trim()).filter(Boolean);
  const previewLocalMissingTracked = (syncPreviewReport?.localMissingTracked || []).map((path) => path.trim()).filter(Boolean);

  const fileName = activeFile ? window.services.basename(activeFile) : "未打开文件";
  const isMarkdownFile = activeFile ? /\.md$/i.test(fileName) : false;
  const displayFileName = isMarkdownFile ? fileName.replace(/\.md$/i, "") : fileName;

  useEffect(() => {
    setEditName(displayFileName);
    setIsEditing(false);
  }, [displayFileName]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const timer = window.requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(timer);
  }, [isEditing]);

  useEffect(() => {
    const handleStartRename = (event: Event) => {
      const customEvent = event as CustomEvent<StartRenameEventDetail>;
      const detail = customEvent.detail;
      const targetPath = detail?.path;
      if (!targetPath) {
        return;
      }
      pendingRenamePathRef.current = targetPath;
      if (activeFile === targetPath && /\.md$/i.test(window.services.basename(targetPath))) {
        setIsEditing(true);
      }
    };
    window.addEventListener("note-editor-start-rename", handleStartRename);
    return () => {
      window.removeEventListener("note-editor-start-rename", handleStartRename);
    };
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile || !pendingRenamePathRef.current) {
      return;
    }
    if (pendingRenamePathRef.current !== activeFile) {
      return;
    }
    pendingRenamePathRef.current = null;
    if (isMarkdownFile) {
      setIsEditing(true);
    }
  }, [activeFile, isMarkdownFile]);

  useEffect(() => {
    if (!pendingSyncPreviewReport) {
      return;
    }
    setSyncExecutionMode("startup");
    setSyncDecisions({
      remoteMissingTrackedAction: "keep_local",
      localMissingTrackedAction: "restore_local",
    });
    setSyncPreviewReport(pendingSyncPreviewReport);
    setIsSyncPreviewOpen(true);
    setPendingSyncPreviewReport(null);
  }, [pendingSyncPreviewReport, setPendingSyncPreviewReport]);

  const executeSync = async (mode: "manual" | "startup", decisions?: GitSyncDecisions) => {
    const { config, isConfigured } = await loadGitSyncConfigFromStorage();
    if (!isConfigured) {
      throw new Error("请先在仓库设置中绑定 Git 仓库");
    }
    const result = await runGitSync({
      workspace,
      mode,
      config,
      decisions,
      refreshFileTree,
      setPhase: (phase) => useNoteStore.setState({ gitStatus: phase }),
    });
    if (!result.ok) {
      throw new Error(result.error?.message || "同步失败");
    }
    useNoteStore.setState({ gitStatus: "success" });
    if (result.report.skippedPushByNoChanges) {
      const recoveredCount = result.report.localMissingTracked.length;
      if (result.report.decisionApplied && recoveredCount > 0) {
        toast.success(`同步完成：已从远程恢复 ${recoveredCount} 个文件`);
        return;
      }
      if (result.report.pulled) {
        toast.success("同步完成：已和远程保持一致");
        return;
      }
      toast.success("本次没有发现需要同步的改动");
      return;
    }
    toast.success(`同步完成：已处理 ${result.report.changedPaths.length} 项改动`);
  };

  const handleGitSync = async () => {
    if (gitSyncLockRef.current) {
      toast.error("Git 同步正在进行中，请稍后再试");
      return;
    }
    gitSyncLockRef.current = true;
    try {
      setSyncExecutionMode("manual");
      const { config, isConfigured } = await loadGitSyncConfigFromStorage();

      if (!isConfigured) {
        toast.error("请先在仓库设置中绑定 Git 仓库");
        setSettingsOpen(true);
        return;
      }

      const precheckResult = await runGitSync({
        workspace,
        mode: "manual",
        config,
        precheckOnly: true,
        refreshFileTree,
        setPhase: (phase) => useNoteStore.setState({ gitStatus: phase }),
      });

      if (!precheckResult.ok) {
        throw new Error(precheckResult.error?.message || "同步预检失败");
      }

      if (precheckResult.requiresDecision) {
        setSyncDecisions({
          remoteMissingTrackedAction: "keep_local",
          localMissingTrackedAction: "restore_local",
        });
        setSyncPreviewReport(precheckResult.report);
        setIsSyncPreviewOpen(true);
        return;
      }

      await executeSync("manual");
    } catch (error) {
      console.error(error);
      toast.error(`同步失败：${(error as Error).message || "未知错误"}`);
      useNoteStore.setState({ gitStatus: "error" });
    } finally {
      gitSyncLockRef.current = false;
      setTimeout(() => useNoteStore.setState({ gitStatus: "idle" }), 3000);
    }
  };

  const handleConfirmSync = async () => {
    if (!syncPreviewReport) {
      return;
    }
    if (confirmSyncLockRef.current) {
      toast.error("同步正在进行中，请稍后再试");
      return;
    }
    confirmSyncLockRef.current = true;
    setIsConfirmingSync(true);
    setIsSyncPreviewOpen(false);
    try {
      await executeSync(syncExecutionMode, syncPreviewReport.decisionRequired ? syncDecisions : undefined);
    } catch (error) {
      useNoteStore.setState({ gitStatus: "error" });
      toast.error(`同步失败：${(error as Error).message || "未知错误"}`);
    } finally {
      confirmSyncLockRef.current = false;
      setIsConfirmingSync(false);
      setTimeout(() => useNoteStore.setState({ gitStatus: "idle" }), 3000);
    }
  };

  const getSyncLabel = () => {
    if (gitStatus === "precheck") return "预检查中...";
    if (gitStatus === "confirm") return "等待确认...";
    if (gitStatus === "pull") return "拉取中...";
    if (gitStatus === "diff") return "对比中...";
    if (gitStatus === "dry_run") return "预演中...";
    if (gitStatus === "commit") return "提交中...";
    if (gitStatus === "push") return "推送中...";
    if (gitStatus === "conflict") return "存在冲突";
    return "Git 同步";
  };

  const handleRename = () => {
    if (!isMarkdownFile) {
      toast.error("不支持编辑该文件，请选择 Markdown 文件");
      setIsEditing(false);
      return;
    }
    setIsEditing(false);
    if (!activeFile || editName === displayFileName || !editName.trim()) {
      setEditName(displayFileName);
      return;
    }

    try {
      const dir = window.services.dirname(activeFile);
      const newPath = getUniquePath(dir, editName.endsWith(".md") ? editName : `${editName}.md`, false);

      window.services.rename(activeFile, newPath);
      setActiveFile(newPath, useNoteStore.getState().fileContent);
      refreshFileTree();
      toast.success("重命名成功");
    } catch (err) {
      toast.error(`重命名失败: ${(err as Error).message}`);
      setEditName(displayFileName);
    }
  };

  return (
    <div className="flex items-center justify-between h-12 pr-4 border-b border-border bg-background shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-12 w-12 rounded-none hover:bg-accent border-r border-border">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText className="w-4 h-4 text-muted-foreground" />
          {isEditing && activeFile ? (
            <Input
              ref={renameInputRef}
              autoFocus
              className="h-6 text-sm py-0 px-1 w-48 bg-background border-border"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setEditName(displayFileName);
                  setIsEditing(false);
                }
              }}
            />
          ) : (
            <span className={activeFile && isMarkdownFile ? "cursor-pointer hover:bg-accent/50 px-1 rounded" : ""} onClick={() => activeFile && isMarkdownFile && setIsEditing(true)}>
              {displayFileName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-8 text-xs bg-muted/50 hover:bg-muted"
          onClick={handleGitSync}
          disabled={gitStatus !== "idle" && gitStatus !== "success" && gitStatus !== "error"}
        >
          <Send className={`w-3.5 h-3.5 ${gitStatus !== "idle" && gitStatus !== "success" && gitStatus !== "error" ? "animate-pulse text-blue-500" : ""}`} />
          {getSyncLabel()}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-8 w-8 cursor-pointer">
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Git 仓库
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLocalStoreOpen(true)}>
              <FolderOpen className="w-4 h-4 mr-2" />
              本地仓库
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={isSyncPreviewOpen} onOpenChange={(open) => open && setIsSyncPreviewOpen(true)}>
        <DialogContent className="sm:max-w-[560px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>同步前确认</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-3">
            {syncPreviewReport?.decisionRequired && (
              <div className="space-y-3 rounded-md border border-amber-400/40 bg-amber-50/40 dark:bg-amber-500/10 p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">检测到已追踪文件删除风险，请先确认策略。</p>
                {previewRemoteMissingTracked.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">远程缺少</p>
                    <PathTreePanel paths={previewRemoteMissingTracked} />
                    <div className="rounded-md border border-border p-2">
                      <RadioGroup
                        className="grid grid-cols-2 gap-2"
                        value={syncDecisions.remoteMissingTrackedAction}
                        onValueChange={(value) =>
                          setSyncDecisions((prev) => ({
                            ...prev,
                            remoteMissingTrackedAction: value as GitSyncDecisions["remoteMissingTrackedAction"],
                          }))
                        }
                      >
                        <label className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-2 text-sm cursor-pointer">
                          <RadioGroupItem value="keep_local" />
                          <span>保留本地并回推远程</span>
                        </label>
                        <label className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-2 text-sm cursor-pointer">
                          <RadioGroupItem value="apply_remote_delete" />
                          <span>同步远程删除到本地</span>
                        </label>
                      </RadioGroup>
                    </div>
                  </div>
                )}
                {previewLocalMissingTracked.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">本地缺少</p>
                    <PathTreePanel paths={previewLocalMissingTracked} />
                    <div className="rounded-md border border-border p-2">
                      <RadioGroup
                        className="grid grid-cols-2 gap-2"
                        value={syncDecisions.localMissingTrackedAction}
                        onValueChange={(value) =>
                          setSyncDecisions((prev) => ({
                            ...prev,
                            localMissingTrackedAction: value as GitSyncDecisions["localMissingTrackedAction"],
                          }))
                        }
                      >
                        <label className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer">
                          <RadioGroupItem value="restore_local" />
                          <span>从远程恢复到本地</span>
                        </label>
                        <label className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer">
                          <RadioGroupItem value="apply_local_delete" />
                          <span>同步本地删除到远程</span>
                        </label>
                      </RadioGroup>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsSyncPreviewOpen(false)}>
              取消
            </Button>
            <Button onClick={handleConfirmSync} disabled={isConfirmingSync}>
              {isConfirmingSync ? "同步中..." : "确认同步"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
