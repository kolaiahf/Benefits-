/**
 * Apple / Google Wallet pass generation boundary.
 *
 * The "Add to Apple Wallet" button currently confirms optimistically. To issue
 * real passes you need:
 *   - Apple: a Pass Type ID + signing certificate (Apple Developer Program),
 *     to build and sign a .pkpass bundle.
 *   - Google: a Google Wallet API issuer account + service-account key, to
 *     create a Generic/insurance pass class+object and return a "save" JWT URL.
 *
 * These secrets can't live in the repo. This module defines the seam: implement
 * the builders and expose them from an authenticated route (e.g. /api/wallet).
 */
export interface WalletCardData {
  memberName: string;
  memberId: string;
  carrier: string;
  planName: string;
  groupNumber: string;
}

export interface WalletProvider {
  /** Build a signed Apple .pkpass bundle for a member's insurance card. */
  buildApplePass(card: WalletCardData): Promise<Buffer>;
  /** Create a Google Wallet object and return the "Save to Google Wallet" URL. */
  buildGoogleSaveUrl(card: WalletCardData): Promise<string>;
}

export const walletProvider: WalletProvider = {
  async buildApplePass() {
    throw new Error(
      "Apple Wallet not configured. Add a Pass Type ID + signing cert and " +
        "implement buildApplePass (see src/lib/integrations/wallet.ts)."
    );
  },
  async buildGoogleSaveUrl() {
    throw new Error("Google Wallet not configured. See src/lib/integrations/wallet.ts.");
  },
};

export function isAppleWalletConfigured(): boolean {
  return Boolean(process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_PASS_CERT);
}
export function isGoogleWalletConfigured(): boolean {
  return Boolean(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SA_KEY);
}
