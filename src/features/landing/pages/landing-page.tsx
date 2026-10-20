import * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bird, Check, Egg, Fish, HeartCrack, Menu, Plus, Receipt, ShoppingBasket, Sprout, Wheat, X } from 'lucide-react'
import { BrandLockup } from '@/shared/components/brand'
import { Reveal } from '@/shared/components/reveal'
import { Button } from '@/shared/components/ui/button'
import { PRODUCT } from '@/shared/config/env'
import { cn } from '@/shared/lib/utils'

const NAV = [
  { href: '#a-day', label: 'How it works' },
  { href: '#record', label: 'What you record' },
  { href: '#trust', label: 'Why the numbers hold up' },
  { href: '#team', label: 'Your team' },
]

function Header() {
  const [open, setOpen] = React.useState(false)
  return (
    <header className="sticky top-0 z-30 border-b bg-surface/95">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/" aria-label={`${PRODUCT.name} home`}>
          <BrandLockup />
        </Link>
        <nav className="ml-6 hidden items-center gap-6 text-sm text-muted-foreground lg:flex" aria-label="Page">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-foreground">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <Button asChild variant="ghost">
            <Link to="/auth/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/auth/sign-up">Set up your farm</Link>
          </Button>
        </div>
        <button type="button" className="ml-auto rounded-md p-2 hover:bg-muted sm:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div className="border-t px-5 pb-4 sm:hidden">
          <nav className="flex flex-col py-2 text-sm" aria-label="Page">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="py-2 text-muted-foreground" onClick={() => setOpen(false)}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link to="/auth/sign-in">Sign in</Link>
            </Button>
            <Button asChild className="flex-1">
              <Link to="/auth/sign-up">Set up your farm</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  )
}

function Hero() {
  // Each line eases in after the one before it.
  const rise = (ms: number) => ({ style: { animationDelay: `${ms}ms` } })
  return (
    <section className="relative isolate overflow-hidden bg-foreground text-white">
      {/* Rice harvest in Makurdi, Nigeria. Photo: ZEUS THE CREATOR on Pexels (free for commercial use). */}
      <img
        src="/images/hero-rice-harvest-2000.jpg"
        srcSet="/images/hero-rice-harvest-1000.jpg 1000w, /images/hero-rice-harvest-2000.jpg 2000w"
        sizes="100vw"
        alt=""
        aria-hidden
        fetchPriority="high"
        className="absolute inset-0 -z-10 h-full w-full animate-slow-zoom object-cover object-[50%_55%]"
      />
      {/* Dark scrim so white text stays readable over any part of the photo. */}
      <div className="absolute inset-0 -z-10 bg-black/55" aria-hidden />
      <div className="mx-auto flex min-h-[78vh] max-w-3xl flex-col items-center justify-center px-5 py-24 text-center sm:py-32">
        <h1 {...rise(0)} className="animate-rise text-4xl font-semibold leading-[1.1] drop-shadow-sm sm:text-6xl">
          <span className="text-[hsl(145_60%_66%)]">Know what happened</span> on your farm today.
        </h1>
        <p {...rise(120)} className="animate-rise mt-6 max-w-2xl text-[17px] leading-relaxed text-white/85 sm:text-lg">
          {PRODUCT.name} keeps the daily records of <span className="font-medium text-[hsl(145_60%_66%)]">poultry, fish and crop farms</span>: deaths, feed, eggs, harvests, stock, sales and money. Your workers record it on their phones. You see the whole farm in <span className="font-medium text-white">figures you can trust</span>.
        </p>
        <div {...rise(240)} className="animate-rise mt-9 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="group">
            <Link to="/auth/sign-up">
              Set up your farm <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/50 bg-white/10 text-white hover:bg-white/20">
            <Link to="/auth/sign-in">Sign in</Link>
          </Button>
        </div>
        <p {...rise(360)} className="animate-rise mt-6 text-sm text-white/75">
          Records kept in naira or your own currency. Works on any phone browser.
        </p>
      </div>
      <a
        href="https://www.pexels.com/photo/people-farming-on-the-field-14314165/"
        target="_blank"
        rel="noreferrer noopener"
        className="absolute bottom-3 right-4 text-[11px] text-white/55 hover:text-white/80"
      >
        Photo: ZEUS THE CREATOR / Pexels
      </a>
    </section>
  )
}

const DAY = [
  { time: '6:30', icon: Wheat, what: 'Feed goes to House A', detail: '4 bags of layer mash leave the store. The store balance drops once, right then.', effect: 'Store: −100 kg' },
  { time: '9:00', icon: HeartCrack, what: 'Three birds found dead', detail: 'The worker taps Record, picks the flock and writes "heat stress".', effect: 'Flock: 788 → 785' },
  { time: '11:00', icon: Egg, what: '22 crates collected', detail: 'One crate is cracked, so 21 are available to sell.', effect: 'Eggs available: +21 crates' },
  { time: '15:30', icon: ShoppingBasket, what: 'Mama Nkechi buys 15 crates', detail: 'She pays half now. The rest is shown as owed, not as income.', effect: 'Income: +₦36,000 · Owed: ₦36,000' },
  { time: 'Evening', icon: Receipt, what: 'You check the dashboard', detail: 'Mortality, lay rate, feed eaten, stock and money, for one site or all of them.', effect: 'No spreadsheet to fill in' },
]

function SectionHeading({ title, body }: { title: React.ReactNode; body: string }) {
  return (
    <Reveal>
      <h2 className="max-w-2xl text-3xl font-semibold leading-tight">{title}</h2>
      <p className="mt-3 max-w-2xl text-muted-foreground">{body}</p>
    </Reveal>
  )
}

function ADay() {
  return (
    <section id="a-day" className="scroll-mt-16 bg-background py-20">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          title={<>A day on the farm, <span className="text-brand">recorded once.</span></>}
          body="Each entry updates everything it touches: the flock count, the store, the produce available to sell and the money. Nobody re-types figures at the end of the week."
        />
        <ol className="mt-10 grid gap-3 md:grid-cols-5">
          {DAY.map((d, i) => (
            <Reveal as="li" key={d.time} delay={i * 90} className="rounded-xl border bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted">
                  <d.icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold">{d.time}</span>
              </div>
              <p className="mt-3 font-medium">{d.what}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d.detail}</p>
              <p className="mt-3 border-t pt-2 text-[13px] font-medium tabular">{d.effect}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

const RECORD = [
  {
    type: 'Poultry',
    icon: Bird,
    chip: 'bg-poultry-soft text-poultry-ink',
    record: ['Flocks with breed, source and house', 'Daily mortality and culls with reasons', 'Feed issued and eaten', 'Eggs collected, cracked and graded', 'Live bird sales and transfers between houses'],
    see: ['Birds on farm, per flock', 'Mortality rate and lay rate (hen-day)', 'Feed per bird per day', 'Eggs sold, used and still available', 'Income and costs per flock'],
  },
  {
    type: 'Fish',
    icon: Fish,
    chip: 'bg-fish-soft text-fish-ink',
    record: ['Stocking by pond or tank', 'Mortality, always marked as against an estimate', 'Feed issued and eaten', 'Sample weights', 'Harvests by count and weight'],
    see: ['Estimated fish and biomass per pond', 'Growth from samples', 'Feed per fish', 'Harvest weight and sales', 'Income and costs per batch'],
  },
  {
    type: 'Crops',
    icon: Sprout,
    chip: 'bg-crop-soft text-crop-ink',
    record: ['Fields and plots in hectares, acres or plots', 'Planting, fertilizer, spraying, weeding, labour', 'Inputs taken from the store', 'Field observations and losses', 'Harvests by weight, grade and destination'],
    see: ['Yield per hectare, by field and season', 'Inputs used per hectare', 'Upcoming harvests', 'Produce sold and still in store', 'Income and costs per crop cycle'],
  },
]

function WhatYouRecord() {
  return (
    <section id="record" className="scroll-mt-16 border-y bg-surface py-20">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          title={<>Poultry, fish and crops <span className="text-brand">in one place.</span></>}
          body="Run one enterprise or all three, across as many sites as you farm. Stock, sales and money are shared, so a bag of feed or a naira is only counted once."
        />
        <Reveal className="mt-10 overflow-hidden rounded-xl border">
          <div className="hidden grid-cols-[12rem_1fr_1fr] border-b bg-muted/60 px-6 py-3 text-xs font-medium text-muted-foreground md:grid">
            <span>Enterprise</span>
            <span>Your team records</span>
            <span>You see</span>
          </div>
          {RECORD.map((r) => (
            <div key={r.type} className="grid gap-5 border-b px-6 py-7 transition-colors last:border-b-0 hover:bg-muted/40 md:grid-cols-[12rem_1fr_1fr]">
              <div className="flex items-center gap-3 md:items-start">
                <span className={cn('grid h-9 w-9 place-items-center rounded-lg', r.chip)}>
                  <r.icon className="h-[18px] w-[18px]" />
                </span>
                <span className="text-lg font-semibold">{r.type}</span>
              </div>
              <ul className="space-y-1.5 text-sm">
                <li className="text-xs font-medium text-muted-foreground md:hidden">Your team records</li>
                {r.record.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {x}
                  </li>
                ))}
              </ul>
              <ul className="space-y-1.5 text-sm">
                <li className="text-xs font-medium text-muted-foreground md:hidden">You see</li>
                {r.see.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

const TRUST = [
  { title: 'Feed leaves the store once.', body: 'Issuing feed to a house takes it out of stock. Recording what the birds ate later never takes it out again.' },
  { title: 'Nothing is overwritten.', body: 'A mistake is corrected with a reversing entry and a reason. The original stays in the history, with who did what and when.' },
  { title: 'Estimates are marked as estimates.', body: 'Fish in a pond are never shown as a counted figure. When a harvest finds more or fewer, the difference is recorded openly.' },
  { title: 'A double tap saves once.', body: 'On a weak network a worker can press Save again without creating a second entry.' },
  { title: 'You cannot sell what you do not have.', body: 'Eggs, fish and harvests are checked against what is still available before a sale is saved.' },
  { title: 'Cash is not called profit.', body: 'Income minus expenses is shown as cash recorded. Money customers still owe is shown separately.' },
]

function Trust() {
  return (
    <section id="trust" className="scroll-mt-16 bg-background py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <h2 className="text-3xl font-semibold leading-tight">Figures you can <span className="text-brand">make decisions on.</span></h2>
          <p className="mt-3 text-muted-foreground">A dashboard is only as good as the records under it. These rules are enforced by the database itself, not by a screen that someone could work around.</p>
          <p className="mt-6 rounded-xl border bg-surface p-4 text-sm text-muted-foreground">
            Every farm's records are kept apart at the database level. One farm can never see, change or reach another farm's data, whatever link someone types.
          </p>
        </Reveal>
        <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
          {TRUST.map((t, i) => (
            <Reveal key={t.title} delay={(i % 2) * 80 + Math.floor(i / 2) * 60}>
              <dt className="font-semibold">{t.title}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.body}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  )
}

const ROLES = [
  { role: 'Farm owner', does: 'Sees everything, sets up sites, invites the team and decides who can see money.' },
  { role: 'Farm manager', does: 'Runs the sites they are given: flocks, ponds, fields, stock and operational reports.' },
  { role: 'Farm worker', does: 'Records the day: mortality, feed, eggs, harvests and field work. No access to money.' },
  { role: 'Accountant', does: 'Records income and expenses, follows up money owed and reads the financial reports.' },
]

function MenuRow({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px]">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {label}
    </div>
  )
}

function Team() {
  return (
    <section id="team" className="scroll-mt-16 border-y bg-surface py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.2fr_1fr]">
        <Reveal>
          <h2 className="text-3xl font-semibold leading-tight">Everyone records <span className="text-brand">their part.</span></h2>
          <p className="mt-3 max-w-xl text-muted-foreground">Give each person a role and the sites they work on. A worker on the Abeokuta site sees Abeokuta, not your accounts or your other farms.</p>
          <ul className="mt-8 divide-y rounded-xl border">
            {ROLES.map((r) => (
              <li key={r.role} className="grid gap-1 px-5 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <span className="font-semibold">{r.role}</span>
                <span className="text-sm text-muted-foreground">{r.does}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">Owners can adjust what each role is allowed to do.</p>
        </Reveal>
        <Reveal delay={150} className="mx-auto w-full max-w-[290px]">
          <div className="rounded-[2.2rem] border-[10px] border-foreground bg-surface shadow-raised transition-transform duration-500 hover:-translate-y-1">
            <div className="rounded-t-[1.6rem] border-b px-4 pb-3 pt-5">
              <p className="text-[11px] text-muted-foreground">House A · PB-2610</p>
              <p className="text-base font-semibold">785 birds</p>
            </div>
            <div className="px-3 pb-4">
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">Record</p>
              <div className="rounded-lg border p-1">
                <MenuRow icon={HeartCrack} label="Mortality or loss" />
                <MenuRow icon={Wheat} label="Feed" />
                <MenuRow icon={Egg} label="Egg collection" />
                <MenuRow icon={Fish} label="Fish harvest" />
                <MenuRow icon={Sprout} label="Fertilizer applied" />
              </div>
              <div className="mt-3 flex justify-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white shadow-raised">
                  <Plus className="h-5 w-5" />
                </span>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">Large buttons and number pads for the pen and the pond. Enter feed in bags and eggs in crates; {PRODUCT.name} converts.</p>
        </Reveal>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal className="rounded-2xl border bg-surface px-6 py-12 text-center shadow-card">
          <h2 className="text-3xl font-semibold leading-tight">Start with <span className="text-brand">one flock, one pond or one field.</span></h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">Set up your farm in a few minutes, add opening stock and counts, then invite your team when you are ready.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth/sign-up">
                Set up your farm <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth/sign-in">Sign in</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

export function LandingPage() {
  React.useEffect(() => {
    document.title = `${PRODUCT.name}: farm records for poultry, fish and crops`
  }, [])
  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <main>
        <Hero />
        <ADay />
        <WhatYouRecord />
        <Trust />
        <Team />
        <FinalCta />
      </main>
      <footer className="border-t bg-surface py-8 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLockup />
          <div className="flex gap-5">
            <Link to="/auth/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
            <Link to="/auth/sign-up" className="hover:text-foreground">
              Create an account
            </Link>
          </div>
          <p>
            © {new Date().getFullYear()} {PRODUCT.company}
          </p>
        </div>
      </footer>
    </div>
  )
}
