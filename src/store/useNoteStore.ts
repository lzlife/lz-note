import { create } from 'zustand';
import type { GitSyncPhase } from '@/lib/gitSync';
import type { GitSyncReport } from '@/lib/gitSync';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileNode[];
}

interface NoteState {
  workspace: string;
  fileTree: FileNode[];
  activeFile: string | null;
  fileContent: string;
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isLocalStoreOpen: boolean;
  gitStatus: GitSyncPhase;
  pendingSyncPreviewReport: GitSyncReport | null;
  fileTreeFilter: string;
  isFileTreeLoading: boolean;
  fileTreeRefreshTimer: number | null;
  setWorkspace: (workspace: string) => void;
  setFileTree: (tree: FileNode[]) => void;
  setActiveFile: (path: string | null, content?: string) => void;
  setFileContent: (content: string) => void;
  toggleSidebar: () => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setLocalStoreOpen: (isOpen: boolean) => void;
  setGitStatus: (status: GitSyncPhase) => void;
  setPendingSyncPreviewReport: (report: GitSyncReport | null) => void;
  setFileTreeFilter: (keyword: string) => void;
  setFileTreeLoading: (isLoading: boolean) => void;
  refreshFileTree: () => void;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  workspace: '',
  fileTree: [],
  activeFile: null,
  fileContent: '',
  isSidebarOpen: true,
  isSettingsOpen: false,
  isLocalStoreOpen: false,
  gitStatus: 'idle',
  pendingSyncPreviewReport: null,
  fileTreeFilter: '',
  isFileTreeLoading: false,
  fileTreeRefreshTimer: null,
  
  setWorkspace: (workspace) => set({ workspace }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setActiveFile: (path, content = '') => set({ activeFile: path, fileContent: content }),
  setFileContent: (content) => set({ fileContent: content }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setLocalStoreOpen: (isOpen) => set({ isLocalStoreOpen: isOpen }),
  setGitStatus: (status) => set({ gitStatus: status }),
  setPendingSyncPreviewReport: (report) => set({ pendingSyncPreviewReport: report }),
  setFileTreeFilter: (keyword) => set({ fileTreeFilter: keyword }),
  setFileTreeLoading: (isLoading) => set({ isFileTreeLoading: isLoading }),
  
  refreshFileTree: () => {
    const { workspace, fileTreeRefreshTimer } = get();
    if (workspace && window.services) {
      if (fileTreeRefreshTimer) {
        window.clearTimeout(fileTreeRefreshTimer);
      }
      const nextTimer = window.setTimeout(() => {
        set({ isFileTreeLoading: true });
        const tree = window.services.readDir(workspace);
        set({ fileTree: tree || [], isFileTreeLoading: false, fileTreeRefreshTimer: null });
      }, 80);
      set({ fileTreeRefreshTimer: nextTimer });
    }
  }
}));
