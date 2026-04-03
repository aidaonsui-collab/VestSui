// SPDX-License-Identifier: Apache-2.0

/// Token Locker — simple time vault for Sui.
/// Tokens locked until a specified unlock date. All tokens claimable at once.
module vesting_platform::token_locker;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::sui::SUI;

// === Errors ===
#[error]
const EAlreadyUnlocked: vector<u8> = b"Tokens are still locked.";
#[error]
const ENoTokensLocked: vector<u8> = b"No tokens to claim.";
#[error]
const ENotBeneficiary: vector<u8> = b"Only the beneficiary can claim.";
#[error]
const EUnlockTimeNotReached: vector<u8> = b"Unlock time has not been reached.";
#[error]
const EInsufficientFee: vector<u8> = b"Insufficient fee. Required: 1 SUI.";
#[error]
const EZeroAmount: vector<u8> = b"Amount to lock must be greater than zero.";

// === Constants ===
/// 1 SUI in MIST
const PLATFORM_FEE: u64 = 1_000_000_000;

/// Platform admin wallet
const ADMIN: address = @0x92a32ac7fd525f8bd37ed359423b8d7d858cad26224854dfbff1914b75ee658b;

// === Structs ===

/// [Shared] Token lock holding tokens until unlock_time.
/// After unlock, beneficiary claims everything at once.
public struct TokenLock<phantom T> has key {
    id: UID,
    beneficiary: address,
    unlock_time: u64,
    balance: Balance<T>,
    creator: address,
}

// === Events ===

public struct TokensLocked has copy, drop {
    lock_id: vector<u8>,
    beneficiary: address,
    creator: address,
    amount: u64,
    unlock_time: u64,
    fee_charged: u64,
}

public struct TokensClaimed has copy, drop {
    lock_id: vector<u8>,
    beneficiary: address,
    amount: u64,
    remaining_balance: u64,
}

public struct PlatformFeeCollected has copy, drop {
    lock_id: vector<u8>,
    fee_amount: u64,
    admin: address,
}

// === Core Functions ===

/// Lock tokens until `unlock_time`. Charges 1 SUI platform fee.
public fun lock<T>(
    coins: Coin<T>,
    fee_coins: Coin<SUI>,
    clock: &Clock,
    beneficiary: address,
    unlock_time: u64,
    ctx: &mut TxContext,
) {
    // Fix #2: Reject zero-value locks
    let amount = coins.balance().value();
    assert!(amount > 0, EZeroAmount);

    assert!(unlock_time > clock.timestamp_ms(), EUnlockTimeNotReached);

    let mut fee_balance = fee_coins.into_balance();
    assert!(fee_balance.value() >= PLATFORM_FEE, EInsufficientFee);

    let platform_fee = fee_balance.split(PLATFORM_FEE);
    let leftover = fee_balance;

    transfer::public_transfer(coin::from_balance(platform_fee, ctx), ADMIN);

    if (leftover.value() > 0) {
        transfer::public_transfer(coin::from_balance(leftover, ctx), ctx.sender());
    } else {
        leftover.destroy_zero();
    };

    let lock_id = object::new(ctx);

    // Emit events before sharing (Fix #6: event ordering)
    event::emit(TokensLocked {
        lock_id: object::uid_to_bytes(&lock_id),
        beneficiary,
        creator: ctx.sender(),
        amount,
        unlock_time,
        fee_charged: PLATFORM_FEE,
    });

    event::emit(PlatformFeeCollected {
        lock_id: object::uid_to_bytes(&lock_id),
        fee_amount: PLATFORM_FEE,
        admin: ADMIN,
    });

    let lock = TokenLock<T> {
        id: lock_id,
        beneficiary,
        unlock_time,
        balance: coins.into_balance(),
        creator: ctx.sender(),
    };

    transfer::share_object(lock);
}

/// Claim all unlocked tokens. Beneficiary only. No fee on claim.
public fun claim<T>(
    lock: &mut TokenLock<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == lock.beneficiary, ENotBeneficiary);
    assert!(clock.timestamp_ms() >= lock.unlock_time, EAlreadyUnlocked);

    let amount = lock.balance.value();
    assert!(amount > 0, ENoTokensLocked);

    // Fix #6: Split balance BEFORE emitting event with remaining balance
    let remaining = lock.balance.value() - amount;

    event::emit(TokensClaimed {
        lock_id: object::uid_to_bytes(&lock.id),
        beneficiary: ctx.sender(),
        amount,
        remaining_balance: remaining,
    });

    coin::from_balance(lock.balance.split(amount), ctx)
}

/// Amount currently claimable.
public fun claimable<T>(lock: &TokenLock<T>, clock: &Clock): u64 {
    if (clock.timestamp_ms() < lock.unlock_time) {
        0
    } else {
        lock.balance.value()
    }
}

// === Accessors ===

public fun beneficiary<T>(lock: &TokenLock<T>): address { lock.beneficiary }
public fun unlock_time<T>(lock: &TokenLock<T>): u64 { lock.unlock_time }
public fun balance<T>(lock: &TokenLock<T>): u64 { lock.balance.value() }
public fun creator<T>(lock: &TokenLock<T>): address { lock.creator }
public fun admin(): address { ADMIN }
public fun platform_fee(): u64 { PLATFORM_FEE }

public fun is_expired<T>(lock: &TokenLock<T>, clock: &Clock): bool {
    clock.timestamp_ms() >= lock.unlock_time
}
