// SPDX-License-Identifier: Apache-2.0

/// ===========================================================================================
/// Module: vesting_schedule
/// Description:
/// Vesting schedule with cliff + linear release.
/// Flat fee: 1 SUI + gas charged at creation, goes to platform admin.
/// ===========================================================================================
module vesting_platform::vesting_schedule;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::transfer;
use sui::tx_context::TxContext;
use sui::sui::SUI;

// === Errors ===
const ECliffNotReached: vector<u8> = b"Vesting cliff has not been reached yet.";
const ENoTokensVested: vector<u8> = b"No tokens are currently vested.";
const ENotBeneficiary: vector<u8> = b"Only the beneficiary can claim.";
const EInvalidSchedule: vector<u8> = b"Cliff must be after now and before end time.";
const EInsufficientFee: vector<u8> = b"Insufficient fee. Required: 1 SUI.";

// === Constants ===
const PLATFORM_FEE: u64 = 1_000_000_000; // 1 SUI in MIST
const ADMIN: address = @0x92a32ac7fd525f8bd37ed359423b8d7d858cad26224854dfbff1914b75ee658b;

// === Structs ===

public struct VestingWallet<phantom T> has key, id: UID {
    phantom: Phantom<T>,
    beneficiary: address,
    cliff_time: u64,
    end_time: u64,
    total_amount: u64,
    claimed: u64,
    balance: Balance<T>,
    creator: address,
}

// === Events ===

public struct VestingScheduleCreated has copy, drop {
    wallet_id: ID,
    beneficiary: address,
    creator: address,
    total_amount: u64,
    cliff_time: u64,
    end_time: u64,
    fee_charged: u64,
}

public struct TokensVested has copy, drop {
    wallet_id: ID,
    beneficiary: address,
    amount_claimed: u64,
    remaining_balance: u64,
}

public struct PlatformFeeCollected has copy, drop {
    wallet_id: ID,
    fee_amount: u64,
    admin: address,
}

// === Core Functions ===

/// Create a vesting wallet with cliff + linear release.
/// Charges 1 SUI platform fee.
///
/// @param coins Tokens to vest
/// @param fee_coins Coin<SUI> covering 1 SUI fee + gas
/// @param clock Sui clock
/// @param beneficiary Who receives the tokens
/// @param cliff_time When first tokens become claimable (ms)
/// @param end_time When all tokens are fully vested (ms)
public fun new<T>(
    coins: Coin<T>,
    fee_coins: Coin<SUI>,
    clock: &Clock,
    beneficiary: address,
    cliff_time: u64,
    end_time: u64,
    ctx: &mut TxContext,
): VestingWallet<T> {
    assert!(cliff_time >= clock.timestamp_ms(), EInvalidSchedule);
    assert!(end_time > cliff_time, EInvalidSchedule);

    // Charge 1 SUI platform fee
    let fee_balance = fee_coins.into_balance();
    assert!(fee_balance.value() >= PLATFORM_FEE, EInsufficientFee);

    let platform_fee = fee_balance.split(PLATFORM_FEE);
    let leftover = fee_balance;

    transfer::public_transfer(coin::from_balance(platform_fee, ctx), ADMIN);

    if (leftover.value() > 0) {
        transfer::public_transfer(coin::from_balance(leftover, ctx), ctx.sender());
    } else {
        leftover.destroy_zero();
    };

    let wallet_id = object::new(ctx);
    let total = coins.balance().value();

    event::emit(VestingScheduleCreated {
        wallet_id: object::uid_to_bytes(&wallet_id),
        beneficiary,
        creator: ctx.sender(),
        total_amount: total,
        cliff_time,
        end_time,
        fee_charged: PLATFORM_FEE,
    });

    event::emit(PlatformFeeCollected {
        wallet_id: object::uid_to_bytes(&wallet_id),
        fee_amount: PLATFORM_FEE,
        admin: ADMIN,
    });

    let wallet = VestingWallet<T> {
        id: wallet_id,
        phantom: phantom(),
        beneficiary,
        cliff_time,
        end_time,
        total_amount: total,
        claimed: 0,
        balance: coins.into_balance(),
        creator: ctx.sender(),
    };

    transfer::share_object(wallet);
    wallet
}

/// Claim vested tokens. Beneficiary only. No fee on claim.
public fun claim<T>(
    wallet: &mut VestingWallet<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert!(ctx.sender() == wallet.beneficiary, ENotBeneficiary);
    assert!(clock.timestamp_ms() >= wallet.cliff_time, ECliffNotReached);

    let claimable_amount = claimable(wallet, clock);
    assert!(claimable_amount > 0, ENoTokensVested);

    wallet.claimed = wallet.claimed + claimable_amount;

    event::emit(TokensVested {
        wallet_id: object::uid_to_bytes(&wallet.id),
        beneficiary: ctx.sender(),
        amount_claimed: claimable_amount,
        remaining_balance: wallet.balance.value(),
    });

    coin::from_balance(wallet.balance.split(claimable_amount), ctx)
}

/// Calculate currently claimable amount.
/// - Before cliff: 0
/// - After cliff, before end: linear proportional release
/// - After end: entire remaining balance
public fun claimable<T>(wallet: &VestingWallet<T>, clock: &Clock): u64 {
    let timestamp = clock.timestamp_ms();

    if (timestamp < wallet.cliff_time) {
        return 0
    };

    let remaining = wallet.balance.value();
    if (remaining == 0) {
        return 0
    };

    if (timestamp >= wallet.end_time) {
        return remaining
    };

    // Linear: vested = total * elapsed / duration
    let vested_total: u128 =
        ((wallet.total_amount as u128) * ((timestamp - wallet.cliff_time) as u128))
        / ((wallet.end_time - wallet.cliff_time) as u128);
    let already_vested = (vested_total as u64);

    if (already_vested <= wallet.claimed) {
        0
    } else {
        already_vested - wallet.claimed
    }
}

// === Accessors ===

public fun beneficiary<T>(wallet: &VestingWallet<T>): address { wallet.beneficiary }
public fun cliff_time<T>(wallet: &VestingWallet<T>): u64 { wallet.cliff_time }
public fun end_time<T>(wallet: &VestingWallet<T>): u64 { wallet.end_time }
public fun total_amount<T>(wallet: &VestingWallet<T>): u64 { wallet.total_amount }
public fun claimed<T>(wallet: &VestingWallet<T>): u64 { wallet.claimed }
public fun creator<T>(wallet: &VestingWallet<T>): address { wallet.creator }
public fun admin(): address { ADMIN }
public fun platform_fee(): u64 { PLATFORM_FEE }

/// Total vested so far (clamped to total_amount).
public fun vested_total<T>(wallet: &VestingWallet<T>, clock: &Clock): u64 {
    let timestamp = clock.timestamp_ms();
    if (timestamp >= wallet.end_time) {
        wallet.total_amount
    } else if (timestamp <= wallet.cliff_time) {
        0
    } else {
        let ratio: u128 =
            ((wallet.total_amount as u128) * ((timestamp - wallet.cliff_time) as u128))
            / ((wallet.end_time - wallet.cliff_time) as u128);
        (ratio as u64)
    }
}

/// Remaining locked (not yet vested).
public fun locked<T>(wallet: &VestingWallet<T>, clock: &Clock): u64 {
    wallet.total_amount - vested_total(wallet, clock)
}

/// Vesting progress in basis points (0–10000 = 0%–100%).
public fun vested_bps<T>(wallet: &VestingWallet<T>, clock: &Clock): u64 {
    let total = wallet.total_amount;
    if (total == 0) return 0;
    (vested_total(wallet, clock) * 10000) / total
}

/// Milliseconds until cliff (0 if already past cliff).
public fun time_until_cliff<T>(wallet: &VestingWallet<T>, clock: &Clock): u64 {
    let timestamp = clock.timestamp_ms();
    if (timestamp >= wallet.cliff_time) 0
    else wallet.cliff_time - timestamp
}

/// Milliseconds until fully vested (0 if at or past end_time).
public fun time_until_end<T>(wallet: &VestingWallet<T>, clock: &Clock): u64 {
    let timestamp = clock.timestamp_ms();
    if (timestamp >= wallet.end_time) 0
    else wallet.end_time - timestamp
}
