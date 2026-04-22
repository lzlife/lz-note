import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useNoteStore } from "@/store/useNoteStore"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FolderOpen } from "lucide-react"

export function LocalStoreDialog() {
  const { isLocalStoreOpen, setLocalStoreOpen, workspace, setWorkspace, refreshFileTree } = useNoteStore()
  const [localPath, setLocalPath] = useState(workspace)

  useEffect(() => {
    if (isLocalStoreOpen) {
      setLocalPath(workspace)
    }
  }, [isLocalStoreOpen, workspace])

  const handleSelectFolder = async () => {
    const paths = window.ztools?.showOpenDialog({
      title: '选择本地仓库目录',
      properties: ['openDirectory']
    });
    
    if (paths && paths.length > 0) {
      const newPath = paths[0];
      setLocalPath(newPath);
      
      if (window.ztools?.dbStorage) {
        await window.ztools.dbStorage.setItem('localWorkspacePath', newPath);
      } else {
        localStorage.setItem('localWorkspacePath', newPath);
      }
      
      setWorkspace(newPath);
      refreshFileTree();
      toast.success('本地仓库目录已更新');
      setLocalStoreOpen(false);
    }
  }

  return (
    <Dialog open={isLocalStoreOpen} onOpenChange={setLocalStoreOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>本地仓库设置</DialogTitle>
          <DialogDescription>
            自定义你的笔记本地仓库目录。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex gap-2 items-center">
            <Input 
              value={localPath} 
              readOnly 
              placeholder="默认仓库目录" 
              className="flex-1" 
            />
            <Button 
              onClick={handleSelectFolder} 
              variant="outline" 
              className="gap-2 bg-muted/50 hover:bg-muted shrink-0"
            >
              <FolderOpen className="w-4 h-4" />
              自定义地址
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
