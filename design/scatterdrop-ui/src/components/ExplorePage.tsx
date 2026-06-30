import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Campaign } from '../types';
import { Search, Calendar, CheckCircle2, ChevronRight, Filter, Users, AlertCircle } from 'lucide-react';

interface ExplorePageProps {
  onSelectCampaign: (id: string) => void;
}

export const ExplorePage: React.FC<ExplorePageProps> = ({ onSelectCampaign }) => {
  const { campaigns, registries, wallet } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'CSV' | 'GATED' | 'SOCIAL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ENDED'>('ALL');

  const filteredCampaigns = campaigns.filter(campaign => {
    // Search filter
    const matchesSearch = 
      campaign.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.tokenSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Type filter
    const matchesType = activeTab === 'ALL' || campaign.type === activeTab;

    // Status filter
    const isEnded = new Date(campaign.endDate) < new Date();
    const matchesStatus = 
      statusFilter === 'ALL' || 
      (statusFilter === 'ACTIVE' && !isEnded) || 
      (statusFilter === 'ENDED' && isEnded);

    return matchesSearch && matchesType && matchesStatus;
  });

  const getRegistryName = (address: string) => {
    const reg = registries.find(r => r.address.toLowerCase() === address.toLowerCase());
    return reg ? reg.name : 'Unknown Custom Registry';
  };

  const getVerificationStatus = (registryAddress: string) => {
    if (!wallet.isConnected) return null;
    const reg = registries.find(r => r.address.toLowerCase() === registryAddress.toLowerCase());
    if (!reg) return null;
    const expiry = reg.verifiedWallets[wallet.address];
    if (!expiry) return false;
    return new Date(expiry) >= new Date();
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Hero section */}
      <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl p-8 md:p-12 text-slate-100 shadow-xl">
        <div className="absolute inset-0 bg-radial-gradient from-slate-800/50 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Decentralized Sybil-Resistant Distribution
          </div>
          <h1 className="text-3xl md:text-4xl font-sans font-bold tracking-tight">
            Distribute tokens securely with zk-X509 identities.
          </h1>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            ScatterDrop binds on-chain smartcard digital signatures and national identifiers to wallet claims. Operators deposit funds, define rules, and prevent bot farms entirely.
          </p>
        </div>
      </div>

      {/* Main filters & search */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-800/60">
        {/* Left: Search input */}
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search campaigns, tokens, descriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 placeholder-slate-500 pl-10 pr-4 py-2 text-sm rounded-lg outline-none transition"
          />
        </div>

        {/* Center: Airdrop Type tabs */}
        <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 w-full lg:w-auto">
          {(['ALL', 'CSV', 'GATED', 'SOCIAL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 lg:flex-none px-4 py-1.5 text-xs font-mono font-medium rounded transition ${
                activeTab === tab
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              {tab === 'ALL' ? 'All Types' : tab === 'CSV' ? 'CSV/Merkle' : tab === 'GATED' ? 'On-chain Gated' : 'Social Tasks'}
            </button>
          ))}
        </div>

        {/* Right: Status Filters */}
        <div className="flex gap-1.5 w-full lg:w-auto">
          {(['ALL', 'ACTIVE', 'ENDED'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 lg:flex-none px-3 py-1.5 text-xs font-medium rounded border transition ${
                statusFilter === status
                  ? 'bg-slate-100 text-slate-900 border-slate-200 shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900/50'
              }`}
            >
              {status === 'ALL' ? 'All Status' : status === 'ACTIVE' ? 'Active' : 'Ended'}
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns list */}
      {filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-600" />
          <h3 className="text-slate-300 font-medium">No campaigns found</h3>
          <p className="text-slate-500 text-xs max-w-sm">
            Try adjusting your search query, selecting another category, or removing filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCampaigns.map((campaign) => {
            const isEnded = new Date(campaign.endDate) < new Date();
            const progress = ((campaign.totalAmount - campaign.remainingAmount) / campaign.totalAmount) * 100;
            const isVerified = getVerificationStatus(campaign.customerRegistryAddress);

            return (
              <div
                key={campaign.id}
                onClick={() => onSelectCampaign(campaign.id)}
                className="group relative flex flex-col bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 shadow-sm hover:shadow-md cursor-pointer transition flex-1 justify-between"
              >
                <div className="space-y-4">
                  {/* Top line: Badges */}
                  <div className="flex items-center justify-between">
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                      campaign.type === 'CSV' 
                        ? 'bg-blue-950/40 text-blue-400 border-blue-900/40' 
                        : campaign.type === 'GATED'
                        ? 'bg-purple-950/40 text-purple-400 border-purple-900/40'
                        : 'bg-indigo-950/40 text-indigo-400 border-indigo-900/40'
                    }`}>
                      {campaign.type === 'CSV' ? 'CSV Merkle' : campaign.type === 'GATED' ? 'On-Chain Gated' : 'Social Quest'}
                    </span>

                    {isEnded ? (
                      <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded">ENDED</span>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/20 px-2 py-0.5 rounded flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Campaign logo & header */}
                  <div className="flex gap-3">
                    {campaign.logoUrl ? (
                      <img
                        src={campaign.logoUrl}
                        alt={campaign.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-500">
                        {campaign.tokenSymbol}
                      </div>
                    )}
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-400 leading-tight transition line-clamp-1">
                        {campaign.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Pool: {campaign.totalAmount.toLocaleString()} {campaign.tokenSymbol}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {campaign.description}
                  </p>

                  {/* zk-X509 Identity Gate Indicator */}
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-slate-400">zk-X509 CA Gate:</span>
                      {isVerified === null ? (
                        <span className="text-slate-500">Unconnected</span>
                      ) : isVerified ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> VERIFIED
                        </span>
                      ) : (
                        <span className="text-amber-500">Unverified</span>
                      )}
                    </div>
                    <div className="text-[11px] font-semibold text-slate-300 truncate">
                      {getRegistryName(campaign.customerRegistryAddress)}
                    </div>
                  </div>
                </div>

                {/* Progress bar and claiming statistics */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Claimed: {progress.toFixed(1)}%</span>
                      <span>{campaign.remainingAmount.toLocaleString()} left</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      Ends {new Date(campaign.endDate).toLocaleDateString()}
                    </span>
                    <span className="flex items-center text-emerald-400 group-hover:translate-x-1 transition-transform">
                      Check Eligibility <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
