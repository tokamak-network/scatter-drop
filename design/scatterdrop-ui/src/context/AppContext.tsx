import React, { createContext, useContext, useState, useEffect } from 'react';
import { Campaign, AllowedToken, Registry, FeeConfig, WalletState, Participant } from '../types';
import { INITIAL_CAMPAIGNS, INITIAL_FEES, INITIAL_REGISTRIES, INITIAL_TOKENS, INITIAL_PARTICIPANTS } from '../data';

interface AppContextType {
  wallet: WalletState;
  setWallet: React.Dispatch<React.SetStateAction<WalletState>>;
  campaigns: Campaign[];
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  registries: Registry[];
  setRegistries: React.Dispatch<React.SetStateAction<Registry[]>>;
  fees: FeeConfig[];
  setFees: React.Dispatch<React.SetStateAction<FeeConfig[]>>;
  tokens: AllowedToken[];
  setTokens: React.Dispatch<React.SetStateAction<AllowedToken[]>>;
  participants: Record<string, Participant[]>;
  setParticipants: React.Dispatch<React.SetStateAction<Record<string, Participant[]>>>;
  collectedFees: Record<string, number>;
  setCollectedFees: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  resetAll: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Try to load initial state from localStorage, otherwise use seeded data
  const [wallet, setWallet] = useState<WalletState>(() => {
    const saved = localStorage.getItem('sd_wallet');
    return saved ? JSON.parse(saved) : {
      address: '0xCustomer111111111111111111111111111111',
      isConnected: true,
      tokenBalances: {
        'ETH': 4.25,
        'TON': 350,
        'SDROP': 1200,
        'TOK': 150,
        'TMT': 0
      },
      nftCollection: ['Tokamak Early Access NFT #102'],
      isStaking: true
    };
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    const saved = localStorage.getItem('sd_campaigns');
    return saved ? JSON.parse(saved) : INITIAL_CAMPAIGNS;
  });

  const [registries, setRegistries] = useState<Registry[]>(() => {
    const saved = localStorage.getItem('sd_registries');
    return saved ? JSON.parse(saved) : INITIAL_REGISTRIES;
  });

  const [fees, setFees] = useState<FeeConfig[]>(() => {
    const saved = localStorage.getItem('sd_fees');
    return saved ? JSON.parse(saved) : INITIAL_FEES;
  });

  const [tokens, setTokens] = useState<AllowedToken[]>(() => {
    const saved = localStorage.getItem('sd_tokens');
    return saved ? JSON.parse(saved) : INITIAL_TOKENS;
  });

  const [participants, setParticipants] = useState<Record<string, Participant[]>>(() => {
    const saved = localStorage.getItem('sd_participants');
    return saved ? JSON.parse(saved) : INITIAL_PARTICIPANTS;
  });

  const [collectedFees, setCollectedFees] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('sd_collected_fees');
    return saved ? JSON.parse(saved) : {
      'ETH': 0.15,
      'TON': 120,
      'SDROP': 1100
    };
  });

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem('sd_wallet', JSON.stringify(wallet));
  }, [wallet]);

  useEffect(() => {
    localStorage.setItem('sd_campaigns', JSON.stringify(campaigns));
  }, [campaigns]);

  useEffect(() => {
    localStorage.setItem('sd_registries', JSON.stringify(registries));
  }, [registries]);

  useEffect(() => {
    localStorage.setItem('sd_fees', JSON.stringify(fees));
  }, [fees]);

  useEffect(() => {
    localStorage.setItem('sd_tokens', JSON.stringify(tokens));
  }, [tokens]);

  useEffect(() => {
    localStorage.setItem('sd_participants', JSON.stringify(participants));
  }, [participants]);

  useEffect(() => {
    localStorage.setItem('sd_collected_fees', JSON.stringify(collectedFees));
  }, [collectedFees]);

  const resetAll = () => {
    localStorage.removeItem('sd_wallet');
    localStorage.removeItem('sd_campaigns');
    localStorage.removeItem('sd_registries');
    localStorage.removeItem('sd_fees');
    localStorage.removeItem('sd_tokens');
    localStorage.removeItem('sd_participants');
    localStorage.removeItem('sd_collected_fees');
    
    // Hard refresh/reset state
    window.location.reload();
  };

  return (
    <AppContext.Provider value={{
      wallet,
      setWallet,
      campaigns,
      setCampaigns,
      registries,
      setRegistries,
      fees,
      setFees,
      tokens,
      setTokens,
      participants,
      setParticipants,
      collectedFees,
      setCollectedFees,
      resetAll
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
