/**
 * GrepAISettings
 *
 * Settings section for configuring GrepAI semantic code search.
 * Allows users to enable/disable, configure embedding provider,
 * and manage the watch daemon.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Check,
  X,
  Loader2,
  AlertCircle,
  Play,
  Square,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type {
  GrepAIConfig,
  GrepAIStatus,
  GrepAIEmbeddingProvider
} from '../../../shared/types/grepai';
import {
  GREPAI_AVAILABLE_MODELS,
  GREPAI_DEFAULT_MODELS,
  DEFAULT_GREPAI_CONFIG
} from '../../../shared/types/grepai';

interface GrepAISettingsProps {
  projectPath: string;
}

export function GrepAISettings({ projectPath }: GrepAISettingsProps) {
  const { t } = useTranslation('settings');
  const [status, setStatus] = useState<GrepAIStatus | null>(null);
  const [config, setConfig] = useState<GrepAIConfig>(DEFAULT_GREPAI_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // Local state for API key (not persisted until save)
  const [apiKey, setApiKey] = useState('');

  // Load status and config on mount
  const loadData = useCallback(async () => {
    if (!projectPath) return;

    setIsLoading(true);
    setError(null);

    try {
      const [statusResult, configResult] = await Promise.all([
        window.electronAPI.grepaiGetStatus(projectPath),
        window.electronAPI.grepaiGetConfig(projectPath)
      ]);

      if (statusResult.success && statusResult.data) {
        setStatus(statusResult.data);
      }

      if (configResult.success && configResult.data) {
        setConfig(configResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('grepai.errorLoadingStatus'));
    } finally {
      setIsLoading(false);
    }
  }, [projectPath, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = window.electronAPI.onGrepaiStatusChanged((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle provider change
  const handleProviderChange = (provider: GrepAIEmbeddingProvider) => {
    setConfig(prev => ({
      ...prev,
      embeddingProvider: provider,
      embeddingModel: GREPAI_DEFAULT_MODELS[provider]
    }));
    setApiKey(''); // Clear API key when switching providers
  };

  // Handle model change
  const handleModelChange = (model: string) => {
    setConfig(prev => ({
      ...prev,
      embeddingModel: model
    }));
  };

  // Handle save config
  const handleSaveConfig = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const configToSave: GrepAIConfig = {
        ...config
      };

      // Add API key based on provider
      if (config.embeddingProvider === 'openai' && apiKey) {
        configToSave.openaiApiKey = apiKey;
      } else if (config.embeddingProvider === 'gemini' && apiKey) {
        configToSave.geminiApiKey = apiKey;
      }

      const result = await window.electronAPI.grepaiSaveConfig(projectPath, configToSave);

      if (!result.success) {
        setError(result.error || t('grepai.errorSavingConfig'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('grepai.errorSavingConfig'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle initialize GrepAI
  const handleInitialize = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const initOptions = {
        provider: config.embeddingProvider,
        model: config.embeddingModel,
        providerOptions: {
          ollamaBaseUrl: config.ollamaBaseUrl,
          apiKey: apiKey || undefined
        }
      };

      const result = await window.electronAPI.grepaiInit(projectPath, initOptions);

      if (result.success) {
        await loadData();
      } else {
        setError(result.error || t('grepai.errorInitializing'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('grepai.errorInitializing'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle start/stop watch
  const handleToggleWatch = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      if (status?.watching) {
        const result = await window.electronAPI.grepaiStopWatch();
        if (!result.success) {
          setError(result.error || t('grepai.errorStoppingWatch'));
        }
      } else {
        const result = await window.electronAPI.grepaiStartWatch(projectPath);
        if (!result.success) {
          setError(result.error || t('grepai.errorStartingWatch'));
        }
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('grepai.errorToggleWatch'));
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
  const isInitialized = status?.initialized;
  const isWatching = status?.watching;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-start gap-4">
          <div className={`rounded-full p-2 ${isInstalled ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
            <Search className={`h-5 w-5 ${isInstalled ? 'text-green-500' : 'text-destructive'}`} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium">
                {t('grepai.title')}
              </h4>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isInstalled
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-destructive/10 text-destructive'
              }`}>
                {isInstalled ? t('grepai.installed') : t('grepai.notInstalled')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('grepai.description')}
            </p>
          </div>
        </div>

        {/* Status Details */}
        {status && isInstalled && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2">
                {isInitialized ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={isInitialized ? 'text-foreground' : 'text-muted-foreground'}>
                  {t('grepai.projectInitialized')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isWatching ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <X className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={isWatching ? 'text-foreground' : 'text-muted-foreground'}>
                  {t('grepai.watchDaemon')}
                </span>
              </div>
            </div>
            {status.indexProgress !== undefined && (
              <div className="text-xs text-muted-foreground">
                {t('grepai.indexProgress', { progress: status.indexProgress })}
              </div>
            )}
            {status.error && (
              <div className="text-xs text-destructive">
                {status.error}
              </div>
            )}
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

      {/* Not Installed Warning */}
      {!isInstalled && (
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-4">
          <h4 className="text-sm font-medium text-warning mb-2">
            {t('grepai.installRequired')}
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            {t('grepai.installInstructions')}
          </p>
          <code className="block text-xs bg-muted p-2 rounded">
            pip install grepai
          </code>
        </div>
      )}

      {/* Configuration (only show if installed) */}
      {isInstalled && (
        <div className="space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium">{t('grepai.enabled')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('grepai.enabledDescription')}
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
              disabled={isProcessing}
            />
          </div>

          {/* Auto-watch Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border">
            <div className="space-y-1">
              <Label className="font-medium">{t('grepai.autoWatch')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('grepai.autoWatchDescription')}
              </p>
            </div>
            <Switch
              checked={config.autoWatch}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoWatch: checked }))}
              disabled={isProcessing}
            />
          </div>

          {/* Embedding Provider */}
          <div className="space-y-2">
            <Label>{t('grepai.embeddingProvider')}</Label>
            <Select
              value={config.embeddingProvider}
              onValueChange={(v) => handleProviderChange(v as GrepAIEmbeddingProvider)}
              disabled={isProcessing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ollama">{t('grepai.providers.ollama')}</SelectItem>
                <SelectItem value="openai">{t('grepai.providers.openai')}</SelectItem>
                <SelectItem value="gemini">{t('grepai.providers.gemini')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Embedding Model */}
          <div className="space-y-2">
            <Label>{t('grepai.embeddingModel')}</Label>
            <Select
              value={config.embeddingModel}
              onValueChange={handleModelChange}
              disabled={isProcessing}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GREPAI_AVAILABLE_MODELS[config.embeddingProvider].map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider-specific settings */}
          {config.embeddingProvider === 'ollama' && (
            <div className="space-y-2">
              <Label>{t('grepai.ollamaUrl')}</Label>
              <Input
                value={config.ollamaBaseUrl || 'http://localhost:11434'}
                onChange={(e) => setConfig(prev => ({ ...prev, ollamaBaseUrl: e.target.value }))}
                placeholder="http://localhost:11434"
                disabled={isProcessing}
              />
            </div>
          )}

          {(config.embeddingProvider === 'openai' || config.embeddingProvider === 'gemini') && (
            <div className="space-y-2">
              <Label>
                {config.embeddingProvider === 'openai' ? t('grepai.openaiApiKey') : t('grepai.geminiApiKey')}
              </Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t('grepai.apiKeyPlaceholder')}
                  disabled={isProcessing}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Save Config Button */}
          <Button
            onClick={handleSaveConfig}
            disabled={isProcessing}
            variant="outline"
          >
            {isProcessing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {t('grepai.saveConfig')}
          </Button>
        </div>
      )}

      {/* Actions */}
      {isInstalled && (
        <div className="flex gap-2 pt-4 border-t border-border">
          {!isInitialized ? (
            <Button
              onClick={handleInitialize}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('grepai.initializing')}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('grepai.initialize')}
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleToggleWatch}
              disabled={isProcessing}
              variant={isWatching ? 'destructive' : 'default'}
            >
              {isProcessing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : isWatching ? (
                <Square className="mr-2 h-4 w-4" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {isWatching ? t('grepai.stopWatch') : t('grepai.startWatch')}
            </Button>
          )}

          <Button
            onClick={loadData}
            variant="outline"
            disabled={isProcessing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} />
            {t('grepai.refresh')}
          </Button>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-lg bg-muted/50 p-4 space-y-3">
        <h4 className="text-sm font-medium">{t('grepai.howItWorks')}</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li className="flex items-start gap-2">
            <Search className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('grepai.feature1')}</span>
          </li>
          <li className="flex items-start gap-2">
            <Search className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('grepai.feature2')}</span>
          </li>
          <li className="flex items-start gap-2">
            <Search className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{t('grepai.feature3')}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
