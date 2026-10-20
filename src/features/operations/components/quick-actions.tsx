import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Bird, ClipboardPlus, Egg, Fish, HeartCrack, PackagePlus, Receipt, Scale, ShoppingBasket, Sprout, Wheat, Wallet } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/misc'
import { EggCollectionDialog, FeedDialog, FishHarvestDialog, FishSampleDialog, PopulationChangeDialog } from './livestock-dialogs'
import { ActivityDialog, CropHarvestDialog, InputUseDialog } from './field-dialogs'
import { FinanceDialog } from '@/features/finance/components/finance-dialog'
import { ReceiveStockDialog } from '@/features/inventory/components/stock-dialogs'
import type { PermissionKey } from '@/shared/lib/permissions'

export type QuickAction =
  | 'mortality'
  | 'feed'
  | 'eggs'
  | 'fish_sample'
  | 'fish_harvest'
  | 'crop_harvest'
  | 'input_use'
  | 'activity'
  | 'expense'
  | 'income'
  | 'receive_stock'

interface Ctx {
  open: (action: QuickAction, context?: { batchId?: string; cycleId?: string; siteId?: string }) => void
}

const QuickActionsContext = React.createContext<Ctx | null>(null)

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{ action: QuickAction | null; batchId?: string; cycleId?: string; siteId?: string }>({ action: null })
  const open = React.useCallback<Ctx['open']>((action, context) => setState({ action, ...context }), [])
  const close = (o: boolean) => !o && setState((s) => ({ ...s, action: null }))
  const is = (a: QuickAction) => state.action === a
  const value = React.useMemo(() => ({ open }), [open])

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <PopulationChangeDialog open={is('mortality')} onOpenChange={close} batchId={state.batchId} />
      <FeedDialog open={is('feed')} onOpenChange={close} batchId={state.batchId} />
      <EggCollectionDialog open={is('eggs')} onOpenChange={close} batchId={state.batchId} />
      <FishSampleDialog open={is('fish_sample')} onOpenChange={close} batchId={state.batchId} />
      <FishHarvestDialog open={is('fish_harvest')} onOpenChange={close} batchId={state.batchId} />
      <CropHarvestDialog open={is('crop_harvest')} onOpenChange={close} cycleId={state.cycleId} />
      <InputUseDialog open={is('input_use')} onOpenChange={close} cycleId={state.cycleId} />
      <ActivityDialog open={is('activity')} onOpenChange={close} />
      <FinanceDialog open={is('expense')} onOpenChange={close} kind="expense" />
      <FinanceDialog open={is('income')} onOpenChange={close} kind="income" />
      <ReceiveStockDialog open={is('receive_stock')} onOpenChange={close} />
    </QuickActionsContext.Provider>
  )
}

export function useQuickActions(): Ctx {
  const ctx = React.useContext(QuickActionsContext)
  if (!ctx) throw new Error('useQuickActions must be used inside <QuickActionsProvider>')
  return ctx
}

interface MenuEntry {
  action: QuickAction | 'sale'
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission: PermissionKey
}

const GROUPS: { label: string; items: MenuEntry[] }[] = [
  {
    label: 'Livestock',
    items: [
      { action: 'mortality', label: 'Mortality or loss', icon: HeartCrack, permission: 'operations.record' },
      { action: 'feed', label: 'Feed', icon: Bird, permission: 'inventory.record' },
      { action: 'eggs', label: 'Egg collection', icon: Egg, permission: 'operations.record' },
      { action: 'fish_sample', label: 'Fish sample weight', icon: Scale, permission: 'operations.record' },
      { action: 'fish_harvest', label: 'Fish harvest', icon: Fish, permission: 'operations.record' },
    ],
  },
  {
    label: 'Crops',
    items: [
      { action: 'input_use', label: 'Fertilizer / input applied', icon: Sprout, permission: 'operations.record' },
      { action: 'crop_harvest', label: 'Crop harvest', icon: Wheat, permission: 'operations.record' },
    ],
  },
  {
    label: 'Other',
    items: [
      { action: 'activity', label: 'Daily log entry', icon: ClipboardPlus, permission: 'operations.record' },
      { action: 'receive_stock', label: 'Stock received', icon: PackagePlus, permission: 'inventory.manage' },
      { action: 'sale', label: 'Sale', icon: ShoppingBasket, permission: 'sales.record' },
      { action: 'expense', label: 'Expense', icon: Receipt, permission: 'finance.record' },
      { action: 'income', label: 'Other income', icon: Wallet, permission: 'finance.record' },
    ],
  },
]

export function QuickRecordMenu({ trigger }: { trigger: React.ReactNode }) {
  const { has } = useAuth()
  const { open } = useQuickActions()
  const navigate = useNavigate()
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => has(i.permission)) })).filter((g) => g.items.length)
  if (!groups.length) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end">
        {groups.map((g, i) => (
          <React.Fragment key={g.label}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {g.items.map((item) => {
              const Icon = item.icon
              return (
                <DropdownMenuItem key={item.action} onSelect={() => (item.action === 'sale' ? navigate('/sales/new') : open(item.action))}>
                  <Icon className="text-muted-foreground" />
                  {item.label}
                </DropdownMenuItem>
              )
            })}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
