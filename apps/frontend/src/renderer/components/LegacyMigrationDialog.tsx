/**
 * Legacy Migration Dialog
 *
 * Prompts user to migrate from .auto-claude to .ouro directory structure.
 * Shows when a project with legacy directory is opened.
 */

import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderSync, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog';
import type { Project } from '../../shared/types';

interface LegacyMigrationDialogProps {
  open: boolean;
  project: Project | null;
  isMigrating: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onMigrate: () => void;
  onSkip: () => void;
}

export function LegacyMigrationDialog({
  open,
  project,
  isMigrating,
  error,
  onOpenChange,
  onMigrate,
  onSkip
}: LegacyMigrationDialogProps) {
  const { t } = useTranslation(['dialogs', 'common']);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {error ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            {error
              ? t('dialogs:legacyMigration.errorTitle', 'Migration Failed')
              : t('dialogs:legacyMigration.title', 'Legacy Directory Detected')}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-3">
              {error ? (
                <p className="text-destructive">{error}</p>
              ) : (
                <>
                  <p>
                    {t('dialogs:legacyMigration.description', 'This project uses the old .auto-claude directory structure.')}
                  </p>
                  <p>
                    {t('dialogs:legacyMigration.willMigrate', 'It will be renamed to .ouro for compatibility with the new Ouro system.')}
                  </p>
                </>
              )}

              {project && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common:project', 'Project')}:</span>
                    <span className="font-medium">{project.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common:from', 'From')}:</span>
                    <span className="font-mono text-xs">.auto-claude/</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('common:to', 'To')}:</span>
                    <span className="font-mono text-xs">.ouro/</span>
                  </div>
                </div>
              )}

              {!error && (
                <p className="text-amber-600 dark:text-amber-500">
                  {t('dialogs:legacyMigration.warning', 'Make sure to commit any pending changes before migrating.')}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMigrating} onClick={onSkip}>
            {t('dialogs:legacyMigration.skip', 'Skip for Now')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onMigrate();
            }}
            disabled={isMigrating}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {isMigrating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('dialogs:legacyMigration.migrating', 'Migrating...')}
              </>
            ) : error ? (
              <>
                <FolderSync className="mr-2 h-4 w-4" />
                {t('common:buttons.retry', 'Retry')}
              </>
            ) : (
              <>
                <FolderSync className="mr-2 h-4 w-4" />
                {t('dialogs:legacyMigration.migrate', 'Migrate to .ouro')}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
