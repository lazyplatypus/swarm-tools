import { useState } from 'react';

/**
 * Cell data structure matching swarm-mail hive schema
 */
export interface Cell {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'blocked' | 'closed';
  priority: number;
  issue_type: 'epic' | 'task' | 'bug' | 'chore' | 'feature';
  parent_id?: string;
  children?: Cell[];
}

interface CellNodeProps {
  cell: Cell;
  depth?: number;
  isSelected?: boolean;
  onSelect?: (cellId: string) => void;
}

/**
 * Status icon mapping with Unicode symbols
 */
const STATUS_ICONS: Record<Cell['status'], string> = {
  open: '○',
  in_progress: '◐',
  closed: '●',
  blocked: '⊘',
};

/**
 * Status colors using Catppuccin palette
 */
const STATUS_COLORS: Record<Cell['status'], string> = {
  open: 'var(--foreground1)',
  in_progress: 'var(--yellow, #f9e2af)',
  closed: 'var(--green, #a6e3a1)',
  blocked: 'var(--red, #f38ba8)',
};

/**
 * Priority badge component with Catppuccin colors
 */
const PriorityBadge = ({ priority }: { priority: number }) => {
  const colors: Record<number, { bg: string; text: string }> = {
    0: { bg: 'var(--red, #f38ba8)', text: 'var(--base, #1e1e2e)' },
    1: { bg: 'var(--peach, #fab387)', text: 'var(--base, #1e1e2e)' },
    2: { bg: 'var(--yellow, #f9e2af)', text: 'var(--base, #1e1e2e)' },
    3: { bg: 'var(--surface2, #585b70)', text: 'var(--text, #cdd6f4)' },
  };

  const color = colors[priority] || colors[3];

  return (
    <span
      style={{
        padding: '0.125rem 0.375rem',
        borderRadius: '0.25rem',
        fontSize: '0.75rem',
        fontWeight: 500,
        backgroundColor: color.bg,
        color: color.text,
      }}
    >
      P{priority}
    </span>
  );
};

/**
 * Issue type badge with subtle styling
 */
const TypeBadge = ({ type }: { type: Cell['issue_type'] }) => {
  return (
    <span
      style={{
        fontSize: '0.625rem',
        color: 'var(--foreground2)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {type}
    </span>
  );
};

/**
 * Recursive tree node component for displaying cells
 */
export const CellNode = ({ cell, depth = 0, isSelected = false, onSelect }: CellNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = cell.children && cell.children.length > 0;
  const isEpic = cell.issue_type === 'epic';

  const handleClick = () => {
    if (onSelect) {
      onSelect(cell.id);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      {/* Node row */}
      <button
        type="button"
        onClick={handleClick}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          paddingLeft: `${depth * 1.25 + 0.75}rem`,
          cursor: 'pointer',
          backgroundColor: isSelected ? 'var(--surface1, #45475a)' : 'transparent',
          border: 'none',
          textAlign: 'left',
          transition: 'background-color 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'var(--surface0, #313244)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* Expand/collapse chevron for epics */}
        {isEpic && hasChildren ? (
          <button
            type="button"
            onClick={handleToggle}
            style={{
              width: '1rem',
              height: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--foreground2)',
              padding: 0,
              fontSize: '0.75rem',
              transition: 'transform 0.15s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            }}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            ▶
          </button>
        ) : (
          <span style={{ width: '1rem' }} />
        )}

        {/* Status icon */}
        <span
          style={{
            fontSize: '1rem',
            lineHeight: 1,
            color: STATUS_COLORS[cell.status],
          }}
          title={cell.status}
        >
          {STATUS_ICONS[cell.status]}
        </span>

        {/* Cell title */}
        <span
          style={{
            flex: 1,
            fontSize: '0.875rem',
            fontWeight: isEpic ? 600 : 400,
            color: 'var(--foreground0)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cell.title}
        </span>

        {/* Priority badge */}
        <PriorityBadge priority={cell.priority} />

        {/* Issue type badge */}
        <TypeBadge type={cell.issue_type} />
      </button>

      {/* Children (recursive) */}
      {isEpic && hasChildren && isExpanded && cell.children && (
        <div>
          {cell.children.map((child) => (
            <CellNode
              key={child.id}
              cell={child}
              depth={depth + 1}
              isSelected={isSelected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};
