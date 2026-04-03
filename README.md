# VestSui — Token Lock & Vesting on Sui

Token lock and vesting platform on Sui blockchain.

## Contracts

### Token Locker (`sources/token_locker.move`)
Simple time vault — locks tokens until a single unlock date. Fee: 1 SUI.

### Vesting Schedule (`sources/vesting_schedule.move`)
Cliff + linear release. Fee: 1 SUI.

**Package ID:** `0x93d1a123f8955c344d83d571048cf2d53ab790ba9c202391e4ef54e467574558`
**Network:** Sui Mainnet

## Frontend (Vercel-deployable)

The Next.js frontend is at the repo root.

```bash
npm install
npm run dev
```

## Deploy Contracts

```bash
cd sources && sui client publish
```
