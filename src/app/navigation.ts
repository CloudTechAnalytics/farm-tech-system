import {
  BarChart3,
  Bell,
  Bird,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  FileInput,
  FileText,
  Fish,
  HandCoins,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Package,
  PackageSearch,
  Receipt,
  Settings,
  ShoppingBasket,
  Sprout,
  Truck,
  UserRound,
  Users,
  Wallet,
  Wheat,
  Wrench,
} from 'lucide-react'
import type { PermissionKey, ProductionType } from '@/shared/lib/permissions'

export interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: PermissionKey[]
  /** Shown only when at least one active site runs this type of production. */
  farmType?: ProductionType
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
    label: 'Farm operations',
    items: [
      { to: '/log', label: 'Daily log', icon: ClipboardList, permission: ['operations.view'] },
      { to: '/tasks', label: 'Tasks', icon: ListChecks, permission: ['operations.view'] },
      { to: '/health', label: 'Health & biosecurity', icon: HeartPulse, permission: ['health.view'] },
      { to: '/equipment', label: 'Equipment', icon: Wrench, permission: ['assets.view'] },
    ],
  },
  {
    label: 'Production',
    items: [
      { to: '/poultry', label: 'Poultry', icon: Bird, permission: ['operations.view'], farmType: 'poultry' },
      { to: '/fish', label: 'Fish', icon: Fish, permission: ['operations.view'], farmType: 'fish' },
      { to: '/crops', label: 'Crops', icon: Sprout, permission: ['operations.view'], farmType: 'crop' },
      { to: '/production', label: 'Produce & harvest', icon: Wheat, permission: ['operations.view'] },
    ],
  },
  {
    label: 'Stock and procurement',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Package, permission: ['inventory.view'] },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, permission: ['suppliers.manage', 'procurement.request', 'procurement.approve', 'inventory.manage', 'finance.view'] },
      { to: '/purchase-requests', label: 'Purchase requests', icon: ClipboardCheck, permission: ['procurement.request', 'procurement.approve'] },
      { to: '/purchase-orders', label: 'Purchase orders', icon: FileInput, permission: ['suppliers.manage', 'procurement.request', 'procurement.approve', 'inventory.manage', 'finance.view'] },
      { to: '/bills', label: 'Supplier bills', icon: FileText, permission: ['finance.view', 'suppliers.manage', 'procurement.approve'] },
    ],
  },
  {
    label: 'Sales and customers',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, permission: ['customers.manage', 'sales.record', 'finance.view'] },
      { to: '/products', label: 'Products', icon: PackageSearch, permission: ['products.manage', 'sales.record'] },
      { to: '/orders', label: 'Sales orders', icon: ClipboardPen, permission: ['sales.record', 'finance.view'] },
      { to: '/sales', label: 'Invoices', icon: ShoppingBasket, permission: ['sales.record', 'finance.view'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/finance', label: 'Income & expenses', icon: Receipt, permission: ['finance.view'] },
      { to: '/receivables', label: 'Receivables', icon: HandCoins, permission: ['finance.view'] },
      { to: '/payables', label: 'Payables', icon: Wallet, permission: ['finance.view'] },
      { to: '/cashbook', label: 'Cashbook', icon: BookOpen, permission: ['finance.view'] },
      { to: '/reports', label: 'Reports', icon: BarChart3, permission: ['reports.view', 'reports.financial'] },
    ],
  },
  {
    label: 'People and administration',
    items: [
      { to: '/workers', label: 'Workers', icon: UserRound, permission: ['workforce.manage', 'tasks.manage'] },
      { to: '/sites', label: 'Farm sites', icon: MapPinned },
      { to: '/admin', label: 'Administration', icon: Settings, permission: ['org.manage', 'members.manage', 'settings.manage', 'audit.view'] },
    ],
  },
]

export const PLATFORM_NAV: NavItem = { to: '/platform', label: 'Platform', icon: Landmark }
