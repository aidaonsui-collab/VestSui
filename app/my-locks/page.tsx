'use client'

import { useState, useEffect } from 'react'
import { useCurrentAccount, useSuiClient, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit'
import { Lock, TrendingUp, Clock, Coins, AlertCircle, Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import { Transaction } from '@mysten/sui/transactions'
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils'

const VESTING_PKG = process.env.NEXT_PUBLIC_VESTING_PKG || '0x0'
const RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC || 'https://fullnode.mainnet.sui.io'

interface LockInfo {
  id: string
  type: 'lock' | 'vesting'
  tokenType: string
  balance: number
  beneficiary: string
  unlockTime?: number
  cliffTime?: number
  endTime?: number
  totalAmount?: number
  claimed?: number
  creator: string
}

async function rpcCall(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j = await res.json() as { result: unknown }
  return j.result
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

function timeLeft(ms: number): string {
  const diff = ms - Date.now()
  if (diff <= 0) return 'Unlocked'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function MyLocksPage() {
  const account = useCurrentAccount()
  const suiClient = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransactionBlock()
  const [locks, setLocks] = useState<LockInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [claiming, setClaiming] = useState<string | null>(null)
  const [txDigests, setTxDigests] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!account) { setLoading(false); return }
    loadLocks()
  }, [account])

  async function loadLocks() {
    if (!account) return
    setLoading(true)

    try {
      // Query TokenLock and VestingWallet objects owned by this user
      const [lockObjs, vestingObjs] = await Promise.all([
        rpcCall('suix_getOwnedObjects', [
          account.address,
          { filter: { StructType: `${VESTING_PKG}::token_locker::TokenLock` }, options: { showContent: true, showType: true } }
        ]),
        rpcCall('suix_getOwnedObjects', [
          account.address,
          { filter: { StructType: `${VESTING_PKG}::vesting_schedule::VestingWallet` }, options: { showContent: true, showType: true } }
        ]),
      ])

      const results: LockInfo[] = []

      // Parse token locks
      for (const obj of (lockObjs as any)?.data || []) {
        const fields = (obj.data?.content as any)?.fields
        const typeStr = obj.data?.type || ''
        const tokenMatch = typeStr.match(/<(.+)>/)
        results.push({
          id: obj.data.objectId,
          type: 'lock',
          tokenType: tokenMatch ? tokenMatch[1] : 'Unknown',
          balance: parseInt(fields?.balance || '0'),
          beneficiary: fields?.beneficiary || account.address,
          unlockTime: parseInt(fields?.unlock_time || '0'),
          creator: fields?.creator || account.address,
        })
      }

      // Parse vesting wallets
      for (const obj of (vestingObjs as any)?.data || []) {
        const fields = (obj.data?.content as any)?.fields
        const typeStr = obj.data?.type || ''
        const tokenMatch = typeStr.match(/<(.+)>/)
        results.push({
          id: obj.data.objectId,
          type: 'vesting',
          tokenType: tokenMatch ? tokenMatch[1] : 'Unknown',
          balance: parseInt(fields?.balance?.value || '0'),
          beneficiary: fields?.beneficiary || account.address,
          cliffTime: parseInt(fields?.cliff_time || '0'),
          endTime: parseInt(fields?.end_time || '0'),
          totalAmount: parseInt(fields?.total_amount || '0'),
          claimed: parseInt(fields?.claimed || '0'),
          creator: fields?.creator || account.address,
        })
      }

      setLocks(results)
    } catch (e) {
      setError('Failed to load locks')
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
          <Coins className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
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
            <h1 className="text-3xl font-bold mb-1">My Locks</h1>
            <p className="text-muted-foreground">Your token locks and vesting schedules</p>
          </div>
          <button onClick={loadLocks}
            className="px-4 py-2 rounded-lg bg-secondary border border-border text-sm hover:bg-muted transition-colors">
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
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : locks.length === 0 ? (
          <div className="text-center py-20 rounded-xl bg-card border border-border">
            <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground">No locks or vesting schedules found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {locks.map(lock => (
              <div key={lock.id} className="p-5 rounded-xl bg-card border border-border fade-in">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {lock.type === 'lock'
                        ? <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                        : <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />}
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${lock.type === 'lock' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'}`}>
                        {lock.type === 'lock' ? 'Token Lock' : 'Vesting'}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{lock.tokenType.slice(0, 12)}...</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Balance</span>
                        <div className="font-medium">{(lock.balance / 1e9).toLocaleString()} tokens</div>
                      </div>
                      {lock.type === 'lock' ? (
                        <div>
                          <span className="text-muted-foreground text-xs">Unlocks</span>
                          <div className="font-medium">{lock.unlockTime ? formatDate(lock.unlockTime) : '—'}</div>
                          {lock.unlockTime && <div className={`text-xs font-medium ${lock.unlockTime <= Date.now() ? 'text-green-400' : 'text-muted-foreground'}`}>
                            {timeLeft(lock.unlockTime)}
                          </div>}
                        </div>
                      ) : (
                        <>
                          <div>
                            <span className="text-muted-foreground text-xs">Cliff</span>
                            <div className="font-medium">{lock.cliffTime ? formatDate(lock.cliffTime) : '—'}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-xs">Fully Vested</span>
                            <div className="font-medium">{lock.endTime ? formatDate(lock.endTime) : '—'}</div>
                          </div>
                        </>
                      )}
                      <div>
                        <span className="text-muted-foreground text-xs">Beneficiary</span>
                        <div className="font-medium font-mono text-xs">{lock.beneficiary.slice(0, 8)}...{lock.beneficiary.slice(-4)}</div>
                      </div>
                      {lock.type === 'vesting' && (
                        <div>
                          <span className="text-muted-foreground text-xs">Claimed</span>
                          <div className="font-medium">{(lock.claimed! / 1e9).toLocaleString()} / {(lock.totalAmount! / 1e9).toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {txDigests[lock.id] ? (
                      <a href={`https://suivision.xyz/txblock/${txDigests[lock.id]}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-400">
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
                        className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-50 text-sm font-medium transition-all glow-purple flex items-center gap-1.5"
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
