/** Mirrors public.permissions. The database is the real gate; the UI uses these to hide what a role can't do. */
export const PERMISSION_KEYS = [
  'org.manage',
  'members.manage',
  'sites.manage',
  'settings.manage',
  'audit.view',
  'operations.view',
  'operations.record',
  'batches.manage',
  'inventory.view',
  'inventory.record',
  'inventory.manage',
  'sales.record',
  'finance.view',
  'finance.record',
  'finance.reverse',
  'reports.view',
  'reports.financial',
  'reports.export',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export type ProductionType = 'poultry' | 'fish' | 'crop'
export type ActivityProductionType = ProductionType | 'general'

export const PRODUCTION_TYPE_LABEL: Record<ActivityProductionType, string> = {
  poultry: 'Poultry',
  fish: 'Fish',
  crop: 'Crops',
  general: 'General',
}
