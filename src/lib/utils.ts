import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getUniquePath(dir: string, baseName: string, isDir: boolean, ignorePath?: string): string {
  let name = baseName;
  let ext = '';

  if (!isDir) {
    const dotIdx = baseName.lastIndexOf('.');
    if (dotIdx > -1) {
      name = baseName.substring(0, dotIdx);
      ext = baseName.substring(dotIdx);
    } else {
      ext = '.md';
    }
  }

  // Windows 文件系统大小写不敏感，重命名时仅大小写不同的目标名会被 exists 误判为已存在。
  // 传入自身旧路径，命中时视为不冲突，从而允许纯大小写重命名。
  const isSamePath = (candidate: string, target?: string) =>
    !!target && candidate.toLowerCase() === target.toLowerCase();

  let finalPath = window.services.joinPath(dir, name + ext);
  let counter = 2;
  while (window.services.exists(finalPath) && !isSamePath(finalPath, ignorePath)) {
    finalPath = window.services.joinPath(dir, `${name}(${counter})${ext}`);
    counter++;
  }
  return finalPath;
}

export function getNextIndexedName(existingNames: string[], baseName: string): string {
  const normalized = new Set(existingNames.map((item) => item.trim()));
  if (!normalized.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  while (normalized.has(`${baseName}(${counter})`)) {
    counter++;
  }
  return `${baseName}(${counter})`;
}
