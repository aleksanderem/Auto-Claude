/**
 * Manager Chat Component
 * Chat interface for the Project Manager powered by Claude Opus 4.5
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Loader2,
  User,
  Bot,
  AlertCircle,
  Search,
  FileText,
  FolderSearch,
  Trash2,
  Sparkles,
  X,
  Image as ImageIcon,
  Square
} from 'lucide-react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import {
  useManagerStore,
  sendManagerMessage,
  setupManagerListeners,
  clearManagerChat,
  cancelManagerSession,
  type ManagerMessage
} from '../../stores/manager-store';
import { useImageUpload } from '../task-form/useImageUpload';
import { formatFileSize } from '../ImageUpload';
import type { ImageAttachment } from '../../../shared/types';

// Safe link component for markdown
const createSafeLink = (opensInNewWindowText: string) => {
  return function SafeLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    const isValidUrl = href && (
      href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('/') ||
      href.startsWith('#')
    );

    if (!isValidUrl) {
      return <span className="text-muted-foreground">{children}</span>;
    }

    const isExternal = href?.startsWith('http://') || href?.startsWith('https://');

    return (
      <a
        href={href}
        {...props}
        {...(isExternal && {
          target: '_blank',
          rel: 'noopener noreferrer',
        })}
        className="text-primary hover:underline"
      >
        {children}
        {isExternal && <span className="sr-only"> {opensInNewWindowText}</span>}
      </a>
    );
  };
};

interface ManagerChatProps {
  projectId: string;
  projectPath: string;
}

export function ManagerChat({ projectId, projectPath }: ManagerChatProps) {
  const { t } = useTranslation('common');
  const messages = useManagerStore((state) => state.messages);
  const status = useManagerStore((state) => state.status);
  const streamingContent = useManagerStore((state) => state.streamingContent);
  const currentTool = useManagerStore((state) => state.currentTool);

  const [inputValue, setInputValue] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Image upload hook for paste/drag-drop
  const {
    isDragOver,
    pasteSuccess,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeImage,
    canAddMore
  } = useImageUpload({
    images,
    onImagesChange: setImages,
    disabled: status.phase === 'thinking' || status.phase === 'streaming',
    onError: setImageError
  });

  // Create markdown components
  const markdownComponents = useMemo(() => ({
    a: createSafeLink(t('accessibility.opensInNewWindow', 'opens in new window')),
  }), [t]);

  // Set up listeners on mount
  useEffect(() => {
    const cleanup = setupManagerListeners();
    return cleanup;
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSend = () => {
    const message = inputValue.trim();
    if ((!message && images.length === 0) || status.phase === 'thinking' || status.phase === 'streaming') return;

    const messageToSend = message || 'What do you see in this image?';
    setInputValue('');
    setImages([]);
    setImageError(null);
    sendManagerMessage(projectId, messageToSend, images.length > 0 ? images : undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    clearManagerChat();
  };

  const handleCancel = () => {
    cancelManagerSession(projectId);
  };

  const isLoading = status.phase === 'thinking' || status.phase === 'streaming';

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {messages.length === 0 && !streamingContent ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h3 className="mb-2 text-base font-medium text-foreground">
              Project Manager
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              I can help you break down stories into tasks, research your codebase, and monitor progress.
            </p>
            <div className="flex flex-col gap-2 w-full">
              {[
                'Help me create a new feature',
                'What tasks are in progress?',
                'Research the auth system'
              ].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="text-sm justify-start h-9"
                  onClick={() => {
                    setInputValue(suggestion);
                    textareaRef.current?.focus();
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                markdownComponents={markdownComponents}
              />
            ))}

            {/* Streaming message */}
            {(streamingContent || currentTool) && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {streamingContent && (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {streamingContent}
                      </ReactMarkdown>
                    </div>
                  )}
                  {currentTool && (
                    <ToolIndicator name={currentTool.name} input={currentTool.input} />
                  )}
                </div>
              </div>
            )}

            {/* Thinking indicator */}
            {status.phase === 'thinking' && !streamingContent && !currentTool && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}

            {/* Error message */}
            {status.phase === 'error' && status.error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {status.error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4 space-y-3">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative group rounded-lg border border-border overflow-hidden"
                style={{ width: 56, height: 56 }}
              >
                {image.thumbnail ? (
                  <img
                    src={image.thumbnail}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <button
                  onClick={() => removeImage(image.id)}
                  className="absolute top-0 right-0 p-1 bg-destructive text-destructive-foreground rounded-bl-lg opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Image error */}
        {imageError && (
          <div className="text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4" />
            {imageError}
          </div>
        )}

        {/* Paste success indicator */}
        {pasteSuccess && (
          <div className="text-sm text-green-500 flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4" />
            Image added
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            placeholder={isDragOver ? 'Drop image here...' : 'Ask the Manager... (paste images)'}
            className={cn(
              'min-h-[72px] max-h-[140px] resize-none text-sm rounded-lg',
              isDragOver && 'border-primary bg-primary/5'
            )}
            disabled={isLoading}
          />
          <div className="flex flex-col gap-1.5">
            {isLoading ? (
              <Button
                size="icon"
                variant="destructive"
                className="h-8 w-8"
                onClick={handleCancel}
                title="Stop"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={handleSend}
                disabled={!inputValue.trim() && images.length === 0}
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleClear}
              disabled={messages.length === 0}
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ManagerMessage;
  markdownComponents: Components;
}

function MessageBubble({ message, markdownComponents }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className="flex gap-3">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-muted' : 'bg-primary/10'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        {/* Images in user messages */}
        {isUser && message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((image) => (
              <div
                key={image.id}
                className="rounded-lg border border-border overflow-hidden"
                style={{ maxWidth: 140, maxHeight: 140 }}
              >
                {image.thumbnail ? (
                  <img
                    src={image.thumbnail}
                    alt={image.filename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center bg-muted">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Tool usage */}
        {!isUser && message.toolsUsed && message.toolsUsed.length > 0 && (
          <ToolUsageHistory tools={message.toolsUsed} />
        )}
      </div>
    </div>
  );
}

interface ToolUsageHistoryProps {
  tools: Array<{
    name: string;
    input?: string;
    timestamp: Date;
  }>;
}

function ToolUsageHistory({ tools }: ToolUsageHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  const toolCounts = tools.reduce((acc, tool) => {
    acc[tool.name] = (acc[tool.name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getToolIcon = (toolName: string) => {
    switch (toolName) {
      case 'Read': return FileText;
      case 'Glob': return FolderSearch;
      case 'Grep': return Search;
      default: return FileText;
    }
  };

  const getToolColor = (toolName: string) => {
    switch (toolName) {
      case 'Read': return 'text-blue-500';
      case 'Glob': return 'text-amber-500';
      case 'Grep': return 'text-green-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1">
          {Object.entries(toolCounts).map(([name, count]) => {
            const Icon = getToolIcon(name);
            return (
              <span key={name} className={cn('flex items-center gap-0.5', getToolColor(name))}>
                <Icon className="h-3 w-3" />
                <span>{count}</span>
              </span>
            );
          })}
        </span>
        <span>{tools.length} tool{tools.length !== 1 ? 's' : ''}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-1.5 space-y-1 rounded-lg border border-border bg-muted/30 p-2">
          {tools.map((tool, index) => {
            const Icon = getToolIcon(tool.name);
            return (
              <div key={`${tool.name}-${index}`} className="flex items-center gap-2 text-xs">
                <Icon className={cn('h-3 w-3 shrink-0', getToolColor(tool.name))} />
                <span className="font-medium">{tool.name}</span>
                {tool.input && (
                  <span className="text-muted-foreground truncate max-w-[180px]">{tool.input}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ToolIndicatorProps {
  name: string;
  input?: string;
}

function ToolIndicator({ name, input }: ToolIndicatorProps) {
  const getToolInfo = (toolName: string) => {
    switch (toolName) {
      case 'Read':
        return { icon: FileText, label: 'Reading', color: 'text-blue-500 bg-blue-500/10' };
      case 'Glob':
        return { icon: FolderSearch, label: 'Searching', color: 'text-amber-500 bg-amber-500/10' };
      case 'Grep':
        return { icon: Search, label: 'Searching', color: 'text-green-500 bg-green-500/10' };
      default:
        return { icon: Loader2, label: toolName, color: 'text-primary bg-primary/10' };
    }
  };

  const { icon: Icon, label, color } = getToolInfo(name);

  return (
    <div className={cn('mt-2 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs', color)}>
      <Icon className="h-3.5 w-3.5 animate-pulse" />
      <span className="font-medium">{label}</span>
      {input && <span className="text-muted-foreground truncate max-w-[150px]">{input}</span>}
    </div>
  );
}
