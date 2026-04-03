'use client'

import { useState } from 'react'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { Lock, TrendingUp, Shield, Zap, Coins, ArrowRight, Clock, CheckCircle, Key } from 'lucide-react'
import Link from 'next/link'

const features = [
  {
    icon: <Lock className="w-6 h-6" />,
    title: 'Token Locker',
    description: 'Lock tokens until a specific date. Simple, secure, no cliff.',
    href: '/create/lock',
    color: 'text-purple-400',
    glow: 'glow-purple',
    tag: '1 SUI fee',
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: 'Vesting Schedule',
    description: 'Cliff + linear release for team, investors, and incentives.',
    href: '/create/vesting',
    color: 'text-green-400',
    glow: 'glow-green',
    tag: '1 SUI fee',
  },
]

export default function HomePage() {
  const account = useCurrentAccount()
  const [activeTab, setActiveTab] = useState<'lock' | 'vesting'>('lock')

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-muted-foreground">Live on Sui Mainnet</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            <span className="gradient-text">Token Lock</span> &<br />
            <span className="gradient-text">Vesting Platform</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
            Lock tokens or create vesting schedules for your team, investors, and liquidity.
            Built on Sui — fast, secure, and low cost.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/create/lock"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary hover:bg-primary/80 text-primary-foreground font-semibold transition-all glow-purple"
            >
              <Lock className="w-4 h-4" />
              Lock Tokens
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/create/vesting"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-accent/20 border border-accent/30 hover:bg-accent/30 text-accent font-semibold transition-all"
            >
              <TrendingUp className="w-4 h-4" />
              Create Vesting
            </Link>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Platform Fee', value: '1 SUI', sub: 'Per lock created' },
            { label: 'Networks', value: 'Sui', sub: 'Mainnet only' },
            { label: 'Partial Claims', value: 'Yes', sub: 'Vesting only' },
            { label: 'No Admin Keys', value: '100%', sub: 'Non-custodial' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-xl font-bold stat-value">{stat.value}</div>
              <div className="text-sm text-primary font-medium">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Product Cards */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold mb-8 text-center">Choose Your Tool</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group relative p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-all fade-in"
            >
              <div className={`inline-flex p-3 rounded-lg bg-secondary mb-4 ${f.glow}`}>
                <div className={f.color}>{f.icon}</div>
              </div>
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-xl font-bold">{f.title}</h3>
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{f.tag}</span>
              </div>
              <p className="text-muted-foreground text-sm mb-4">{f.description}</p>
              <div className="flex items-center gap-1 text-primary text-sm font-medium group-hover:gap-2 transition-all">
                Get started <ArrowRight className="w-4 h-4" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div className="border-t border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Connect Wallet',
                desc: 'Connect your Sui wallet. No sign-up, no KYC.',
                icon: <Coins className="w-5 h-5" />,
              },
              {
                step: '02',
                title: 'Create Lock or Vesting',
                desc: 'Choose your type, set the schedule, pay 1 SUI fee.',
                icon: <Key className="w-5 h-5" />,
              },
              {
                step: '03',
                title: 'Beneficiary Claims',
                desc: 'Tokens unlock automatically. Beneficiary withdraws anytime after unlock.',
                icon: <CheckCircle className="w-5 h-5" />,
              },
            ].map((item) => (
              <div key={item.step} className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <span className="text-primary font-bold">{item.step}</span>
                </div>
                <h3 className="font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">VestSui — Built on Sui</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/create/lock" className="hover:text-foreground">Lock</Link>
            <Link href="/create/vesting" className="hover:text-foreground">Vesting</Link>
            <Link href="/my-locks" className="hover:text-foreground">My Locks</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
