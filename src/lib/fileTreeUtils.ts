import type { FileNode } from '@/store/useNoteStore';

export function filterFileTreeByName(nodes: FileNode[], keyword: string): FileNode[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) {
    return nodes;
  }
  return nodes.reduce<FileNode[]>((result, node) => {
    const selfMatched = node.name.toLowerCase().includes(normalizedKeyword);
    const filteredChildren = node.children?.length ? filterFileTreeByName(node.children, normalizedKeyword) : [];
    if (!selfMatched && filteredChildren.length === 0) {
      return result;
    }
    result.push({
      ...node,
      children: selfMatched ? node.children : filteredChildren
    });
    return result;
  }, []);
}

export function collectDirectoryPaths(nodes: FileNode[]): string[] {
  return nodes.reduce<string[]>((paths, item) => {
    if (item.isDirectory) {
      paths.push(item.path);
      if (item.children?.length) {
        paths.push(...collectDirectoryPaths(item.children));
      }
    }
    return paths;
  }, []);
}
