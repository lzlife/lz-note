/// <reference types="vite/client" />

declare global {
  interface NoteEditorStartRenameDetail {
    path: string;
  }

  interface WindowEventMap {
    'note-editor-before-switch': Event;
    'note-editor-start-rename': CustomEvent<NoteEditorStartRenameDetail>;
  }

  interface Window {
    ztools: any;
    services: {
      getWorkspace: () => string;
      readDir: (dirPath: string) => any;
      readFile: (filePath: string) => string;
      writeFile: (filePath: string, content: string) => string;
      writeFileBase64: (filePath: string, base64: string) => string;
      copy: (src: string, dest: string) => boolean;
      mkdir: (dirPath: string) => string;
      rename: (oldPath: string, newPath: string) => string;
      unlink: (filePath: string) => boolean;
      rmdir: (dirPath: string) => boolean;
      exists: (filePath: string) => boolean;
      joinPath: (...paths: string[]) => string;
      basename: (filePath: string) => string;
      dirname: (filePath: string) => string;
      extname: (filePath: string) => string;
      getLogFilePath: () => string;
      readLogFile: () => string;
      exportHtmlToPdf: (
        html: string,
        outputPath: string,
        options?: {
          width?: number;
          height?: number;
          format?: string;
          printBackground?: boolean;
          marginTop?: string;
          marginRight?: string;
          marginBottom?: string;
          marginLeft?: string;
        }
      ) => Promise<string>;
      exportHtmlToImage: (
        html: string,
        outputPath: string,
        options?: {
          width?: number;
          height?: number;
          deviceScaleFactor?: number;
          quality?: number;
          fullPage?: boolean;
        }
      ) => Promise<string>;
      gitClone: (url: string, dir: string, token: string, username?: string, branch?: string) => Promise<boolean>;
      gitPrepareWorkspaceForSync: (
        dir: string,
        url: string,
        token: string,
        branch?: string
      ) => Promise<{
        remoteMissingTracked: string[];
        localMissingTracked: string[];
        bootstrapped: boolean;
      }>;
      gitPull: (
        dir: string,
        url: string,
        token: string,
        branch?: string,
        decisions?: {
          remoteMissingTrackedAction: 'keep_local' | 'apply_remote_delete';
          localMissingTrackedAction: 'restore_local' | 'apply_local_delete';
        }
      ) => Promise<boolean>;
      gitAdd: (dir: string, filepath: string) => Promise<boolean>;
      gitAddAll: (dir: string) => Promise<boolean>;
      gitCommit: (dir: string, message: string, name?: string, email?: string) => Promise<boolean>;
      gitPush: (dir: string, token: string, branch?: string) => Promise<boolean>;
      gitStatus: (dir: string) => Promise<any>;
    };
  }
}

export {}
