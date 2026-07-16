import { StorageService } from '../services/StorageService';
import { OpError, OpErrorCode } from '../bridge/errors';

export async function listTemplates(params?: { limit?: unknown }) {
  const rawLimit = typeof params?.limit === 'number' ? params.limit : Number(params?.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(200, Math.floor(rawLimit)) : 100;

  const templates = await StorageService.getTemplates();
  const sorted = [...templates].sort((a, b) => b.timestamp - a.timestamp);
  const sliced = sorted.slice(0, limit);

  return {
    total: sorted.length,
    limit,
    truncated: sorted.length > sliced.length,
    templates: sliced.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description ?? null,
      timestamp: template.timestamp,
      backtestVersion: template.backtestVersion ?? template.apiVersion ?? null
    }))
  };
}

export async function getTemplate(params?: { templateId?: unknown; id?: unknown }) {
  const templateId =
    typeof params?.templateId === 'string'
      ? params.templateId.trim()
      : typeof params?.id === 'string'
        ? params.id.trim()
        : '';

  if (!templateId) {
    throw new OpError(OpErrorCode.VALIDATION, 'templateId is required');
  }

  const templates = await StorageService.getTemplates();
  const template = templates.find((item) => item.id === templateId);
  if (!template) {
    throw new OpError(OpErrorCode.NOT_FOUND, `Template not found: ${templateId}`);
  }

  return { template };
}
