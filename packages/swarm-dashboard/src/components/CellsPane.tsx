import { useState, useEffect } from 'react';
import { CellNode, type Cell } from './CellNode';
import { getCells } from '../lib/api';

interface CellsPaneProps {
  onCellSelect?: (cellId: string) => void;
  /** Base URL for API calls (default: http://localhost:4483 - HIVE on phone keypad) */
  apiBaseUrl?: string;
}

/**
 * Cells pane component displaying epic/subtask hierarchy
 * 
 * Features:
 * - Tree view with expandable epics
 * - Status icons (○ open, ◐ in_progress, ● closed, ⊘ blocked)
 * - Priority badges (P0-P3) with Catppuccin colors
 * - Cell selection with highlight
 * - Real-time data from swarm-mail hive database
 * - Auto-refresh every 5 seconds
 */
export const CellsPane = ({ onCellSelect, apiBaseUrl = "http://localhost:4483" }: CellsPaneProps) => {
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch cells on mount and every 5 seconds
  useEffect(() => {
    const fetchCells = async () => {
      try {
        const fetchedCells = await getCells(apiBaseUrl);
        setCells(fetchedCells);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch cells");
      } finally {
        setLoading(false);
      }
    };

    fetchCells();
    const intervalId = setInterval(fetchCells, 5000);
    return () => clearInterval(intervalId);
  }, [apiBaseUrl]);

  const handleSelect = (cellId: string) => {
    setSelectedCellId(cellId);
    if (onCellSelect) {
      onCellSelect(cellId);
    }
  };

  const openCellsCount = cells.reduce((count, cell) => {
    const cellCount = cell.status === 'open' ? 1 : 0;
    const childrenCount = cell.children?.filter(c => c.status === 'open').length || 0;
    return count + cellCount + childrenCount;
  }, 0);

  const totalCellsCount = cells.reduce((count, cell) => {
    return count + 1 + (cell.children?.length || 0);
  }, 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--background1)',
        borderRadius: '0.5rem',
        border: '1px solid var(--surface0, #313244)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--surface0, #313244)',
        }}
      >
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'var(--foreground0)',
            margin: 0,
          }}
        >
          Cells
        </h2>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--foreground2)',
            margin: '0.25rem 0 0',
          }}
        >
          {loading ? "Loading..." : `${totalCellsCount} cells · ${openCellsCount} open`}
        </p>
        {error && (
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--red, #f38ba8)',
              margin: '0.25rem 0 0',
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Tree view */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--foreground2)',
            }}
          >
            Loading cells...
          </div>
        ) : cells.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--foreground2)',
            }}
          >
            No cells found
          </div>
        ) : (
          <div style={{ padding: '0.25rem 0' }}>
            {cells.map((cell) => (
              <CellNode
                key={cell.id}
                cell={cell}
                isSelected={selectedCellId === cell.id}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer with legend */}
      <div
        style={{
          padding: '0.5rem 1rem',
          borderTop: '1px solid var(--surface0, #313244)',
          backgroundColor: 'var(--surface0, #313244)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            fontSize: '0.75rem',
            color: 'var(--foreground2)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: 'var(--foreground1)' }}>○</span> Open
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: 'var(--yellow, #f9e2af)' }}>◐</span> In Progress
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: 'var(--green, #a6e3a1)' }}>●</span> Closed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ color: 'var(--red, #f38ba8)' }}>⊘</span> Blocked
          </span>
        </div>
      </div>
    </div>
  );
};
