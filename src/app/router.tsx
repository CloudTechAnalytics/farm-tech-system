import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { createBrowserRouter, Outlet, useRouteError } from 'react-router-dom'
import { AppLayout } from '@/app/layout/app-layout'
import { Landing, RedirectIfAuthenticated, RequireAuth, RequireOrganization, RequirePermission, RequirePlatformAdmin } from '@/features/auth/components/route-guards'
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage, SignInPage, SignUpPage } from '@/features/auth/pages/auth-pages'
import { SiteScopeProvider } from '@/shared/context/site-scope'
import { QuickActionsProvider } from '@/features/operations/components/quick-actions'
import { FullPageLoader, LoadingRows } from '@/shared/components/common'

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
                  { path: '/production', element: ops(<ProductionPage />) },
                  { path: '/inventory', element: <RequirePermission permission="inventory.view"><InventoryPage /></RequirePermission> },
                  { path: '/sales', element: <RequirePermission permission={['sales.record', 'finance.view']}><SalesPage /></RequirePermission> },
                  { path: '/sales/new', element: <RequirePermission permission="sales.record"><NewSalePage /></RequirePermission> },
                  { path: '/sales/:id', element: <RequirePermission permission={['sales.record', 'finance.view']}><SaleDetailPage /></RequirePermission> },
                  { path: '/finance', element: <RequirePermission permission="finance.view"><FinancePage /></RequirePermission> },
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
