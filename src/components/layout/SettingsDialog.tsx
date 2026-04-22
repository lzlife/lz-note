import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useNoteStore } from "@/store/useNoteStore"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Save, Eye, EyeOff, ClipboardCopy, ChevronDown } from "lucide-react"
import { readStorageValue, writeStorageValue } from "@/lib/storage"

export function SettingsDialog() {
  const { isSettingsOpen, setSettingsOpen, workspace, refreshFileTree } = useNoteStore()
  const [gitUrl, setGitUrl] = useState("")
  const [gitToken, setGitToken] = useState("")
  const [gitBranch, setGitBranch] = useState("main")
  const [gitSyncStrategy, setGitSyncStrategy] = useState("full_sync")
  const [showToken, setShowToken] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const syncStrategyOptions = [
    { value: "full_sync", label: "启动自动同步（拉取并推送）" },
    { value: "pull_only", label: "启动仅拉取（不推送）" },
    { value: "manual_only", label: "仅手动同步（启动不自动同步）" }
  ]

  const selectedStrategyLabel = syncStrategyOptions.find(item => item.value === gitSyncStrategy)?.label || syncStrategyOptions[0].label

  useEffect(() => {
    let mounted = true
    const loadSettings = async () => {
      if (!isSettingsOpen) return
      try {
        const [url, token] = await Promise.all([
          readStorageValue('gitUrl'),
          readStorageValue('gitToken')
        ])
        const branch = await readStorageValue('gitBranch')
        const strategy = await readStorageValue('gitSyncStrategy')
        if (mounted) {
          setGitUrl(url)
          setGitToken(token)
          setGitBranch(branch || 'main')
          setGitSyncStrategy(strategy || 'full_sync')
        }
      } catch (err) {
        if (mounted) {
          toast.error(`读取设置失败: ${(err as Error).message}`)
        }
      }
    }
    loadSettings()

    return () => {
      mounted = false
    }
  }, [isSettingsOpen])

  const validateConfig = () => {
    const hasAnyGitConfig = !!gitUrl.trim() || !!gitToken.trim()
    if (!hasAnyGitConfig) {
      return ''
    }
    if (!gitUrl.trim() || !gitToken.trim()) {
      return 'Git 仓库 URL 和 Token 需要同时填写'
    }
    if (!/^https:\/\//i.test(gitUrl.trim())) {
      return 'Git 仓库 URL 必须为 HTTPS 地址'
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(gitBranch.trim())) {
      return '分支名称格式不合法，请仅使用字母、数字、点、下划线、短横线和斜杠'
    }
    if (gitToken.trim().length < 8) {
      return 'Token 长度过短，请检查是否填写正确'
    }
    return ''
  }

  const handleCopyLogPath = async () => {
    try {
      const path = window.services.getLogFilePath()
      await navigator.clipboard.writeText(path)
      toast.success(`日志路径已复制：${path}`)
    } catch (err) {
      toast.error(`复制日志路径失败: ${(err as Error).message}`)
    }
  }

  const handleSave = async () => {
    const normalizedGitUrl = gitUrl.trim()
    const normalizedGitToken = gitToken.trim()
    const normalizedGitBranch = gitBranch.trim() || 'main'
    const error = validateConfig()
    if (error) {
      toast.error(error)
      return
    }

    setIsLoading(true)
    try {
      await writeStorageValue('gitUrl', normalizedGitUrl)
      await writeStorageValue('gitToken', normalizedGitToken)
      await writeStorageValue('gitBranch', normalizedGitBranch)
      await writeStorageValue('gitSyncStrategy', gitSyncStrategy || 'full_sync')

      if (normalizedGitUrl && normalizedGitToken) {
        const tree = window.services.readDir(workspace);
        if (!tree || tree.length === 0) {
          await window.services.gitClone(normalizedGitUrl, workspace, normalizedGitToken, undefined, normalizedGitBranch);
          toast.success("成功克隆仓库");
          refreshFileTree();
        } else {
          toast.success("设置已保存");
        }
      } else {
        toast.success("设置已保存");
      }
      setSettingsOpen(false)
    } catch (err) {
      toast.error(`保存失败: ${(err as Error).message}`);
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Git 仓库设置</DialogTitle>
          <DialogDescription>
            配置你的 Git 仓库信息以便同步笔记内容。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Git 仓库 URL</label>
            <Input 
              value={gitUrl} 
              onChange={e => setGitUrl(e.target.value)} 
              placeholder="https://github.com/user/notes.git" 
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Access Token</label>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                value={gitToken}
                onChange={e => setGitToken(e.target.value)}
                placeholder="ghp_..."
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? "隐藏 Token" : "显示 Token"}
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">分支名称</label>
            <Input
              value={gitBranch}
              onChange={e => setGitBranch(e.target.value)}
              placeholder="main"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">启动同步策略</label>
            <DropdownMenu>
              <DropdownMenuTrigger className="h-9 w-full justify-between rounded-md border border-input bg-background px-3 text-sm font-normal hover:bg-accent/50">
                <span className="truncate text-left">{selectedStrategyLabel}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[360px]">
                {syncStrategyOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setGitSyncStrategy(option.value)}
                    className={gitSyncStrategy === option.value ? "bg-accent" : ""}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">日志文件</label>
            <div className="flex items-center gap-2">
              <Input value={window.services.getLogFilePath()} readOnly />
              <Button type="button" variant="outline" size="icon" onClick={handleCopyLogPath} title="复制日志路径">
                <ClipboardCopy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={isLoading} 
            variant="outline"
            className="gap-2 bg-muted/50 hover:bg-muted"
          >
            <Save className={`w-4 h-4 ${isLoading ? 'animate-pulse' : ''}`} />
            {isLoading ? "保存并克隆中..." : "保存设置"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
