'use client'

import { useState, useEffect } from 'react'
import { useCurrentAccount, useSignAndExecuteTransactionBlock, useSuiClient } from '@mysten/dapp-kit'
import { Lock, AlertCircle, CheckCircle, ExternalLink, Info, Loader2 } from 'lucide-react'
import { Transaction } from '@mysten/sui/transactions'
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils'

const VESTING_PKG = process.env.NEXT_PUBLIC_VESTING_PKG || '0x0'
const PLATFORM_FEE = 1_000_000_000 // 1 SUI in MIST

function dateToMs(dateStr: string): string {
  return String(new Date(dateStr).getTime())
}

export default function CreateLockPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransactionBlock()
  const suiClient = useSuiClient()

  const [tokenType, setTokenType] = useState('')
  const [amount, setAmount] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [unlockDate, setUnlockDate] = useState('')
  const [txDigest, setTxDigest] = useState('')
  const [error, setError] = useState('')
  const [suiBalance, setSuiBalance] = useState(0)

  useEffect(() => {
    if (!account) return
    suiClient.getBalance({ owner: account.address, coinType: '0x2::sui::SUI' })
      .then(b => setSuiBalance(Number(b.totalBalance) / 1e9))
      .catch(() => {})
  }, [account, suiClient])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!account) return

    const unlockTimeMs = new Date(unlockDate).getTime()
    if (unlockTimeMs <= Date.now()) {
      setError('Unlock date must be in the future')
      return
    }

    // Fetch user's coins of the specified type
    let coins
    try {
      coins = await suiClient.getCoins({
        owner: account.address,
        coinType: tokenType,
      })
    } catch {
      setError('Failed to fetch your coins. Check the token address.')
      return
    }

    if (!coins.data.length) {
      setError(`You don't have any ${tokenType} tokens.`)
      return
    }

    const amountBase = BigInt(Math.floor(parseFloat(amount) * 1e9))

    const tx = new Transaction()

    // Split the amount from first coin (or use gas if it's the same type)
    const coinToSend = tx.splitCoins(tx.gas, [tx.pure.u64(amountBase)])

    // Get 1 SUI for fee
    const feeCoin = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(PLATFORM_FEE))])

    // Call token_locker::lock
    tx.moveCall({
      target: `${VESTING_PKG}::token_locker::lock`,
      arguments: [
        coinToSend,       // Coin<T>
        feeCoin,          // Coin<SUI> fee
        tx.object(SUI_CLOCK_OBJECT_ID), // &Clock
        tx.pure.address(beneficiary),    // beneficiary address
        tx.pure.u64(BigInt(unlockTimeMs)), // unlock_time ms
      ],
      typeArguments: [tokenType],
    })

    signAndExecute(
      { transactionBlock: tx as any },
      {
        onSuccess: (result) => {
          setTxDigest(result.digest)
        },
        onError: (err) => {
          setError(err.message || 'Transaction failed')
        },
      }
    )
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center p-8 rounded-xl bg-card border border-border max-w-sm">
          <Lock className="w-12 h-12 text-primary mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground">Connect your Sui wallet to create a token lock.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
            <Lock className="w-3 h-3 text-purple-400" />
            <span className="text-xs text-purple-400 font-medium">Token Locker</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Lock Tokens</h1>
          <p className="text-muted-foreground">Lock tokens until a specific date. All tokens claimable at once after unlock.</p>
        </div>

        {/* Fee Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary border border-border mb-6">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="text-foreground font-medium">1 SUI platform fee</span>
            <span className="text-muted-foreground"> + gas charged at lock time. </span>
            <span className="text-green-400 font-medium">Balance: {suiBalance.toFixed(2)} SUI</span>
          </div>
        </div>

        {txDigest ? (
          <div className="text-center p-8 rounded-xl bg-card border border-green-500/20 fade-in">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Lock Created!</h2>
            <p className="text-muted-foreground mb-4">Your tokens are now locked until {new Date(unlockDate).toLocaleString()}</p>
            <a
              href={`https://suivision.xyz/txblock/${txDigest}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View on Suivision <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="p-6 rounded-xl bg-card border border-border space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">Token Address</label>
                <input
                  type="text"
                  value={tokenType}
                  onChange={e => setTokenType(e.target.value)}
                  placeholder="0x...::token::TOKEN"
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Amount to Lock</label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Beneficiary Address</label>
                <input
                  type="text"
                  value={beneficiary}
                  onChange={e => setBeneficiary(e.target.value)}
                  placeholder="0x... (who claims after unlock)"
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Unlock Date & Time</label>
                <input
                  type="datetime-local"
                  value={unlockDate}
                  onChange={e => setUnlockDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium font-mono text-xs">{tokenType ? `${tokenType.slice(0,12)}...` : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{amount || '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Unlock Date</span>
                <span className="font-medium">{unlockDate ? new Date(unlockDate).toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Beneficiary</span>
                <span className="font-medium font-mono text-xs">{beneficiary ? `${beneficiary.slice(0,8)}...${beneficiary.slice(-4)}` : '—'}</span>
              </div>
              <div className="border-t border-border/50 pt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Platform Fee</span>
                <span className="font-medium text-primary">1 SUI + gas</span>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-3 rounded-lg bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all glow-purple flex items-center justify-center gap-2"
            >
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Lock...</> : 'Create Lock'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
