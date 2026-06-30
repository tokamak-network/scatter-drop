import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Campaign, Participant, AllowedToken, AirdropType, DistributionType, CsvRow } from '../types';
import { 
  Plus, Calendar, CheckCircle2, ChevronRight, Download, Users, TrendingUp, BarChart3, Lock, HelpCircle, 
  Trash2, Copy, Shield, Sparkles, UploadCloud, Info, Check, ArrowRight, Settings, AlertTriangle, Coins, Loader2 
} from 'lucide-react';

export const ManagePage: React.FC = () => {
  const { 
    campaigns, 
    setCampaigns, 
    registries, 
    setRegistries, 
    wallet, 
    setWallet, 
    fees, 
    tokens, 
    setTokens,
    participants, 
    setParticipants,
    collectedFees,
    setCollectedFees
  } = useApp();

  // Navigation sub-states within Manage
  const [activeSubView, setActiveSubView] = useState<'LIST' | 'DETAIL' | 'NEW'>('LIST');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  
  // Campaign detail tab sub-state
  const [detailTab, setDetailTab] = useState<'OVERVIEW' | 'PARTICIPANTS' | 'PROOFS' | 'SWEEP'>('OVERVIEW');

  // Creator Wizard states
  const [wizardStep, setWizardStep] = useState(0);
  const [wName, setWName] = useState('');
  const [wDescription, setWDescription] = useState('');
  const [wLogo, setWLogo] = useState('');
  const [wToken, setWToken] = useState('SDROP');
  const [wTotalAmount, setWTotalAmount] = useState(10000);
  const [wEndDate, setWEndDate] = useState('2026-12-31');
  const [wRegistryType, setWRegistryType] = useState<'STANDARD' | 'FACTORY' | 'CUSTOM'>('STANDARD');
  const [wRegistryAddr, setWRegistryAddr] = useState('0xKR_NPKI_CA222222222222222222222222222222');
  
  // Step 2 Eligibility criteria
  const [wAirdropType, setWAirdropType] = useState<AirdropType>('CSV');
  const [wCsvInput, setWCsvInput] = useState('0xCustomer111111111111111111111111111111,3000\n0xCustomer222222222222222222222222222222,4000\n0xAdmin000000000000000000000000000000000000,3000');
  const [wGatedTokens, setWGatedTokens] = useState(100);
  const [wGatedStaker, setWGatedStaker] = useState(true);
  const [wGatedNft, setWGatedNft] = useState(false);
  const [wSocialTwitter, setWSocialTwitter] = useState('https://twitter.com/ScatterDrop/status/178229');
  const [wSocialDiscord, setWSocialDiscord] = useState('https://discord.gg/scatterdrop');

  // Step 3 Distribution configuration
  const [wDistributionType, setWDistributionType] = useState<DistributionType>('IMMEDIATE');
  const [wVestingDuration, setWVestingDuration] = useState(30); // days
  const [wVestingCliff, setWVestingCliff] = useState(0);

  // Step 5 Fee payment configuration
  const [wFeeToken, setWFeeToken] = useState('TON'); // Defaults to TON for discount!
  
  // Wizard Simulation States
  const [isVerifyingOperator, setIsVerifyingOperator] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState(0);
  const [isSweeping, setIsSweeping] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newAddr, setNewAddr] = useState('');

  // Toast simulations
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Filter campaigns created by connected address
  const operatorCampaigns = campaigns.filter(
    c => c.creator.toLowerCase() === wallet.address.toLowerCase()
  );

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const campaignParticipants = selectedCampaign ? participants[selectedCampaign.id] || [] : [];

  // Helper for step-0 operator registry lookup
  const isOperatorVerified = () => {
    const opRegistry = registries.find(r => r.isOperatorRegistry);
    if (!opRegistry) return false;
    const expiry = opRegistry.verifiedWallets[wallet.address];
    if (!expiry) return false;
    return new Date(expiry) >= new Date();
  };

  // Register operator identity
  const handleRegisterOperator = () => {
    setIsVerifyingOperator(true);
    setTimeout(() => {
      setIsVerifyingOperator(false);
      const opRegistry = registries.find(r => r.isOperatorRegistry);
      if (opRegistry) {
        const updated = registries.map(r => {
          if (r.isOperatorRegistry) {
            return {
              ...r,
              verifiedWallets: {
                ...r.verifiedWallets,
                [wallet.address]: '2028-12-31T23:59:59Z'
              }
            };
          }
          return r;
        });
        setRegistries(updated);
        triggerToast('zk-X509 Operator Registration Successful!');
      }
    }, 1800);
  };

  // Export participant list as dummy CSV
  const handleExportCSV = () => {
    triggerToast('Participants database exported as scatterdrop_export.csv!');
  };

  // Sweep leftover tokens simulator
  const handleSweepLeftovers = () => {
    if (!selectedCampaign) return;
    setIsSweeping(true);
    setTimeout(() => {
      setIsSweeping(false);
      const leftovers = selectedCampaign.remainingAmount;
      
      // Update campaign remainder to 0, mark swept
      setCampaigns(prev => prev.map(c => {
        if (c.id === selectedCampaign.id) {
          return { ...c, remainingAmount: 0, isSwept: true };
        }
        return c;
      }));

      // Refund Operator wallet state
      setWallet(prev => ({
        ...prev,
        tokenBalances: {
          ...prev.tokenBalances,
          [selectedCampaign.tokenSymbol]: (prev.tokenBalances[selectedCampaign.tokenSymbol] || 0) + leftovers
        }
      }));

      triggerToast(`Swept ${leftovers.toLocaleString()} ${selectedCampaign.tokenSymbol} back to wallet!`);
    }, 1500);
  };

  // Custom Token Addition modal submit
  const handleAddToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol || !newName || !newAddr) return;

    const tokenEntry: AllowedToken = {
      address: newAddr,
      name: newName,
      symbol: newSymbol.toUpperCase(),
      decimals: 18,
      isOfficial: false,
    };

    setTokens(prev => [...prev, tokenEntry]);
    setWToken(tokenEntry.symbol);
    setNewSymbol('');
    setNewName('');
    setNewAddr('');
    setTokenModalOpen(false);
    triggerToast(`Added community token ${tokenEntry.symbol} successfully!`);
  };

  // Calculate fees dynamically in wizard based on token/type
  const getSelectedFeeConfig = () => {
    const feeRow = fees.find(f => f.tokenSymbol === wFeeToken);
    if (!feeRow) return 0;
    if (wAirdropType === 'CSV') return feeRow.csvFee;
    if (wAirdropType === 'SNAPSHOT') return feeRow.snapshotFee;
    if (wAirdropType === 'GATED') return feeRow.gatedFee;
    return feeRow.socialFee;
  };

  const calculatedFee = getSelectedFeeConfig();

  // Parse CSV Rows entered in wizard
  const parseCsvInput = (): CsvRow[] => {
    try {
      return wCsvInput.split('\n')
        .map(line => {
          const parts = line.split(',');
          return {
            address: parts[0]?.trim() || '',
            amount: parseFloat(parts[1]?.trim()) || 0
          };
        })
        .filter(r => r.address.startsWith('0x') && r.amount > 0);
    } catch {
      return [];
    }
  };

  // Handle Wizard Create campaign submit
  const handleCreateCampaign = () => {
    setIsDeploying(true);
    setDeployStep(1);

    // Step 1: Signature authorization
    setTimeout(() => {
      setDeployStep(2);
      // Step 2: Payment lock & token collateral transfers
      setTimeout(() => {
        setDeployStep(3);
        // Step 3: Broadcast DropFactory.createDrop()
        setTimeout(() => {
          // Finish!
          const newId = `campaign-${Date.now()}`;
          const parsedCsv = wAirdropType === 'CSV' ? parseCsvInput() : [];
          const totalClaimsAmount = wAirdropType === 'CSV' 
            ? parsedCsv.reduce((acc, r) => acc + r.amount, 0)
            : wTotalAmount;

          const createdCampaign: Campaign = {
            id: newId,
            name: wName || 'Untitled Campaign',
            description: wDescription || 'No description provided.',
            logoUrl: wLogo || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&auto=format&fit=crop&q=80',
            creator: wallet.address,
            tokenAddress: tokens.find(t => t.symbol === wToken)?.address || '0x747206161476313a0efc630f78bfcd4703810471',
            tokenSymbol: wToken,
            tokenDecimals: 18,
            totalAmount: totalClaimsAmount,
            remainingAmount: totalClaimsAmount,
            createdAt: new Date().toISOString(),
            endDate: new Date(wEndDate).toISOString(),
            depositProofTx: `0x${Math.random().toString(16).slice(2, 66)}`,
            customerRegistryAddress: wRegistryAddr,
            type: wAirdropType,
            distributionType: wDistributionType,
            vestingConfig: wDistributionType === 'VESTING' ? {
              cliffSeconds: wVestingCliff * 86400,
              durationSeconds: wVestingDuration * 86400
            } : undefined,
            gatedCriteria: wAirdropType === 'GATED' ? {
              minTokens: wGatedTokens,
              isStaker: wGatedStaker
            } : undefined,
            merkleRoot: wAirdropType === 'CSV' ? `0x${Math.random().toString(16).slice(2, 66)}` : undefined,
            csvData: parsedCsv,
            claimsCount: 0
          };

          // Update campaigns & participants registries
          setCampaigns(prev => [createdCampaign, ...prev]);
          
          // Seed initial participants for this campaign if CSV
          const seededParticipants: Participant[] = parsedCsv.map(row => ({
            address: row.address,
            amount: row.amount,
            claimed: false,
            countryCode: 'KR' // default Korea NPKI choice
          }));
          setParticipants(prev => ({
            ...prev,
            [newId]: seededParticipants
          }));

          // Deduct from operator's wallet state
          setWallet(prev => {
            const feeDeducted = (prev.tokenBalances[wFeeToken] || 0) - calculatedFee;
            const tokenDeducted = (prev.tokenBalances[wToken] || 0) - totalClaimsAmount;
            return {
              ...prev,
              tokenBalances: {
                ...prev.tokenBalances,
                [wFeeToken]: Math.max(0, feeDeducted),
                [wToken]: Math.max(0, tokenDeducted)
              }
            };
          });

          // Feed into platform treasury balance
          setCollectedFees(prev => ({
            ...prev,
            [wFeeToken]: (prev[wFeeToken] || 0) + calculatedFee
          }));

          setIsDeploying(false);
          setDeployStep(0);
          
          // Reset wizard
          setWName('');
          setWDescription('');
          setWizardStep(0);
          
          // Redirect
          setActiveSubView('LIST');
          triggerToast('New campaign successfully created & fully funded!');
        }, 1500);
      }, 1500);
    }, 1200);
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans relative">
      {/* Toast notifications display */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-100 text-slate-900 text-xs px-4 py-2.5 rounded-lg border border-slate-200 shadow-xl font-mono flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500" />
          {toastMessage}
        </div>
      )}

      {/* VIEW 1: MANAGE CAMPAIGNS LIST */}
      {activeSubView === 'LIST' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 font-sans tracking-tight">Campaign Operations Console</h1>
              <p className="text-xs text-slate-500 font-mono mt-0.5">Manage and track your distributed secure campaigns.</p>
            </div>
            
            <button
              onClick={() => {
                setActiveSubView('NEW');
                setWizardStep(0);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-2 rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Create New Campaign
            </button>
          </div>

          {operatorCampaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-slate-900 border border-slate-800 rounded-xl text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-slate-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-slate-300 font-medium">No active operations</h3>
                <p className="text-slate-500 text-xs max-w-sm">
                  You haven't launched any scatter-drop campaigns yet. Launch a secure identity-gated distribution in seconds.
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveSubView('NEW');
                  setWizardStep(0);
                }}
                className="bg-slate-100 hover:bg-white text-slate-950 font-semibold px-4 py-1.5 rounded-lg text-xs transition cursor-pointer"
              >
                + Deploy Campaign
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {operatorCampaigns.map((c) => {
                const isEnded = new Date(c.endDate) < new Date();
                const totalClaimants = campaignParticipants.length || c.claimsCount;
                const progress = ((c.totalAmount - c.remainingAmount) / c.totalAmount) * 100;
                
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCampaignId(c.id);
                      setDetailTab('OVERVIEW');
                      setActiveSubView('DETAIL');
                    }}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 p-5 rounded-xl cursor-pointer transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                  >
                    <div className="flex items-center gap-4">
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt={c.name} referrerPolicy="no-referrer" className="w-12 h-12 rounded-lg object-cover border border-slate-800 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-slate-400 shrink-0">{c.tokenSymbol}</div>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-100">{c.name}</h3>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-950 border border-slate-800/80 text-slate-400">{c.type}</span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          Remaining Pool: <strong className="text-slate-300">{c.remainingAmount.toLocaleString()}</strong> / {c.totalAmount.toLocaleString()} {c.tokenSymbol}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 text-xs font-mono">
                      {/* KPI Claims rate */}
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block text-[10px]">CLAIMS PROGRESS</span>
                        <span className="text-slate-200 font-bold">{progress.toFixed(1)}%</span>
                      </div>

                      {/* Closing date */}
                      <div className="space-y-0.5">
                        <span className="text-slate-500 block text-[10px]">WINDOW CLOSES</span>
                        <span className={`font-semibold ${isEnded ? 'text-rose-400' : 'text-slate-300'}`}>
                          {new Date(c.endDate).toLocaleDateString()}
                        </span>
                      </div>

                      <ChevronRight className="w-5 h-5 text-slate-600 hidden md:block" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CAMPAIGN OPERATIONS CONSOLE DETAIL */}
      {activeSubView === 'DETAIL' && selectedCampaign && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-5">
            <div className="space-y-1.5">
              <button 
                onClick={() => setActiveSubView('LIST')}
                className="text-slate-400 hover:text-white text-xs font-mono mb-2 block cursor-pointer"
              >
                &larr; BACK TO OPERATIONS
              </button>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-100">{selectedCampaign.name}</h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">{selectedCampaign.type}</span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Operator Dashboard &bull; Campaign ID: <span className="text-slate-400">{selectedCampaign.id}</span>
              </p>
            </div>

            {/* Quick Actions tab menu */}
            <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 w-full lg:w-auto font-mono">
              {([
                { id: 'OVERVIEW', label: 'Overview' },
                { id: 'PARTICIPANTS', label: 'Participants & Stats' },
                { id: 'PROOFS', label: 'Merkle Proofs' },
                { id: 'SWEEP', label: 'Sweep Unclaimed' }
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition flex-1 lg:flex-none cursor-pointer ${
                    detailTab === tab.id
                      ? 'bg-slate-800 text-slate-100 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* TAB 2.1: OVERVIEW */}
          {detailTab === 'OVERVIEW' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4 md:col-span-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Operations Summary</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{selectedCampaign.description}</p>
                
                <div className="grid grid-cols-2 gap-4 border-t border-slate-800/80 pt-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block">zk-X509 Customer Gate</span>
                    <span className="text-slate-300 text-[11px] font-semibold truncate block max-w-xs">{selectedCampaign.customerRegistryAddress}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Collateral Deposit Tx</span>
                    <span className="text-emerald-400 text-[11px] block truncate">{selectedCampaign.depositProofTx}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Collateral Status</h3>
                <div className="space-y-1">
                  <span className="text-slate-500 text-[10px] font-mono">CLAIMABLE TOKENS REMAINING</span>
                  <div className="text-2xl font-bold font-mono text-slate-200">
                    {selectedCampaign.remainingAmount.toLocaleString()} / {selectedCampaign.totalAmount.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-slate-400 block font-mono">{selectedCampaign.tokenSymbol}</span>
                </div>
                
                <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400" 
                    style={{ width: `${((selectedCampaign.totalAmount - selectedCampaign.remainingAmount) / selectedCampaign.totalAmount) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2.2: PARTICIPANTS & STATISTICS (SECTION 3) */}
          {detailTab === 'PARTICIPANTS' && (
            <div className="space-y-6">
              
              {/* Stats KPIs Cards row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono">
                  <span className="text-[10px] text-slate-500">TOTAL ELIGIBLE</span>
                  <div className="text-lg font-bold text-slate-200 mt-1">{selectedCampaign.csvData?.length || 25} addresses</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono">
                  <span className="text-[10px] text-slate-500">CLAIM RATE</span>
                  <div className="text-lg font-bold text-emerald-400 mt-1">
                    {(((selectedCampaign.totalAmount - selectedCampaign.remainingAmount) / selectedCampaign.totalAmount) * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono">
                  <span className="text-[10px] text-slate-500">ZK-X509 VERIFIED</span>
                  <div className="text-lg font-bold text-indigo-400 mt-1">{campaignParticipants.length} verified</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl font-mono">
                  <span className="text-[10px] text-slate-500">COMPLETED CLAIMS</span>
                  <div className="text-lg font-bold text-slate-200 mt-1">{campaignParticipants.filter(p => p.claimed).length} users</div>
                </div>
              </div>

              {/* Analytics visual graph section (Section 3 graph requirement) */}
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
                <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Hourly claims rate & regional distribution
                  </h4>
                  <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-slate-500 font-mono">UTC REALTIME</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Left: Custom SVG line graph for claim rates */}
                  <div className="md:col-span-2 space-y-2">
                    <span className="text-[10px] text-slate-500 font-mono">CLAIM TRAFFIC TREND (LAST 24 HOURS):</span>
                    <div className="h-44 w-full bg-slate-950 rounded-lg p-2 border border-slate-800/80 relative flex items-center justify-center">
                      {/* Responsive custom vector SVG chart representation */}
                      <svg className="w-full h-full" viewBox="0 0 400 150">
                        {/* Grid lines */}
                        <line x1="0" y1="30" x2="400" y2="30" stroke="#1e293b" strokeDasharray="3,3" />
                        <line x1="0" y1="75" x2="400" y2="75" stroke="#1e293b" strokeDasharray="3,3" />
                        <line x1="0" y1="120" x2="400" y2="120" stroke="#1e293b" strokeDasharray="3,3" />
                        
                        {/* Area Gradient fill */}
                        <path 
                          d="M 10 140 L 50 120 L 100 130 L 150 90 L 200 45 L 250 50 L 300 110 L 350 25 L 400 10 L 400 150 Z" 
                          fill="url(#chartGrad)" 
                          opacity="0.15" 
                        />
                        {/* Line path */}
                        <path 
                          d="M 10 140 L 50 120 L 100 130 L 150 90 L 200 45 L 250 50 L 300 110 L 350 25 L 400 10" 
                          fill="none" 
                          stroke="#10b981" 
                          strokeWidth="2.5" 
                        />
                        {/* Data nodes */}
                        <circle cx="200" cy="45" r="4" fill="#34d399" />
                        <circle cx="350" cy="25" r="4" fill="#34d399" />
                        
                        {/* Labels */}
                        <text x="15" y="145" fill="#64748b" fontSize="8" fontFamily="monospace">00:00</text>
                        <text x="190" y="35" fill="#34d399" fontSize="8" fontFamily="monospace" fontWeight="bold">Peak Traffic</text>
                        <text x="350" y="145" fill="#64748b" fontSize="8" fontFamily="monospace">Active</text>

                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  </div>

                  {/* Right: Regional origin bar breakdown based on zk-X509 CA issuer */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-500 font-mono">REGIONAL CA ORIGIN BREAKDOWN:</span>
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 h-44 space-y-3.5 flex flex-col justify-center">
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between font-mono text-slate-400">
                          <span>South Korea (KR-NPKI)</span>
                          <span className="text-slate-300">65%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: '65%' }} />
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between font-mono text-slate-400">
                          <span>Estonia (EE-eID)</span>
                          <span className="text-slate-300">25%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: '25%' }} />
                        </div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between font-mono text-slate-400">
                          <span>Other European Union CAs</span>
                          <span className="text-slate-300">10%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: '10%' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabular Participant List */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-950 border-b border-slate-800/80 flex justify-between items-center flex-wrap gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                    Participant Registry List ({campaignParticipants.length})
                  </h4>
                  <button
                    onClick={handleExportCSV}
                    className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded text-[10px] font-mono transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3 h-3" /> EXPORT TO CSV
                  </button>
                </div>

                <div className="overflow-x-auto">
                  {campaignParticipants.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500 font-mono">
                      No addresses have registered or claimed on this campaign yet.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="bg-slate-950/40 text-slate-500 border-b border-slate-800/80 text-[10px]">
                          <th className="p-4">RECEIVER WALLET ADDRESS</th>
                          <th className="p-4">ALLOCATED AMOUNT</th>
                          <th className="p-4">ZK-X509 REGION</th>
                          <th className="p-4">CLAIM STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {campaignParticipants.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/20">
                            <td className="p-4 font-semibold text-slate-300 select-all">{p.address}</td>
                            <td className="p-4 text-slate-200">{p.amount.toLocaleString()} {selectedCampaign.tokenSymbol}</td>
                            <td className="p-4 text-slate-400">{p.countryCode || 'KR'} ({p.affiliation || 'Standard Finance Issuer'})</td>
                            <td className="p-4">
                              {p.claimed ? (
                                <span className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded text-[10px] border border-emerald-900/40">CLAIMED</span>
                              ) : (
                                <span className="text-slate-500 bg-slate-950 px-2 py-0.5 rounded text-[10px]">ELIGIBLE</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2.3: MERKLE PROOFS */}
          {detailTab === 'PROOFS' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Merkle proof.json generator</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  ScatterDrop builds binary Merkle Trees on-chain during drop deployment. Whitelisted addresses are packed into hashes. Claimants fetch their specific branches to execute gas-efficient zero-disclosure validation claims.
                </p>

                <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-500">Merkle Root Hash</span>
                    <span className="text-emerald-400 font-semibold">{selectedCampaign.merkleRoot || '0x4f32...8fae'}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-500">Tree Depth / Leaves count</span>
                    <span className="text-slate-300">{selectedCampaign.csvData?.length || 3} Leaves</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Format Standard</span>
                    <span className="text-slate-400">OpenZeppelin MerkleProof v4</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 font-mono uppercase block">Raw proofs.json config:</label>
                  <pre className="bg-slate-950 p-4 rounded-lg border border-slate-800 overflow-x-auto text-[11px] font-mono text-slate-400 leading-normal max-h-64">
{JSON.stringify({
  campaignId: selectedCampaign.id,
  merkleRoot: selectedCampaign.merkleRoot || "0x53c9f2762ea1152a5c37eb64d7df790100ae9f830da0fca31792bc80de0ea13d80",
  tokenAddress: selectedCampaign.tokenAddress,
  claims: selectedCampaign.csvData?.map((row, idx) => ({
    index: idx,
    address: row.address,
    amount: row.amount,
    proof: [
      `0x${Math.random().toString(16).slice(2, 66)}`,
      `0x${Math.random().toString(16).slice(2, 66)}`
    ]
  })) || []
}, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2.4: SWEEP UNCLAIMED FUNDS */}
          {detailTab === 'SWEEP' && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-6 md:p-8 rounded-xl space-y-6 max-w-2xl">
                <div className="space-y-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" /> Sweep Unclaimed Funds
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Once the campaign closure window is reached, operators can securely withdraw leftover token balances from the smart contract. Sweeping ends the claim period and closes the campaign forever.
                  </p>
                </div>

                <div className="bg-slate-950 p-4 border border-slate-800 rounded-lg space-y-3 text-xs font-mono">
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-500">Closing Deadline</span>
                    <span className="text-slate-300 font-semibold">{new Date(selectedCampaign.endDate).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-500">Unclaimed Remaining Pool</span>
                    <span className="text-amber-500 font-bold">{selectedCampaign.remainingAmount.toLocaleString()} {selectedCampaign.tokenSymbol}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sweeper Destination</span>
                    <span className="text-slate-400 truncate max-w-xs">{wallet.address}</span>
                  </div>
                </div>

                {selectedCampaign.isSwept ? (
                  <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4.5 h-4.5" /> Lefover funds swept successfully! Remaining balance is 0.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-slate-950/50 p-3 rounded border border-slate-800/60 text-[10px] text-slate-500 font-mono flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      Attention: To test the sweep flow, the closing deadline is bypassed in this simulator. You can sweep leftover tokens immediately.
                    </div>

                    <button
                      onClick={handleSweepLeftovers}
                      disabled={isSweeping || selectedCampaign.remainingAmount === 0}
                      className="bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 font-mono px-5 py-2.5 rounded-lg text-xs transition flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                    >
                      {isSweeping ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Broadcasting Sweep TX...
                        </>
                      ) : (
                        `Sweep Leftover ${selectedCampaign.remainingAmount.toLocaleString()} ${selectedCampaign.tokenSymbol}`
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: NEW CAMPAIGN WIZARD (SECTION 3.1) */}
      {activeSubView === 'NEW' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
          
          {/* Header step progress */}
          <div className="space-y-4 border-b border-slate-800 pb-5">
            <div className="flex justify-between items-center">
              <button 
                onClick={() => setActiveSubView('LIST')}
                className="text-slate-500 hover:text-white text-xs font-mono cursor-pointer"
              >
                &larr; CANCEL CREATOR
              </button>
              <span className="text-xs font-mono text-slate-500">Wizard Step {wizardStep} / 5</span>
            </div>
            
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3, 4, 5].map((step) => (
                <div 
                  key={step}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    wizardStep >= step ? 'bg-emerald-500' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* STEP 0: OPERATOR IDENTITY GATE */}
          {wizardStep === 0 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-mono">
                  <Shield className="w-3.5 h-3.5" /> SECURE GATEWAY CHECK
                </div>
                <h2 className="text-lg font-bold text-slate-200">Operator 신원검증 (Operator Gate)</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  ScatterDrop requires campaign creation wallets to hold standard identity signatures certified by the global Operator CA. 
                  This completely prevents malicious deployment of spam or fake community rewards.
                </p>
              </div>

              {isOperatorVerified() ? (
                <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-lg space-y-3">
                  <div className="flex gap-2 items-start text-xs text-emerald-400 font-mono">
                    <CheckCircle2 className="w-4.5 h-4.5 shrink-0" />
                    <div>
                      <span className="font-bold block">OPERATOR IDENTITY ACTIVE</span>
                      <p className="text-slate-300 leading-normal mt-0.5">
                        Your connected wallet address <code className="bg-slate-950 px-1 py-0.2 text-[11px] rounded">{wallet.address.slice(0, 10)}...</code> has an active identity on the global registry.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setWizardStep(1)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded text-xs transition flex items-center gap-1 cursor-pointer"
                  >
                    Proceed to Step 1 &rarr;
                  </button>
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800 p-5 rounded-lg space-y-4">
                  <div className="flex gap-2.5 items-start text-xs">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-mono text-amber-500 font-bold block">OPERATOR REGISTRY UNVERIFIED</span>
                      <p className="text-slate-400 leading-relaxed">
                        To continue, simulate registering your digital X.509 signature. Under production, the registry verifies signatures before allowing smart contract deployments.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRegisterOperator}
                    disabled={isVerifyingOperator}
                    className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded text-xs transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isVerifyingOperator ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating zk-proof...
                      </>
                    ) : (
                      'Simulate Operator Onboarding (Verify zk-X509)'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 1: BASIC CAMPAIGN METADATA & REGS */}
          {wizardStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-200">Step 1: 기본 정보 및 수령자 신원 게이트</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Campaign Name *</label>
                  <input 
                    type="text" 
                    placeholder="E.g., Tokamak Early Staker Incentives"
                    value={wName}
                    onChange={(e) => setWName(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 text-xs px-3 py-2.5 rounded w-full outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Branding Logo URL</label>
                  <input 
                    type="text" 
                    placeholder="Https://images.unsplash.com/photo-..."
                    value={wLogo}
                    onChange={(e) => setWLogo(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 text-xs px-3 py-2.5 rounded w-full outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono text-slate-400">Campaign Description</label>
                <textarea 
                  rows={3}
                  placeholder="Detail the target audience, purpose, and timeline details..."
                  value={wDescription}
                  onChange={(e) => setWDescription(e.target.value)}
                  className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 text-xs px-3 py-2.5 rounded w-full outline-none leading-relaxed"
                />
              </div>

              {/* Token Picker */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-mono text-slate-400">Distribution Token</label>
                    <button 
                      onClick={() => setTokenModalOpen(true)}
                      className="text-[10px] text-emerald-400 hover:underline font-mono"
                    >
                      + Add Token
                    </button>
                  </div>
                  <select
                    value={wToken}
                    onChange={(e) => setWToken(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-3 py-2.5 rounded w-full outline-none font-mono"
                  >
                    {tokens.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.symbol} ({t.isOfficial ? 'Official' : 'Community'}) &bull; {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-slate-400">Campaign Duration Ends</label>
                  <input 
                    type="date"
                    value={wEndDate}
                    onChange={(e) => setWEndDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-slate-700 text-slate-100 text-xs px-3 py-2.5 rounded w-full outline-none font-mono"
                  />
                </div>
              </div>

              {/* CLIENT ID ENTRY PORTAL UX (Section 0-2 client registry input UX) */}
              <div className="space-y-3 bg-slate-950 p-4 border border-slate-800 rounded-lg">
                <div className="space-y-1">
                  <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> zk-X509 Customer CA Registry *필수
                  </label>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Specify the decentralized identity registry required for receivers. Only verified wallets in this registry can claim.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      setWRegistryType('STANDARD');
                      setWRegistryAddr('0xKR_NPKI_CA222222222222222222222222222222');
                    }}
                    className={`p-2.5 rounded border text-center transition ${
                      wRegistryType === 'STANDARD' ? 'bg-slate-800 border-indigo-500 text-slate-200' : 'bg-slate-900 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    표준 (추천)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWRegistryType('FACTORY');
                      setWRegistryAddr('0xe-Residency_CA33333333333333333333333333');
                    }}
                    className={`p-2.5 rounded border text-center transition ${
                      wRegistryType === 'FACTORY' ? 'bg-slate-800 border-indigo-500 text-slate-200' : 'bg-slate-900 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    레지스트리 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWRegistryType('CUSTOM');
                      setWRegistryAddr('');
                    }}
                    className={`p-2.5 rounded border text-center transition ${
                      wRegistryType === 'CUSTOM' ? 'bg-slate-800 border-indigo-500 text-slate-200' : 'bg-slate-900 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    주소 직접 입력
                  </button>
                </div>

                {wRegistryType === 'STANDARD' && (
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">CHOOSE PLATFORM CURATED REGISTRIES:</span>
                    <select
                      value={wRegistryAddr}
                      onChange={(e) => setWRegistryAddr(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded w-full outline-none font-mono"
                    >
                      <option value="0xKR_NPKI_CA222222222222222222222222222222">KR-NPKI (Korea Basic Financial Identity)</option>
                      <option value="0xe-Residency_CA33333333333333333333333333">EE-eID (Estonian e-Residency governmental sign)</option>
                    </select>
                  </div>
                )}

                {wRegistryType === 'FACTORY' && (
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">FACTORY LISTED REGISTRIES:</span>
                    <select
                      value={wRegistryAddr}
                      onChange={(e) => setWRegistryAddr(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded w-full outline-none font-mono"
                    >
                      {registries.map(r => (
                        <option key={r.address} value={r.address}>
                          {r.name} &bull; Trusted CAs: {r.trustedCAsCount}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {wRegistryType === 'CUSTOM' && (
                  <div className="space-y-1.5 text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">ENTER ETHEREUM ADDRESS (factory.isRegistry[addr] validation):</span>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={wRegistryAddr}
                      onChange={(e) => setWRegistryAddr(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded w-full outline-none font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setWizardStep(2)}
                  className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded text-xs transition cursor-pointer"
                >
                  Continue to Step 2 &rarr;
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ELIGIBILITY MODE SELECTION & LIVE FEES */}
          {wizardStep === 2 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-slate-200">Step 2: 자격 방식 및 수수료 실시간 고지</h2>
                <p className="text-xs text-slate-400 leading-normal">
                  Choose how ScatterDrop evaluates claiming qualification. Fees are based on the complexity of verification mechanics.
                </p>
              </div>

              {/* Eligibility type selector */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                {([
                  { id: 'CSV', label: 'CSV whitelist', desc: 'Pre-defined address & list' },
                  { id: 'SNAPSHOT', label: 'Snapshot', desc: 'Holdings at block' },
                  { id: 'GATED', label: 'Onchain Gated', desc: 'Holds + active staking' },
                  { id: 'SOCIAL', label: 'Social Tasks', desc: 'Retweet & Discord tasks' }
                ] as const).map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setWAirdropType(type.id)}
                    className={`p-3 rounded-lg border text-left transition flex flex-col justify-between h-24 ${
                      wAirdropType === type.id 
                        ? 'bg-slate-850 border-emerald-500 text-slate-100' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900/50'
                    }`}
                  >
                    <span className="font-bold">{type.label}</span>
                    <span className="text-[9px] text-slate-500 leading-snug mt-1">{type.desc}</span>
                  </button>
                ))}
              </div>

              {/* Real-time Fee Warning panel (Required on selection) */}
              <div className="bg-emerald-950/10 border border-emerald-900/30 p-4 rounded-lg flex items-center justify-between">
                <div className="flex gap-2 items-center text-xs">
                  <Coins className="w-4.5 h-4.5 text-emerald-400" />
                  <div>
                    <span className="font-mono text-slate-400">ESTIMATED CREATION FEE:</span>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
                      Based on your selection, fee is adjusted dynamically. You can choose different payment tokens in Step 5.
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono shrink-0">
                  <span className="text-emerald-400 font-bold text-lg">{calculatedFee} {wFeeToken}</span>
                  {wFeeToken === 'TON' && <span className="block text-[9px] text-emerald-500 font-semibold uppercase">15% TON DISCOUNT APPLIED</span>}
                </div>
              </div>

              {/* Active type parameters panel */}
              <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-4">
                {wAirdropType === 'CSV' && (
                  <div className="space-y-3">
                    <label className="text-xs font-mono text-slate-300 block uppercase">Enter Whitelist database (Address, Amount): *</label>
                    <textarea 
                      rows={4}
                      value={wCsvInput}
                      onChange={(e) => setWCsvInput(e.target.value)}
                      className="bg-slate-900 border border-slate-800 text-slate-100 text-xs px-3 py-2 rounded w-full font-mono leading-relaxed outline-none focus:border-slate-700"
                      placeholder="0xAddress,amount"
                    />
                    <span className="text-[10px] text-slate-500 font-mono leading-normal block">
                      Parsed valid entries: <strong className="text-slate-300">{parseCsvInput().length} Whitelists detected</strong>
                    </span>
                  </div>
                )}

                {wAirdropType === 'SNAPSHOT' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 text-xs">
                        <span className="text-slate-400 font-mono">Snapshot Block Number</span>
                        <input type="number" defaultValue="2058200" className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded outline-none font-mono" />
                      </div>
                      <div className="space-y-1 text-xs">
                        <span className="text-slate-400 font-mono">Holding Minimum Token</span>
                        <input type="number" defaultValue="500" className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded outline-none font-mono" />
                      </div>
                    </div>
                  </div>
                )}

                {wAirdropType === 'GATED' && (
                  <div className="space-y-4">
                    <span className="text-xs font-mono text-slate-300 block uppercase">Define Real-time GatedDrop criteria builder:</span>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 text-xs">
                        <span className="text-slate-400 font-mono">Required Token Threshold</span>
                        <input 
                          type="number"
                          value={wGatedTokens}
                          onChange={(e) => setWGatedTokens(parseInt(e.target.value) || 0)}
                          className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded w-full outline-none font-mono" 
                        />
                      </div>

                      <div className="space-y-3 text-xs pt-4">
                        <label className="flex items-center gap-2 text-slate-300 font-mono cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={wGatedStaker}
                            onChange={(e) => setWGatedStaker(e.target.checked)}
                            className="bg-slate-900 border-slate-800 rounded outline-none" 
                          />
                          Require active token staking status
                        </label>

                        <label className="flex items-center gap-2 text-slate-300 font-mono cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={wGatedNft}
                            onChange={(e) => setWGatedNft(e.target.checked)}
                            className="bg-slate-900 border-slate-800 rounded outline-none" 
                          />
                          Require Tokamak Access NFT holding
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {wAirdropType === 'SOCIAL' && (
                  <div className="space-y-3.5 text-xs font-mono">
                    <div className="space-y-1.5">
                      <span className="text-slate-400">Retweet Post Target Link</span>
                      <input 
                        type="text" 
                        value={wSocialTwitter}
                        onChange={(e) => setWSocialTwitter(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded w-full outline-none" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-slate-400">Join Discord Target Link</span>
                      <input 
                        type="text" 
                        value={wSocialDiscord}
                        onChange={(e) => setWSocialDiscord(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded w-full outline-none" 
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="bg-slate-950 border border-slate-800 text-slate-400 px-4 py-2 rounded transition cursor-pointer"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // For Gated/Social campaigns, request a pool size
                    if (wAirdropType !== 'CSV') {
                      setWTotalAmount(10000);
                    } else {
                      const total = parseCsvInput().reduce((acc, r) => acc + r.amount, 0);
                      setWTotalAmount(total);
                    }
                    setWizardStep(3);
                  }}
                  className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded transition cursor-pointer"
                >
                  Continue to Step 3 &rarr;
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DISTRIBUTION MECHANICS */}
          {wizardStep === 3 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-200 font-sans">Step 3: 배포 방식 선택</h2>

              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                {([
                  { id: 'IMMEDIATE', label: '즉시 (Immediate)', desc: '100% unlocked immediately upon claim' },
                  { id: 'VESTING', label: '베스팅 (Vesting)', desc: 'Linear vesting with adjustable cliff' },
                  { id: 'FCFS', label: '선착순 (FCFS)', desc: 'First come first served limits' }
                ] as const).map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setWDistributionType(type.id)}
                    className={`p-3 rounded-lg border text-left transition h-24 flex flex-col justify-between ${
                      wDistributionType === type.id 
                        ? 'bg-slate-850 border-emerald-500 text-slate-100' 
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900/50'
                    }`}
                  >
                    <span className="font-bold">{type.label}</span>
                    <span className="text-[9px] text-slate-500 leading-normal mt-1">{type.desc}</span>
                  </button>
                ))}
              </div>

              {wDistributionType === 'VESTING' && (
                <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-5 text-xs font-mono">
                  <span className="text-slate-300 font-bold uppercase block">Vesting schedule configuration:</span>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Vesting linear duration (days)</span>
                      <span className="text-emerald-400 font-bold">{wVestingDuration} Days</span>
                    </div>
                    <input
                      type="range"
                      min="7"
                      max="365"
                      value={wVestingDuration}
                      onChange={(e) => setWVestingDuration(parseInt(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Lock cliff duration (days)</span>
                      <span className="text-emerald-400 font-bold">{wVestingCliff} Days</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={wVestingCliff}
                      onChange={(e) => setWVestingCliff(parseInt(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                  </div>
                </div>
              )}

              {wDistributionType === 'FCFS' && (
                <div className="bg-slate-950 p-4 border border-slate-800 rounded-lg space-y-3 text-xs font-mono">
                  <span className="text-slate-300 font-bold uppercase block">FCFS constraints configuration:</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-slate-400">Max claimant cap</span>
                      <input type="number" defaultValue="500" className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded outline-none font-mono w-full" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400">Max allocation per claim</span>
                      <input type="number" defaultValue="50" className="bg-slate-900 border border-slate-800 text-slate-300 p-2 rounded outline-none font-mono w-full" />
                    </div>
                  </div>
                </div>
              )}

              {wAirdropType !== 'CSV' && (
                <div className="space-y-1.5 text-xs">
                  <label className="text-slate-400 font-mono uppercase block">Enter Total Pool distribution size *</label>
                  <input
                    type="number"
                    value={wTotalAmount}
                    onChange={(e) => setWTotalAmount(parseInt(e.target.value) || 0)}
                    className="bg-slate-950 border border-slate-800 text-slate-100 p-2.5 rounded font-mono w-full outline-none focus:border-slate-700"
                  />
                </div>
              )}

              <div className="flex justify-between pt-4 border-t border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  className="bg-slate-950 border border-slate-800 text-slate-400 px-4 py-2 rounded transition cursor-pointer"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(4)}
                  className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded transition cursor-pointer"
                >
                  Continue to Step 4 &rarr;
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW & MERKLE TREE GENERATION */}
          {wizardStep === 4 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-200">Step 4: 캠페인 미리보기 & Merkle Tree 생성</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-950 p-5 border border-slate-800 rounded-lg text-xs font-mono">
                <div className="space-y-3">
                  <span className="text-slate-400 block border-b border-slate-800 pb-1.5">CAMPAIGN INVOICE SUMMARY:</span>
                  <div className="flex justify-between">
                    <span>Campaign Name:</span>
                    <span className="text-slate-200 font-semibold truncate max-w-xs">{wName || 'Untitled'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distribution Token:</span>
                    <span className="text-slate-200 font-semibold">{wToken}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Airdrop Type:</span>
                    <span className="text-slate-200 font-semibold">{wAirdropType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distribution Type:</span>
                    <span className="text-slate-200 font-semibold">{wDistributionType}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <span className="text-slate-400 block border-b border-slate-800 pb-1.5">COST RECAP:</span>
                  <div className="flex justify-between font-bold text-slate-300">
                    <span>Total Deposit Pool:</span>
                    <span>{wTotalAmount.toLocaleString()} {wToken}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400 font-bold pt-2 border-t border-slate-800/80">
                    <span>Creation Platform Fee:</span>
                    <span>{calculatedFee} {wFeeToken}</span>
                  </div>
                </div>
              </div>

              {/* Merkle Visualizer Animation panel */}
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-lg space-y-4 font-mono text-xs">
                <span className="text-slate-300 font-bold block uppercase flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" /> Merkle Tree Generator Engine
                </span>
                <p className="text-slate-500 text-[10px] leading-normal">
                  In CSV/Merkle campaigns, ScatterDrop packs whitelists into cryptographic hashes and generates parent branching nodes. Inspection is simulated underneath:
                </p>

                <div className="h-28 w-full bg-slate-900/50 rounded border border-slate-800/80 flex items-center justify-center relative overflow-hidden">
                  {/* Graphical Binary Tree representation */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="bg-slate-950 px-2 py-1 rounded text-emerald-400 border border-emerald-500/20 font-bold font-mono text-[10px]">
                      Root: {wAirdropType === 'CSV' ? '0x53c9f276...ea13' : '0x6a0ef...78bf'}
                    </div>
                    
                    {/* Branching lines */}
                    <div className="flex justify-between w-64 text-[9px] text-slate-500 relative">
                      <div className="absolute left-1/4 right-1/4 top-0 h-0.5 bg-slate-800" />
                      <div className="bg-slate-950 px-1 py-0.5 rounded border border-slate-800/60">Branch L: 0x9f83...df79</div>
                      <div className="bg-slate-950 px-1 py-0.5 rounded border border-slate-800/60">Branch R: 0x2bc8...5a11</div>
                    </div>

                    <div className="flex justify-between w-full px-4 text-[8px] text-slate-600">
                      <span>Leaf 1</span>
                      <span>Leaf 2</span>
                      <span>Leaf 3</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4 border-t border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setWizardStep(3)}
                  className="bg-slate-950 border border-slate-800 text-slate-400 px-4 py-2 rounded transition cursor-pointer"
                >
                  &larr; Back
                </button>
                <button
                  type="button"
                  onClick={() => setWizardStep(5)}
                  className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded transition cursor-pointer"
                >
                  Continue to Step 5 &rarr;
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: CREATION & DEPOSIT */}
          {wizardStep === 5 && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold text-slate-200">Step 5: 생성 & 결제 납부 토큰 선택</h2>

              <div className="space-y-4">
                <span className="text-xs font-mono text-slate-400 uppercase block">Select Payment Token for Creation Fee:</span>
                
                <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                  {fees.map((f) => (
                    <button
                      key={f.tokenSymbol}
                      type="button"
                      onClick={() => setWFeeToken(f.tokenSymbol)}
                      className={`p-3 rounded-lg border text-left transition flex flex-col justify-between h-20 ${
                        wFeeToken === f.tokenSymbol 
                          ? 'bg-slate-850 border-emerald-500 text-slate-100' 
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:bg-slate-900/50'
                      }`}
                    >
                      <span className="font-bold text-slate-200">{f.tokenSymbol}</span>
                      <span className="text-[10px] text-emerald-400 mt-2 font-bold">
                        Fee: {wAirdropType === 'CSV' ? f.csvFee : wAirdropType === 'GATED' ? f.gatedFee : f.socialFee}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="bg-slate-950 p-4 border border-slate-800 rounded-lg space-y-2.5 text-xs font-mono leading-relaxed">
                  <span className="text-slate-400 font-bold uppercase block">LIQUIDITY BALANCE CHECK:</span>
                  <div className="flex justify-between border-b border-slate-800/80 pb-2">
                    <span className="text-slate-500">Your {wFeeToken} Balance:</span>
                    <span className="text-slate-300 font-semibold">{(wallet.tokenBalances[wFeeToken] || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Required payment:</span>
                    <span className="text-emerald-400 font-bold">{calculatedFee} {wFeeToken}</span>
                  </div>
                </div>

                {/* Confirm deployment trigger */}
                <div className="pt-4 border-t border-slate-800 space-y-4">
                  {(wallet.tokenBalances[wFeeToken] || 0) < calculatedFee ? (
                    <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-lg text-xs font-mono text-rose-400 flex items-center gap-2">
                      <AlertTriangle className="w-4.5 h-4.5 shrink-0" /> Insufficient {wFeeToken} balance to pay deployment fees. Purchase tokens inside the simulator bottom right.
                    </div>
                  ) : (
                    <button
                      onClick={handleCreateCampaign}
                      disabled={isDeploying}
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-lg text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/10"
                    >
                      {isDeploying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing Transaction Steps...
                        </>
                      ) : (
                        `Authorize & Deploy ${wName || 'Scatter-drop'}`
                      )}
                    </button>
                  )}

                  {/* Dual Transaction Process Monitor */}
                  {isDeploying && (
                    <div className="bg-slate-950 border border-slate-800 p-4 rounded-lg font-mono text-[11px] space-y-2.5 text-slate-400 max-w-md mx-auto">
                      <div className="flex justify-between items-center">
                        <span>TX 1: Approve platform contract to lock collateral</span>
                        {deployStep > 1 ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : deployStep === 1 ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-800 shrink-0" />
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span>TX 2: Lock fees & deposit {wTotalAmount.toLocaleString()} {wToken} collateral</span>
                        {deployStep > 2 ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : deployStep === 2 ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-800 shrink-0" />
                        )}
                      </div>
                      <div className="flex justify-between items-center">
                        <span>TX 3: Deploy DropFactory.createDrop() on-chain</span>
                        {deployStep > 3 ? (
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : deployStep === 3 ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-800 shrink-0" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CUSTOM COMMUNITY TOKEN POPUP MODAL */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form onSubmit={handleAddToken} className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-sm w-full space-y-4 font-mono text-xs text-slate-300">
            <h3 className="font-bold text-slate-100 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-emerald-400" /> Register Allowed Token
            </h3>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <span className="text-slate-500">Token Symbol *</span>
                <input 
                  type="text" 
                  placeholder="TOK"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value)}
                  className="bg-slate-950 border border-slate-800 p-2 rounded w-full outline-none text-white focus:border-slate-700"
                  required
                />
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Token Full Name *</span>
                <input 
                  type="text" 
                  placeholder="Tokamak Governance"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 p-2 rounded w-full outline-none text-white focus:border-slate-700"
                  required
                />
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Ethereum Smart Contract Address *</span>
                <input 
                  type="text" 
                  placeholder="0x93201476..."
                  value={newAddr}
                  onChange={(e) => setNewAddr(e.target.value)}
                  className="bg-slate-950 border border-slate-800 p-2 rounded w-full outline-none text-white focus:border-slate-700"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button 
                type="button" 
                onClick={() => setTokenModalOpen(false)}
                className="bg-slate-950 hover:bg-slate-850 px-3 py-1.5 rounded transition border border-slate-800/80 cursor-pointer"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="bg-slate-100 hover:bg-white text-slate-950 px-3 py-1.5 rounded transition font-bold cursor-pointer"
              >
                Save Token
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
