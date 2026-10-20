import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Bird, Fish, Sprout } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { adminService } from '@/features/admin/services/admin.service'
import { sitesService } from '@/features/sites/services/sites.service'
import { BrandLockup } from '@/shared/components/brand'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input, Select } from '@/shared/components/ui/input'
import { Field, FormError } from '@/shared/components/common'
import { friendlyError } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { COUNTRIES, NIGERIAN_STATES, TIMEZONES } from '@/shared/lib/regions'

const orgSchema = z.object({
  name: z.string().trim().min(2, 'Enter your farm or business name').max(120),
  country: z.string().length(2),
  currency: z.string().length(3),
  timezone: z.string().min(3),
})

const siteSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name for this site').max(120),
    address: z.string().trim().max(300).optional(),
    state_region: z.string().trim().max(80).optional(),
    has_poultry: z.boolean(),
    has_fish: z.boolean(),
    has_crops: z.boolean(),
  })
  .refine((v) => v.has_poultry || v.has_fish || v.has_crops, { path: ['has_poultry'], message: 'Choose at least one type of production' })

const TONE = {
  poultry: { on: 'border-poultry bg-poultry-soft/40', icon: 'bg-poultry text-white' },
  fish: { on: 'border-fish bg-fish-soft/40', icon: 'bg-fish text-white' },
  crop: { on: 'border-crop bg-crop-soft/40', icon: 'bg-crop text-white' },
} as const

function TypeToggle({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
  tone,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  tone: 'poultry' | 'fish' | 'crop'
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        checked ? TONE[tone].on : 'bg-surface hover:bg-muted/50',
      )}
    >
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', checked ? TONE[tone].icon : 'bg-muted text-muted-foreground')}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[13px] text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}

export function OnboardingPage() {
  const { refresh, setActiveOrg, memberships, profile } = useAuth()
  const navigate = useNavigate()
  const [orgId, setOrgId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const orgForm = useForm<z.infer<typeof orgSchema>>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '', country: 'NG', currency: 'NGN', timezone: 'Africa/Lagos' },
  })
  const siteForm = useForm<z.infer<typeof siteSchema>>({
    resolver: zodResolver(siteSchema),
    defaultValues: { name: '', address: '', state_region: '', has_poultry: false, has_fish: false, has_crops: false },
  })
  const country = orgForm.watch('country')

  React.useEffect(() => {
    const c = COUNTRIES.find((x) => x.code === country)
    if (c) {
      orgForm.setValue('currency', c.currency)
      orgForm.setValue('timezone', c.timezone)
    }
  }, [country, orgForm])

  const createOrg = orgForm.handleSubmit(async (v) => {
    setError(null)
    try {
      const id = await adminService.createOrganization(v)
      setOrgId(id)
      siteForm.setValue('name', `${v.name.replace(/\s+(farms?|ltd|limited|enterprises?)$/i, '')} main farm`)
    } catch (err) {
      setError(friendlyError(err))
    }
  })

  const createSite = siteForm.handleSubmit(async (v) => {
    if (!orgId) return
    setError(null)
    try {
      await sitesService.create(orgId, { ...v, country })
      await refresh()
      await setActiveOrg(orgId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
    }
  })

  const step = orgId ? 2 : 1
  const typeError = siteForm.formState.errors.has_poultry?.message

  return (
    <div className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto max-w-xl">
        <BrandLockup />
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground" aria-label={`Step ${step} of 2`}>
          <span className={cn('h-1.5 w-12 rounded-full', 'bg-brand')} />
          <span className={cn('h-1.5 w-12 rounded-full', step === 2 ? 'bg-brand' : 'bg-border')} />
          <span className="ml-1">Step {step} of 2</span>
        </div>

        <Card className="mt-4 p-6">
          {step === 1 ? (
            <form onSubmit={createOrg} className="space-y-4" noValidate>
              <div>
                <h1 className="text-2xl font-semibold">Set up your farm business</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile?.full_name ? `Welcome, ${profile.full_name.split(' ')[0]}. ` : ''}This is the organization your records, users and money belong to.
                </p>
              </div>
              <Field label="Farm or business name" htmlFor="ob-name" error={orgForm.formState.errors.name?.message} required>
                <Input id="ob-name" autoFocus placeholder="e.g. Green Acres Agro Ltd" {...orgForm.register('name')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Country" htmlFor="ob-country">
                  <Select id="ob-country" {...orgForm.register('country')}>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Currency" htmlFor="ob-currency" hint="Cannot change after money is recorded">
                  <Select id="ob-currency" {...orgForm.register('currency')}>
                    {[...new Set(COUNTRIES.map((c) => c.currency))].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Time zone" htmlFor="ob-tz" hint="Used for 'today' in daily records and alerts">
                <Select id="ob-tz" {...orgForm.register('timezone')}>
                  {TIMEZONES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <FormError message={error} />
              <Button type="submit" className="w-full" loading={orgForm.formState.isSubmitting}>
                Continue
              </Button>
              {memberships.length > 0 ? (
                <Button variant="ghost" className="w-full" onClick={() => navigate('/')}>
                  Back to my farms
                </Button>
              ) : null}
            </form>
          ) : (
            <form onSubmit={createSite} className="space-y-4" noValidate>
              <div>
                <h1 className="text-2xl font-semibold">Add your first farm site</h1>
                <p className="mt-1 text-sm text-muted-foreground">A site is one physical location. You can add more sites later.</p>
              </div>
              <Field label="Site name" htmlFor="ob-site" error={siteForm.formState.errors.name?.message} required>
                <Input id="ob-site" autoFocus {...siteForm.register('name')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={country === 'NG' ? 'State' : 'State / region'} htmlFor="ob-state">
                  {country === 'NG' ? (
                    <Select id="ob-state" {...siteForm.register('state_region')}>
                      <option value="">Choose a state</option>
                      {NIGERIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input id="ob-state" {...siteForm.register('state_region')} />
                  )}
                </Field>
                <Field label="Address or nearest town" htmlFor="ob-address">
                  <Input id="ob-address" {...siteForm.register('address')} />
                </Field>
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium">What do you produce here?</legend>
                <div className="grid gap-2">
                  <TypeToggle tone="poultry" icon={Bird} label="Poultry" description="Layers, broilers, breeders" checked={siteForm.watch('has_poultry')} onChange={(v) => siteForm.setValue('has_poultry', v, { shouldValidate: true })} />
                  <TypeToggle tone="fish" icon={Fish} label="Fish" description="Ponds, tanks, cages" checked={siteForm.watch('has_fish')} onChange={(v) => siteForm.setValue('has_fish', v, { shouldValidate: true })} />
                  <TypeToggle tone="crop" icon={Sprout} label="Crops" description="Fields, plots, greenhouses" checked={siteForm.watch('has_crops')} onChange={(v) => siteForm.setValue('has_crops', v, { shouldValidate: true })} />
                </div>
                {typeError ? <p className="text-[13px] text-destructive">{typeError}</p> : null}
              </fieldset>
              <FormError message={error} />
              <Button type="submit" className="w-full" loading={siteForm.formState.isSubmitting}>
                Open my farm
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
