import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WalletState } from '../types';
import { Shield, Sparkles, User, Settings, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, Copy } from 'lucide-react';

export const WalletSimulator: React.FC = () => {
  const { wallet, setWallet, resetAll, registries } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const presets = [
    {
      name: 'Regular Customer (KR-NPKI Verified)',
      description: 'Pre-qualified for KR-NPKI CSV drops. Staking TOK (satisfies gate). Unverified on Estonian eID.',
      address: '0xCustomer111111111111111111111111111111',
      tokenBalances: { ETH: 4.25, TON: 350, SDROP: 1200, TOK: 150, TMT: 0 },
      isStaking: true,
      nftCollection: ['Tokamak Access NFT #102'],
    },
    {
      name: 'Estonia Resident (EE-eID Verified)',
      description: 'Estonia eID verified. Holds only 20 TOK, not staking (fails gate). Can buy TOK/stake below to satisfy gate.',
      address: '0xCustomer222222222222222222222222222222',
      tokenBalances: { ETH: 0.8, TON: 40, SDROP: 450, TOK: 20, TMT: 0 },
      isStaking: false,
      nftCollection: [],
    },
    {
      name: 'Platform Administrator',
      description: 'Full DropFactory contract owner. Unlocks the `/admin` menu. Operator and NPKI verified.',
      address: '0xAdmin000000000000000000000000000000000000',
      tokenBalances: { ETH: 120.5, TON: 5400, SDROP: 85000, TOK: 2500, TMT: 1000 },
      isStaking: true,
      nftCollection: ['Founder NFT #001'],
    },
    {
      name: 'Verified Campaign Operator',
      description: 'Registered operator on Operator Registry. Authorized to create campaigns without Step 0 block.',
      address: '0xOperator1111111111111111111111111111111',
      tokenBalances: { ETH: 15.4, TON: 890, SDROP: 12500, TOK: 500, TMT: 0 },
      isStaking: false,
      nftCollection: [],
    },
    {
      name: 'Unverified Operator (New Wallet)',
      description: 'Fresh wallet. Cannot create campaigns until registering on the zk-X509 Operator Gate in Step 0.',
      address: '0xOperatorUnverified5555555555555555555',
      tokenBalances: { ETH: 1.5, TON: 20, SDROP: 200, TOK: 0, TMT: 0 },
      isStaking: false,
      nftCollection: [],
    }
  ];

  const handlePresetSelect = (preset: typeof presets[0]) => {
    setWallet({
      address: preset.address,
      isConnected: true,
      tokenBalances: { ...preset.tokenBalances },
      nftCollection: [...preset.nftCollection],
      isStaking: preset.isStaking
    });
  };

  const handleBalanceChange = (symbol: string, val: number) => {
    setWallet(prev => ({
      ...prev,
      tokenBalances: {
        ...prev.tokenBalances,
        [symbol]: Math.max(0, val)
      }
    }));
  };

  const toggleStaking = () => {
    setWallet(prev => ({ ...prev, isStaking: !prev.isStaking }));
  };

  const toggleNFT = () => {
    setWallet(prev => ({
      ...prev,
      nftCollection: prev.nftCollection.includes('Tokamak Access NFT #102') 
        ? [] 
        : ['Tokamak Access NFT #102']
    }));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Helper to check registry verification status in simulated real-time
  const getVerificationStatus = (registryAddress: string) => {
    const reg = registries.find(r => r.address.toLowerCase() === registryAddress.toLowerCase());
    if (!reg) return false;
    const expiry = reg.verifiedWallets[wallet.address];
    if (!expiry) return false;
    return new Date(expiry) >= new Date();
  };

  return (
    <div id="wallet-simulator-container" className="fixed bottom-4 right-4 z-50 max-w-sm w-full bg-slate-900 border border-slate-800 rounded-xl shadow-2xl text-slate-100 overflow-hidden font-sans">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-3 bg-slate-950 cursor-pointer select-none border-b border-slate-800"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider text-emerald-400">WALLET SIMULATION ENGINE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
            {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
          </span>
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-4 max-h-[75vh] overflow-y-auto space-y-4">
          {/* Quick Connect & Address info */}
          <div className="bg-slate-950 p-3 rounded-lg space-y-2 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">Active Wallet Address:</span>
              <button 
                onClick={handleCopy}
                className="p-1 hover:bg-slate-800 rounded transition text-slate-400 hover:text-white"
                title="Copy Address"
              >
                {copied ? <span className="text-[10px] text-emerald-400 font-mono font-semibold">COPIED!</span> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="text-xs font-mono break-all bg-slate-900 p-2 rounded text-slate-200 select-all border border-slate-800/50">
              {wallet.address}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 bg-slate-900 border border-slate-800">
                Operator CA: {getVerificationStatus('0xOperatorCA1111111111111111111111111111') ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <XCircle className="w-3 h-3 text-rose-500" />
                )}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 bg-slate-900 border border-slate-800">
                KR-NPKI CA: {getVerificationStatus('0xKR_NPKI_CA222222222222222222222222222222') ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <XCircle className="w-3 h-3 text-rose-500" />
                )}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 bg-slate-900 border border-slate-800">
                EE-eID CA: {getVerificationStatus('0xe-Residency_CA33333333333333333333333333') ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <XCircle className="w-3 h-3 text-rose-500" />
                )}
              </span>
            </div>
          </div>

          {/* Preset Selector */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Role Profiles</h4>
            <div className="grid gap-2">
              {presets.map((preset, idx) => {
                const isActive = wallet.address === preset.address;
                return (
                  <button
                    key={idx}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left p-2.5 rounded-lg border transition text-xs flex flex-col gap-0.5 ${
                      isActive 
                        ? 'bg-slate-800/80 border-emerald-500 text-slate-100 shadow-md ring-1 ring-emerald-500/20' 
                        : 'bg-slate-900 border-slate-800 hover:bg-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold text-slate-100 flex items-center gap-1.5">
                        {preset.address === '0xAdmin000000000000000000000000000000000000' ? (
                          <Settings className="w-3.5 h-3.5 text-amber-400" />
                        ) : preset.address.includes('Operator') ? (
                          <Shield className="w-3.5 h-3.5 text-blue-400" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        {preset.name.split(' (')[0]}
                      </span>
                      {isActive && <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold">ACTIVE</span>}
                    </div>
                    <span className="text-[10px] text-slate-400 leading-tight mt-1">
                      {preset.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive State Adjuster */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Adjust Wallet State</h4>
            
            {/* Tokens Grid */}
            <div className="bg-slate-950 p-3 rounded-lg space-y-2.5 border border-slate-800">
              <span className="text-[10px] text-slate-400 font-mono">Simulated Tokens Holding:</span>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(wallet.tokenBalances).map((symbol) => (
                  <div key={symbol} className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-slate-400">{symbol} Balance</label>
                    <input
                      type="number"
                      step={symbol === 'ETH' ? '0.1' : '10'}
                      value={wallet.tokenBalances[symbol] || 0}
                      onChange={(e) => handleBalanceChange(symbol, parseFloat(e.target.value) || 0)}
                      className="bg-slate-900 border border-slate-800 text-xs text-white px-2 py-1 rounded w-full font-mono text-right focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Toggles */}
            <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-mono">Staking in Vault:</span>
                <button
                  onClick={toggleStaking}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                    wallet.isStaking 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {wallet.isStaking ? 'STAKING (ON)' : 'UNSTAKED (OFF)'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-mono">Access NFT:</span>
                <button
                  onClick={toggleNFT}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition ${
                    wallet.nftCollection.length > 0 
                      ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  {wallet.nftCollection.length > 0 ? 'HOLDING NFT' : 'NO NFT'}
                </button>
              </div>
            </div>
          </div>

          {/* Reset System Button */}
          <button
            onClick={resetAll}
            className="w-full bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-slate-700 text-slate-400 hover:text-white py-2 text-xs font-mono rounded-lg transition flex items-center justify-center gap-2 mt-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Simulator Database
          </button>
        </div>
      )}
    </div>
  );
};
