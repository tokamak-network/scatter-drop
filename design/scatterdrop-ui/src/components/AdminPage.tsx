import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AllowedToken, FeeConfig, Registry } from '../types';
import { 
  ShieldAlert, Settings, Key, Coins, Wallet, History, FileText, CheckCircle2, 
  Trash2, AlertTriangle, ArrowUpRight, BarChart3, HelpCircle, ArrowRightLeft, Sparkles, Check 
} from 'lucide-react';

export const AdminPage: React.FC = () => {
  const { 
    wallet, 
    setWallet,
    campaigns, 
    registries, 
    setRegistries, 
    fees, 
    setFees, 
    tokens, 
    setTokens, 
    collectedFees, 
    setCollectedFees 
  } = useApp();

  // Navigation states
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'FUNDS' | 'IDENTITY' | 'TOKENS' | 'VAULT' | 'CAMPAIGNS'>('OVERVIEW');

  // Withdraw states
  const [withdrawToken, setWithdrawToken] = useState('TON');
  const [withdrawDest, setWithdrawDest] = useState('0xTreasuryMultisigSecure99999999999999');
  const [withdrawAmount, setWithdrawAmount] = useState(50);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Identity curation additions
  const [newRegName, setNewRegName] = useState('');
  const [newRegAddr, setNewRegAddr] = useState('');
  const [newRegCAs, setNewRegCAs] = useState(3);
  const [newRegDesc, setNewRegDesc] = useState('');

  // Operator CA update
  const [operatorRegAddr, setOperatorRegAddr] = useState('0xOperatorCA1111111111111111111111111111');

  // Matrix fee inputs state (dynamically linked to context fees)
  const [feeInputs, setFeeInputs] = useState<FeeConfig[]>(() => [...fees]);

  // Toast notifier
  const [toastMessage, setToastMessage] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Restrict access check
  const isAdmin = wallet.address.toLowerCase() === '0xadmin000000000000000000000000000000000000';

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center p-8 bg-slate-900 border border-slate-800 rounded-xl space-y-5 animate-fade-in font-sans mt-8">
        <div className="w-12 h-12 rounded-full bg-rose-950/40 border border-rose-900/40 flex items-center justify-center mx-auto text-rose-500">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200 font-mono">Platform Admin Access Restricted</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Your connected address <code className="bg-slate-950 px-1 py-0.5 rounded text-[10px] text-slate-300 font-mono">{wallet.address.slice(0, 8)}...</code> does not have authorization.
          </p>
        </div>
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-[11px] font-mono text-slate-500 leading-normal">
          💡 Switch to the <strong>Platform Administrator</strong> role profile in the <strong>Wallet Simulator</strong> (bottom right) to unlock this screen instantly.
        </div>
      </div>
    );
  }

  // Handle fee updates matrix (Section 4: setFee)
  const handleUpdateFee = (tokenSymbol: string, type: 'csv' | 'snapshot' | 'gated' | 'social', value: number) => {
    const updated = feeInputs.map(f => {
      if (f.tokenSymbol === tokenSymbol) {
        return {
          ...f,
          [`${type}Fee`]: Math.max(0, value)
        };
      }
      return f;
    });
    setFeeInputs(updated);
  };

  const handleSaveFees = () => {
    setFees(feeInputs);
    triggerToast('On-chain platform fees successfully updated (setFee)!');
  };

  // Withdraw fees from Vault (Section 4: withdrawFees)
  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawDest || withdrawAmount <= 0) return;

    const currentBalance = collectedFees[withdrawToken] || 0;
    if (withdrawAmount > currentBalance) {
      triggerToast(`Insufficient accumulated ${withdrawToken} in the Vault.`);
      return;
    }

    setIsWithdrawing(true);
    setTimeout(() => {
      setIsWithdrawing(false);
      
      // Subtract from Vault
      setCollectedFees(prev => ({
        ...prev,
        [withdrawToken]: currentBalance - withdrawAmount
      }));

      // Credit to the custom destination (if it's the admin, update their wallet balance)
      if (withdrawDest.toLowerCase() === wallet.address.toLowerCase()) {
        setWallet(prev => ({
          ...prev,
          tokenBalances: {
            ...prev.tokenBalances,
            [withdrawToken]: (prev.tokenBalances[withdrawToken] || 0) + withdrawAmount
          }
        }));
      }

      triggerToast(`Withdrew ${withdrawAmount} ${withdrawToken} to ${withdrawDest.slice(0, 8)}... (withdrawFees)`);
      setWithdrawAmount(0);
    }, 1500);
  };

  // Toggle Official Token declaration (Section 4: setOfficialToken)
  const handleToggleOfficial = (tokenAddr: string) => {
    const updated = tokens.map(t => {
      if (t.address === tokenAddr) {
        return { ...t, isOfficial: !t.isOfficial };
      }
      return t;
    });
    setTokens(updated);
    triggerToast('Airdrop token registration status modified!');
  };

  // Remove community tokens (Section 4: removeAllowedToken)
  const handleRemoveToken = (tokenAddr: string) => {
    const updated = tokens.filter(t => t.address !== tokenAddr);
    setTokens(updated);
    triggerToast('Malicious community token removed from registrar!');
  };

  // Add customized identity standard registry (Section 4 curation)
  const handleAddRegistry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegName || !newRegAddr) return;

    const entry: Registry = {
      address: newRegAddr,
      name: newRegName,
      owner: wallet.address,
      trustedCAsCount: newRegCAs,
      isStandard: true,
      isOperatorRegistry: false,
      description: newRegDesc || 'Custom Curated zk-X509 standard registry.',
      verifiedWallets: {}
    };

    setRegistries(prev => [...prev, entry]);
    setNewRegName('');
    setNewRegAddr('');
    setNewRegDesc('');
    triggerToast(`Added standard registry curation ${newRegName}!`);
  };

  // Remove curated standard registry
  const handleRemoveRegistry = (address: string) => {
    setRegistries(prev => prev.filter(r => r.address !== address));
    triggerToast('Standard registry curation removed!');
  };

  // Update Global Operator CA registry (Section 4: setOperatorRegistry)
  const handleUpdateOperatorRegistry = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Scan if already in list, otherwise append
    const exists = registries.some(r => r.address === operatorRegAddr);
    if (!exists) {
      const entry: Registry = {
        address: operatorRegAddr,
        name: 'ScatterDrop Custom Operator CA Registry',
        owner: wallet.address,
        trustedCAsCount: 2,
        isStandard: true,
        isOperatorRegistry: true,
        description: 'New platform-wide operator CA registry.',
        verifiedWallets: {}
      };
      setRegistries(prev => [...prev.map(r => ({ ...r, isOperatorRegistry: false })), entry]);
    } else {
      setRegistries(prev => prev.map(r => ({
        ...r,
        isOperatorRegistry: r.address === operatorRegAddr
      })));
    }
    triggerToast('Global Operator Registry (setOperatorRegistry) updated!');
  };

  return (
    <div className="space-y-8 animate-fade-in font-sans relative">
      {/* Toast notifier */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-slate-100 text-slate-900 text-xs px-4 py-2.5 rounded-lg border border-slate-200 shadow-xl font-mono flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-500 animate-pulse" />
          {toastMessage}
        </div>
      )}

      {/* Admin header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldAlert className="w-3.5 h-3.5" /> PLATFORM MULTISIG OWNER
          </div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight mt-1.5">DropFactory Governance Center</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">Configure platform fee matrices, curate standard zk-X509 registries, and withdraw vault proceeds.</p>
        </div>

        {/* Global Navigation Tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 w-full lg:w-auto font-mono text-xs">
          {([
            { id: 'OVERVIEW', label: 'Dashboard' },
            { id: 'FUNDS', label: 'Fees Config' },
            { id: 'IDENTITY', label: 'CA Registries' },
            { id: 'TOKENS', label: 'Tokens' },
            { id: 'VAULT', label: 'Fee Vault' },
            { id: 'CAMPAIGNS', label: 'Monitor' }
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition flex-1 lg:flex-none cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW METRICS */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* KPI 1: Active drops count */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2 font-mono">
              <span className="text-xs text-slate-500 uppercase">Registered Campaigns</span>
              <div className="text-3xl font-bold text-slate-200">{campaigns.length} Total</div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Active: {campaigns.filter(c => new Date(c.endDate) >= new Date()).length} &bull; Ended: {campaigns.filter(c => new Date(c.endDate) < new Date()).length}
              </p>
            </div>

            {/* KPI 2: Treasury proceeds */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2 font-mono">
              <span className="text-xs text-slate-500 uppercase">Accumulated Fees</span>
              <div className="space-y-1">
                {Object.entries(collectedFees).map(([sym, bal]) => (
                  <div key={sym} className="flex justify-between text-sm">
                    <span className="text-slate-400">{sym}:</span>
                    <strong className="text-emerald-400">{bal.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* KPI 3: Verified CAs */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-2 font-mono">
              <span className="text-xs text-slate-500 uppercase">Active zk-X509 registries</span>
              <div className="text-3xl font-bold text-slate-200">{registries.length} registries</div>
              <p className="text-[10px] text-slate-500 leading-tight">
                Curated: {registries.filter(r => r.isStandard).length} &bull; Custom Operator: 1
              </p>
            </div>

          </div>

          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Active Governance Context</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              As the platform administrator, you command contract level functions of the ScatterDrop ecosystem. 
              Always maintain balanced creation fees to avoid sybil spikes while keeping campaign creation accessible.
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: CAMPAIGN FUNDS / FEE MATRICES (SECTION 4) */}
      {activeTab === 'FUNDS' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-400" />
                On-Chain Platform Fees Matrix (feeOf[token][type])
              </h3>
              <p className="text-xs text-slate-400 leading-normal">
                Configure standard deployment fee requirement amounts for tokens and campaign types. TON fees can be explicitly discounted to reward TON community adoption.
              </p>
            </div>

            {/* 2D Fee Matrix grid editor */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-500 border-b border-slate-800 text-[10px]">
                    <th className="p-4 uppercase">Payment Token</th>
                    <th className="p-4 uppercase">CSV / Merkle Fee</th>
                    <th className="p-4 uppercase">Snapshot Fee</th>
                    <th className="p-4 uppercase">Onchain Gated Fee</th>
                    <th className="p-4 uppercase">Social Task Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                  {feeInputs.map((feeRow) => (
                    <tr key={feeRow.tokenSymbol} className="hover:bg-slate-800/10">
                      <td className="p-4 font-bold text-slate-200 flex flex-col">
                        <span>{feeRow.tokenSymbol}</span>
                        {feeRow.tokenSymbol === 'TON' && <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest mt-0.5">Discount Token</span>}
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.01"
                          value={feeRow.csvFee}
                          onChange={(e) => handleUpdateFee(feeRow.tokenSymbol, 'csv', parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-800 p-1.5 rounded text-white font-semibold text-right focus:border-emerald-500 font-mono w-28 text-xs"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.01"
                          value={feeRow.snapshotFee}
                          onChange={(e) => handleUpdateFee(feeRow.tokenSymbol, 'snapshot', parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-800 p-1.5 rounded text-white font-semibold text-right focus:border-emerald-500 font-mono w-28 text-xs"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.01"
                          value={feeRow.gatedFee}
                          onChange={(e) => handleUpdateFee(feeRow.tokenSymbol, 'gated', parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-800 p-1.5 rounded text-white font-semibold text-right focus:border-emerald-500 font-mono w-28 text-xs"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.01"
                          value={feeRow.socialFee}
                          onChange={(e) => handleUpdateFee(feeRow.tokenSymbol, 'social', parseFloat(e.target.value) || 0)}
                          className="bg-slate-950 border border-slate-800 p-1.5 rounded text-white font-semibold text-right focus:border-emerald-500 font-mono w-28 text-xs"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleSaveFees}
              className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded text-xs transition flex items-center gap-1 cursor-pointer font-mono"
            >
              <Check className="w-3.5 h-3.5" /> Save Fees Configuration (setFee)
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: IDENTITY REGISTRIES */}
      {activeTab === 'IDENTITY' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Operator CA Gate Setup */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                <Key className="w-4 h-4 text-emerald-400" /> Global Operator CA Registry
              </h3>
              <p className="text-xs text-slate-400 leading-normal">
                Define the on-chain zk-X509 registry that operators must verify against before creating campaigns (`setOperatorRegistry`).
              </p>
            </div>

            <form onSubmit={handleUpdateOperatorRegistry} className="space-y-4">
              <div className="space-y-1.5 text-xs font-mono">
                <label className="text-slate-500">Registry Ethereum Address</label>
                <input
                  type="text"
                  value={operatorRegAddr}
                  onChange={(e) => setOperatorRegAddr(e.target.value)}
                  className="bg-slate-950 border border-slate-800 p-2.5 rounded w-full outline-none focus:border-slate-700 font-semibold"
                />
              </div>

              <button
                type="submit"
                className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-4 py-2 rounded text-xs transition cursor-pointer font-mono"
              >
                Update Operator Gate Address (setOperatorRegistry)
              </button>
            </form>
          </div>

          {/* Curated Customer Registries standard lists */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" /> Curate Standard Customer Registries
              </h3>
              <p className="text-xs text-slate-400 leading-normal">
                Curation lists standard national finance registries (e.g., Korea NPKI, e-Residency EE-eID) that are recommended to operators during wizard creation.
              </p>
            </div>

            {/* List Curated */}
            <div className="space-y-3">
              <span className="text-[10px] text-slate-500 font-mono">ACTIVE CURATED LISTS:</span>
              <div className="grid gap-2 text-xs">
                {registries.filter(r => r.isStandard && !r.isOperatorRegistry).map(r => (
                  <div key={r.address} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex justify-between items-center gap-4">
                    <div className="space-y-0.5 truncate">
                      <span className="font-semibold text-slate-200 block">{r.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono truncate block max-w-xs">{r.address}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveRegistry(r.address)}
                      className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded transition cursor-pointer shrink-0"
                      title="Remove Curation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add curation Form */}
            <form onSubmit={handleAddRegistry} className="bg-slate-950 p-4 border border-slate-800 rounded-lg space-y-3.5 text-xs font-mono">
              <span className="font-bold text-slate-300 block uppercase">Curate New Registry:</span>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-slate-500">Registry Name</span>
                  <input type="text" placeholder="EE-eID" value={newRegName} onChange={(e) => setNewRegName(e.target.value)} className="bg-slate-900 border border-slate-800 p-2 rounded outline-none w-full" required />
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500">Address 0x</span>
                  <input type="text" placeholder="0x..." value={newRegAddr} onChange={(e) => setNewRegAddr(e.target.value)} className="bg-slate-900 border border-slate-800 p-2 rounded outline-none w-full" required />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500">Description details</span>
                <input type="text" placeholder="Estonian eID digital registries curation" value={newRegDesc} onChange={(e) => setNewRegDesc(e.target.value)} className="bg-slate-900 border border-slate-800 p-2 rounded outline-none w-full" />
              </div>

              <button type="submit" className="bg-slate-100 hover:bg-white text-slate-950 font-bold py-2 px-3 rounded text-[11px] transition cursor-pointer">
                Curate Registry
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: TOKEN REGISTRAR (SECTION 4) */}
      {activeTab === 'TOKENS' && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-emerald-400" /> Global Airdrop Token Registry
            </h3>
            <p className="text-xs text-slate-400 leading-normal">
              Operators can add any token as allowed. Admins hold permissions to mark tokens as <strong>Official</strong> (curated first in picker lists) or remove malicious, phishing, or copycat tokens entirely (`removeAllowedToken`).
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-800 rounded-lg text-xs font-mono">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-950 text-slate-500 border-b border-slate-800 text-[10px]">
                  <th className="p-4">TOKEN</th>
                  <th className="p-4">SMART CONTRACT ADDRESS</th>
                  <th className="p-4">REGISTRATION STATUS</th>
                  <th className="p-4">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40 text-slate-300">
                {tokens.map((t) => (
                  <tr key={t.address} className="hover:bg-slate-800/10">
                    <td className="p-4 font-bold text-slate-200">
                      {t.symbol} <span className="text-[10px] text-slate-500 font-normal">({t.name})</span>
                    </td>
                    <td className="p-4 text-slate-400 select-all">{t.address}</td>
                    <td className="p-4">
                      {t.isOfficial ? (
                        <span className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-900/40">OFFICIAL</span>
                      ) : (
                        <span className="text-slate-500 bg-slate-950 px-2 py-0.5 rounded text-[10px]">COMMUNITY</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => handleToggleOfficial(t.address)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded text-[10px] transition cursor-pointer font-bold"
                        >
                          {t.isOfficial ? 'Demote' : 'Mark Official'}
                        </button>
                        
                        {!t.isOfficial && (
                          <button
                            onClick={() => handleRemoveToken(t.address)}
                            className="text-rose-500 hover:bg-rose-500/10 p-1.5 rounded transition cursor-pointer"
                            title="Remove Token"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: FEE VAULT WITHDRAWALS (SECTION 4) */}
      {activeTab === 'VAULT' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 font-sans">
          
          {/* Left: Balances breakdown */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6 font-mono">
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Vault Balances</h3>
              <p className="text-[10px] text-slate-500">Collected platform deployment fee assets.</p>
            </div>

            <div className="space-y-3.5 pt-2">
              {Object.entries(collectedFees).map(([sym, bal]) => (
                <div key={sym} className="bg-slate-950 border border-slate-800 p-4 rounded-lg flex justify-between items-baseline">
                  <span className="text-slate-400 font-bold">{sym} ACCRUED</span>
                  <div className="text-right">
                    <span className="text-xl font-bold text-slate-100">{bal.toLocaleString()}</span>
                    <span className="text-[10px] block text-slate-500">{sym} Available</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Withdraw terminal (Section 4: withdrawFees) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-400" /> Fee Vault Withdrawal Terminal (withdrawFees)
              </h3>
              <p className="text-xs text-slate-400 leading-normal">
                Disburse accrued campaign deployment fees from the smart contract vault to designated multisig or treasury vaults. Available only to contract owner.
              </p>
            </div>

            <form onSubmit={handleWithdraw} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500">Disbursement Token Asset</label>
                  <select
                    value={withdrawToken}
                    onChange={(e) => setWithdrawToken(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 p-2.5 rounded w-full outline-none"
                  >
                    {Object.keys(collectedFees).map(sym => (
                      <option key={sym} value={sym}>{sym} &bull; Available: {collectedFees[sym]}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500">Disbursement Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(parseFloat(e.target.value) || 0)}
                    className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none font-bold"
                    max={collectedFees[withdrawToken] || 0}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500">Destination Address (Multisig Vault) *</label>
                <input
                  type="text"
                  value={withdrawDest}
                  onChange={(e) => setWithdrawDest(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-slate-300 p-2.5 rounded w-full outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isWithdrawing || withdrawAmount <= 0}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 px-4 rounded-lg transition disabled:opacity-45 cursor-pointer font-mono"
              >
                {isWithdrawing ? 'Broadcasting withdrawal (withdrawFees)...' : `Withdraw ${withdrawAmount} ${withdrawToken} from Vault`}
              </button>
            </form>
          </div>

        </div>
      )}

      {/* TAB 6: GLOBAL CAMPAIGNS MONITOR */}
      {activeTab === 'CAMPAIGNS' && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Global Campaigns monitor</h3>
          
          <div className="grid gap-3 font-mono text-xs">
            {campaigns.map((c) => (
              <div key={c.id} className="bg-slate-950 border border-slate-800/80 p-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div className="space-y-1 truncate max-w-sm">
                  <span className="font-bold text-slate-200 block truncate">{c.name}</span>
                  <span className="text-[10px] text-slate-500 block truncate">Customer Registry: {c.customerRegistryAddress}</span>
                </div>
                
                <div className="flex gap-6 text-[11px] shrink-0">
                  <div className="space-y-0.5">
                    <span className="text-slate-600 block text-[9px]">TOTAL POOL</span>
                    <span className="text-slate-300 font-bold">{c.totalAmount.toLocaleString()} {c.tokenSymbol}</span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-600 block text-[9px]">CLAIMS COUNT</span>
                    <span className="text-slate-300 font-bold">{c.claimsCount} claims</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
