import {
  BarChart3,
  Bell,
  Bird,
  ClipboardList,
  Fish,
  Landmark,
  LayoutDashboard,
  MapPinned,
  Package,
  Receipt,
  Settings,
  ShoppingBasket,
  Sprout,
  Wheat,
} from 'lucide-react'
import type { PermissionKey } from '@/shared/lib/permissions'

export interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: PermissionKey[]
  end?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/alerts', label: 'Alerts', icon: Bell },
    ],
  },
  {
    label: 'Farm work',
    items: [
      { to: '/log', label: 'Daily log', icon: ClipboardList, permission: ['operations.view'] },
      { to: '/poultry', label: 'Poultry', icon: Bird, permission: ['operations.view'] },
      { to: '/fish', label: 'Fish', icon: Fish, permission: ['operations.view'] },
      { to: '/crops', label: 'Crops', icon: Sprout, permission: ['operations.view'] },
      { to: '/production', label: 'Produce & harvest', icon: Wheat, permission: ['operations.view'] },
    ],
  },
  {
    label: 'Stock and money',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Package, permission: ['inventory.view'] },
      { to: '/sales', label: 'Sales', icon: ShoppingBasket, permission: ['sales.record', 'finance.view'] },
      { to: '/finance', label: 'Income & expenses', icon: Receipt, permission: ['finance.view'] },
      { to: '/reports', label: 'Reports', icon: BarChart3, permission: ['reports.view', 'reports.financial'] },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/sites', label: 'Farm sites', icon: MapPinned },
      { to: '/admin', label: 'Administration', icon: Settings, permission: ['org.manage', 'members.manage', 'settings.manage', 'audit.view'] },
    ],
  },
]

export const PLATFORM_NAV: NavItem = { to: '/platform', label: 'Platform', icon: Landmark }
