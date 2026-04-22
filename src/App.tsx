import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react';
import { useNoteStore } from './store/useNoteStore';
import { Sidebar } from './components/layout/Sidebar';
import { EditorTopBar } from './components/layout/EditorTopBar';
import { MainEditor } from './components/editor/MainEditor';
import { SettingsDialog } from './components/layout/SettingsDialog';
import { LocalStoreDialog } from './components/layout/LocalStoreDialog';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { runGitSync } from '@/lib/gitSync';
import { readStorageValue } from '@/lib/storage';
import { loadGitSyncConfigFromStorage } from '@/lib/gitConfig';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = {
    hasError: false,
    message: ''
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || '页面发生未知错误' };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
          <div className="max-w-lg rounded-lg border border-border bg-card p-6">
            <p className="text-base font-medium">页面出现异常</p>
            <p className="mt-2 text-sm text-muted-foreground break-all">{this.state.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const { setWorkspace, refreshFileTree, isSidebarOpen, setPendingSyncPreviewReport, setFileTreeFilter } = useNoteStore();

  useEffect(() => {
    const init = async () => {
      if (window.services && window.ztools) {
        try {
          const customPath = await readStorageValue('localWorkspacePath');
          const workspace = customPath || window.services.getWorkspace();
          setWorkspace(workspace);
          refreshFileTree();

          const { config: gitConfig, isConfigured } = await loadGitSyncConfigFromStorage();

          // 仅在已配置 Git 仓库时执行开机自动同步，防止本地视图与远程不一致
          if (isConfigured) {
            if (gitConfig.strategy === 'manual_only') {
              return;
            }
            try {
              const precheckResult = await runGitSync({
                workspace,
                mode: 'startup',
                config: gitConfig,
                precheckOnly: true,
                refreshFileTree,
                setPhase: (phase) => useNoteStore.setState({ gitStatus: phase })
              });
              if (!precheckResult.ok && precheckResult.error) {
                toast.error(`自动同步失败: ${precheckResult.error.message}`);
                useNoteStore.setState({ gitStatus: 'error' });
                setTimeout(() => useNoteStore.setState({ gitStatus: 'idle' }), 3000);
                return;
              }
              if (precheckResult.requiresDecision) {
                setPendingSyncPreviewReport(precheckResult.report);
                useNoteStore.setState({ gitStatus: 'confirm' });
                return;
              }

              const result = await runGitSync({
                workspace,
                mode: 'startup',
                config: gitConfig,
                refreshFileTree,
                setPhase: (phase) => useNoteStore.setState({ gitStatus: phase })
              });
              if (!result.ok && result.error) {
                toast.error(`自动同步失败: ${result.error.message}`);
                useNoteStore.setState({ gitStatus: 'error' });
              } else {
                useNoteStore.setState({ gitStatus: 'success' });
              }
              setTimeout(() => useNoteStore.setState({ gitStatus: 'idle' }), 3000);
            } catch (syncErr) {
              toast.error(`自动同步失败: ${(syncErr as Error).message}`);
            }
          }
        } catch (err) {
          toast.error(`初始化失败: ${(err as Error).message}`);
        }
      } else {
        setTimeout(init, 100);
      }
    };
    init();
  }, [setWorkspace, refreshFileTree, setPendingSyncPreviewReport]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.error?.message || event.message || '未知错误';
      toast.error(`运行时错误: ${message}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || '未知错误');
      toast.error(`异步错误: ${reason}`);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  useEffect(() => {
    if (!window.ztools?.setSubInput) {
      return;
    }
    const handleSubInputChange = (payload: unknown) => {
      // 兼容不同宿主版本的回调参数，统一提取为字符串
      const rawText = typeof payload === 'string'
        ? payload
        : typeof payload === 'object' && payload !== null && 'text' in payload
          ? String((payload as { text: unknown }).text ?? '')
          : String(payload ?? '');
      setFileTreeFilter(rawText.trim());
    };
    window.ztools.setSubInput(handleSubInputChange, '搜索文件或文件夹', false);
    return () => {
      setFileTreeFilter('');
      if (window.ztools?.setSubInput) {
        window.ztools.setSubInput(() => {}, '', false);
      }
    };
  }, [setFileTreeFilter]);

  return (
    <>
      <AppErrorBoundary>
        <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex">
          {isSidebarOpen && (
            <div className="w-64 shrink-0 h-full border-r border-border flex flex-col bg-background">
              <Sidebar />
            </div>
          )}
          <div className="flex-1 flex flex-col min-w-0 h-full relative">
            <EditorTopBar />
            <MainEditor />
          </div>
          
          <SettingsDialog />
          <LocalStoreDialog />
        </div>
      </AppErrorBoundary>
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
