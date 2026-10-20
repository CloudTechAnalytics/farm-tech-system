import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Sprout } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { authService } from '@/features/auth/services/auth.service'
import { adminService } from '@/features/admin/services/admin.service'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { EmptyState, Field, FormError, Notice, PageHeader, QueryState, StatCard } from '@/shared/components/common'
import { useSave } from '@/shared/hooks/use-record'
import { friendlyError } from '@/shared/lib/errors'
import { formatNumber } from '@/shared/lib/format'

export function AccountPage() {
  const { userId, profile, email, refresh, memberships } = useAuth()
  const form = useForm<{ full_name: string; phone: string }>({ values: { full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' } })
  const save = useSave(
    async (v: { full_name: string; phone: string }) => {
      await authService.updateProfile(userId!, { full_name: v.full_name.trim() || null, phone: v.phone.trim() || null })
      await refresh()
    },
    { success: 'Profile saved' },
  )
  const pwSchema = z
    .object({ password: z.string().min(8, 'Use at least 8 characters').refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and at least one number'), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const pw = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) })
  const [pwError, setPwError] = React.useState<string | null>(null)
  const [pwDone, setPwDone] = React.useState(false)
  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader title="My account" description={email ?? undefined} />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
            <Field label="Full name" htmlFor="ac-name">
              <Input id="ac-name" maxLength={120} {...form.register('full_name')} />
            </Field>
            <Field label="Phone" htmlFor="ac-phone">
              <Input id="ac-phone" type="tel" maxLength={40} {...form.register('phone')} />
            </Field>
            <FormError message={save.error ? friendlyError(save.error) : null} />
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            noValidate
            onSubmit={pw.handleSubmit(async (v) => {
              setPwError(null)
              setPwDone(false)
              try {
                await authService.updatePassword(v.password)
                pw.reset({ password: '', confirm: '' })
                setPwDone(true)
              } catch (err) {
                setPwError(friendlyError(err))
              }
            })}
          >
            <Field label="New password" htmlFor="ac-pw" error={pw.formState.errors.password?.message}>
              <Input id="ac-pw" type="password" autoComplete="new-password" {...pw.register('password')} />
            </Field>
            <Field label="Confirm password" htmlFor="ac-pw2" error={pw.formState.errors.confirm?.message}>
              <Input id="ac-pw2" type="password" autoComplete="new-password" {...pw.register('confirm')} />
            </Field>
            <FormError message={pwError} />
            {pwDone ? <Notice tone="success">Password changed.</Notice> : null}
            <Button type="submit" variant="outline" loading={pw.formState.isSubmitting}>
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/onboarding">Set up another farm business</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {memberships.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.organization.name}</span>
                <span className="text-muted-foreground">{m.role.name}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

/** CloudTech staff only. Aggregate counts; no farm's records are reachable from here. */
export function PlatformPage() {
  const query = useQuery({ queryKey: ['platform-overview'], queryFn: () => adminService.platformOverview() })
  return (
    <div>
      <PageHeader title="Platform overview" description="Aggregate figures across all customers. Customer farm records are not accessible from the platform console." />
      <QueryState query={query} isEmpty={() => false}>
        {(d) => (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Organizations" value={formatNumber(d.organizations)} hint={`${d.organizations_last_30_days} in the last 30 days`} />
            <StatCard label="Active farm sites" value={formatNumber(d.farm_sites)} />
            <StatCard label="Active users" value={formatNumber(d.active_users)} />
            <StatCard label="Subscriptions" value={Object.entries(d.subscriptions_by_status).map(([k, v]) => `${v} ${k}`).join(', ') || '0'} />
          </div>
        )}
      </QueryState>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Sprout}
      title="Page not found"
      description="The page may have moved, or the record is on a site you can't access."
      action={
        <Button asChild>
          <Link to="/">Go to dashboard</Link>
        </Button>
      }
      className="min-h-[50vh]"
    />
  )
}
