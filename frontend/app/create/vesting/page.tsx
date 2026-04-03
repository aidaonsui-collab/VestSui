'use client'

import { useState, useEffect } from 'react'
import { useCurrentAccount, useSignAndExecuteTransactionBlock, useSuiClient } from '@mysten/dapp-kit'
import { TrendingUp, AlertCircle, CheckCircle, ExternalLink, Info, Loader2 } from 'lucide-react'
import { Transaction } from '@mysten/sui/transactions'
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils'

const VESTING_PKG = process.env.NEXT_PUBLIC_VESTING_PKG || '0x0'
const PLATFORM_FEE = 1_000_000_000 // 1 SUI in MIST

export default function CreateVestingPage() {
  const account = useCurrentAccount()
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransactionBlock()
  const suiClient = useSuiClient()

  const [tokenType, setTokenType] = useState('')
  const [amount, setAmount] = useState('')
  const [beneficiary, setBeneficiary] = useState('')
  const [cliffDate, setCliffDate] = useState('')
  const [endDate, setEndDate] = useState('')
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

    const cliffMs = new Date(cliffDate).getTime()
    const endMs = new Date(endDate).getTime()
    if (cliffMs <= Date.now()) { setError('Cliff date must be in the future'); return }
    if (endMs <= cliffMs) { setError('End date must be after cliff date'); return }

    let tokenCoins
    try {
      tokenCoins = await suiClient.getCoins({ owner: account.address, coinType: tokenType })
    } catch {
      setError('Failed to fetch coins. Check the token address format (e.g. 0x...::module::TYPE).')
      return
    }
    if (!tokenCoins.data.length) { setError(`No ${tokenType} tokens found in wallet.`); return }

    const amountBase = BigInt(Math.floor(parseFloat(amount) * 1e9))
    if (amountBase <= 0n) { setError('Amount must be greater than zero'); return }

    // Validate beneficiary format
    if (!/^0x[a-fA-F0-9]{64}$/.test(beneficiary)) {
      setError('Invalid beneficiary address. Must be a 66-character hex address (0x + 64 hex chars).')
      return
    }

    const isSui = tokenType === '0x2::sui::SUI'
    const tx = new Transaction()

    if (isSui) {
      const coinToSend = tx.splitCoins(tx.gas, [tx.pure.u64(amountBase)])
      const feeCoin = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(PLATFORM_FEE))])

      tx.moveCall({
        target: `${VESTING_PKG}::vesting_schedule::new`,
        arguments: [
          coinToSend,
          feeCoin,
          tx.object(SUI_CLOCK_OBJECT_ID),
          tx.pure.address(beneficiary),
          tx.pure.u64(BigInt(cliffMs)),
          tx.pure.u64(BigInt(endMs)),
        ],
        typeArguments: [tokenType],
      })
    } else {
      // For non-SUI tokens: merge all coin objects, then split
      const coinIds = tokenCoins.data.map(c => c.coinObjectId)
      const primaryCoin = tx.object(coinIds[0])

      if (coinIds.length > 1) {
        tx.mergeCoins(primaryCoin, coinIds.slice(1).map(id => tx.object(id)))
      }

      const coinToSend = tx.splitCoins(primaryCoin, [tx.pure.u64(amountBase)])
      const feeCoin = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(PLATFORM_FEE))])

      tx.moveCall({
        target: `${VESTING_PKG}::vesting_schedule::new`,
        arguments: [
          coinToSend,
          feeCoin,
          tx.object(SUI_CLOCK_OBJECT_ID),
          tx.pure.address(beneficiary),
          tx.pure.u64(BigInt(cliffMs)),
          tx.pure.u64(BigInt(endMs)),
        ],
        typeArguments: [tokenType],
      })
    }

    signAndExecute(
      { transactionBlock: tx as any },
      {
        onSuccess: (result) => setTxDigest(result.digest),
        onError: (err) => setError(err.message || 'Transaction failed'),
      }
    )
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center p-8 rounded-xl bg-card border border-border max-w-sm">
          <TrendingUp className="w-12 h-12 text-green-400 mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground">Connect your Sui wallet to create a vesting schedule.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
            <TrendingUp className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400 font-medium">Vesting Schedule</span>
          </div>
          <h1 className="text-3xl font-bold mb-2">Create Vesting</h1>
          <p className="text-muted-foreground">Cliff + linear release. Tokens vest gradually after the cliff period.</p>
        </div>

        <div className="flex items-start gap-3 p-4 rounded-lg bg-secondary border border-border mb-6">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="text-foreground font-medium">1 SUI platform fee</span>
            <span className="text-muted-foreground"> + gas. Your balance: </span>
            <span className="text-green-400 font-medium">{suiBalance.toFixed(2)} SUI</span>
          </div>
        </div>

        {txDigest ? (
          <div className="text-center p-8 rounded-xl bg-card border border-green-500/20 fade-in">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Vesting Created!</h2>
            <p className="text-muted-foreground mb-4">
              {amount} tokens vesting from {new Date(cliffDate).toLocaleDateString()} to {new Date(endDate).toLocaleDateString()}
            </p>
            <a href={`https://suivision.xyz/txblock/${txDigest}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              View on Suivision <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="p-6 rounded-xl bg-card border border-border space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">Token Address</label>
                <input type="text" value={tokenType} onChange={e => setTokenType(e.target.value)}
                  placeholder="0x...::token::TOKEN" required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono text-sm" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Total Amount to Vest</label>
                <input type="number" step="any" value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder="e.g. 1000000" required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Beneficiary Address</label>
                <input type="text" value={beneficiary} onChange={e => setBeneficiary(e.target.value)}
                  placeholder="0x... (who receives tokens)" required
                  className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Cliff Date</label>
                  <input type="datetime-local" value={cliffDate} onChange={e => setCliffDate(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-primary/50" />
                  <p className="text-xs text-muted-foreground mt-1">When first tokens unlock</p>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">End Date</label>
                  <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} required
                    className="w-full px-4 py-2.5 rounded-lg bg-secondary border border-border text-foreground focus:outline-none focus:border-primary/50" />
                  <p className="text-xs text-muted-foreground mt-1">When all tokens are vested</p>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-medium">{amount || '—'} tokens</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cliff</span>
                <span className="font-medium">{cliffDate ? new Date(cliffDate).toLocaleDateString() : '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Full Vesting</span>
                <span className="font-medium">{endDate ? new Date(endDate).toLocaleDateString() : '—'}</span>
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
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}

            <button type="submit" disabled={isPending}
              className="w-full py-3 rounded-lg bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all glow-green text-black flex items-center justify-center gap-2">
              {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Vesting Schedule'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
