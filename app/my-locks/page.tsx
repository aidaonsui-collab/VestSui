'use client'

import { useState, useEffect } from 'react'
import { useCurrentAccount, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit'
import { Lock, TrendingUp, Clock, Coins, AlertCircle, Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import { Transaction, Argument } from '@mysten/sui/transactions'
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils'
import { fromB64 } from '@mysten/sui/utils'

const VESTING_PKG = process.env.NEXT_PUBLIC_VESTING_PKG || '0x0'
const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC || 'https://fullnode.mainnet.sui.io'

interface LockInfo {
  id: string
  type: 'lock' | 'vesting'
  tokenType: string
  balance: string
  beneficiary: string
  unlockTime?: number
  cliffTime?: number
  endTime?: number
  totalAmount?: string
  creator: string
}

async function suiRPC(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await res.json() as { result?: unknown }
  return j.result
}

async function getCreatedSharedObjectId(txDigest: string): Promise<string> {
  const tx = await suiRPC('sui_getTransactionBlock', [
    txDigest,
    { showEffects: true },
  ]) as Record<string, unknown>
  const effects = tx.effects as Record<string, unknown>
  const created = effects.created as Record<string, unknown>[]
  for (const obj of created) {
    const owner = obj.owner as Record<string, unknown>
    if (owner && 'Shared' in owner) {
      return (obj.reference as Record<string, unknown>).objectId as string
    }
  }
  return ''
}

async function getObjectType(objectId: string): Promise<string> {
  const obj = await suiRPC('sui_getObject', [
    objectId,
    { showType: true },
  ]) as Record<string, unknown>
  const data = obj.data as Record<string, unknown>
  return data.type as string
}

async function queryEvents(eventType: string, module: string) {
  const fullEvent = `${VESTING_PKG}::${module}::${eventType}`
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'suix_queryEvents',
      params: [{ MoveEventType: fullEvent }, null, 50, true],
    }),
  })
  const j = await res.json() as { result?: { data?: unknown[] } }
  return j.result?.data || []
}

function extractCoinType(typeStr: string): string {
  const match = typeStr.match(/<(.+)>$/)
  return match ? match[1] : '0x2::sui::SUI'
}

function safeParseNum(val: unknown): number {
  if (typeof val === 'number') return val
  if (typeof val === 'string') return parseInt(val, 10)
  return 0
}

function formatDate(ms: number): string {
  if (!ms || isNaN(ms)) return '—'
  return new Date(ms).toLocaleString()
}

function timeLeft(ms: number): string {
  if (!ms || isNaN(ms)) return '—'
  const diff = ms - Date.now()
  if (diff <= 0) return 'Unlocked'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h`
  return `${Math.floor(diff / 60000)}m`
}

function formatAmount(raw: string, decimals = 9): string {
  const val = parseInt(raw) / Math.pow(10, decimals)
  if (isNaN(val)) return '—'
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M'
  if (val >= 1_000) return (val / 1_000).toFixed(2) + 'K'
  return val.toFixed(2)
}

export default function MyLocksPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransactionBlock()

  const [locks, setLocks] = useState<LockInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState<string | null>(null)
  const [txDigests, setTxDigests] = useState<Record<string, string>>({})

  useEffect(() => {
    if (account) loadLocks()
    else setLoading(false)
  }, [account])

  async function loadLocks() {
    if (!account) return
    setLoading(true)
    setError('')

    try {
      const lockEvents = await queryEvents('TokensLocked', 'token_locker')
      const vestingEvents = await queryEvents('VestingScheduleCreated', 'vesting_schedule')
      const results: LockInfo[] = []

      for (const evt of lockEvents as Record<string, unknown>[]) {
        const fields = evt.parsedJson as Record<string, unknown> | undefined
        if (!fields) continue
        const beneficiary = fields.beneficiary as string
        if (beneficiary.toLowerCase() !== account.address.toLowerCase()) continue

        const evtId = evt.id as Record<string, unknown>
        const lockId = await getCreatedSharedObjectId(evtId.txDigest as string)
        if (!lockId) continue

        const tokenType = await getObjectType(lockId).then(extractCoinType)

        results.push({
          id: lockId,
          type: 'lock',
          tokenType,
          balance: String(fields.amount ?? '0'),
          beneficiary,
          unlockTime: safeParseNum(fields.unlock_time),
          creator: fields.creator as string,
        })
      }

      for (const evt of vestingEvents as Record<string, unknown>[]) {
        const fields = evt.parsedJson as Record<string, unknown> | undefined
        if (!fields) continue
        const beneficiary = fields.beneficiary as string
        if (beneficiary.toLowerCase() !== account.address.toLowerCase()) continue

        const evtId = evt.id as Record<string, unknown>
        const walletId = await getCreatedSharedObjectId(evtId.txDigest as string)
        if (!walletId) continue

        const tokenType = await getObjectType(walletId).then(extractCoinType)

        results.push({
          id: walletId,
          type: 'vesting',
          tokenType,
          balance: String(fields.total_amount ?? '0'),
          beneficiary,
          cliffTime: safeParseNum(fields.cliff_time),
          endTime: safeParseNum(fields.end_time),
          totalAmount: String(fields.total_amount ?? '0'),
          creator: fields.creator as string,
        })
      }

      setLocks(results)
    } catch (e) {
      console.error(e)
      setError('Failed to load locks. Verify the package ID and RPC URL.')
    } finally {
      setLoading(false)
    }
  }

  async function handleClaim(lock: LockInfo) {
    if (!account) return
    setClaiming(lock.id)
    const tx = new Transaction()

    const [claimResult] = tx.moveCall({
      target: `${VESTING_PKG}::${lock.type === 'lock' ? 'token_locker' : 'vesting_schedule'}::claim`,
      arguments: [
        tx.object(lock.id),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
      typeArguments: [lock.tokenType],
    })

    // Transfer the returned Coin<T> to the sender so it's not unused
    tx.transferObjects([claimResult], tx.pure.address(account.address))

    signAndExecute(
      { transactionBlock: tx as any },
      {
        onSuccess: (result) => {
          setTxDigests(prev => ({ ...prev, [lock.id]: result.digest }))
          setClaiming(null)
          setTimeout(loadLocks, 3000)
        },
        onError: (e) => { setError(e.message); setClaiming(null) },
      }
    )
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center p-8 rounded-xl bg-card border border-border max-w-sm">
          <Coins className="w-12 h-12 text-[#D4AF37] mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'serif' }}>Connect Your Wallet</h2>
          <p className="text-muted-foreground">Connect to see your locks and vesting wallets.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1 gold-gradient-text" style={{ fontFamily: 'serif' }}>My Locks</h1>
            <p className="text-muted-foreground">Your token locks and vesting schedules</p>
          </div>
          <button onClick={loadLocks} disabled={loading}
            className="px-4 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Refresh
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-4">
            <AlertCircle className="w-4 h-4" />{error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
          </div>
        ) : locks.length === 0 ? (
          <div className="text-center py-20 rounded-xl bg-card border border-border">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground">No locks found where you are the beneficiary.</p>
            <p className="text-xs text-muted-foreground mt-2">Try locking some tokens first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {locks.map(lock => (
              <div key={lock.id} className="p-5 rounded-xl bg-card border border-border fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {lock.type === 'lock'
                        ? <Lock className="w-4 h-4 text-[#D4AF37] shrink-0" />
                        : <TrendingUp className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#D4AF37]/10 text-[#D4AF37]">
                        {lock.type === 'lock' ? 'Token Lock' : 'Vesting'}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono ml-auto">{lock.tokenType.slice(0, 10)}...</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Balance</span>
                        <div className="font-medium" style={{ fontFamily: 'serif' }}>
                          {formatAmount(lock.balance)} tokens
                        </div>
                      </div>
                      {lock.type === 'lock' ? (
                        <>
                          <div>
                            <span className="text-muted-foreground text-xs">Unlocks</span>
                            <div className="font-medium text-xs">{formatDate(lock.unlockTime ?? 0)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Time left</span>
                            <div className={`font-medium text-xs ${lock.unlockTime && lock.unlockTime <= Date.now() ? 'text-[#D4AF37]' : ''}`}>
                              {timeLeft(lock.unlockTime ?? 0)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="text-muted-foreground text-xs">Cliff</span>
                            <div className="font-medium text-xs">{formatDate(lock.cliffTime ?? 0)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Fully Vested</span>
                            <div className="font-medium text-xs">{formatDate(lock.endTime ?? 0)}</div>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-muted-foreground text-xs">Beneficiary</span>
                        <div className="font-medium font-mono text-xs">{lock.beneficiary.slice(0, 8)}...{lock.beneficiary.slice(-4)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {txDigests[lock.id] ? (
                      <a href={`https://suivision.xyz/txblock/${txDigests[lock.id]}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-[#D4AF37]">
                        <CheckCircle className="w-3 h-3" /> Claimed <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : lock.type === 'lock' && lock.unlockTime && lock.unlockTime > Date.now() ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> {timeLeft(lock.unlockTime)}
                      </span>
                    ) : lock.type === 'vesting' && lock.cliffTime && lock.cliffTime > Date.now() ? (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" /> Cliff: {timeLeft(lock.cliffTime)}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleClaim(lock)}
                        disabled={claiming === lock.id}
                        className="px-4 py-1.5 rounded-lg gold-gradient-text border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10 disabled:opacity-50 text-sm font-medium transition-all gold-glow flex items-center gap-1.5"
                        style={{ fontFamily: 'serif' }}
                      >
                        {claiming === lock.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <CheckCircle className="w-3 h-3" />}
                        Claim
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
