/**
 * SupervisorModeSection
 *
 * Settings section for installing/managing the Supervisor Plugin.
 * The plugin forces Claude Code into supervisor mode, preventing
 * it from implementing tasks directly.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Check, X, Loader2, AlertCircle, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import type { SupervisorPluginStatus } from '../../../shared/types/supervisor';

interface SupervisorModeSectionProps {
  projectPath: string;
}

export function SupervisorModeSection({ projectPath }: SupervisorModeSectionProps) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<SupervisorPluginStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [includeClaudeMd, setIncludeClaudeMd] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load status on mount and when projectPath changes
  const loadStatus = useCallback(async () => {
    if (!projectPath) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getSupervisorStatus(projectPath);
      if (result.success && result.data) {
        setStatus(result.data);
        // If already installed with CLAUDE.md section, keep the checkbox checked
        setIncludeClaudeMd(result.data.claudeMdSectionPresent);
      } else {
        setError(result.error || t('supervisor.errorLoadingStatus'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supervisor.errorLoadingStatus'));
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Handle install
  const handleInstall = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await window.electronAPI.installSupervisor(projectPath, {
        includeClaudeMdSection: includeClaudeMd
      });

      if (result.success) {
        await loadStatus();
      } else {
        setError(result.error || t('supervisor.errorInstalling'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supervisor.errorInstalling'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle uninstall
  const handleUninstall = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await window.electronAPI.uninstallSupervisor(projectPath);

      if (result.success) {
        await loadStatus();
      } else {
        setError(result.error || t('supervisor.errorUninstalling'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supervisor.errorUninstalling'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle CLAUDE.md toggle (only when installed)
  const handleClaudeMdToggle = async (enabled: boolean) => {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await window.electronAPI.updateSupervisorClaudeMd(projectPath, enabled);

      if (result.success) {
        setIncludeClaudeMd(enabled);
        await loadStatus();
      } else {
        setError(result.error || t('supervisor.errorUpdatingClaudeMd'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('supervisor.errorUpdatingClaudeMd'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isInstalled = status?.installed;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-start gap-4">
          <div className={`rounded-full p-2 ${isInstalled ? 'bg-green-500/10' : 'bg-muted'}`}>
            <Shield className={`h-5 w-5 ${isInstalled ? 'text-green-500' : 'text-muted-foreground'}`} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">
                {t('supervisor.title')}
              </h4>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isInstalled
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {isInstalled ? t('supervisor.installed') : t('supervisor.notInstalled')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('supervisor.description')}
            </p>
          </div>
        </div>

        {/* Installation Details */}
        {status && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                {status.hookifyRulesPresent ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={status.hookifyRulesPresent ? 'text-foreground' : 'text-muted-foreground'}>
                  {t('supervisor.hookifyRules')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {status.commandsPresent ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={status.commandsPresent ? 'text-foreground' : 'text-muted-foreground'}>
                  {t('supervisor.commands')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {status.claudeMdSectionPresent ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={status.claudeMdSectionPresent ? 'text-foreground' : 'text-muted-foreground'}>
                  {t('supervisor.claudeMdSection')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-4">
        {!isInstalled && (
          <div className="flex items-center space-x-2">
            <Switch
              id="include-claude-md"
              checked={includeClaudeMd}
              onCheckedChange={setIncludeClaudeMd}
              disabled={isProcessing}
            />
            <Label htmlFor="include-claude-md" className="text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('supervisor.includeClaude')}
              </div>
              <span className="text-xs text-muted-foreground block mt-0.5">
                {t('supervisor.includeClaudeDescription')}
              </span>
            </Label>
          </div>
        )}

        {isInstalled && (
          <div className="flex items-center space-x-2">
            <Switch
              id="claude-md-toggle"
              checked={status?.claudeMdSectionPresent || false}
              onCheckedChange={handleClaudeMdToggle}
              disabled={isProcessing}
            />
            <Label htmlFor="claude-md-toggle" className="text-sm cursor-pointer">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {t('supervisor.claudeMdToggle')}
              </div>
            </Label>
          </div>
        )}

        <div className="flex gap-2">
          {isInstalled ? (
            <Button
              variant="destructive"
              onClick={handleUninstall}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('supervisor.uninstalling')}
                </>
              ) : (
                t('supervisor.uninstall')
              )}
            </Button>
          ) : (
            <Button
              onClick={handleInstall}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('supervisor.installing')}
                </>
              ) : (
                t('supervisor.install')
              )}
            </Button>
          )}
        </div>
      </div>

      {/* What it does */}
      <div className="rounded-lg bg-muted/50 p-4 space-y-3">
        <h4 className="text-sm font-medium">{t('supervisor.whatItDoes')}</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('supervisor.feature1')}</span>
          </li>
          <li className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('supervisor.feature2')}</span>
          </li>
          <li className="flex items-start gap-2">
            <Shield className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('supervisor.feature3')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
