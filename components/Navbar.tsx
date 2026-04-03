'use client'

import Link from 'next/link'
import { useCurrentAccount } from '@mysten/dapp-kit'
import { ConnectButton } from '@mysten/dapp-kit'
import { Lock, Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function Navbar() {
  const account = useCurrentAccount()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center gold-glow">
            <Lock className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <span className="font-bold text-lg gold-gradient-text" style={{ fontFamily: 'serif' }}>SuiLock</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            Home
          </Link>
          <Link href="/create/lock" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            Lock Tokens
          </Link>
          <Link href="/create/vesting" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            Create Vesting
          </Link>
          <Link href="/my-locks" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
            My Locks
          </Link>
        </div>

        {/* Wallet Connect Button */}
        <div className="flex items-center gap-3">
          <ConnectButton
            className="!bg-[#D4AF37]/10 !text-[#D4AF37] !border !border-[#D4AF37]/30 !rounded-lg !px-4 !py-1.5 !text-sm !font-medium hover:!bg-[#D4AF37]/20 transition-all"
          />
          <button
            className="md:hidden p-2"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border px-4 py-4 space-y-3 bg-card">
          <Link href="/" className="block text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>Home</Link>
          <Link href="/create/lock" className="block text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>Lock Tokens</Link>
          <Link href="/create/vesting" className="block text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>Create Vesting</Link>
          <Link href="/my-locks" className="block text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>My Locks</Link>
        </div>
      )}
    </nav>
  )
}
