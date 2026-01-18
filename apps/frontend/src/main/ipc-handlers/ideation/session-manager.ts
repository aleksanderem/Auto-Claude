/**
 * Ideation session CRUD operations
 */

import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { existsSync } from 'fs';
import { AUTO_BUILD_PATHS, LEGACY_BUILD_PATHS, getIdeationDir } from '../../../shared/constants';
import type { IPCResult, IdeationSession } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { transformIdeaFromSnakeCase } from './transformers';
import { readIdeationFile } from './file-utils';

/**
 * Get ideation session for a project
 */
/**
 * Find ideation path with legacy fallback
 */
function findIdeationPath(projectPath: string, autoBuildPath: string | undefined): string | null {
  const newPath = path.join(projectPath, getIdeationDir(autoBuildPath), AUTO_BUILD_PATHS.IDEATION_FILE);
  if (existsSync(newPath)) return newPath;

  const legacyPath = path.join(projectPath, LEGACY_BUILD_PATHS.IDEATION_DIR, AUTO_BUILD_PATHS.IDEATION_FILE);
  if (existsSync(legacyPath)) return legacyPath;

  return null;
}

export async function getIdeationSession(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IPCResult<IdeationSession | null>> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = findIdeationPath(project.path, project.autoBuildPath);
  if (!ideationPath) {
    return { success: true, data: null };
  }

  const rawIdeation = readIdeationFile(ideationPath);
  if (!rawIdeation) {
    return { success: true, data: null };
  }

  try {
    // Transform snake_case to camelCase for frontend
    const enabledTypes = (rawIdeation.config?.enabled_types || rawIdeation.config?.enabledTypes || []) as unknown[];

    const session: IdeationSession = {
      id: rawIdeation.id || `ideation-${Date.now()}`,
      projectId,
      config: {
        enabledTypes: enabledTypes as IdeationSession['config']['enabledTypes'],
        includeRoadmapContext: rawIdeation.config?.include_roadmap_context ?? rawIdeation.config?.includeRoadmapContext ?? true,
        includeKanbanContext: rawIdeation.config?.include_kanban_context ?? rawIdeation.config?.includeKanbanContext ?? true,
        maxIdeasPerType: rawIdeation.config?.max_ideas_per_type || rawIdeation.config?.maxIdeasPerType || 5
      },
      ideas: (rawIdeation.ideas || []).map(idea => transformIdeaFromSnakeCase(idea)),
      projectContext: {
        existingFeatures: rawIdeation.project_context?.existing_features || rawIdeation.projectContext?.existingFeatures || [],
        techStack: rawIdeation.project_context?.tech_stack || rawIdeation.projectContext?.techStack || [],
        targetAudience: rawIdeation.project_context?.target_audience || rawIdeation.projectContext?.targetAudience,
        plannedFeatures: rawIdeation.project_context?.planned_features || rawIdeation.projectContext?.plannedFeatures || []
      },
      generatedAt: rawIdeation.generated_at ? new Date(rawIdeation.generated_at) : new Date(),
      updatedAt: rawIdeation.updated_at ? new Date(rawIdeation.updated_at) : new Date()
    };

    return { success: true, data: session };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read ideation'
    };
  }
}
