import * as React from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { authService } from '@/features/auth/services/auth.service'
import { useAuth } from '@/features/auth/context/auth-provider'
import { adminService } from '@/features/admin/services/admin.service'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Field, FormError, FullPageLoader, Notice } from '@/shared/components/common'
import { friendlyError } from '@/shared/lib/errors'
import { env } from '@/shared/config/env'
import { supabase } from '@/shared/lib/supabase'

const email = z.string().trim().min(1, 'Enter your email').email('Enter a valid email address')
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), 'Use letters and at least one number')

function SetupNotice() {
  if (env.isSupabaseConfigured) return null
  return (
    <Notice tone="warning" className="mb-4">
      The app is not connected to a database yet. Copy <code>.env.example</code> to <code>.env.local</code> and add the Supabase URL and anon key.
    </Notice>
  )
}

export function SignInPage() {
  const schema = z.object({ email, password: z.string().min(1, 'Enter your password') })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const [error, setError] = React.useState<string | null>(null)
  const location = useLocation()
  const invite = (location.state as { from?: string } | null)?.from?.startsWith('/invite/')

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      await authService.signIn(v.email, v.password)
    } catch (err) {
      const msg = friendlyError(err)
      setError(msg.toLowerCase().includes('invalid login') ? 'The email or password is not correct.' : msg)
    }
  })

  return (
    <AuthShell title="Sign in" subtitle={invite ? 'Sign in with the email address the invitation was sent to.' : 'Welcome back to your farm records.'}>
      <SetupNotice />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="si-email" error={form.formState.errors.email?.message}>
          <Input id="si-email" type="email" autoComplete="email" autoFocus {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="si-password" error={form.formState.errors.password?.message}>
          <Input id="si-password" type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/auth/forgot-password" className="text-brand hover:underline">
          Forgot password?
        </Link>
        <Link to="/auth/sign-up" state={location.state} className="text-brand hover:underline">
          Create an account
        </Link>
      </div>
    </AuthShell>
  )
}

export function SignUpPage() {
  const schema = z
    .object({ full_name: z.string().trim().min(2, 'Enter your name').max(120), email, password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const [error, setError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      const { needsConfirmation } = await authService.signUp(v.email, v.password, v.full_name, from ?? '/onboarding')
      if (needsConfirmation) setSentTo(v.email)
    } catch (err) {
      setError(friendlyError(err))
    }
  })

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle={`We sent a confirmation link to ${sentTo}.`}>
        <div className="flex gap-3 rounded-md border bg-surface p-4 text-sm">
          <MailCheck className="h-5 w-5 shrink-0 text-brand" />
          <p>Open the link to confirm your address, then sign in to set up your farm. The link expires in 24 hours.</p>
        </div>
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link to="/auth/sign-in">Back to sign in</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Create your account" subtitle="Set up your farm in a few minutes. You can invite your team afterwards.">
      <SetupNotice />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Your name" htmlFor="su-name" error={form.formState.errors.full_name?.message}>
          <Input id="su-name" autoComplete="name" autoFocus {...form.register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="su-email" error={form.formState.errors.email?.message}>
          <Input id="su-email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="Password" htmlFor="su-password" error={form.formState.errors.password?.message} hint="At least 8 characters, with letters and a number">
          <Input id="su-password" type="password" autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="su-confirm" error={form.formState.errors.confirm?.message}>
          <Input id="su-confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/auth/sign-in" state={location.state} className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const schema = z.object({ email })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      await authService.sendPasswordReset(v.email)
      setSent(true)
    } catch (err) {
      setError(friendlyError(err))
    }
  })
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new password.">
      {sent ? (
        <Notice tone="success">If an account exists for that email, a reset link is on its way. It expires in one hour.</Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="fp-email" error={form.formState.errors.email?.message}>
            <Input id="fp-email" type="email" autoComplete="email" autoFocus {...form.register('email')} />
          </Field>
          <FormError message={error} />
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/auth/sign-in" className="mt-5 inline-block text-sm text-brand hover:underline">
        Back to sign in
      </Link>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const schema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const [error, setError] = React.useState<string | null>(null)
  const [hasSession, setHasSession] = React.useState<boolean | null>(null)
  const navigate = useNavigate()
  React.useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session))
  }, [])
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null)
    try {
      await authService.updatePassword(v.password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  })
  if (hasSession === null) return <FullPageLoader label="Checking your reset link…" />
  return (
    <AuthShell title="Choose a new password">
      {!hasSession ? (
        <Notice tone="warning">This reset link is invalid or has expired. Request a new one.</Notice>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="New password" htmlFor="rp-password" error={form.formState.errors.password?.message}>
            <Input id="rp-password" type="password" autoComplete="new-password" autoFocus {...form.register('password')} />
          </Field>
          <Field label="Confirm password" htmlFor="rp-confirm" error={form.formState.errors.confirm?.message}>
            <Input id="rp-confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <FormError message={error} />
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Save password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

/** /invite/:token. Requires sign-in with the invited address, then joins the organization. */
export function AcceptInvitePage() {
  const { token = '' } = useParams()
  const { status, email: userEmail, refresh, setActiveOrg, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const info = useQuery({
    queryKey: ['invitation', token, userEmail],
    enabled: status === 'authenticated',
    queryFn: () => adminService.getInvitation(token),
    retry: false,
  })

  if (status === 'loading') return <FullPageLoader />
  if (status === 'unauthenticated') {
    return (
      <AuthShell title="You've been invited" subtitle="Sign in or create an account with the email address the invitation was sent to.">
        <div className="flex flex-col gap-2">
          <Button onClick={() => navigate('/auth/sign-in', { state: { from: location.pathname } })}>Sign in</Button>
          <Button variant="outline" onClick={() => navigate('/auth/sign-up', { state: { from: location.pathname } })}>
            Create an account
          </Button>
        </div>
      </AuthShell>
    )
  }

  const accept = async () => {
    setPending(true)
    setError(null)
    try {
      const orgId = await adminService.acceptInvitation(token)
      await refresh()
      await setActiveOrg(orgId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setPending(false)
    }
  }

  const s = info.data?.status
  return (
    <AuthShell title="Join an organization">
      {info.isLoading ? <p className="text-sm text-muted-foreground">Checking the invitation…</p> : null}
      {info.error ? <FormError message={friendlyError(info.error)} /> : null}
      {s === 'pending' ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-md border bg-surface p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-brand" />
            <p>
              You are invited to <strong>{info.data?.organization_name}</strong> as <strong>{info.data?.role_name}</strong>.
            </p>
          </div>
          <FormError message={error} />
          <Button className="w-full" onClick={accept} loading={pending}>
            Accept and continue
          </Button>
        </div>
      ) : null}
      {s === 'wrong_email' ? (
        <div className="space-y-3">
          <Notice tone="warning">
            This invitation was sent to a different email address. You are signed in as {userEmail}.
          </Notice>
          <Button variant="outline" className="w-full" onClick={() => void signOut()}>
            Sign out and use another account
          </Button>
        </div>
      ) : null}
      {s && !['pending', 'wrong_email'].includes(s) ? (
        <Notice tone="warning">
          {s === 'expired' ? 'This invitation has expired.' : s === 'accepted' ? 'This invitation has already been used.' : 'This invitation is no longer valid.'} Ask
          the farm owner to send a new one.
        </Notice>
      ) : null}
    </AuthShell>
  )
}
