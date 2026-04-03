# Sui Vesting Platform

A token lock and vesting platform on Sui blockchain with two core contract types.

## Contracts

### 1. Token Locker (`token_locker`)
**Simple time vault** — locks tokens until a single unlock date.

- Beneficiary can only withdraw ALL tokens after the unlock time
- No partial claims, no gradual release
- **Fee: 1 SUI + gas** charged at lock time (goes to platform admin)
- Use for: LP locks, team token locks, simple time-based locks

### 2. Vesting Schedule (`vesting_schedule`)
**Cliff + linear release** — tokens vest gradually after a cliff period.

- Nothing claimable during cliff
- After cliff: linear release over the vesting period
- Beneficiary can claim partial amounts anytime
- **Fee: 1 SUI + gas** charged at creation (goes to platform admin)
- Use for: team vesting, investor vesting, token incentives

## Fees

- **1 SUI flat fee per lock/vest** + standard Sui gas
- Fee goes to platform admin wallet
- Claiming/withdrawing is **free** (gas only)
- Admin address: `0x92a32ac7fd525f8bd37ed359423b8d7d858cad26224854dfbff1914b75ee658b`

## Building

```bash
cd sui-vesting-platform
sui move build
```

## Key Differences

| Feature | Token Locker | Vesting Schedule |
|---------|-------------|-----------------|
| Partial claims | ❌ No | ✅ Yes |
| Cliff period | ❌ No | ✅ Yes |
| Linear release | ❌ No | ✅ Yes |
| Unlock date | Single date | Cliff + end date |
| Fee on lock | 1 SUI | 1 SUI |
| Fee on claim | Free | Free |
| Use case | LP locks, simple holds | Team/investor vesting |
