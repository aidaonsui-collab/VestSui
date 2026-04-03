// SPDX-License-Identifier: Apache-2.0

/// ===========================================================================================
/// Module: token_locker
/// Description:
/// Simple time-locked vault. Tokens are locked until a specified unlock time.
/// No gradual release — the full balance becomes available all at once after unlock.
/// Flat fee: 1 SUI + gas charged at lock time, goes to platform admin.
/// ===========================================================================================
module vesting_platform::token_locker;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::transfer;
use sui::tx_context::TxContext;
use sui::sui::SUI;

// === Errors ===
const EAlreadyUnlocked: vector<u8> = b"Tokens are still locked.";
const ENoTokensLocked: vector<u8> = b"No tokens to claim.";
const ENotBeneficiary: vector<u8> = b"Only the beneficiary can claim.";
const EUnlockTimeNotReached: vector<u8> = b"Unlock time has not been reached.";
const EInsufficientFee: vector<u8> = b"Insufficient fee. Required: 1 SUI.";

// === Constants ===
/// Flat platform fee charged on every lock (1 SUI = 1_000_000_000 MIST)
const PLATFORM_FEE: u64 = 1_000_000_000; // 1 SUI in MIST

/// Platform admin wallet that receives fees
const ADMIN: address = @0x92a32ac7fd525f8bd37ed359423b8d7d858cad26224854dfbff1914b75ee658b;

// === Structs ===

public struct TokenLock<phantom T> has key, id: UID {
    phantom: Phantom<T>,
    beneficiary: address,
    unlock_time: u64,
    balance: Balance<T>,
    creator: address,
}

// === Events ===

public struct TokensLocked has copy, drop {
    lock_id: ID,
    beneficiary: address,
    creator: address,
    amount: u64,
    unlock_time: u64,
    fee_charged: u64,
}

public struct TokensClaimed has copy, drop {
    lock_id: ID,
    beneficiary: address,
    amount: u64,
}

public struct PlatformFeeCollected has copy, drop {
    lock_id: ID,
    fee_amount: u64,
    admin: address,
}

// === Core Functions ===

/// Lock tokens until `unlock_time`. Charges 1 SUI flat fee.
/// After unlock_time, only the beneficiary can claim all tokens.
///
/// @param coins Token coins to lock
/// @param fee_coins Coin<SUI> covering 1 SUI fee + gas
/// @param clock Sui clock
/// @param beneficiary Who receives tokens after unlock
/// @param unlock_time Unix timestamp in milliseconds
public fun lock<T>(
    coins: Coin<T>,
    fee_coins: Coin<SUI>,
    clock: &Clock,
    beneficiary: address,
    unlock_time: u64,
    ctx: &mut TxContext,
) {
    assert!(unlock_time > clock.timestamp_ms(), EUnlockTimeNotReached);

    // Charge 1 SUI platform fee
    let fee_balance = fee_coins.into_balance();
    assert!(fee_balance.value() >= PLATFORM_FEE, EInsufficientFee);

    let platform_fee = fee_balance.split(PLATFORM_FEE);
    let leftover = fee_balance;

    // Send fee to admin
    transfer::public_transfer(coin::from_balance(platform_fee, ctx), ADMIN);

    // Refund excess fee to sender
    if (leftover.value() > 0) {
        transfer::public_transfer(coin::from_balance(leftover, ctx), ctx.sender());
    } else {
        leftover.destroy_zero();
    };

    let lock_id = object::new(ctx);
    let amount = coins.balance().value();

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
        phantom: phantom(),
        beneficiary,
        unlock_time,
        balance: coins.into_balance(),
        creator: ctx.sender(),
    };

    transfer::share_object(lock);
}

/// Claim all unlocked tokens. Only the beneficiary after unlock time.
/// No fee on claim — gas only.
public fun claim<T>(
    lock: &mut TokenLock<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == lock.beneficiary, ENotBeneficiary);
    assert!(clock.timestamp_ms() >= lock.unlock_time, EAlreadyUnlocked);

    let amount = lock.balance.value();
    assert!(amount > 0, ENoTokensLocked);

    event::emit(TokensClaimed {
        lock_id: object::uid_to_bytes(&lock.id),
        beneficiary: ctx.sender(),
        amount,
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
