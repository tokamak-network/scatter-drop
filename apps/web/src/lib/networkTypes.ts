/** Public (browser-safe) view of a registered network — never carries the server rpcUrl. */
export interface PublicNetwork {
  chainId: number;
  name: string;
  /** Required — networks without a browser RPC are filtered out server-side. */
  publicRpcUrl: string;
  explorerUrl: string | null;
  nativeSymbol: string;
  dropFactory: string;
  feeToken: string | null;
  treasury: string | null;
  operatorRegistry: string | null;
  zkFactory: string | null;
  deployBlock: number | null;
}
