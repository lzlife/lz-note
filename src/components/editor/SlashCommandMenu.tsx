import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";

export interface SlashCommand {
  label: string;
  description: string;
  icon: string;
  value: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: "标题2", description: "二级标题", icon: "H2", value: "## " },
  { label: "标题3", description: "三级标题", icon: "H3", value: "### " },
  { label: "标题4", description: "四级标题", icon: "H4", value: "#### " },
  { label: "标题5", description: "五级标题", icon: "H5", value: "##### " },
  { label: "标题6", description: "六级标题", icon: "H6", value: "###### " },
  { label: "行内代码", description: "行内代码", icon: "<>", value: "`代码`" },
  { label: "代码块", description: "多行代码", icon: "{}", value: "```\n\n```" },
  { label: "引用", description: "引用块", icon: ">", value: "> " },
  { label: "无序列表", description: "无序列表项", icon: "•", value: "- " },
  { label: "有序列表", description: "有序列表项", icon: "1.", value: "1. " },
  { label: "任务列表", description: "待办事项", icon: "☐", value: "- [ ] " },
  { label: "链接", description: "插入链接", icon: "🔗", value: "[链接](url)" },
  {
    label: "表格",
    description: "插入表格",
    icon: "▦",
    value: "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |",
  },
];

export { SLASH_COMMANDS };

interface SlashCommandMenuProps {
  visible: boolean;
  filter: string;
  position: { top: number; left: number };
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SlashCommandMenu({
  visible,
  filter,
  position,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [adjustedPos, setAdjustedPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? SLASH_COMMANDS.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(filter.toLowerCase()) ||
          cmd.description.toLowerCase().includes(filter.toLowerCase()),
      )
    : SLASH_COMMANDS;

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    if (!visible || filtered.length === 0) return;
    const menu = menuRef.current;
    if (!menu) return;
    const selected = menu.children[selectedIndex] as HTMLElement;
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, visible, filtered.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;
      if (filtered.length === 0) {
        if (e.key === "Escape") onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[selectedIndex].value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [visible, filtered, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!visible) return;
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [visible, handleKeyDown]);

  // 弹窗渲染后检测边界，确保不超出视口
  useLayoutEffect(() => {
    if (!visible || !menuRef.current) {
      setAdjustedPos(null);
      return;
    }
    const menuHeight = menuRef.current.offsetHeight;
    const menuWidth = menuRef.current.offsetWidth;
    const gap = 4;

    let top = position.top;
    let left = position.left;

    // 下方空间不足则上移
    if (top + menuHeight > window.innerHeight - gap) {
      top = Math.max(gap, window.innerHeight - menuHeight - gap);
    }
    // 右侧空间不足则左移
    if (left + menuWidth > window.innerWidth - gap) {
      left = Math.max(gap, window.innerWidth - menuWidth - gap);
    }

    setAdjustedPos({ top, left });
  }, [visible, position, filtered.length]);

  // 点击外部关闭弹窗
  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [visible, onClose]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{
        position: "fixed",
        top: adjustedPos?.top ?? position.top,
        left: adjustedPos?.left ?? position.left,
        zIndex: 100,
      }}
    >
      {filtered.map((cmd, i) => (
        <div
          key={cmd.label}
          className={`slash-command-item ${i === selectedIndex ? "slash-command-item--active" : ""}`}
        >
          <span className="slash-command-icon">{cmd.icon}</span>
          <div className="slash-command-text">
            <span className="slash-command-label">{cmd.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
