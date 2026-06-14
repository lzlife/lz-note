import {
  Dialog,
  DialogContent,
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
import { Save, Eye, EyeOff, ClipboardCopy, ChevronDown, FolderOpen, Settings } from "lucide-react"
import { readStorageValue, writeStorageValue } from "@/lib/storage"

export function SettingsDialog() {
  const { isSettingsOpen, setSettingsOpen, workspace, setWorkspace, refreshFileTree } = useNoteStore()
  const [activeTab, setActiveTab] = useState<'local' | 'git'>('local')

  const [localPath, setLocalPath] = useState("")
  const [gitUrl, setGitUrl] = useState("")
  const [gitToken, setGitToken] = useState("")
  const [gitBranch, setGitBranch] = useState("main")
  const [gitSyncStrategy, setGitSyncStrategy] = useState("pull_only")
  const [showToken, setShowToken] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const syncStrategyOptions = [
    { value: "pull_only", label: "启动仅拉取（不推送）" },
    { value: "full_sync", label: "启动自动同步（拉取并推送）" },
    { value: "manual_only", label: "仅手动同步（启动不自动同步）" }
  ]

  const selectedStrategyLabel = syncStrategyOptions.find(item => item.value === gitSyncStrategy)?.label || syncStrategyOptions[0].label

  useEffect(() => {
    if (!isSettingsOpen) return
    let mounted = true
    const loadSettings = async () => {
      try {
        const customPath = await readStorageValue('localWorkspacePath')
        const [url, token] = await Promise.all([
          readStorageValue('gitUrl'),
          readStorageValue('gitToken')
        ])
        const branch = await readStorageValue('gitBranch')
        const strategy = await readStorageValue('gitSyncStrategy')
        if (mounted) {
          setLocalPath(customPath || workspace)
          setGitUrl(url)
          setGitToken(token)
          setGitBranch(branch || 'main')
          setGitSyncStrategy(strategy || 'pull_only')
        }
      } catch (err) {
        if (mounted) {
          toast.error(`读取设置失败: ${(err as Error).message}`)
        }
      }
    }
    loadSettings()
    return () => { mounted = false }
  }, [isSettingsOpen, workspace])

  const handleSelectFolder = async () => {
    const paths = window.ztools?.showOpenDialog({
      title: '选择本地仓库目录',
      properties: ['openDirectory']
    })
    if (paths && paths.length > 0) {
      setLocalPath(paths[0])
    }
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

  const validateGitConfig = () => {
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

  const handleSave = async () => {
    const error = validateGitConfig()
    if (error) {
      toast.error(error)
      return
    }
    setIsSaving(true)
    try {
      if (localPath && localPath !== workspace) {
        if (window.ztools?.dbStorage) {
          await window.ztools.dbStorage.setItem('localWorkspacePath', localPath)
        } else {
          localStorage.setItem('localWorkspacePath', localPath)
        }
        setWorkspace(localPath)
        refreshFileTree()
      }

      await writeStorageValue('gitUrl', gitUrl.trim())
      await writeStorageValue('gitToken', gitToken.trim())
      await writeStorageValue('gitBranch', gitBranch.trim() || 'main')
      await writeStorageValue('gitSyncStrategy', gitSyncStrategy || 'pull_only')

      toast.success('设置已保存')
      setSettingsOpen(false)
    } catch (err) {
      toast.error(`保存失败: ${(err as Error).message}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="w-[90vw] h-[90vh] max-w-none sm:max-w-none p-0 flex flex-col gap-0" showCloseButton={false}>
          <div className="shrink-0 flex items-center px-4 h-11 border-b border-border">
            <h2 className="text-sm font-semibold">设置</h2>
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="w-40 shrink-0 border-r border-border overflow-y-auto p-3 flex flex-col gap-1">
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'local' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground'}`}
                onClick={() => setActiveTab('local')}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                本地仓库
              </button>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'git' ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50 text-muted-foreground'}`}
                onClick={() => setActiveTab('git')}
              >
                <Settings className="h-4 w-4 shrink-0" />
                Git 仓库
              </button>
            </div>

            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'local' ? (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">本地仓库设置</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">自定义你的笔记本地仓库目录。</p>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Input value={localPath} readOnly placeholder="默认仓库目录" className="flex-1" />
                      <Button onClick={handleSelectFolder} variant="outline" className="gap-2 bg-muted/50 hover:bg-muted shrink-0">
                        <FolderOpen className="w-4 h-4" />
                        自定义地址
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold">Git 仓库设置</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">配置你的 Git 仓库信息以便同步笔记内容。</p>
                    </div>
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
                        <DropdownMenuTrigger className="inline-flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm font-normal hover:bg-accent/50">
                          <span className="truncate text-left">{selectedStrategyLabel}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-[var(--anchor-width)]">
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
                )}
              </div>

              <div className="shrink-0 flex justify-end gap-2 p-4 border-t border-border">
                <Button variant="outline" onClick={() => setSettingsOpen(false)}>取消</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="w-4 h-4" />
                  {isSaving ? "保存中..." : "保存设置"}
                </Button>
              </div>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  )
}
