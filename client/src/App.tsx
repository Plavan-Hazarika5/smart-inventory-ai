import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

type InventoryStatus = 'ok' | 'low' | 'critical'
type ReorderConfidence = 'high' | 'medium' | 'low'
type SortDir = 'asc' | 'desc'
type Tab = 'dashboard' | 'inventory' | 'recommendations'
type SortKey = 'sku' | 'name' | 'category' | 'supplier_name' | 'current_stock' | 'status' | 'days_of_stock_left'
type DashboardSortKey = 'days_of_stock_left' | 'reorder_qty' | 'confidence'

type InventoryItem = {
  id: number
  sku: string
  name: string
  category: string
  supplier_id: number
  supplier_name: string
  current_stock: number
  reorder_point: number
  min_stock: number
  unit_cost: number
  status: InventoryStatus
  avg_daily_sales: number
  avg_weekly_sales: number
  days_of_stock_left: number | 'no velocity data'
}

type Recommendation = {
  sku_id: number
  sku: string
  name: string
  supplier_id: number
  supplier_name: string
  category: string
  reorder_qty: number
  original_reorder_qty: number
  avg_weekly_sales: number
  confidence: ReorderConfidence
  reason: string
}

type AuditLogItem = {
  id: number
  sku: string
  action: 'approved' | 'overridden' | 'rejected'
  original_qty: number
  final_qty: number
  user_name: string
  timestamp: string
}

type EmailPreview = { supplier_name: string; subject: string; body: string }
type Toast = { id: number; tone: 'error' | 'success'; message: string }

const statusStyles: Record<InventoryStatus, string> = {
  ok: 'bg-green-100 text-green-700',
  low: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-700',
}

const confidenceStyles: Record<ReorderConfidence, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-700',
}

const SkeletonCard = () => <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
const SkeletonTable = () => <div className="h-64 animate-pulse rounded-xl bg-slate-200" />

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-slate-100 text-4xl leading-[4rem]">📦</div>
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  )
}

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const payload = await response.json()
    return payload.message ?? fallback
  } catch {
    return fallback
  }
}

async function fetchInventoryStatus(): Promise<InventoryItem[]> {
  const response = await fetch('/api/inventory/velocity')
  if (!response.ok) throw new Error('Failed to load inventory velocity.')
  return (await response.json()).data
}

async function fetchRecommendations(supplierId?: number, category?: string): Promise<Recommendation[]> {
  const response = await fetch('/api/reorder/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(supplierId ? { supplier_id: supplierId } : {}), ...(category ? { category } : {}) }),
  })
  if (!response.ok) throw new Error('Failed to load recommendations.')
  return (await response.json()).data
}

async function fetchAuditLogs(): Promise<AuditLogItem[]> {
  const response = await fetch('/api/reorder/audit')
  if (!response.ok) throw new Error('Failed to load audit logs.')
  return (await response.json()).data
}

async function fetchEmailPreviews(confirmOverorder = false): Promise<EmailPreview[]> {
  const response = await fetch(`/api/reorder/export/email-preview${confirmOverorder ? '?confirm_overorder=true' : ''}`)
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load email previews.'))
  return (await response.json()).data
}

async function downloadReorderCsv(confirmOverorder = false): Promise<void> {
  const response = await fetch(`/api/reorder/export/csv${confirmOverorder ? '?confirm_overorder=true' : ''}`)
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to export CSV.'))
  const csvText = await response.text()
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'reorder-recommendations.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function approveRecommendation(payload: { sku: string; final_qty?: number; confirm_overorder?: boolean }) {
  const response = await fetch('/api/reorder/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, user_name: 'admin' }),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to approve recommendation.'))
}

async function rejectRecommendation(payload: { sku: string }) {
  const response = await fetch('/api/reorder/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, user_name: 'admin' }),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to reject recommendation.'))
}

function App() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [sortKey, setSortKey] = useState<SortKey>('sku')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dashboardSupplierFilter, setDashboardSupplierFilter] = useState('')
  const [dashboardCategoryFilter, setDashboardCategoryFilter] = useState('')
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<'all' | InventoryStatus>('all')
  const [dashboardSortKey, setDashboardSortKey] = useState<DashboardSortKey>('days_of_stock_left')
  const [dashboardSortDir, setDashboardSortDir] = useState<SortDir>('asc')
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [confirmExportOverorder, setConfirmExportOverorder] = useState(false)
  const [overrideQtyBySku, setOverrideQtyBySku] = useState<Record<string, string>>({})
  const [expandedAuditBySku, setExpandedAuditBySku] = useState<Record<string, boolean>>({})
  const [toasts, setToasts] = useState<Toast[]>([])

  const pushToast = (tone: Toast['tone'], message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, tone, message }])
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3200)
  }

  const { data: inventory = [], isLoading: inventoryLoading, isError: inventoryError } = useQuery({
    queryKey: ['inventory-status'],
    queryFn: fetchInventoryStatus,
  })
  const { data: recommendations = [], isLoading: recommendationLoading, isError: recommendationError } = useQuery({
    queryKey: ['reorder-recommendations', supplierFilter, categoryFilter],
    queryFn: () => fetchRecommendations(supplierFilter ? Number(supplierFilter) : undefined, categoryFilter || undefined),
  })
  const { data: auditLogs = [] } = useQuery({ queryKey: ['audit-logs'], queryFn: fetchAuditLogs })
  const { data: emailPreviews = [], isLoading: emailPreviewLoading, isError: emailPreviewError } = useQuery({
    queryKey: ['email-previews', confirmExportOverorder],
    queryFn: () => fetchEmailPreviews(confirmExportOverorder),
    enabled: showEmailModal,
  })

  const csvMutation = useMutation({
    mutationFn: (confirm: boolean) => downloadReorderCsv(confirm),
    onSuccess: () => pushToast('success', 'CSV exported.'),
    onError: (error: Error) => pushToast('error', error.message),
  })
  const approveMutation = useMutation({
    mutationFn: approveRecommendation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      pushToast('success', 'Recommendation approved.')
    },
    onError: (error: Error) => pushToast('error', error.message),
  })
  const rejectMutation = useMutation({
    mutationFn: rejectRecommendation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
      pushToast('success', 'Recommendation rejected.')
    },
    onError: (error: Error) => pushToast('error', error.message),
  })

  const supplierOptions = useMemo(() => Array.from(new Map(inventory.map((item) => [item.supplier_id, item.supplier_name])).entries()), [inventory])
  const categoryOptions = useMemo(() => Array.from(new Set(inventory.map((item) => item.category))).sort(), [inventory])
  const recommendationBySku = useMemo(() => new Map(recommendations.map((item) => [item.sku, item])), [recommendations])

  const rows = useMemo(() => [...inventory].sort((a, b) => {
    if (sortKey === 'days_of_stock_left') {
      const first = a.days_of_stock_left === 'no velocity data' ? Number.NEGATIVE_INFINITY : a.days_of_stock_left
      const second = b.days_of_stock_left === 'no velocity data' ? Number.NEGATIVE_INFINITY : b.days_of_stock_left
      return sortDir === 'asc' ? first - second : second - first
    }
    const first = a[sortKey]
    const second = b[sortKey]
    if (typeof first === 'number' && typeof second === 'number') return sortDir === 'asc' ? first - second : second - first
    return sortDir === 'asc' ? String(first).localeCompare(String(second)) : String(second).localeCompare(String(first))
  }), [inventory, sortDir, sortKey])

  const dashboardRows = useMemo(() => {
    const confidenceRank: Record<ReorderConfidence, number> = { low: 0, medium: 1, high: 2 }
    return inventory
      .filter((item) => item.status === 'low' || item.status === 'critical')
      .map((item) => ({ ...item, reorder_qty: recommendationBySku.get(item.sku)?.reorder_qty ?? 0, confidence: recommendationBySku.get(item.sku)?.confidence ?? 'low' }))
      .filter((item) => (!dashboardSupplierFilter || String(item.supplier_id) === dashboardSupplierFilter) && (!dashboardCategoryFilter || item.category === dashboardCategoryFilter) && (dashboardStatusFilter === 'all' || item.status === dashboardStatusFilter))
      .sort((a, b) => {
        if (dashboardSortKey === 'days_of_stock_left') {
          const first = a.days_of_stock_left === 'no velocity data' ? Number.NEGATIVE_INFINITY : a.days_of_stock_left
          const second = b.days_of_stock_left === 'no velocity data' ? Number.NEGATIVE_INFINITY : b.days_of_stock_left
          return dashboardSortDir === 'asc' ? first - second : second - first
        }
        if (dashboardSortKey === 'reorder_qty') return dashboardSortDir === 'asc' ? a.reorder_qty - b.reorder_qty : b.reorder_qty - a.reorder_qty
        return dashboardSortDir === 'asc' ? confidenceRank[a.confidence] - confidenceRank[b.confidence] : confidenceRank[b.confidence] - confidenceRank[a.confidence]
      })
  }, [inventory, recommendationBySku, dashboardSupplierFilter, dashboardCategoryFilter, dashboardStatusFilter, dashboardSortKey, dashboardSortDir])

  const criticalTodayCount = inventory.filter((item) => item.status === 'critical').length
  const atRiskThisWeekCount = inventory.filter((item) => item.days_of_stock_left !== 'no velocity data' && item.days_of_stock_left <= 7).length
  const pendingReordersCount = recommendations.filter((item) => item.reorder_qty > 0).length
  const topUrgent = [...inventory].filter((item) => item.days_of_stock_left !== 'no velocity data').sort((a, b) => (a.days_of_stock_left as number) - (b.days_of_stock_left as number)).slice(0, 5)

  const auditBySku = useMemo(() => {
    const grouped = new Map<string, AuditLogItem[]>()
    for (const log of auditLogs) {
      if (!grouped.has(log.sku)) grouped.set(log.sku, [])
      grouped.get(log.sku)?.push(log)
    }
    return grouped
  }, [auditLogs])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <h1 className="mb-1 text-2xl font-semibold md:text-3xl">Low-Stock Auto Reorder Assistant</h1>
        <p className="mb-5 text-sm text-slate-500">Day 7 - Demo ready inventory operations dashboard</p>

        <div className="mb-4 flex flex-wrap gap-2">
          {(['dashboard', 'inventory', 'recommendations'] as Tab[]).map((item) => (
            <button key={item} type="button" className={`rounded-md px-3 py-2 text-sm font-medium capitalize ${tab === item ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>

        {tab === 'dashboard' && (
          <section className="space-y-4">
            {inventoryLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Critical today</p><p className="mt-1 text-3xl font-semibold text-red-600">{criticalTodayCount}</p></article>
                <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">At risk this week</p><p className="mt-1 text-3xl font-semibold text-amber-600">{atRiskThisWeekCount}</p></article>
                <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Pending reorders</p><p className="mt-1 text-3xl font-semibold">{pendingReordersCount}</p></article>
                <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs uppercase text-slate-500">Top 5 urgent SKUs</p>{topUrgent.map((item) => <p className="text-xs text-slate-700" key={item.sku}>{item.sku} - {(item.days_of_stock_left as number).toFixed(1)}d</p>)}</article>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-6">
                <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={dashboardSupplierFilter} onChange={(e) => setDashboardSupplierFilter(e.target.value)}><option value="">All suppliers</option>{supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={dashboardCategoryFilter} onChange={(e) => setDashboardCategoryFilter(e.target.value)}><option value="">All categories</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select>
                <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={dashboardStatusFilter} onChange={(e) => setDashboardStatusFilter(e.target.value as 'all' | InventoryStatus)}><option value="all">All status</option><option value="low">Low</option><option value="critical">Critical</option></select>
                <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={dashboardSortKey} onChange={(e) => setDashboardSortKey(e.target.value as DashboardSortKey)}><option value="days_of_stock_left">Sort: Days left</option><option value="reorder_qty">Sort: Reorder qty</option><option value="confidence">Sort: Confidence</option></select>
                <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={dashboardSortDir} onChange={(e) => setDashboardSortDir(e.target.value as SortDir)}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
              </div>
            </div>
            {inventoryError ? <EmptyState title="Dashboard data unavailable" subtitle="Please retry after API connection is restored." /> : dashboardRows.length === 0 ? <EmptyState title="No critical items" subtitle="Everything looks healthy for now." /> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Days left</th><th className="px-4 py-3">Reorder qty</th><th className="px-4 py-3">Confidence</th></tr></thead><tbody>{dashboardRows.map((item) => <tr className="border-t border-slate-100" key={item.sku}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.name}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{item.status}</span></td><td className="px-4 py-3">{item.days_of_stock_left === 'no velocity data' ? 'No velocity data' : `${item.days_of_stock_left.toFixed(1)} days`}</td><td className="px-4 py-3">{item.reorder_qty}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${confidenceStyles[item.confidence]}`}>{item.confidence}</span></td></tr>)}</tbody></table></div>}
          </section>
        )}

        {tab === 'inventory' && (
          <section className="space-y-3">
            {inventoryLoading ? <SkeletonTable /> : inventoryError ? <EmptyState title="Inventory endpoint failed" subtitle="Please check API health and refresh." /> : rows.length === 0 ? <EmptyState title="No inventory rows" subtitle="Seed data to begin inventory monitoring." /> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr>{(['sku', 'name', 'category', 'supplier_name', 'current_stock', 'status', 'days_of_stock_left'] as SortKey[]).map((key) => <th className="px-4 py-3" key={key}><button className="cursor-pointer" type="button" onClick={() => { if (sortKey === key) setSortDir((cur) => cur === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('asc') } }}>{key.replaceAll('_', ' ')}</button></th>)}</tr></thead><tbody>{rows.map((item) => <tr className="border-t border-slate-100" key={item.id}><td className="px-4 py-3">{item.sku}</td><td className="px-4 py-3">{item.name}</td><td className="px-4 py-3">{item.category}</td><td className="px-4 py-3">{item.supplier_name}</td><td className="px-4 py-3">{item.current_stock}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusStyles[item.status]}`}>{item.status}</span></td><td className="px-4 py-3">{item.days_of_stock_left === 'no velocity data' ? 'No velocity data' : `${item.days_of_stock_left.toFixed(1)} days`}</td></tr>)}</tbody></table></div>}
          </section>
        )}

        {tab === 'recommendations' && (
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
              <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}><option value="">All suppliers</option>{supplierOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
              <select className="rounded border border-slate-300 px-3 py-2 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="">All categories</option>{categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select>
              <div className="relative">
                <button className="w-full rounded border border-slate-300 px-3 py-2 text-left text-sm" type="button" onClick={() => setShowExportMenu((cur) => !cur)}>Export</button>
                {showExportMenu && <div className="absolute right-0 z-10 mt-2 w-full rounded border border-slate-200 bg-white p-1 shadow"><button className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-100" type="button" onClick={() => { csvMutation.mutate(false, { onError: (error: Error) => { if (error.message.includes('8 weeks')) setConfirmExportOverorder(true) } }); setShowExportMenu(false) }}>Download CSV</button><button className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-100" type="button" onClick={() => { setShowEmailModal(true); setShowExportMenu(false) }}>Preview email drafts</button></div>}
              </div>
            </div>

            {confirmExportOverorder && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Reorder quantity exceeds 8 weeks of demand - confirm intent.<button className="ml-3 rounded border border-amber-300 px-2 py-1 text-xs" type="button" onClick={() => { csvMutation.mutate(true); setConfirmExportOverorder(false) }}>Confirm and export</button></div>}

            {recommendationLoading ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, index) => <SkeletonCard key={index} />)}</div> : recommendationError ? <EmptyState title="Recommendations failed to load" subtitle="Please verify API connectivity." /> : recommendations.length === 0 ? <EmptyState title="No recommendations" subtitle="No reorder action is currently needed." /> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{recommendations.map((item) => <article key={item.sku} className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-2 flex items-start justify-between"><div><h3 className="font-semibold">{item.name}</h3><p className="text-xs text-slate-500">{item.sku} - {item.supplier_name}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${confidenceStyles[item.confidence]}`}>{item.confidence}</span></div><p className="text-sm">Recommended reorder: <strong>{item.reorder_qty}</strong> units</p><p className="text-xs text-slate-500">Original: {item.original_reorder_qty}</p><div className="mt-2 flex items-center gap-2"><input className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" min={0} type="number" value={overrideQtyBySku[item.sku] ?? String(item.reorder_qty)} onChange={(e) => setOverrideQtyBySku((cur) => ({ ...cur, [item.sku]: e.target.value }))} /><button className="rounded bg-slate-900 px-2 py-1 text-xs text-white" type="button" onClick={() => { const finalQty = Number(overrideQtyBySku[item.sku] ?? item.reorder_qty); const over = finalQty > item.avg_weekly_sales * 8; approveMutation.mutate({ sku: item.sku, final_qty: finalQty, confirm_overorder: over ? window.confirm('Reorder quantity exceeds 8 weeks of demand - confirm intent.') : false }) }}>Approve</button><button className="rounded border border-slate-300 px-2 py-1 text-xs" type="button" onClick={() => rejectMutation.mutate({ sku: item.sku })}>Reject</button></div><p className="mt-2 text-xs text-slate-500">{item.reason}</p><button className="mt-3 text-xs underline" type="button" onClick={() => setExpandedAuditBySku((cur) => ({ ...cur, [item.sku]: !cur[item.sku] }))}>{expandedAuditBySku[item.sku] ? 'Hide audit trail' : 'Show audit trail'}</button>{expandedAuditBySku[item.sku] && <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">{(auditBySku.get(item.sku) ?? []).map((log) => <p className="text-xs text-slate-600" key={log.id}>{log.action} by {log.user_name} - {log.original_qty} to {log.final_qty} ({new Date(log.timestamp).toLocaleString()})</p>)}</div>}</article>)}</div>}
          </section>
        )}
      </div>

      {showEmailModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Email Drafts</h2><button className="rounded border border-slate-200 px-2 py-1 text-xs" type="button" onClick={() => setShowEmailModal(false)}>Close</button></div>
            {emailPreviewLoading ? <SkeletonTable /> : emailPreviewError ? <EmptyState title="Email previews unavailable" subtitle="Try again after resolving API issues." /> : emailPreviews.map((preview) => <article className="mb-3 rounded border border-slate-200 p-3" key={preview.supplier_name}><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">{preview.supplier_name}</p><button className="rounded border border-slate-200 px-2 py-1 text-xs" type="button" onClick={() => { void navigator.clipboard.writeText(preview.body); pushToast('success', `Copied draft for ${preview.supplier_name}`) }}>Copy</button></div><pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{preview.body}</pre></article>)}
          </div>
        </div>
      )}

      <div className="fixed bottom-4 right-4 z-30 space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className={`rounded px-3 py-2 text-sm shadow ${toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  )
}

export default App
