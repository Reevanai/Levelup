/**
 * Provider seams.
 *
 * LevelUp never moves real money itself. Every regulated action goes through
 * one of these interfaces. In this prototype each one is backed by a mock that
 * only writes to our own simulation ledger. To go live, swap the mocks for
 * adapters to appropriately licensed partners (a PPI issuer / partner bank for
 * wallet balances and cards, a payment aggregator for collections, a
 * regulated KYC provider for identity) — no route or UI code needs to change.
 */
import { randomBytes } from 'node:crypto';

export interface ProviderResult { ok: boolean; ref: string; reason?: string }

export interface FundingProvider {
  readonly name: string;
  /** Pull money from an external source into the user's wallet. */
  collect(userId: string, amount: number, source: string): ProviderResult;
}
export interface TransferProvider {
  readonly name: string;
  /** Push money from the user's wallet to another person. */
  payout(userId: string, amount: number, toHandle: string): ProviderResult;
}
export interface CardProvider {
  readonly name: string;
  issueVirtualCard(userId: string): { last4: string; expiry: string };
  /** Demo-only: returns non-issuable placeholder credentials. */
  revealCredentials(last4: string): { number: string; cvv: string };
  authorize(userId: string, amount: number, merchant: string): ProviderResult;
}
export interface KycProvider {
  readonly name: string;
  verify(userId: string, input: { docType: string }): { status: 'demo_verified' | 'rejected'; ref: string };
}

const ref = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex').toUpperCase()}`;

export const funding: FundingProvider = {
  name: 'mock-funding',
  collect: () => ({ ok: true, ref: ref('SIMFUND') }),
};
export const transfers: TransferProvider = {
  name: 'mock-transfers',
  payout: () => ({ ok: true, ref: ref('SIMPAY') }),
};
export const cardsProvider: CardProvider = {
  name: 'mock-cards',
  issueVirtualCard() {
    const last4 = String(1000 + (randomBytes(2).readUInt16BE() % 9000));
    const d = new Date();
    const expiry = `${String(d.getMonth() + 1).padStart(2, '0')}/${String((d.getFullYear() + 4) % 100).padStart(2, '0')}`;
    return { last4, expiry };
  },
  // 9999 is not an assigned card range, so these can never be real credentials.
  revealCredentials: (last4) => ({ number: `9999 0000 0000 ${last4}`, cvv: '000' }),
  authorize: () => ({ ok: true, ref: ref('SIMCARD') }),
};
export const kyc: KycProvider = {
  name: 'mock-kyc',
  verify: () => ({ status: 'demo_verified', ref: ref('SIMKYC') }),
};
export const internalRef = () => ref('SIMLEDGER');
