export interface EditorDraft {
  path: string;
  content: string;
  updatedAt: number;
}

const DRAFT_KEY_PREFIX = 'lz-note:draft:';

function getDraftKey(path: string): string {
  return `${DRAFT_KEY_PREFIX}${path}`;
}

export function saveEditorDraft(path: string, content: string): void {
  try {
    const payload: EditorDraft = {
      path,
      content,
      updatedAt: Date.now()
    };
    localStorage.setItem(getDraftKey(path), JSON.stringify(payload));
  } catch {
    // 忽略草稿缓存失败，避免影响主流程
  }
}

export function readEditorDraft(path: string): EditorDraft | null {
  try {
    const raw = localStorage.getItem(getDraftKey(path));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<EditorDraft>;
    if (
      typeof parsed.path !== 'string' ||
      typeof parsed.content !== 'string' ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null;
    }
    return {
      path: parsed.path,
      content: parsed.content,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return null;
  }
}

export function removeEditorDraft(path: string): void {
  try {
    localStorage.removeItem(getDraftKey(path));
  } catch {
    // 忽略草稿删除失败，避免影响主流程
  }
}

function isDraftKeyOfPath(key: string, path: string): boolean {
  const exactKey = getDraftKey(path);
  if (key === exactKey) {
    return true;
  }
  const slashPrefix = `${exactKey}/`;
  const backslashPrefix = `${exactKey}\\`;
  return key.startsWith(slashPrefix) || key.startsWith(backslashPrefix);
}

export function removeEditorDraftByPath(path: string): void {
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_KEY_PREFIX)) {
        continue;
      }
      if (isDraftKeyOfPath(key, path)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => localStorage.removeItem(key));
  } catch {
    // 忽略批量删除草稿失败，避免影响主流程
  }
}
