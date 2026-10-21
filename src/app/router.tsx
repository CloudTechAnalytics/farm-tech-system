import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Outlet, useRouteError } from 'react-router-dom'
import { AppLayout } from '@/app/layout/app-layout'
import { Landing, RedirectIfAuthenticated, RequireAuth, RequireOrganization, RequirePermission, RequirePlatformAdmin } from '@/features/auth/components/route-guards'
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage, SignInPage, SignUpPage } from '@/features/auth/pages/auth-pages'
import { SiteScopeProvider } from '@/shared/context/site-scope'
import { QuickActionsProvider } from '@/features/operations/components/quick-actions'
import { FullPageLoader, LoadingRows } from '@/shared/components/common'
import type { PermissionKey } from '@/shared/lib/permissions'

/** Each page is its own chunk so phones on slow networks only download what they open. */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, name: K) {
  return lazy(async () => ({ default: (await load())[name] }))
}

const OnboardingPage = lazyPage(() => import('@/features/onboarding/pages/onboarding-page'), 'OnboardingPage')
const DashboardPage = lazyPage(() => import('@/features/dashboard/pages/dashboard-page'), 'DashboardPage')
const AlertsPage = lazyPage(() => import('@/features/alerts/pages/alerts-page'), 'AlertsPage')
const DailyLogPage = lazyPage(() => import('@/features/activity/pages/daily-log-page'), 'DailyLogPage')
const BatchesPage = lazyPage(() => import('@/features/batches/pages/batches-page'), 'BatchesPage')
const BatchDetailPage = lazyPage(() => import('@/features/batches/pages/batch-detail-page'), 'BatchDetailPage')
const CropDetailPage = lazyPage(() => import('@/features/crops/pages/crops-pages'), 'CropDetailPage')
const CropsPage = lazyPage(() => import('@/features/crops/pages/crops-pages'), 'CropsPage')
const ProductionPage = lazyPage(() => import('@/features/production/pages/production-page'), 'ProductionPage')
const InventoryPage = lazyPage(() => import('@/features/inventory/pages/inventory-page'), 'InventoryPage')
const NewSalePage = lazyPage(() => import('@/features/sales/pages/sales-pages'), 'NewSalePage')
const SaleDetailPage = lazyPage(() => import('@/features/sales/pages/sales-pages'), 'SaleDetailPage')
const SalesPage = lazyPage(() => import('@/features/sales/pages/sales-pages'), 'SalesPage')
const CustomersPage = lazyPage(() => import('@/features/customers/pages/customers-pages'), 'CustomersPage')
const CustomerDetailPage = lazyPage(() => import('@/features/customers/pages/customers-pages'), 'CustomerDetailPage')
const ProductsPage = lazyPage(() => import('@/features/sales/pages/products-page'), 'ProductsPage')
const OrdersPage = lazyPage(() => import('@/features/sales/pages/orders-pages'), 'OrdersPage')
const NewOrderPage = lazyPage(() => import('@/features/sales/pages/orders-pages'), 'NewOrderPage')
const OrderDetailPage = lazyPage(() => import('@/features/sales/pages/orders-pages'), 'OrderDetailPage')
const SuppliersPage = lazyPage(() => import('@/features/procurement/pages/suppliers-pages'), 'SuppliersPage')
const SupplierDetailPage = lazyPage(() => import('@/features/procurement/pages/suppliers-pages'), 'SupplierDetailPage')
const PurchaseRequestsPage = lazyPage(() => import('@/features/procurement/pages/purchasing-pages'), 'PurchaseRequestsPage')
const PurchaseOrdersPage = lazyPage(() => import('@/features/procurement/pages/purchasing-pages'), 'PurchaseOrdersPage')
const NewPurchaseOrderPage = lazyPage(() => import('@/features/procurement/pages/purchasing-pages'), 'NewPurchaseOrderPage')
const PurchaseOrderDetailPage = lazyPage(() => import('@/features/procurement/pages/purchasing-pages'), 'PurchaseOrderDetailPage')
const SupplierBillsPage = lazyPage(() => import('@/features/procurement/pages/bills-pages'), 'SupplierBillsPage')
const SupplierBillDetailPage = lazyPage(() => import('@/features/procurement/pages/bills-pages'), 'SupplierBillDetailPage')
const TasksPage = lazyPage(() => import('@/features/tasks/pages/tasks-pages'), 'TasksPage')
const WorkersPage = lazyPage(() => import('@/features/tasks/pages/tasks-pages'), 'WorkersPage')
const ReceivablesPage = lazyPage(() => import('@/features/finance/pages/position-pages'), 'ReceivablesPage')
const PayablesPage = lazyPage(() => import('@/features/finance/pages/position-pages'), 'PayablesPage')
const CashbookPage = lazyPage(() => import('@/features/finance/pages/position-pages'), 'CashbookPage')
const AssetsPage = lazyPage(() => import('@/features/assets/pages/assets-pages'), 'AssetsPage')
const AssetDetailPage = lazyPage(() => import('@/features/assets/pages/assets-pages'), 'AssetDetailPage')
const HealthPage = lazyPage(() => import('@/features/health/pages/health-page'), 'HealthPage')
const FinancePage = lazyPage(() => import('@/features/finance/pages/finance-page'), 'FinancePage')
const ReportsPage = lazyPage(() => import('@/features/reports/pages/reports-page'), 'ReportsPage')
const SiteDetailPage = lazyPage(() => import('@/features/sites/pages/sites-pages'), 'SiteDetailPage')
const SitesPage = lazyPage(() => import('@/features/sites/pages/sites-pages'), 'SitesPage')
const AdminPage = lazyPage(() => import('@/features/admin/pages/admin-page'), 'AdminPage')
const AccountPage = lazyPage(() => import('@/features/account/pages/account-pages'), 'AccountPage')
const NotFoundPage = lazyPage(() => import('@/features/account/pages/account-pages'), 'NotFoundPage')
const PlatformPage = lazyPage(() => import('@/features/account/pages/account-pages'), 'PlatformPage')

function Workspace() {
  return (
    <SiteScopeProvider>
      <QuickActionsProvider>
        <Suspense fallback={<LoadingRows rows={6} />}>
          <Outlet />
        </Suspense>
      </QuickActionsProvider>
    </SiteScopeProvider>
  )
}

/** Shown when a page throws. Records are saved server-side, so a reload is safe. */
function RouteError() {
  const error = useRouteError()
  console.error('Route error', error)
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div className="max-w-sm">
        <p className="font-display text-2xl font-semibold">This page could not be shown</p>
        <p className="mt-2 text-sm text-muted-foreground">Your saved records are safe. Go back to the dashboard and try again.</p>
        <a href="/" className="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Back to dashboard
        </a>
      </div>
    </div>
  )
}

// Mirrors public.can_see_procurement.
const PROCUREMENT_VIEW: PermissionKey[] = ['suppliers.manage', 'procurement.request', 'procurement.approve', 'inventory.manage', 'finance.view']

const ops = (el: ReactNode) => <RequirePermission permission="operations.view">{el}</RequirePermission>

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
  { path: '/welcome', element: <Landing /> },
  { path: '/auth/sign-in', element: <RedirectIfAuthenticated><SignInPage /></RedirectIfAuthenticated> },
  { path: '/auth/sign-up', element: <RedirectIfAuthenticated><SignUpPage /></RedirectIfAuthenticated> },
  { path: '/auth/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/auth/reset-password', element: <ResetPasswordPage /> },
  { path: '/invite/:token', element: <AcceptInvitePage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/onboarding', element: <Suspense fallback={<FullPageLoader />}><OnboardingPage /></Suspense> },
      {
        element: <RequireOrganization />,
        children: [
          {
            element: <Workspace />,
            children: [
              {
                element: <AppLayout />,
                children: [
                  { path: '/', element: <DashboardPage /> },
                  { path: '/alerts', element: <AlertsPage /> },
                  { path: '/log', element: ops(<DailyLogPage />) },
                  { path: '/poultry', element: ops(<BatchesPage key="poultry" type="poultry" />) },
                  { path: '/poultry/:id', element: ops(<BatchDetailPage type="poultry" />) },
                  { path: '/fish', element: ops(<BatchesPage key="fish" type="fish" />) },
                  { path: '/fish/:id', element: ops(<BatchDetailPage type="fish" />) },
                  { path: '/crops', element: ops(<CropsPage />) },
                  { path: '/crops/:id', element: ops(<CropDetailPage />) },
                  { path: '/tasks', element: ops(<TasksPage />) },
                  { path: '/workers', element: <RequirePermission permission={['workforce.manage', 'tasks.manage']}><WorkersPage /></RequirePermission> },
                  { path: '/health', element: <RequirePermission permission="health.view"><HealthPage /></RequirePermission> },
                  { path: '/equipment', element: <RequirePermission permission="assets.view"><AssetsPage /></RequirePermission> },
                  { path: '/equipment/:id', element: <RequirePermission permission="assets.view"><AssetDetailPage /></RequirePermission> },
                  { path: '/production', element: ops(<ProductionPage />) },
                  { path: '/inventory', element: <RequirePermission permission="inventory.view"><InventoryPage /></RequirePermission> },
                  { path: '/sales', element: <RequirePermission permission={['sales.record', 'finance.view']}><SalesPage /></RequirePermission> },
                  { path: '/sales/new', element: <RequirePermission permission="sales.record"><NewSalePage /></RequirePermission> },
                  { path: '/sales/:id', element: <RequirePermission permission={['sales.record', 'finance.view']}><SaleDetailPage /></RequirePermission> },
                  { path: '/suppliers', element: <RequirePermission permission={PROCUREMENT_VIEW}><SuppliersPage /></RequirePermission> },
                  { path: '/suppliers/:id', element: <RequirePermission permission={PROCUREMENT_VIEW}><SupplierDetailPage /></RequirePermission> },
                  { path: '/purchase-requests', element: <RequirePermission permission={['procurement.request', 'procurement.approve']}><PurchaseRequestsPage /></RequirePermission> },
                  { path: '/purchase-orders', element: <RequirePermission permission={PROCUREMENT_VIEW}><PurchaseOrdersPage /></RequirePermission> },
                  { path: '/purchase-orders/new', element: <RequirePermission permission="procurement.approve"><NewPurchaseOrderPage /></RequirePermission> },
                  { path: '/purchase-orders/:id', element: <RequirePermission permission={PROCUREMENT_VIEW}><PurchaseOrderDetailPage /></RequirePermission> },
                  { path: '/bills', element: <RequirePermission permission={['finance.view', 'suppliers.manage', 'procurement.approve']}><SupplierBillsPage /></RequirePermission> },
                  { path: '/bills/:id', element: <RequirePermission permission={['finance.view', 'suppliers.manage', 'procurement.approve']}><SupplierBillDetailPage /></RequirePermission> },
                  { path: '/customers', element: <RequirePermission permission={['customers.manage', 'sales.record', 'finance.view']}><CustomersPage /></RequirePermission> },
                  { path: '/customers/:id', element: <RequirePermission permission={['customers.manage', 'sales.record', 'finance.view']}><CustomerDetailPage /></RequirePermission> },
                  { path: '/products', element: <RequirePermission permission={['products.manage', 'sales.record']}><ProductsPage /></RequirePermission> },
                  { path: '/orders', element: <RequirePermission permission={['sales.record', 'finance.view']}><OrdersPage /></RequirePermission> },
                  { path: '/orders/new', element: <RequirePermission permission="sales.record"><NewOrderPage /></RequirePermission> },
                  { path: '/orders/:id', element: <RequirePermission permission={['sales.record', 'finance.view']}><OrderDetailPage /></RequirePermission> },
                  { path: '/finance', element: <RequirePermission permission="finance.view"><FinancePage /></RequirePermission> },
                  { path: '/receivables', element: <RequirePermission permission="finance.view"><ReceivablesPage /></RequirePermission> },
                  { path: '/payables', element: <RequirePermission permission="finance.view"><PayablesPage /></RequirePermission> },
                  { path: '/cashbook', element: <RequirePermission permission="finance.view"><CashbookPage /></RequirePermission> },
                  { path: '/reports', element: <RequirePermission permission={['reports.view', 'reports.financial']}><ReportsPage /></RequirePermission> },
                  { path: '/sites', element: <SitesPage /> },
                  { path: '/sites/:id', element: <SiteDetailPage /> },
                  { path: '/admin', element: <RequirePermission permission={['org.manage', 'members.manage', 'settings.manage', 'audit.view']}><AdminPage /></RequirePermission> },
                  { path: '/account', element: <AccountPage /> },
                  { element: <RequirePlatformAdmin />, children: [{ path: '/platform', element: <PlatformPage /> }] },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
    ],
  },
])
