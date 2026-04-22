import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getUniquePath(dir: string, baseName: string, isDir: boolean): string {
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
  
  let finalPath = window.services.joinPath(dir, name + ext);
  let counter = 2;
  while (window.services.exists(finalPath)) {
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
