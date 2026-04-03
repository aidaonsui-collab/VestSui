'use client'

import { useState, useEffect } from 'react'
import { useCurrentAccount, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit'
import { Lock, TrendingUp, Clock, Coins, AlertCircle, Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import { Transaction } from '@mysten/sui/transactions'
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils'

const VESTING_PKG = process.env.NEXT_PUBLIC_VESTING_PKG || '0x0'
const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC || 'https://fullnode.mainnet.sui.io'
const SUI_COIN_TYPE = '0x2::sui::SUI'

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

async function getCreatedObjectId(txDigest: string): Promise<string> {
  const tx = await suiRPC('sui_getTransactionBlock', [
    txDigest,
    { showEffects: true, showEvents: true },
  ]) as Record<string, unknown>
  const effects = tx.effects as Record<string, unknown>
  const created = effects.created as Record<string, unknown>[]
  for (const obj of created) {
    const owner = obj.owner as Record<string, unknown>
    if (owner && 'Shared' in owner) {
      const ref = obj.reference as Record<string, unknown>
      return ref.objectId as string
    }
  }
  return ''
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

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

function timeLeft(ms: number): string {
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

      // Process token locks — fetch object ID from the transaction that created it
      for (const evt of lockEvents as Record<string, unknown>[]) {
        const fields = evt.parsedJson as Record<string, unknown> | undefined
        if (!fields) continue
        const beneficiary = fields.beneficiary as string
        if (beneficiary.toLowerCase() !== account.address.toLowerCase()) continue

        const evtId = evt.id as Record<string, unknown>
        const txDigest = evtId.txDigest as string
        const lockId = await getCreatedObjectId(txDigest)
        if (!lockId) continue

        results.push({
          id: lockId,
          type: 'lock',
          tokenType: SUI_COIN_TYPE,
          balance: fields.amount as string,
          beneficiary,
          unlockTime: fields.unlock_time as number,
          creator: fields.creator as string,
        })
      }

      // Process vesting wallets
      for (const evt of vestingEvents as Record<string, unknown>[]) {
        const fields = evt.parsedJson as Record<string, unknown> | undefined
        if (!fields) continue
        const beneficiary = fields.beneficiary as string
        if (beneficiary.toLowerCase() !== account.address.toLowerCase()) continue

        const evtId = evt.id as Record<string, unknown>
        const txDigest = evtId.txDigest as string
        const walletId = await getCreatedObjectId(txDigest)
        if (!walletId) continue

        results.push({
          id: walletId,
          type: 'vesting',
          tokenType: SUI_COIN_TYPE,
          balance: fields.total_amount as string,
          beneficiary,
          cliffTime: fields.cliff_time as number,
          endTime: fields.end_time as number,
          totalAmount: fields.total_amount as string,
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
    setClaiming(lock.id)
    const tx = new Transaction()

    if (lock.type === 'lock') {
      tx.moveCall({
        target: `${VESTING_PKG}::token_locker::claim`,
        arguments: [tx.object(lock.id), tx.object(SUI_CLOCK_OBJECT_ID)],
        typeArguments: [lock.tokenType],
      })
    } else {
      tx.moveCall({
        target: `${VESTING_PKG}::vesting_schedule::claim`,
        arguments: [tx.object(lock.id), tx.object(SUI_CLOCK_OBJECT_ID)],
        typeArguments: [lock.tokenType],
      })
    }

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
                      <span className="text-xs text-muted-foreground font-mono ml-auto">{lock.id.slice(0, 10)}...</span>
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
                            <div className="font-medium text-xs">{lock.unlockTime ? formatDate(lock.unlockTime) : '—'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Time left</span>
                            <div className="font-medium text-xs">{lock.unlockTime ? timeLeft(lock.unlockTime) : '—'}</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <span className="text-muted-foreground text-xs">Cliff</span>
                            <div className="font-medium text-xs">{lock.cliffTime ? formatDate(lock.cliffTime) : '—'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Fully Vested</span>
                            <div className="font-medium text-xs">{lock.endTime ? formatDate(lock.endTime) : '—'}</div>
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
