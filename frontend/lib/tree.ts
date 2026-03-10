export type NodeType = "folder" | "page";

export interface TreeNode {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null;
  order: number;
  createdAt: number;
  // page-only
  pdfId?: string;      // references server-side PDF id
  content?: string;    // markdown / plain text content
  updatedAt?: number;  // last content or name edit (unix ms)
}

export const TREE_STORAGE_KEY = "lingua-tree";

export function loadTree(): TreeNode[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TREE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TreeNode[]) : [];
  } catch {
    return [];
  }
}

export function saveTree(nodes: TreeNode[]): void {
  localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(nodes));
}

export function getChildren(nodes: TreeNode[], parentId: string | null): TreeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function getDescendantIds(nodes: TreeNode[], id: string): string[] {
  const direct = nodes.filter((n) => n.parentId === id);
  return [id, ...direct.flatMap((c) => getDescendantIds(nodes, c.id))];
}

export function nextOrder(nodes: TreeNode[], parentId: string | null): number {
  const siblings = nodes.filter((n) => n.parentId === parentId);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((n) => n.order)) + 1;
}
