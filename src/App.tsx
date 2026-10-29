import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Boxes,
  BriefcaseBusiness, Check, ChevronDown, CircleDollarSign, Clock3, LayoutDashboard,
  LogOut, Menu, Package, Plus, Search, Settings, ShoppingBag, ShoppingCart,
  Sparkles, Store, Tags, TrendingUp, Users, X,
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { multiplyMoney, sumMoney } from './lib/money'
import './App.css'

const SalesChart = lazy(() => import('./components/SalesChart'))

type Page = 'Overview' | 'Products' | 'Inventory' | 'Point of sale' | 'Receiving' | 'Sales' | 'Reports' | 'Settings'
type Business = { id: string; name: string; currency: string; timezone: string; role: string }
type Product = {
  id: string; name: string; sku: string; category_name?: string | null; status: string
  variants?: Variant[]
}
type Variant = {
  id: string; product_id: string; sku: string; size: string | null; color: string | null
  price: string; cost_price: number; stock_quantity: number; reorder_threshold: number
}
type Sale = { id: string; sale_number: string; total: number | string; created_at: string; status: string }
type Movement = { id: string; movement_type: string; quantity_change: number; created_at: string; reason: string | null; variant_sku?: string }
type MovementRecord = Omit<Movement, 'variant_sku'> & { product_variants: { sku: string } | null }
type Notice = { kind: 'success' | 'error'; text: string }

const navigation: { name: Page; icon: typeof LayoutDashboard; group: string }[] = [
  { name: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { name: 'Products', icon: Package, group: 'WORKSPACE' },
  { name: 'Inventory', icon: Boxes, group: 'WORKSPACE' },
  { name: 'Point of sale', icon: ShoppingCart, group: 'SELLING' },
  { name: 'Receiving', icon: ArrowDownToLine, group: 'SELLING' },
  { name: 'Sales', icon: CircleDollarSign, group: 'INSIGHTS' },
  { name: 'Reports', icon: TrendingUp, group: 'INSIGHTS' },
  { name: 'Settings', icon: Settings, group: 'MANAGE' },
]

const money = (amount: number | string, currency: string) => new Intl.NumberFormat('en-RW', {
  style: 'currency', currency, maximumFractionDigits: currency === 'RWF' ? 0 : 2,
}).format(Number.isFinite(Number(amount)) ? Number(amount) : 0)

const businessDateKey = (date: Date, timezone: string) =>
  date.toLocaleDateString('en-CA', { timeZone: timezone })

async function fetchCatalogPages(businessId: string) {
  if (!supabase) return { data: null, error: new Error('Supabase is not configured.') }
  const rows: unknown[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('get_catalog', {
      p_business_id: businessId, p_limit: 500, p_offset: offset,
    })
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) return { data: rows, error: null }
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [business, setBusiness] = useState<Business | null>(null)
  const [page, setPage] = useState<Page>('Overview')
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'forgot' | 'reset'>('login')
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [todaySales, setTodaySales] = useState(0)
  const [monthSales, setMonthSales] = useState(0)
  const [stockUnits, setStockUnits] = useState(0)
  const [inventoryCost, setInventoryCost] = useState(0)
  const [chartData, setChartData] = useState<{ day: string; sales: number }[]>([])
  const [showProduct, setShowProduct] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [showCheckout, setShowCheckout] = useState(false)
  const [checkoutVariantId, setCheckoutVariantId] = useState('')
  const [clockNow] = useState(() => new Date())

  const notify = useCallback((kind: Notice['kind'], text: string) => {
    setNotice({ kind, text })
    window.setTimeout(() => setNotice(null), 4200)
  }, [])
  const startCheckout = (variantId?: string) => {
    setCheckoutVariantId(variantId ?? '')
    setShowCheckout(true)
  }

  const loadBusiness = useCallback(async (userId: string) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('business_memberships')
      .select('role, business_id, businesses(id, name, currency, timezone)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (error) throw error
    const record = data?.businesses as unknown as Omit<Business, 'role'> | null
    if (record && data) setBusiness({ ...record, role: data.role })
    else setBusiness(null)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) { notify('error', error.message); setBusy(false); return }
      if (!active) return
      setSession(data.session)
      if (data.session) {
        try { await loadBusiness(data.session.user.id) } catch (reason) {
          notify('error', reason instanceof Error ? reason.message : 'Could not load your business.')
        }
      }
      setBusy(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setAuthMode('reset')
      setSession(nextSession)
      if (!nextSession) { setBusiness(null); setBusy(false) }
      else {
        setBusy(true)
        window.setTimeout(() => {
          loadBusiness(nextSession.user.id).catch((reason: unknown) =>
            notify('error', reason instanceof Error ? reason.message : 'Could not load your business.'))
            .finally(() => setBusy(false))
        }, 0)
      }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadBusiness, notify])

  const loadData = useCallback(async () => {
    if (!supabase || !business) return
    const since = new Date(Date.now() - (31 * 24 * 60 * 60 * 1000))
    const canSeeCosts = ['owner', 'admin', 'manager'].includes(business.role)
    const [catalogResult, saleResult, movementResult, balanceResult] = await Promise.all([
      fetchCatalogPages(business.id),
      supabase.from('sales').select('id,sale_number,total,created_at,status').eq('business_id', business.id).eq('status', 'completed').gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(100),
      canSeeCosts ? supabase.from('inventory_movements').select('id,movement_type,quantity_change,created_at,reason,product_variants(sku)').eq('business_id', business.id).order('created_at', { ascending: false }).limit(12) : Promise.resolve({ data: [], error: null }),
      canSeeCosts ? supabase.rpc('get_inventory_valuation', { p_business_id: business.id }) : Promise.resolve({ data: null, error: null }),
    ])
    const error = catalogResult.error ?? saleResult.error ?? movementResult.error ?? balanceResult.error
    if (error) {
      notify('error', error.message)
      return
    }
    const productMap = new Map<string, Product>()
    for (const raw of catalogResult.data ?? []) {
      const row = raw as {
        product_id: string; product_name: string; product_sku: string; category_name: string | null
        product_status: string; variant_id: string; variant_sku: string; variant_size: string | null
        variant_color: string | null; selling_price: string; cost_price: string
        reorder_threshold: number; quantity_on_hand: number
      }
      const product = productMap.get(row.product_id) ?? {
        id: row.product_id, name: row.product_name, sku: row.product_sku, status: row.product_status,
          category_name: row.category_name, variants: [],
      }
      product.variants?.push({
        id: row.variant_id, product_id: row.product_id, sku: row.variant_sku,
        size: row.variant_size, color: row.variant_color, price: String(row.selling_price),
        cost_price: Number(row.cost_price), stock_quantity: Number(row.quantity_on_hand),
        reorder_threshold: Number(row.reorder_threshold),
      })
      productMap.set(row.product_id, product)
    }
    const normalizedProducts = [...productMap.values()]
    const rows = (saleResult.data ?? []) as Sale[]
    setProducts(normalizedProducts)
    setSales(rows)
    const movementRows = (movementResult.data ?? []) as unknown as MovementRecord[]
    setMovements(movementRows.map((raw) => ({
      ...raw, variant_sku: raw.product_variants?.sku ?? '—',
    })))
    setStockUnits(normalizedProducts.flatMap((product) => product.variants ?? []).reduce((total, variant) => total + variant.stock_quantity, 0))
    setInventoryCost(Number(balanceResult.data ?? 0))
    const todayKey = businessDateKey(new Date(), business.timezone)
    const monthKey = todayKey.slice(0, 7)
    const todayRows = rows.filter((sale) => businessDateKey(new Date(sale.created_at), business.timezone) === todayKey)
    const monthRows = rows.filter((sale) => businessDateKey(new Date(sale.created_at), business.timezone).startsWith(monthKey))
    setTodaySales(Number(sumMoney(todayRows.map((sale) => sale.total))))
    setMonthSales(Number(sumMoney(monthRows.map((sale) => sale.total))))
    const dates = Array.from({ length: 7 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - index))
      return date
    })
    setChartData(dates.map((date) => {
      const dayKey = businessDateKey(date, business.timezone)
      return {
        day: date.toLocaleDateString('en', { weekday: 'short', timeZone: business.timezone }),
        sales: Number(sumMoney(rows.filter((sale) => businessDateKey(new Date(sale.created_at), business.timezone) === dayKey)
          .map((sale) => sale.total))),
      }
    }))
  }, [business, notify])

  useEffect(() => {
    if (!business) return
    const request = window.setTimeout(() => { void loadData() }, 0)
    return () => window.clearTimeout(request)
  }, [business, loadData])

  const visibleProducts = useMemo(() => products.filter((product) =>
    `${product.name} ${product.sku} ${product.category_name ?? ''} ${product.variants?.map((variant) => variant.sku).join(' ') ?? ''}`
      .toLowerCase().includes(query.toLowerCase())), [products, query])

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email') ?? '')
    setBusy(true)
    const result = authMode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password: String(values.get('password') ?? '') })
      : authMode === 'reset'
        ? await supabase.auth.updateUser({ password: String(values.get('password') ?? '') })
        : await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (result.error) { setBusy(false); notify('error', result.error.message) }
    else if (authMode === 'login') return
    else if (authMode === 'forgot') { setBusy(false); notify('success', 'If an account exists for this email, a recovery link has been sent.') }
    else if (authMode === 'reset') { setAuthMode('login'); notify('success', 'Your password has been updated.') }
  }

  async function handleLogout() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) notify('error', error.message)
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    setBusy(true)
    const { error } = await supabase.rpc('create_business', {
      p_name: String(values.get('name') ?? ''),
      p_currency: String(values.get('currency') ?? 'RWF'),
      p_timezone: String(values.get('timezone') ?? 'Africa/Kigali'),
      p_location_name: String(values.get('location') ?? 'Main boutique'),
    })
    setBusy(false)
    if (error) notify('error', error.message)
    else {
      try {
        if (!session?.user?.id) throw new Error('Authentication required')
        await loadBusiness(session.user.id)
        notify('success', 'Your business workspace is ready.')
      }
      catch (reason) { notify('error', reason instanceof Error ? reason.message : 'Business setup failed.') }
    }
  }

  if (!supabase) return <SetupRequired />
  if (authMode === 'reset') return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} busy={busy} notice={notice} />
  if (busy && !session) return <div className="full-loading"><span className="spinner" /> Loading workspace</div>
  if (!session) return <AuthScreen mode={authMode} setMode={setAuthMode} onSubmit={handleAuth} busy={busy} notice={notice} />
  if (busy && !business) return <div className="full-loading"><span className="spinner" /> Loading your business</div>
  if (!business) return <Onboarding onSubmit={createBusiness} busy={busy} notice={notice} onLogout={handleLogout} />

  const totalProducts = products.length
  const canSeeCosts = ['owner', 'admin', 'manager'].includes(business.role)
  const canManageProducts = ['owner', 'admin', 'manager'].includes(business.role)
  const canReceiveStock = ['owner', 'admin', 'manager', 'stock_clerk'].includes(business.role)
  const allowedPages: Page[] = business.role === 'cashier'
    ? ['Overview', 'Products', 'Point of sale', 'Sales']
    : business.role === 'stock_clerk'
      ? ['Overview', 'Products', 'Inventory', 'Receiving']
      : navigation.map((item) => item.name)
  const todayLabel = new Intl.DateTimeFormat('en', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: business.timezone,
  }).format(clockNow).toUpperCase()
  const lowStock = products.flatMap((product) => product.variants ?? []).filter((variant) => variant.stock_quantity <= variant.reorder_threshold && variant.stock_quantity > 0).length
  return (
    <div className="app-shell">
      {mobileNav && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><Store size={19} /></div><div><strong>atelier</strong><span>STOCK STUDIO</span></div><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="workspace-switch"><div className="workspace-avatar">{business.name.slice(0, 1).toUpperCase()}</div><div className="workspace-copy"><strong>{business.name}</strong><span>Primary location</span></div><ChevronDown size={15} /></div>
        <nav className="side-nav" aria-label="Main navigation">
          {['WORKSPACE', 'SELLING', 'INSIGHTS', 'MANAGE'].map((group) => {
            const groupItems = navigation.filter((item) => item.group === group && allowedPages.includes(item.name))
            return groupItems.length > 0 && (
              <section className="nav-group" key={group}>
                <span className="nav-label">{group}</span>
                {groupItems.map(({ name, icon: Icon }) => (
                  <button key={name} className={`nav-item ${page === name ? 'active' : ''}`} onClick={() => { setPage(name); setMobileNav(false) }}>
                    <Icon size={17} strokeWidth={1.8} /><span>{name}</span>
                    {name === 'Inventory' && lowStock > 0 && <span className="nav-count">{lowStock}</span>}
                  </button>
                ))}
              </section>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><Sparkles size={16} /></div><strong>Need a hand?</strong><p>Your stockroom, in good order.</p></div>
          <button className="profile-button" onClick={handleLogout}><div className="profile-avatar">{session.user.email?.slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{session.user.email}</strong><span>Sign out</span></div><LogOut size={15} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="crumb"><span>Atelier</span><span className="crumb-slash">/</span><strong>{page}</strong></div>
          <div className="top-actions">
            <label className="global-search"><Search size={16} /><input placeholder="Search products, SKU…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
            <span className="top-avatar" aria-hidden="true">{session.user.email?.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div className="content-area">
          {page === 'Overview' && <Dashboard business={business} currency={business.currency} busy={busy} products={products} sales={sales} movements={movements} todaySales={todaySales} monthSales={monthSales} stockUnits={stockUnits} inventoryCost={inventoryCost} canSeeCosts={canSeeCosts} todayLabel={todayLabel} chartData={chartData} onNavigate={setPage} />}
          {page === 'Products' && <ProductsPage products={visibleProducts} allCount={totalProducts} currency={business.currency} onCreate={() => setShowProduct(true)} canManage={canManageProducts} />}
          {page === 'Inventory' && <InventoryPage products={products} movements={movements} currency={business.currency} canSeeCosts={canSeeCosts} canReceive={canReceiveStock} onReceive={() => setShowReceive(true)} />}
          {page === 'Point of sale' && <PosPage products={products} currency={business.currency} onCheckout={startCheckout} />}
          {page === 'Receiving' && <ReceivingPage products={products} movements={movements} canReceive={canReceiveStock} onReceive={() => setShowReceive(true)} />}
          {page === 'Sales' && <SalesPage sales={sales} currency={business.currency} timezone={business.timezone} />}
          {page === 'Reports' && <ReportsPage products={products} sales={sales} currency={business.currency} timezone={business.timezone} monthSales={monthSales} inventoryCost={inventoryCost} stockUnits={stockUnits} canSeeCosts={canSeeCosts} />}
          {page === 'Settings' && <SettingsPage business={business} onLogout={handleLogout} />}
        </div>
      </main>
      {showProduct && <ProductDialog businessId={business.id} currency={business.currency} onClose={() => setShowProduct(false)} onSaved={() => { setShowProduct(false); void loadData(); notify('success', 'Product and variants saved.') }} notify={notify} />}
      {showReceive && <ReceiveDialog businessId={business.id} currency={business.currency} products={products} onClose={() => setShowReceive(false)} onSaved={() => { setShowReceive(false); void loadData(); notify('success', 'Stock receipt recorded.') }} notify={notify} />}
      {showCheckout && <CheckoutDialog businessId={business.id} products={products} currency={business.currency} initialVariantId={checkoutVariantId} onClose={() => setShowCheckout(false)} onSaved={() => { setShowCheckout(false); void loadData(); notify('success', 'Sale completed and inventory updated.') }} notify={notify} />}
      {notice && <div className={`toast ${notice.kind}`} role="status"><span>{notice.kind === 'success' ? <Check size={17} /> : <X size={17} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  )
}

function SetupRequired() {
  return <div className="setup-screen"><div className="setup-card"><div className="brand-mark large"><Store size={23} /></div><p className="eyebrow">ATELIER STOCK STUDIO</p><h1>Connect your workspace</h1><p className="muted">Add your Supabase project credentials to start using your boutique workspace.</p><div className="setup-steps"><span>1</span><div><strong>Configure environment</strong><p>Copy <code>.env.example</code> to <code>.env.local</code>, then add your Supabase URL and anon key.</p></div></div><div className="setup-steps"><span>2</span><div><strong>Apply database migrations</strong><p>Run the SQL migration in <code>supabase/migrations</code> using the Supabase CLI.</p></div></div><div className="setup-steps"><span>3</span><div><strong>Create an owner account</strong><p>Enable email authentication in Supabase, then sign in and create your business.</p></div></div><div className="secure-note"><Check size={15} /> Only the public anon key belongs in frontend environment variables.</div></div></div>
}

function AuthScreen({ mode, setMode, onSubmit, busy, notice }: { mode: 'login' | 'forgot' | 'reset'; setMode: (mode: 'login' | 'forgot' | 'reset') => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; notice: Notice | null }) {
  return <div className="auth-screen"><div className="auth-story"><div className="brand light"><div className="brand-mark"><Store size={19} /></div><div><strong>atelier</strong><span>STOCK STUDIO</span></div></div><div className="story-copy"><p className="eyebrow">YOUR BUSINESS, IN BALANCE</p><h1>A little more<br /><em>in your hands.</em></h1><p>A calmer way to know what you have, what you’ve sold, and what comes next.</p></div><div className="story-foot"><span>01 — INVENTORY, SIMPLIFIED</span><span>DESIGNED FOR THE WAY YOU WORK</span></div></div><div className="auth-panel"><div className="auth-form-wrap"><p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'ACCOUNT RECOVERY'}</p><h2>{mode === 'login' ? 'Sign in to your studio' : mode === 'reset' ? 'Choose a new password' : 'Reset your password'}</h2><p className="muted">{mode === 'login' ? 'Your boutique is ready when you are.' : mode === 'reset' ? 'Choose a strong password for your account.' : 'We’ll email you a secure password reset link.'}</p><form onSubmit={onSubmit} className="form-stack">{mode !== 'reset' && <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@yourboutique.com" /></label>}{(mode === 'login' || mode === 'reset') && <label>{mode === 'reset' ? 'New password' : 'Password'}<input name="password" type="password" autoComplete={mode === 'reset' ? 'new-password' : 'current-password'} required minLength={8} placeholder={mode === 'reset' ? 'At least 8 characters' : 'Enter your password'} /></label>}<button className="primary-button wide" disabled={busy}>{busy ? <span className="spinner small" /> : mode === 'login' ? 'Sign in' : mode === 'reset' ? 'Update password' : 'Send reset link'}<ArrowUpRight size={16} /></button></form>{mode === 'login' ? <button className="text-button centered" onClick={() => setMode('forgot')}>Forgot password?</button> : mode === 'forgot' ? <button className="text-button centered" onClick={() => setMode('login')}>Back to sign in</button> : null}{notice && <div className={`inline-notice ${notice.kind}`}>{notice.text}</div>}<div className="auth-security"><Check size={15} /> Secure access, protected by Supabase Auth</div></div></div></div>
}

function Onboarding({ onSubmit, busy, notice, onLogout }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; busy: boolean; notice: Notice | null; onLogout: () => void }) {
  return <div className="setup-screen"><div className="setup-card onboarding-card"><div className="brand-mark large"><Store size={23} /></div><p className="eyebrow">A GOOD PLACE TO BEGIN</p><h1>Set up your boutique</h1><p className="muted">A few details make your inventory and reports yours. You can update these later.</p><form className="form-stack" onSubmit={onSubmit}><label>Business name<input name="name" required maxLength={120} placeholder="e.g. Imizi Boutique" /></label><div className="form-row"><label>Currency<select name="currency" defaultValue="RWF"><option value="RWF">RWF — Rwandan Franc</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option></select></label><label>Timezone<select name="timezone" defaultValue="Africa/Kigali"><option value="Africa/Kigali">Africa/Kigali</option><option value="UTC">UTC</option></select></label></div><label>First location<input name="location" required defaultValue="Main boutique" maxLength={100} /></label><button className="primary-button wide" disabled={busy}>Create workspace <ArrowUpRight size={16} /></button></form>{notice && <div className={`inline-notice ${notice.kind}`}>{notice.text}</div>}<button className="text-button centered" onClick={onLogout}>Sign out</button></div></div>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{action}</div>
}

function Dashboard({ business, currency, busy, products, sales, movements, todaySales, monthSales, stockUnits, inventoryCost, canSeeCosts, todayLabel, chartData, onNavigate }: { business: Business; currency: string; busy: boolean; products: Product[]; sales: Sale[]; movements: Movement[]; todaySales: number; monthSales: number; stockUnits: number; inventoryCost: number; canSeeCosts: boolean; todayLabel: string; chartData: { day: string; sales: number }[]; onNavigate: (page: Page) => void }) {
  const variants = products.flatMap((product) => product.variants ?? [])
  const lowStock = variants.filter((variant) => variant.stock_quantity <= variant.reorder_threshold && variant.stock_quantity > 0)
  const outOfStock = variants.filter((variant) => variant.stock_quantity <= 0)
  const recent = sales.slice(0, 5)
  return <div className="page-content"><div className="welcome-row"><div><p className="eyebrow">{todayLabel}</p><h1>{business.name}, <em>in good shape.</em></h1><p className="muted">Here’s your studio at a glance.</p></div><button className="secondary-button" onClick={() => onNavigate('Reports')}><Activity size={16} /> View reports</button></div>
    <div className="metric-grid">
      <MetricCard label="Sales today" value={money(todaySales, currency)} note="Completed transactions" icon={CircleDollarSign} tone="peach" />
      <MetricCard label="Sales this month" value={money(monthSales, currency)} note="Month to date" icon={TrendingUp} tone="lavender" />
      <MetricCard label="Units on hand" value={stockUnits.toLocaleString()} note={`${products.length} active products`} icon={Boxes} tone="sage" />
      {canSeeCosts
        ? <MetricCard label="Inventory at cost" value={money(inventoryCost, currency)} note="Weighted average cost" icon={BriefcaseBusiness} tone="butter" />
        : <MetricCard label="Active products" value={products.length.toLocaleString()} note="Catalog products" icon={Package} tone="butter" />}
    </div>
    <div className="overview-grid">
      <section className="panel sales-panel"><div className="panel-heading"><div><h2>Sales overview</h2><p>Last 7 days · completed sales</p></div><span className="period-pill">7 DAYS <ChevronDown size={12} /></span></div>{busy ? <div className="chart-placeholder"><span className="spinner" /></div> : <div className="chart-wrap">{sales.length === 0 ? <EmptyState icon={TrendingUp} title="Your first sale will show here" text="Once a sale is completed, this chart will begin to tell the story." /> : <Suspense fallback={<div className="chart-placeholder"><span className="spinner" /></div>}><SalesChart data={chartData} formatAmount={(amount) => money(amount, currency)} /></Suspense>}</div>}</section>
      <section className="panel stock-panel"><div className="panel-heading"><div><h2>Stock health</h2><p>Variant-level availability</p></div><button className="panel-link" onClick={() => onNavigate('Inventory')}>View inventory <ArrowUpRight size={14} /></button></div><div className="stock-status-row"><div className="stock-status"><span className="status-dot green" /><span>In stock</span><strong>{variants.filter((variant) => variant.stock_quantity > variant.reorder_threshold).length}</strong></div><div className="stock-status"><span className="status-dot amber" /><span>Running low</span><strong>{lowStock.length}</strong></div><div className="stock-status"><span className="status-dot red" /><span>Out of stock</span><strong>{outOfStock.length}</strong></div></div><div className="stock-nudge"><div className="nudge-icon"><Boxes size={16} /></div><div><strong>{lowStock.length + outOfStock.length === 0 ? 'Stockroom looking good' : `${lowStock.length + outOfStock.length} variant${lowStock.length + outOfStock.length === 1 ? '' : 's'} need attention`}</strong><p>{lowStock.length + outOfStock.length === 0 ? 'No low-stock items at the moment.' : 'Review your stock levels before the next rush.'}</p></div></div><button className="stock-action" onClick={() => onNavigate('Inventory')}>Open stockroom <ArrowUpRight size={15} /></button></section>
    </div>
    <div className="lower-grid"><section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Your latest completed transactions</p></div><button className="panel-link" onClick={() => onNavigate('Sales')}>All sales <ArrowUpRight size={14} /></button></div><SalesTable sales={recent} currency={currency} timezone={business.timezone} /></section><section className="panel movement-panel"><div className="panel-heading"><div><h2>Stock movements</h2><p>Latest inventory activity</p></div><button className="panel-link" onClick={() => onNavigate('Inventory')}>View all <ArrowUpRight size={14} /></button></div>{movements.length === 0 ? <EmptyState icon={ArrowLeftRight} title="No stock movements yet" text="Receipts and sales will appear here." compact /> : <div className="movement-list">{movements.slice(0, 5).map((movement) => <MovementRow movement={movement} key={movement.id} />)}</div>}</section></div>
  </div>
}

function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note: string; icon: typeof Package; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.8} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>
}

function ProductsPage({ products, allCount, currency, onCreate, canManage }: { products: Product[]; allCount: number; currency: string; onCreate: () => void; canManage: boolean }) {
  return <div className="page-content"><PageHeading eyebrow="THE CATALOG" title="Products" description={`${allCount} active product${allCount === 1 ? '' : 's'} in your boutique.`} action={canManage ? <button className="primary-button" onClick={onCreate}><Plus size={16} /> Add product</button> : undefined} /><section className="panel table-panel"><div className="panel-heading"><div><h2>All products</h2><p>Products and their sellable variants</p></div><span className="count-pill">{products.length} PRODUCTS</span></div>{products.length === 0 ? <EmptyState icon={Package} title="Your catalog starts here" text="Add a product to create its variants and begin tracking stock." action={canManage ? <button className="secondary-button" onClick={onCreate}><Plus size={15} /> Create first product</button> : undefined} /> : <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>VARIANTS</th><th>STOCK</th><th>SELLING PRICE</th><th>STATUS</th></tr></thead><tbody>{products.map((product) => { const count = (product.variants ?? []).reduce((sum, variant) => sum + variant.stock_quantity, 0); const low = (product.variants ?? []).some((variant) => variant.stock_quantity <= variant.reorder_threshold); return <tr key={product.id}><td><div className="product-cell"><div className="product-swatch"><Package size={16} /></div><div><strong>{product.name}</strong><span>{product.category_name ?? 'Uncategorised'}</span></div></div></td><td><code>{product.sku}</code></td><td>{product.variants?.length ?? 0}</td><td><span className={`stock-label ${count <= 0 ? 'empty' : low ? 'low' : ''}`}><i />{count} units</span></td><td>{money(Number(product.variants?.[0]?.price ?? 0), currency)}</td><td><span className="status-pill">Active</span></td></tr> })}</tbody></table></div>}</section></div>
}

function InventoryPage({ products, movements, currency, canSeeCosts, canReceive, onReceive }: { products: Product[]; movements: Movement[]; currency: string; canSeeCosts: boolean; canReceive: boolean; onReceive: () => void }) {
  const rows = products.flatMap((product) => (product.variants ?? []).map((variant) => ({ ...variant, product_name: product.name, category_name: product.category_name })))
  const lowRows = rows.filter((row) => row.stock_quantity > 0 && row.stock_quantity <= row.reorder_threshold)
  const totalCost = sumMoney(rows.map((row) => multiplyMoney(row.cost_price, row.stock_quantity)))
  return <div className="page-content"><PageHeading eyebrow="THE STOCKROOM" title="Inventory" description="A clear picture of what’s on your shelves." action={canReceive ? <button className="primary-button" onClick={onReceive}><ArrowDownToLine size={16} /> Receive stock</button> : undefined} /><div className="inventory-summary"><div className="summary-tile"><span>Tracked variants</span><strong>{rows.length}</strong></div><div className="summary-tile"><span>Total units</span><strong>{rows.reduce((sum, row) => sum + row.stock_quantity, 0)}</strong></div><div className="summary-tile"><span>Low stock</span><strong className="text-amber">{lowRows.length}</strong></div><div className="summary-tile"><span>Out of stock</span><strong className="text-red">{rows.filter((row) => row.stock_quantity <= 0).length}</strong></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>On-hand inventory</h2><p>Stock status by product variant{canSeeCosts ? ' · weighted-average cost basis' : ''}</p></div>{canSeeCosts && <span className="count-pill">{money(totalCost, currency)} COST</span>}</div>{rows.length === 0 ? <EmptyState icon={Boxes} title="Your stockroom is ready" text="Create a product, then receive stock against one of its variants." /> : <div className="table-scroll"><table><thead><tr><th>PRODUCT / VARIANT</th><th>SKU</th><th>SIZE / COLOUR</th><th>ON HAND</th>{canSeeCosts && <th>UNIT COST</th>}<th>STATUS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="product-cell"><div className="product-swatch"><Package size={16} /></div><div><strong>{row.product_name}</strong><span>{row.category_name ?? 'Uncategorised'}</span></div></div></td><td><code>{row.sku}</code></td><td>{[row.size, row.color].filter(Boolean).join(' / ') || 'Standard'}</td><td><strong>{row.stock_quantity}</strong></td>{canSeeCosts && <td>{money(row.cost_price, currency)}</td>}<td><span className={`stock-label ${row.stock_quantity <= 0 ? 'empty' : row.stock_quantity <= row.reorder_threshold ? 'low' : ''}`}><i />{row.stock_quantity <= 0 ? 'Out of stock' : row.stock_quantity <= row.reorder_threshold ? 'Low stock' : 'In stock'}</span></td></tr>)}</tbody></table></div>}</section><section className="panel movement-table-panel"><div className="panel-heading"><div><h2>Movement ledger</h2><p>Every change to stock, recorded with a timestamp</p></div></div>{movements.length ? <div className="movement-list padded">{movements.map((movement) => <MovementRow movement={movement} key={movement.id} />)}</div> : <EmptyState icon={ArrowLeftRight} title="No movement history yet" text="Your stock changes will be recorded here." compact />}</section></div>
}

function ReceivingPage({ products, movements, canReceive, onReceive }: { products: Product[]; movements: Movement[]; canReceive: boolean; onReceive: () => void }) {
  return <div className="page-content"><PageHeading eyebrow="GOODS IN" title="Receiving" description="Record deliveries against the variants you carry." action={canReceive ? <button className="primary-button" onClick={onReceive}><Plus size={16} /> Record receipt</button> : undefined} /><section className="panel receiving-intro"><div className="receive-illustration"><ArrowDownToLine size={23} /></div><div><p className="eyebrow">STOCK RECEIPT</p><h2>Every delivery, accounted for.</h2><p className="muted">Record quantities actually received and their unit costs. Stock balances and the inventory ledger update together in one database transaction.</p>{canReceive && <button className="secondary-button" onClick={onReceive}>Receive stock <ArrowUpRight size={15} /></button>}</div><div className="receive-stat"><span>Products ready</span><strong>{products.length}</strong><span>Latest movements <b>{movements.length}</b></span></div></section><section className="panel table-panel"><div className="panel-heading"><div><h2>Recent receipts & movements</h2><p>Newest stock activity first</p></div></div>{movements.length ? <div className="movement-list padded">{movements.map((movement) => <MovementRow movement={movement} key={movement.id} />)}</div> : <EmptyState icon={Clock3} title="Waiting on the first delivery" text="Receipts will be logged automatically as you record them." compact />}</section></div>
}

function PosPage({ products, currency, onCheckout }: { products: Product[]; currency: string; onCheckout: (variantId?: string) => void }) {
  const sellable = products.flatMap((product) => (product.variants ?? []).filter((variant) => variant.stock_quantity > 0).map((variant) => ({ ...variant, product_name: product.name })))
  return <div className="page-content"><PageHeading eyebrow="AT THE COUNTER" title="Point of sale" description="A quick, clear checkout for the busy moments." /><div className="pos-layout"><section className="panel pos-products"><div className="panel-heading"><div><h2>Ready to sell</h2><p>In-stock variants only</p></div><span className="count-pill">{sellable.length} VARIANTS</span></div>{sellable.length ? <div className="pos-product-list">{sellable.map((variant) => <button className="pos-product" key={variant.id} onClick={() => onCheckout(variant.id)}><div className="product-swatch"><ShoppingBag size={16} /></div><div className="pos-product-copy"><strong>{variant.product_name}</strong><span>{[variant.size, variant.color].filter(Boolean).join(' · ') || variant.sku} · {variant.stock_quantity} in stock</span></div><strong>{money(variant.price, currency)}</strong><Plus size={16} /></button>)}</div> : <EmptyState icon={ShoppingBag} title="No sellable stock yet" text="Receive stock against a product variant to make it available for checkout." />}</section><aside className="panel pos-checkout-card"><div className="pos-bag"><ShoppingCart size={20} /></div><h2>Simple, secure checkout</h2><p className="muted">Select a product to begin a sale. Stock is revalidated by PostgreSQL before a transaction is confirmed.</p><div className="checkout-assurance"><Check size={15} /><span>Atomic stock deduction</span></div><div className="checkout-assurance"><Check size={15} /><span>Duplicate request protection</span></div><button className="primary-button wide" onClick={() => onCheckout()} disabled={sellable.length === 0}>Start checkout <ArrowUpRight size={16} /></button></aside></div></div>
}

function SalesPage({ sales, currency, timezone }: { sales: Sale[]; currency: string; timezone: string }) {
  return <div className="page-content"><PageHeading eyebrow="TRANSACTIONS" title="Sales" description="Completed sales for the last 30 days." /><section className="panel table-panel"><div className="panel-heading"><div><h2>Sales history</h2><p>{sales.length} completed transactions · newest first</p></div><span className="count-pill">{money(sumMoney(sales.map((sale) => sale.total)), currency)} TOTAL</span></div><SalesTable sales={sales} currency={currency} timezone={timezone} /></section></div>
}

function ReportsPage({ products, sales, currency, timezone, monthSales, inventoryCost, stockUnits, canSeeCosts }: { products: Product[]; sales: Sale[]; currency: string; timezone: string; monthSales: number; inventoryCost: number; stockUnits: number; canSeeCosts: boolean }) {
  const averageOrder = sales.length ? Number(sumMoney(sales.map((sale) => sale.total))) / sales.length : 0
  return <div className="page-content"><PageHeading eyebrow="THE BIG PICTURE" title="Reports" description="A straightforward view of recorded business activity." /><div className="report-grid"><MetricCard label="Sales this month" value={money(monthSales, currency)} note="Completed sales · month to date" icon={TrendingUp} tone="peach" /><MetricCard label="Average sale" value={money(averageOrder, currency)} note={`${sales.length} completed in last 30 days`} icon={CircleDollarSign} tone="lavender" />{canSeeCosts ? <MetricCard label="Current stock at cost" value={money(inventoryCost, currency)} note="Weighted average valuation" icon={Boxes} tone="sage" /> : <MetricCard label="Units on hand" value={stockUnits.toLocaleString()} note="Sellable units" icon={Boxes} tone="sage" />}<MetricCard label="Active products" value={products.length.toString()} note="Catalog products" icon={Package} tone="butter" /></div><div className="report-disclaimer"><Activity size={17} /><div><strong>About these numbers</strong><p>Sales totals reflect completed sales only. Gross profit and net operating results are not shown until historical cost snapshots and expense posting workflows are enabled. All figures use your configured currency.</p></div></div><section className="panel table-panel"><div className="panel-heading"><div><h2>Daily sales</h2><p>Recent completed sale records</p></div></div><SalesTable sales={sales.slice(0, 10)} currency={currency} timezone={timezone} /></section></div>
}

function SettingsPage({ business, onLogout }: { business: Business; onLogout: () => void }) {
  return <div className="page-content"><PageHeading eyebrow="YOUR STUDIO" title="Settings" description="Business workspace and account details." /><div className="settings-grid"><section className="panel settings-card"><div className="settings-icon"><Store size={18} /></div><p className="eyebrow">BUSINESS</p><h2>{business.name}</h2><p className="muted">Your primary boutique workspace.</p><div className="setting-line"><span>Reporting currency</span><strong>{business.currency}</strong></div><div className="setting-line"><span>Location support</span><strong>Ready to configure</strong></div></section><section className="panel settings-card"><div className="settings-icon"><Users size={18} /></div><p className="eyebrow">ACCESS</p><h2>Your account</h2><p className="muted">Authentication is managed securely by Supabase.</p><button className="secondary-button" onClick={onLogout}><LogOut size={15} /> Sign out</button><div className="settings-foot">Staff invitations and fine-grained permissions are not enabled yet.</div></section><section className="panel settings-card"><div className="settings-icon"><Tags size={18} /></div><p className="eyebrow">DATA & SECURITY</p><h2>Protected records</h2><p className="muted">Database policies scope business data to active members. Critical stock operations run inside PostgreSQL transactions.</p><div className="secure-note"><Check size={15} /> Public key only · Row-level security enabled</div></section></div></div>
}

function SalesTable({ sales, currency, timezone }: { sales: Sale[]; currency: string; timezone: string }) {
  if (!sales.length) return <EmptyState icon={ShoppingBag} title="No sales to show yet" text="Completed checkouts will appear here." compact />
  return <div className="table-scroll"><table><thead><tr><th>SALE</th><th>DATE & TIME</th><th>STATUS</th><th className="align-right">TOTAL</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><strong className="sale-number">{sale.sale_number}</strong></td><td>{new Date(sale.created_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone })}</td><td><span className="status-pill">{sale.status}</span></td><td className="align-right"><strong>{money(sale.total, currency)}</strong></td></tr>)}</tbody></table></div>
}

function MovementRow({ movement }: { movement: Movement }) {
  const inbound = Number(movement.quantity_change) > 0
  return <div className="movement-row"><div className={`movement-icon ${inbound ? 'inbound' : 'outbound'}`}>{inbound ? <ArrowDownToLine size={15} /> : <ArrowUpRight size={15} />}</div><div className="movement-main"><strong>{movement.movement_type.replaceAll('_', ' ')}</strong><span>{movement.variant_sku} {movement.reason ? `· ${movement.reason}` : ''}</span></div><strong className={inbound ? 'qty-in' : 'qty-out'}>{inbound ? '+' : ''}{movement.quantity_change}</strong><time>{new Date(movement.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</time></div>
}

function EmptyState({ icon: Icon, title, text, action, compact = false }: { icon: typeof Package; title: string; text: string; action?: React.ReactNode; compact?: boolean }) {
  return <div className={`empty-state ${compact ? 'compact' : ''}`}><div className="empty-icon"><Icon size={19} /></div><strong>{title}</strong><p>{text}</p>{action}</div>
}

function ProductDialog({ businessId, currency, onClose, onSaved, notify }: { businessId: string; currency: string; onClose: () => void; onSaved: () => void; notify: (kind: Notice['kind'], text: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [variantRows, setVariantRows] = useState([{ sku: '', size: '', color: '', cost: '', price: '', threshold: '5' }])
  const idempotencyKey = useRef(crypto.randomUUID())
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    const name = String(values.get('name') ?? '').trim()
    const sku = String(values.get('sku') ?? '').trim()
    if (!name || !sku || variantRows.some((row) => !row.sku.trim() || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0 || !Number.isFinite(Number(row.cost)) || Number(row.cost) < 0 || !Number.isInteger(Number(row.threshold)) || Number(row.threshold) < 0)) {
      notify('error', 'Add a product name, SKU, and valid variant price and cost.')
      return
    }
    setSaving(true)
    const variants = variantRows.map((row) => ({
      sku: row.sku.trim(), size: row.size.trim(), color: row.color.trim(),
      cost_price: row.cost, price: row.price, reorder_threshold: Number(row.threshold),
    }))
    const { error } = await supabase.rpc('create_product', {
      p_business_id: businessId, p_name: name, p_sku: sku,
      p_description: String(values.get('description') ?? ''), p_variants: variants,
      p_idempotency_key: idempotencyKey.current,
    })
    setSaving(false)
    if (error) { notify('error', error.message); return }
    onSaved()
  }
  return <Dialog title="Add a product" subtitle="A product can have multiple size and colour variants." onClose={onClose}><form className="form-stack dialog-form" onChange={() => { idempotencyKey.current = crypto.randomUUID() }} onSubmit={submit}><div className="form-row"><label>Product name<input name="name" required maxLength={160} placeholder="Classic linen shirt" /></label><label>Product SKU<input name="sku" required maxLength={80} placeholder="LIN-SHIRT-01" /></label></div><label>Description <span className="optional">(optional)</span><textarea name="description" rows={2} placeholder="A short note about this product" /></label><div className="variant-editor-head"><div><strong>Variants</strong><span>Set price, cost and reorder point per variant</span></div><button type="button" className="text-button" onClick={() => { idempotencyKey.current = crypto.randomUUID(); setVariantRows((rows) => [...rows, { sku: '', size: '', color: '', cost: '', price: '', threshold: '5' }]) }}><Plus size={14} /> Add variant</button></div>{variantRows.map((row, index) => <div className="variant-row" key={index}><input aria-label="Variant SKU" placeholder="Variant SKU" value={row.sku} onChange={(event) => setVariantRows((rows) => rows.map((item, i) => i === index ? { ...item, sku: event.target.value } : item))} required /><input aria-label="Size" placeholder="Size" value={row.size} onChange={(event) => setVariantRows((rows) => rows.map((item, i) => i === index ? { ...item, size: event.target.value } : item))} /><input aria-label="Colour" placeholder="Colour" value={row.color} onChange={(event) => setVariantRows((rows) => rows.map((item, i) => i === index ? { ...item, color: event.target.value } : item))} /><input aria-label="Unit cost" type="number" min="0" step={currency === 'RWF' ? 1 : 0.01} placeholder="Cost" value={row.cost} onChange={(event) => setVariantRows((rows) => rows.map((item, i) => i === index ? { ...item, cost: event.target.value } : item))} required /><input aria-label="Selling price" type="number" min={currency === 'RWF' ? 1 : 0.01} step={currency === 'RWF' ? 1 : 0.01} placeholder="Price" value={row.price} onChange={(event) => setVariantRows((rows) => rows.map((item, i) => i === index ? { ...item, price: event.target.value } : item))} required /><input aria-label="Reorder point" type="number" min="0" step="1" placeholder="Alert at" value={row.threshold} onChange={(event) => setVariantRows((rows) => rows.map((item, i) => i === index ? { ...item, threshold: event.target.value } : item))} required />{variantRows.length > 1 && <button type="button" className="remove-variant" onClick={() => { idempotencyKey.current = crypto.randomUUID(); setVariantRows((rows) => rows.filter((_, i) => i !== index)) }} aria-label="Remove variant"><X size={15} /></button>}</div>)}<p className="form-hint">Prices are stored as exact decimal amounts. New products start at zero stock; record a receipt to add units.</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? <span className="spinner small" /> : <Check size={15} />} Save product</button></div></form></Dialog>
}

function ReceiveDialog({ businessId, currency, products, onClose, onSaved, notify }: { businessId: string; currency: string; products: Product[]; onClose: () => void; onSaved: () => void; notify: (kind: Notice['kind'], text: string) => void }) {
  const variants = products.flatMap((product) => (product.variants ?? []).map((variant) => ({ ...variant, product_name: product.name })))
  const [saving, setSaving] = useState(false)
  const idempotencyKey = useRef(crypto.randomUUID())
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const values = new FormData(event.currentTarget)
    const quantity = Number(values.get('quantity'))
    const cost = String(values.get('cost') ?? '')
    if (!values.get('variant') || !Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(Number(cost)) || Number(cost) < 0) { notify('error', 'Choose a variant, whole-number quantity and valid unit cost.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('receive_stock', {
      p_business_id: businessId, p_variant_id: String(values.get('variant')),
      p_quantity: quantity, p_unit_cost: cost, p_reason: String(values.get('reason') ?? 'Supplier delivery'),
      p_idempotency_key: idempotencyKey.current,
    })
    setSaving(false)
    if (error) notify('error', error.message)
    else onSaved()
  }
  return <Dialog title="Receive stock" subtitle="Only quantities physically received should be recorded." onClose={onClose}><form className="form-stack dialog-form" onChange={() => { idempotencyKey.current = crypto.randomUUID() }} onSubmit={submit}><label>Product variant<select name="variant" required defaultValue=""><option value="" disabled>Select a variant…</option>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.product_name} · {[variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku} ({variant.sku})</option>)}</select></label><div className="form-row"><label>Quantity received<input name="quantity" type="number" min="1" step="1" required placeholder="10" /></label><label>Unit cost<input name="cost" type="number" min="0" step={currency === 'RWF' ? 1 : 0.01} required placeholder="0" /></label></div><label>Receipt note<input name="reason" maxLength={200} defaultValue="Supplier delivery" /></label><p className="form-hint">This will update the on-hand balance, weighted average cost and movement ledger atomically.</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || variants.length === 0}>{saving ? <span className="spinner small" /> : <ArrowDownToLine size={15} />} Record receipt</button></div></form></Dialog>
}

function CheckoutDialog({ businessId, products, currency, initialVariantId, onClose, onSaved, notify }: { businessId: string; products: Product[]; currency: string; initialVariantId: string; onClose: () => void; onSaved: () => void; notify: (kind: Notice['kind'], text: string) => void }) {
  const variants = products.flatMap((product) => (product.variants ?? []).filter((variant) => variant.stock_quantity > 0).map((variant) => ({ ...variant, product_name: product.name })))
  const [variantId, setVariantId] = useState(() => variants.some((variant) => variant.id === initialVariantId) ? initialVariantId : variants[0]?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const idempotencyKey = useRef(crypto.randomUUID())
  const selected = variants.find((variant) => variant.id === variantId)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selected) return
    if (quantity < 1 || quantity > selected.stock_quantity || !Number.isInteger(quantity)) { notify('error', 'Quantity must be a whole number available in stock.'); return }
    setSaving(true)
    const { error } = await supabase.rpc('complete_sale', {
      p_business_id: businessId,
      p_items: [{ variant_id: selected.id, quantity }],
      p_payments: [{ method: paymentMethod, amount: multiplyMoney(selected.price, quantity) }],
      p_idempotency_key: idempotencyKey.current,
    })
    setSaving(false)
    if (error) notify('error', error.message)
    else onSaved()
  }
  return <Dialog title="Quick checkout" subtitle="The server validates price and stock and commits the sale atomically." onClose={onClose}><form className="form-stack dialog-form" onSubmit={submit}><label>Item<select value={variantId} onChange={(event) => { setVariantId(event.target.value); idempotencyKey.current = crypto.randomUUID() }} required>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.product_name} · {[variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku} ({variant.stock_quantity} available)</option>)}</select></label><div className="form-row"><label>Quantity<input type="number" min="1" max={selected?.stock_quantity ?? 1} step="1" value={quantity} onChange={(event) => { setQuantity(Number(event.target.value)); idempotencyKey.current = crypto.randomUUID() }} required /></label><label>Payment method<select name="payment_method" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); idempotencyKey.current = crypto.randomUUID() }}><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select></label></div><div className="checkout-total"><span>Total due</span><strong>{money(multiplyMoney(selected?.price ?? '0', quantity), currency)}</strong></div><p className="form-hint">This initial checkout takes one item line and one full payment. No discount, credit sale, or split-payment feature is enabled.</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving || variants.length === 0}>{saving ? <span className="spinner small" /> : <ShoppingCart size={15} />} Complete sale</button></div></form></Dialog>
}

function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><h2 id="dialog-title">{title}</h2><p>{subtitle}</p></div><button className="dialog-close" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>
}

export default App
