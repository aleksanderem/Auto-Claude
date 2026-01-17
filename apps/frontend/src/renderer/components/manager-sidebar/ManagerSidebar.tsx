/**
 * Manager Sidebar Component
 *
 * Right-side panel containing a chat interface with Project Manager.
 * Powered by Claude Opus 4.5 with comprehensive Auto-Claude knowledge.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Users, GripVertical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ManagerChat } from './ManagerChat';
import { useManagerStore } from '../../stores/manager-store';

// Minimum and maximum sidebar widths
const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 400;

export interface ManagerSidebarProps {
  projectPath: string;
  projectId: string;
  onClose: () => void;
  width?: number;
  onWidthChange?: (width: number) => void;
}

export function ManagerSidebar({
  projectPath,
  projectId,
  onClose,
  width = DEFAULT_WIDTH,
  onWidthChange,
}: ManagerSidebarProps) {
  const { t } = useTranslation(['common']);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Get manager status for indicator
  const status = useManagerStore((state) => state.status);
  const isBusy = status.phase === 'thinking' || status.phase === 'streaming';

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = width;
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStartWidth.current + delta));
      onWidthChange?.(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  return (
    <div
      className="relative flex flex-col h-full border-l border-border bg-sidebar"
      style={{ width: `${width}px`, minWidth: `${MIN_WIDTH}px`, maxWidth: `${MAX_WIDTH}px` }}
    >
      {/* Resize handle - wider hit area for easier grabbing */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/50 transition-colors z-20 group',
          isResizing && 'bg-primary/50'
        )}
        onMouseDown={handleResizeStart}
      >
        {/* Visual indicator */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-1 rounded bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('manager.title', 'Project Manager')}</span>
          {/* Status indicator */}
          <div
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              isBusy ? 'bg-amber-500 animate-pulse' : 'bg-green-500'
            )}
            title={isBusy ? t('manager.status.busy', 'Processing') : t('manager.status.idle', 'Idle')}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClose}
          title={t('common:buttons.close', 'Close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Chat content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ManagerChat
          projectId={projectId}
          projectPath={projectPath}
        />
      </div>
    </div>
  );
}
