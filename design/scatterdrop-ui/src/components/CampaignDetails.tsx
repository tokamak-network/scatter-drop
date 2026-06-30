import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Campaign, Participant } from '../types';
import { ArrowLeft, Shield, CheckCircle2, XCircle, Clock, Gift, Lock, Loader2, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';

interface CampaignDetailsProps {
  campaignId: string;
  onBack: () => void;
}

export const CampaignDetails: React.FC<CampaignDetailsProps> = ({ campaignId, onBack }) => {
  const { 
    campaigns, 
    setCampaigns, 
    registries, 
    setRegistries, 
    wallet, 
    setWallet, 
    participants, 
    setParticipants 
  } = useApp();

  const campaign = campaigns.find(c => c.id === campaignId);

  // States for verification flow simulation
  const [certType, setCertType] = useState('NPKI');
  const [certPasscode, setCertPasscode] = useState('');
  const [isVerifyingCert, setIsVerifyingCert] = useState(false);
  const [certError, setCertError] = useState('');
  
  // Claim execution states
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimStep, setClaimStep] = useState(0);
  const [claimError, setClaimError] = useState('');

  // Vesting unlock states
  const [isReleasingVested, setIsReleasingVested] = useState(false);

  // Social simulation states
  const [socialTwitterConnected, setSocialTwitterConnected] = useState(false);
  const [socialDiscordConnected, setSocialDiscordConnected] = useState(false);

  if (!campaign) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-4">
        <p className="text-slate-400">Campaign not found.</p>
        <button onClick={onBack} className="text-emerald-400 hover:underline">Go Back</button>
      </div>
    );
  }

  const isEnded = new Date(campaign.endDate) < new Date();
  const registry = registries.find(r => r.address.toLowerCase() === campaign.customerRegistryAddress.toLowerCase());

  // Check if wallet is verified on the customer registry
  const getVerificationExpiry = () => {
    if (!wallet.isConnected || !registry) return null;
    return registry.verifiedWallets[wallet.address] || null;
  };

  const expiryStr = getVerificationExpiry();
  const isIdentityVerified = expiryStr ? new Date(expiryStr) >= new Date() : false;

  // Real-time eligibility calculator
  const getEligibility = () => {
    if (!wallet.isConnected) return { eligible: false, amount: 0, reason: 'Please connect your wallet first.' };

    if (campaign.type === 'CSV') {
      const row = campaign.csvData?.find(r => r.address.toLowerCase() === wallet.address.toLowerCase());
      if (row) {
        return { eligible: true, amount: row.amount, reason: 'Your address is listed in the distribution list.' };
      }
      return { eligible: false, amount: 0, reason: 'Your wallet is not pre-registered in this CSV Merkle list.' };
    }

    if (campaign.type === 'GATED') {
      const criteria = campaign.gatedCriteria;
      if (!criteria) return { eligible: false, amount: 0, reason: 'Invalid campaign setup.' };

      const holdCount = wallet.tokenBalances[campaign.tokenSymbol] || 0;
      const meetsMinTokens = !criteria.minTokens || holdCount >= criteria.minTokens;
      const meetsStaker = !criteria.isStaker || wallet.isStaking;

      if (meetsMinTokens && meetsStaker) {
        // Base amount for staker gate
        return { eligible: true, amount: 2000, reason: 'You satisfy all on-chain requirements (token hold + staking active)!' };
      }

      const reasons = [];
      if (!meetsMinTokens) reasons.push(`Holds ${holdCount}/${criteria.minTokens} ${campaign.tokenSymbol}`);
      if (!meetsStaker) reasons.push('Not staking in ecosystem contract');

      return { eligible: false, amount: 0, reason: `Requirements failed: ${reasons.join(', ')}` };
    }

    if (campaign.type === 'SOCIAL') {
      if (socialTwitterConnected && socialDiscordConnected) {
        return { eligible: true, amount: 1000, reason: 'Social media interactions validated successfully.' };
      }
      const missing = [];
      if (!socialTwitterConnected) missing.push('Retweet task');
      if (!socialDiscordConnected) missing.push('Discord join');
      return { eligible: false, amount: 0, reason: `Tasks remaining: ${missing.join(', ')}` };
    }

    return { eligible: false, amount: 0, reason: 'Unknown' };
  };

  const { eligible, amount: eligibleAmount, reason: eligibilityReason } = getEligibility();

  // Check if wallet has already claimed
  const getClaimRecord = () => {
    const list = participants[campaign.id] || [];
    return list.find(p => p.address.toLowerCase() === wallet.address.toLowerCase()) || null;
  };

  const claimRecord = getClaimRecord();

  // Simulate zk-X509 onboarding registration
  const handleRegisterIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certPasscode) {
      setCertError('Please input your certificate passcode.');
      return;
    }
    setCertError('');
    setIsVerifyingCert(true);

    setTimeout(() => {
      setIsVerifyingCert(false);
      // Register wallet in the active registry
      if (!registry) return;

      const updatedRegistries = registries.map(r => {
        if (r.address === registry.address) {
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

      setRegistries(updatedRegistries);
      setCertPasscode('');
    }, 2000);
  };

  // Simulate claims process with Web3 steps
  const handleClaim = () => {
    if (!isIdentityVerified) return;
    if (!eligible) return;
    if (claimRecord?.claimed) return;

    setIsClaiming(true);
    setClaimStep(1);
    setClaimError('');

    // Step 1: Sign cryptographically bound message
    setTimeout(() => {
      setClaimStep(2);
      // Step 2: Generate zk-Proof verifying identity validation without revealing certificate content
      setTimeout(() => {
        setClaimStep(3);
        // Step 3: Broadcast transaction to Smart Contract
        setTimeout(() => {
          // Success!
          // 1. Add participant claim record
          const list = participants[campaign.id] || [];
          const updatedParticipantList: Participant[] = [
            ...list.filter(p => p.address.toLowerCase() !== wallet.address.toLowerCase()),
            {
              address: wallet.address,
              amount: eligibleAmount,
              claimed: true,
              claimedAt: new Date().toISOString(),
              vestingClaimedAmount: campaign.distributionType === 'VESTING' ? 0 : eligibleAmount,
              countryCode: registry?.name.includes('KR') ? 'KR' : 'EE',
              affiliation: registry?.name.includes('KR') ? 'Kookmin Bank Certified' : 'Estonian eID Client'
            }
          ];

          setParticipants(prev => ({
            ...prev,
            [campaign.id]: updatedParticipantList
          }));

          // 2. Reduce campaign pool
          setCampaigns(prev => prev.map(c => {
            if (c.id === campaign.id) {
              return {
                ...c,
                remainingAmount: c.remainingAmount - eligibleAmount,
                claimsCount: c.claimsCount + 1
              };
            }
            return c;
          }));

          // 3. Increase wallet token balance (if immediate)
          if (campaign.distributionType !== 'VESTING') {
            setWallet(prev => ({
              ...prev,
              tokenBalances: {
                ...prev.tokenBalances,
                [campaign.tokenSymbol]: (prev.tokenBalances[campaign.tokenSymbol] || 0) + eligibleAmount
              }
            }));
          }

          setIsClaiming(false);
          setClaimStep(0);
        }, 1500);
      }, 1500);
    }, 1200);
  };

  // Simulate Linear Vesting release stream
  const handleReleaseVesting = () => {
    if (!claimRecord || !claimRecord.claimed) return;
    setIsReleasingVested(true);

    setTimeout(() => {
      // Release 25% of remaining amount for demonstration
      const totalAmount = claimRecord.amount;
      const alreadyClaimed = claimRecord.vestingClaimedAmount || 0;
      const claimableNow = Math.min(totalAmount - alreadyClaimed, Math.ceil(totalAmount * 0.25));

      if (claimableNow > 0) {
        // Update participant state
        setParticipants(prev => ({
          ...prev,
          [campaign.id]: prev[campaign.id].map(p => {
            if (p.address.toLowerCase() === wallet.address.toLowerCase()) {
              return {
                ...p,
                vestingClaimedAmount: alreadyClaimed + claimableNow
              };
            }
            return p;
          })
        }));

        // Credit to wallet
        setWallet(prev => ({
          ...prev,
          tokenBalances: {
            ...prev.tokenBalances,
            [campaign.tokenSymbol]: (prev.tokenBalances[campaign.tokenSymbol] || 0) + claimableNow
          }
        }));
      }

      setIsReleasingVested(false);
    }, 1500);
  };

  const getVestingStats = () => {
    if (!claimRecord) return { claimed: 0, claimable: 0, total: 0 };
    const total = claimRecord.amount;
    const claimed = claimRecord.vestingClaimedAmount || 0;
    const claimable = total - claimed;
    return { claimed, claimable, total };
  };

  const vestingStats = getVestingStats();

  return (
    <div className="space-y-8 animate-fade-in font-sans">
      {/* Back navigation */}
      <button 
        onClick={onBack}
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition text-sm font-mono cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        BACK TO DIRECTORY
      </button>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Campaign Information */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Campaign Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-6">
            <div className="flex flex-col md:flex-row gap-5 items-start">
              {campaign.logoUrl ? (
                <img
                  src={campaign.logoUrl}
                  alt={campaign.name}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-xl object-cover border border-slate-800 shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-2xl text-slate-500 shrink-0">
                  {campaign.tokenSymbol}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-800 px-2 py-0.5 rounded border border-slate-700/50">
                    ID: {campaign.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                    campaign.distributionType === 'IMMEDIATE' 
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' 
                      : 'bg-amber-950/40 text-amber-400 border-amber-900/40'
                  }`}>
                    {campaign.distributionType === 'IMMEDIATE' ? 'Immediate Unlock' : 'Vesting Release'}
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-100">{campaign.name}</h1>
                <p className="text-xs text-slate-500 font-mono">
                  Created by Operator: <span className="text-slate-300">{campaign.creator.slice(0, 10)}...{campaign.creator.slice(-8)}</span>
                </p>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed border-t border-slate-800/80 pt-4">
              {campaign.description}
            </p>

            {/* Campaign Contract details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800/60 text-xs font-mono">
              <div className="space-y-1">
                <span className="text-slate-500">Airdrop Token Address</span>
                <div className="text-slate-300 truncate font-semibold select-all" title={campaign.tokenAddress}>
                  {campaign.tokenAddress}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-slate-500">Deposit Proof Transaction</span>
                <div className="text-slate-300 truncate font-semibold select-all text-emerald-400" title={campaign.depositProofTx}>
                  {campaign.depositProofTx}
                </div>
              </div>
            </div>
          </div>

          {/* zk-X509 Onboarding Gate Simulator */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                zk-X509 Identity CA Gate
              </h3>
              {isIdentityVerified ? (
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/30 px-3 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SECURE / VERIFIED
                </span>
              ) : (
                <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/20 px-3 py-1 rounded-full border border-amber-500/20 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> AUTH REQUIRED
                </span>
              )}
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                This campaign is gated with the <strong className="text-slate-200">{registry?.name}</strong> registry. To participate, you must register a certified cryptographic digital signature issued by an authorized CA. 
                ScatterDrop uses Zero-Knowledge proofs to verify standard digital identities without exposing actual governmental metadata.
              </p>

              {isIdentityVerified ? (
                <div className="bg-emerald-950/20 border border-emerald-900/40 p-4 rounded-lg flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-emerald-400 font-mono">WALLET BOUND SUCCESSFUL</h4>
                    <p className="text-slate-300 leading-relaxed">
                      Your connected address <code className="bg-slate-950 px-1 py-0.2 rounded text-[11px] text-slate-300 font-mono">{wallet.address.slice(0, 8)}...</code> is registered and verified on-chain until <strong>{new Date(expiryStr || '').toLocaleDateString()}</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegisterIdentity} className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-4">
                  <h4 className="text-xs font-bold text-slate-300 font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Register Certified X.509 Identity
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-mono">Issuer / Certification Authority</label>
                      <select 
                        value={certType}
                        onChange={(e) => setCertType(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3 py-2 rounded w-full focus:outline-none focus:border-slate-700 font-mono"
                      >
                        {registry?.name.includes('KR') ? (
                          <>
                            <option value="NPKI">KOSCOM NPKI (Korea Public Certificate)</option>
                            <option value="YESSIGN">Financial Decision Board (yessign)</option>
                            <option value="SIGNKOREA">KOSCOM (SignKorea)</option>
                          </>
                        ) : (
                          <>
                            <option value="EST_EID">Estonia Government CA (EST-eID)</option>
                            <option value="EU_TRUST">EU Trusted Service List Issuer</option>
                            <option value="MOCK">ScatterDrop Sandbox CA</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-500 font-mono">Certificate Passcode (Password)</label>
                      <input
                        type="password"
                        placeholder="••••••••••••"
                        value={certPasscode}
                        onChange={(e) => setCertPasscode(e.target.value)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-3 py-2 rounded w-full focus:outline-none focus:border-slate-700 font-mono"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-900/50 p-2.5 rounded border border-slate-800/40 text-[10px] text-slate-500 font-mono flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" /> Note: Verification submits a zk-SNARK cryptographically linking your ID to wallet.
                  </div>

                  {certError && (
                    <div className="text-xs text-rose-500 font-mono flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> {certError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isVerifyingCert}
                    className="bg-slate-100 hover:bg-white text-slate-950 font-semibold px-4 py-2 rounded text-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isVerifyingCert ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Generating Proof & Binding Wallet...
                      </>
                    ) : (
                      'Simulate zk-X509 Onboarding (Verify & Register)'
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Claims Portal */}
        <div className="space-y-6">
          
          {/* Status KPI Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Campaign Pool</h3>
            <div className="flex justify-between items-baseline">
              <span className="text-3xl font-bold text-slate-100">
                {campaign.remainingAmount.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-slate-500">
                / {campaign.totalAmount.toLocaleString()} {campaign.tokenSymbol} left
              </span>
            </div>
            
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500" 
                style={{ width: `${((campaign.totalAmount - campaign.remainingAmount) / campaign.totalAmount) * 100}%` }}
              />
            </div>

            <div className="flex justify-between text-xs font-mono text-slate-500 pt-1">
              <span>Claims rate: {(((campaign.totalAmount - campaign.remainingAmount) / campaign.totalAmount) * 100).toFixed(1)}%</span>
              <span>{campaign.claimsCount} Claimants</span>
            </div>
          </div>

          {/* Gating & Eligibility panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Gift className="w-4 h-4 text-indigo-400" />
              Eligibility check
            </h3>

            {/* If GATED drop: render interactive checklist */}
            {campaign.type === 'GATED' && campaign.gatedCriteria && (
              <div className="space-y-3">
                <span className="text-[10px] text-slate-500 font-mono block">ON-CHAIN GATED DROP CONDITIONS:</span>
                
                {campaign.gatedCriteria.minTokens && (
                  <div className="flex items-start justify-between bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <div className="space-y-1 text-xs">
                      <span className="text-slate-300 font-semibold block">Token Threshold</span>
                      <p className="text-slate-500 leading-normal text-[10px]">
                        Must hold &gt;= {campaign.gatedCriteria.minTokens} {campaign.tokenSymbol}.
                        <span className="block text-slate-400 mt-0.5">Your hold: {wallet.tokenBalances[campaign.tokenSymbol] || 0} {campaign.tokenSymbol}</span>
                      </p>
                    </div>
                    {(wallet.tokenBalances[campaign.tokenSymbol] || 0) >= campaign.gatedCriteria.minTokens ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0 font-bold" />
                    )}
                  </div>
                )}

                {campaign.gatedCriteria.isStaker && (
                  <div className="flex items-start justify-between bg-slate-950 p-3 rounded-lg border border-slate-800/80">
                    <div className="space-y-1 text-xs">
                      <span className="text-slate-300 font-semibold block">Ecosystem Staker</span>
                      <p className="text-slate-500 leading-normal text-[10px]">
                        Must actively stake TOK in governance protocol.
                        <span className="block text-slate-400 mt-0.5">Your status: {wallet.isStaking ? 'Staking Active' : 'No Active Stake'}</span>
                      </p>
                    </div>
                    {wallet.isStaking ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                  </div>
                )}
                
                <span className="text-[10px] text-slate-500 font-mono leading-relaxed block bg-slate-950/40 p-2 border border-slate-800/30 rounded">
                  💡 Tip: You can adjust your staking and token hold levels instantly inside the <strong>Wallet Simulator</strong> in the bottom right!
                </span>
              </div>
            )}

            {/* If SOCIAL drop: render social simulator interactive items */}
            {campaign.type === 'SOCIAL' && (
              <div className="space-y-3">
                <span className="text-[10px] text-slate-500 font-mono block">SOCIAL MEDIATOR VERIFICATIONS:</span>
                
                {/* Twitter task */}
                <button
                  type="button"
                  onClick={() => setSocialTwitterConnected(true)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition ${
                    socialTwitterConnected 
                      ? 'bg-slate-950 border-slate-800 text-slate-400' 
                      : 'bg-indigo-950/20 border-indigo-900/40 hover:bg-indigo-900/30 text-slate-200'
                  }`}
                >
                  <div className="text-xs">
                    <span className="font-semibold block">Retweet Announcement</span>
                    <span className="text-[10px] text-slate-500 font-mono">Retweet @ScatterDrop beta announcement</span>
                  </div>
                  {socialTwitterConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-mono font-bold">VERIFY TASK</span>
                  )}
                </button>

                {/* Discord task */}
                <button
                  type="button"
                  onClick={() => setSocialDiscordConnected(true)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition ${
                    socialDiscordConnected 
                      ? 'bg-slate-950 border-slate-800 text-slate-400' 
                      : 'bg-indigo-950/20 border-indigo-900/40 hover:bg-indigo-900/30 text-slate-200'
                  }`}
                >
                  <div className="text-xs">
                    <span className="font-semibold block">Join Discord Server</span>
                    <span className="text-[10px] text-slate-500 font-mono">Join ScatterDrop Official Discord community</span>
                  </div>
                  {socialDiscordConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-mono font-bold">VERIFY TASK</span>
                  )}
                </button>
              </div>
            )}

            {/* Eligibility outcome summary */}
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800/80 space-y-2">
              <span className="text-[10px] text-slate-500 font-mono">CALCULATION RESULT:</span>
              <div className="flex gap-2 items-start">
                {eligible ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4.5 h-4.5 text-slate-600 shrink-0 mt-0.5" />
                )}
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-slate-300">
                    {eligible ? `Eligible for ${eligibleAmount.toLocaleString()} ${campaign.tokenSymbol}` : 'Not eligible'}
                  </div>
                  <div className="text-slate-500 text-[11px] leading-snug">
                    {eligibilityReason}
                  </div>
                </div>
              </div>
            </div>

            {/* CLAIM TRIGGER PORTAL */}
            <div className="border-t border-slate-800 pt-5 space-y-4">
              
              {claimRecord?.claimed ? (
                /* Already Claimed State */
                <div className="space-y-4">
                  <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-lg text-xs space-y-2">
                    <span className="font-mono text-emerald-400 font-bold block flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> AIRDROP RECEIVED
                    </span>
                    <p className="text-slate-300 leading-relaxed">
                      You successfully claimed <strong>{claimRecord.amount.toLocaleString()} {campaign.tokenSymbol}</strong>.
                    </p>
                    {claimRecord.claimedAt && (
                      <span className="text-[10px] text-slate-500 block font-mono">
                        Claim Transaction timestamp: {new Date(claimRecord.claimedAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {/* Vesting stream release console */}
                  {campaign.distributionType === 'VESTING' && (
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                      <span className="text-[10px] text-slate-400 font-mono block flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-500" /> VESTING RELEASE PORTAL
                      </span>
                      
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                          <span>Withdrawn: {vestingStats.claimed.toLocaleString()}</span>
                          <span>Locked: {vestingStats.claimable.toLocaleString()} / {vestingStats.total.toLocaleString()} TOK</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className="h-full bg-amber-500 rounded-full transition-all duration-500" 
                            style={{ width: `${(vestingStats.claimed / vestingStats.total) * 100}%` }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleReleaseVesting}
                        disabled={isReleasingVested || vestingStats.claimable === 0}
                        className="w-full bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 text-xs py-2 rounded-lg font-mono transition flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                      >
                        {isReleasingVested ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Releasing stream...
                          </>
                        ) : vestingStats.claimable === 0 ? (
                          'Stream Fully Released'
                        ) : (
                          'Simulate Vesting Stream Release (Claim 25% Vested)'
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Unclaimed state triggers */
                <div className="space-y-3">
                  
                  {isEnded ? (
                    <div className="text-center p-3 border border-slate-800 bg-slate-950/40 rounded text-xs font-mono text-slate-500">
                      🔒 This campaign has ended (Claim Window Closed).
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={handleClaim}
                        disabled={!isIdentityVerified || !eligible || isClaiming}
                        className={`w-full py-3 px-4 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer ${
                          isIdentityVerified && eligible
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/10'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800/80'
                        }`}
                      >
                        {isClaiming ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing claim...
                          </>
                        ) : !isIdentityVerified ? (
                          'zk-X509 Identity Verification Required'
                        ) : !eligible ? (
                          'Airdrop Requirements Not Met'
                        ) : (
                          `Claim ${eligibleAmount.toLocaleString()} ${campaign.tokenSymbol}`
                        )}
                      </button>

                      {/* Claims loader details */}
                      {isClaiming && (
                        <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-lg text-[11px] font-mono space-y-2 text-slate-400">
                          <div className="flex justify-between items-center">
                            <span>Step 1: Cryptographic authentication signature</span>
                            {claimStep > 1 ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : claimStep === 1 ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-800 shrink-0" />
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Step 2: zk-SNARK identity-link proof generation</span>
                            {claimStep > 2 ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : claimStep === 2 ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-800 shrink-0" />
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Step 3: DropFactory smart contract broadcast</span>
                            {claimStep > 3 ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : claimStep === 3 ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-800 shrink-0" />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
