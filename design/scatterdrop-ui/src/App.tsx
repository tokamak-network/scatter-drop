import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ExplorePage } from './components/ExplorePage';
import { CampaignDetails } from './components/CampaignDetails';
import { ManagePage } from './components/ManagePage';
import { AdminPage } from './components/AdminPage';
import { WalletSimulator } from './components/WalletSimulator';
import { Shield, Sparkles, AlertCircle, Coins, ChevronRight, CheckCircle2, User, HelpCircle, Gift } from 'lucide-react';

type MainView = 'EXPLORE' | 'CAMPAIGN_DETAIL' | 'CLAIMS' | 'MANAGE' | 'ADMIN';

const AppContent: React.FC = () => {
  const { wallet, setWallet, campaigns, registries } = useApp();
  const [currentView, setCurrentView] = useState<MainView>('EXPLORE');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  // Wallet connection toggler simulation
  const toggleWalletConnection = () => {
    setWallet(prev => ({
      ...prev,
      isConnected: !prev.isConnected
    }));
  };

  const handleSelectCampaign = (id: string) => {
    setSelectedCampaignId(id);
    setCurrentView('CAMPAIGN_DETAIL');
  };

  // Helper to determine if connected wallet is admin
  const isAdmin = wallet.isConnected && wallet.address.toLowerCase() === '0xadmin000000000000000000000000000000000000';

  // Compute immediate claim shortcuts for "My Claims" view
  const getQualifiedClaims = () => {
    if (!wallet.isConnected) return [];

    return campaigns.filter(c => {
      // CSV Check
      if (c.type === 'CSV') {
        return c.csvData?.some(row => row.address.toLowerCase() === wallet.address.toLowerCase());
      }
      
      // Gated check
      if (c.type === 'GATED' && c.gatedCriteria) {
        const meetsTokens = !c.gatedCriteria.minTokens || (wallet.tokenBalances[c.tokenSymbol] || 0) >= c.gatedCriteria.minTokens;
        const meetsStaking = !c.gatedCriteria.isStaker || wallet.isStaking;
        return meetsTokens && meetsStaking;
      }

      // Social check (if started/simulated)
      return false;
    });
  };

  const qualifiedClaims = getQualifiedClaims();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* GLOBAL BANNER: Network indicator */}
      <div className="bg-slate-900 border-b border-slate-800 text-[11px] font-mono py-1.5 px-4 text-center text-slate-400 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Connected Chain: <strong className="text-slate-200">Ethereum L1 Mainnet</strong>
      </div>

      {/* HEADER BAR */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          
          {/* Logo brand */}
          <div 
            onClick={() => setCurrentView('EXPLORE')}
            className="flex items-center gap-2.5 cursor-pointer select-none"
          >
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-white shadow-md shadow-emerald-500/10">
              S
            </div>
            <span className="font-display font-bold text-lg tracking-tight text-slate-50">
              scatter<span className="text-emerald-400">.drop</span>
            </span>
          </div>

          {/* Navigation links (Section 1) */}
          <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-medium text-slate-300">
            <button
              onClick={() => setCurrentView('EXPLORE')}
              className={`hover:text-slate-50 transition cursor-pointer ${currentView === 'EXPLORE' || currentView === 'CAMPAIGN_DETAIL' ? 'text-emerald-400 border-b-2 border-emerald-500 pb-0.5' : ''}`}
            >
              Explore
            </button>
            <button
              onClick={() => setCurrentView('CLAIMS')}
              className={`hover:text-slate-50 transition cursor-pointer flex items-center gap-1 ${currentView === 'CLAIMS' ? 'text-emerald-400 border-b-2 border-emerald-500 pb-0.5' : ''}`}
            >
              My Claims
              {wallet.isConnected && qualifiedClaims.length > 0 && (
                <span className="bg-emerald-500 text-white font-bold px-1 py-0.2 rounded-full text-[9px]">
                  {qualifiedClaims.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setCurrentView('MANAGE')}
              className={`hover:text-slate-50 transition cursor-pointer ${currentView === 'MANAGE' ? 'text-emerald-400 border-b-2 border-emerald-500 pb-0.5' : ''}`}
            >
              Manage
            </button>

            {/* Admin (Curated view only if authorized) */}
            {isAdmin && (
              <button
                onClick={() => setCurrentView('ADMIN')}
                className={`hover:text-slate-50 transition cursor-pointer flex items-center gap-1.5 ${currentView === 'ADMIN' ? 'text-amber-500 border-b-2 border-amber-500 pb-0.5 font-bold' : ''}`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-500" /> Admin
              </button>
            )}
          </nav>

          {/* Connected wallet button widget */}
          <div className="flex items-center gap-3 font-mono text-xs">
            {wallet.isConnected ? (
              <button
                onClick={toggleWalletConnection}
                className="bg-slate-800 border border-slate-700 hover:border-slate-600 px-3 py-1.5 rounded-lg text-slate-100 transition flex items-center gap-2 cursor-pointer"
                title="Click to Disconnect"
              >
                <User className="w-3.5 h-3.5 text-slate-300" />
                <span>{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </button>
            ) : (
              <button
                onClick={toggleWalletConnection}
                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-4 py-2 rounded-lg transition cursor-pointer"
              >
                Connect Wallet
              </button>
            )}
          </div>

        </div>
      </header>

      {/* MOBILE HUD NAVIGATION */}
      <div className="md:hidden border-b border-slate-900/60 bg-slate-950 px-4 py-2 flex justify-around gap-2 text-[11px] font-mono font-medium text-slate-400">
        <button 
          onClick={() => setCurrentView('EXPLORE')}
          className={`px-2 py-1 rounded ${currentView === 'EXPLORE' ? 'text-emerald-400 bg-slate-900/40' : ''}`}
        >
          Explore
        </button>
        <button 
          onClick={() => setCurrentView('CLAIMS')}
          className={`px-2 py-1 rounded ${currentView === 'CLAIMS' ? 'text-emerald-400 bg-slate-900/40' : ''}`}
        >
          My Claims ({qualifiedClaims.length})
        </button>
        <button 
          onClick={() => setCurrentView('MANAGE')}
          className={`px-2 py-1 rounded ${currentView === 'MANAGE' ? 'text-emerald-400 bg-slate-900/40' : ''}`}
        >
          Manage
        </button>
        {isAdmin && (
          <button 
            onClick={() => setCurrentView('ADMIN')}
            className={`px-2 py-1 rounded flex items-center gap-1 ${currentView === 'ADMIN' ? 'text-amber-400 bg-slate-900/40' : ''}`}
          >
            Admin
          </button>
        )}
      </div>

      {/* MAIN LAYOUT CANVAS */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 md:px-8 space-y-8 pb-32">
        
        {/* VIEW ROUTING CONTROLLER */}
        {currentView === 'EXPLORE' && (
          <ExplorePage onSelectCampaign={handleSelectCampaign} />
        )}

        {currentView === 'CAMPAIGN_DETAIL' && (
          <CampaignDetails 
            campaignId={selectedCampaignId} 
            onBack={() => setCurrentView('EXPLORE')} 
          />
        )}

        {/* VIEW: MY CLAIMS SHORTCUT (Section 1 & 2.2) */}
        {currentView === 'CLAIMS' && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-tight">My Pre-Qualified Claims</h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Shortcuts to Merkle drops you qualify for. Claims are done inside campaign details.</p>
            </div>

            {!wallet.isConnected ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4">
                <AlertCircle className="w-8 h-8 text-slate-600" />
                <div className="space-y-1">
                  <h3 className="text-slate-300 font-medium">Wallet connection required</h3>
                  <p className="text-slate-500 text-xs">Connect your wallet to inspect whitelists and Merkle-tree qualifications.</p>
                </div>
                <button
                  onClick={toggleWalletConnection}
                  className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition cursor-pointer"
                >
                  Connect Wallet
                </button>
              </div>
            ) : qualifiedClaims.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-slate-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-slate-300 font-medium">No immediate claims found</h3>
                  <p className="text-slate-500 text-xs max-w-sm">
                    No pre-seeded Merkle whitelists are bound to this wallet. Use the <strong>Explore</strong> list to satisfy real-time On-chain GatedDrops or verify your zk-X509 standard identity.
                  </p>
                </div>
                <button
                  onClick={() => setCurrentView('EXPLORE')}
                  className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
                >
                  Browse Public Directory
                </button>
              </div>
            ) : (
              <div className="grid gap-4 max-w-3xl">
                {qualifiedClaims.map((c) => {
                  const amt = c.type === 'CSV' 
                    ? c.csvData?.find(r => r.address.toLowerCase() === wallet.address.toLowerCase())?.amount || 0
                    : 2000; // default estimated gated drop

                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCampaign(c.id)}
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 p-5 rounded-xl cursor-pointer transition flex justify-between items-center gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-100">{c.name}</h3>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-950 text-emerald-400 border border-emerald-950">{c.type}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          Allocated amount: <strong className="text-slate-300">{amt.toLocaleString()} {c.tokenSymbol}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 shrink-0">
                        <span>Go to Claim</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {currentView === 'MANAGE' && (
          wallet.isConnected ? (
            <ManagePage />
          ) : (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4">
              <AlertCircle className="w-8 h-8 text-slate-600" />
              <div className="space-y-1">
                <h3 className="text-slate-300 font-medium">Wallet connection required</h3>
                <p className="text-slate-500 text-xs">Connect your wallet to manage your campaigns, check stats, and deploy new drops.</p>
              </div>
              <button
                onClick={toggleWalletConnection}
                className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition cursor-pointer"
              >
                Connect Wallet
              </button>
            </div>
          )
        )}

        {currentView === 'ADMIN' && (
          <AdminPage />
        )}

      </main>

      {/* FLOATING WALLET SIMULATION DRAWER */}
      <WalletSimulator />

    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
