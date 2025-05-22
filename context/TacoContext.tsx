// context/TacoContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from "react";
import { toast } from "sonner";
import { useWallet } from "./wallet-context";
import useTaco from "@/hooks/useTaco";
import { domains, conditions } from "@nucypher/taco";
import { ethers } from "ethers";

//-----------------------------------------------------------------------------
// Types
//-----------------------------------------------------------------------------
interface TacoContextType {
  // Initialization status
  isTacoInit: boolean;
  networkError: string | null;
  
  // Core encryption/decryption functions
  encryptDataToBytes: (
    data: string | Uint8Array,
    condition: conditions.condition.Condition,
    encryptorSigner: ethers.Signer
  ) => Promise<Uint8Array | undefined>;
  
  decryptDataFromBytes: (
    encryptedBytes: Uint8Array,
    signer: ethers.Signer
  ) => Promise<Uint8Array>;
  
  // Condition creation helpers
  createPositiveBalanceCondition: () => conditions.condition.Condition;
  createTimeWindowCondition: (timeWindowInSeconds: number) => Promise<conditions.condition.Condition>;
  
  // Encryption settings
  useEncryption: boolean;
  setUseEncryption: (val: boolean) => void;
  accessConditionType: "positive" | "time";
  setAccessConditionType: (val: "positive" | "time") => void;
  windowTimeSeconds: string;
  setWindowTimeSeconds: (val: string) => void;
  
  // Configuration
  ritualId: number;
  domain: string;
}

const TacoContext = createContext<TacoContextType | null>(null);

export const useTacoContext = () => {
  const ctx = useContext(TacoContext);
  if (!ctx) throw new Error("useTacoContext must be used within <TacoProvider>");
  return ctx;
};

//-----------------------------------------------------------------------------
// Provider implementation
//-----------------------------------------------------------------------------
interface Props {
  children: ReactNode;
}

export function TacoProvider({ children }: Props) {
  const {
    provider,
    walletConnected,
  } = useWallet();

  // TACo initialization settings
  const ritualId = 6;
  const domain = domains.TESTNET;
  
  // Encryption settings
  const [useEncryption, setUseEncryption] = useState(false);
  const [accessConditionType, setAccessConditionType] = useState<"positive" | "time">("positive");
  const [windowTimeSeconds, setWindowTimeSeconds] = useState("60");

  // TACo hook
  const {
    isInit: isTacoInit,
    networkError,
    encryptDataToBytes,
    decryptDataFromBytes,
    createConditions,
  } = useTaco({
    provider: provider as ethers.providers.Provider | undefined,
    domain,
    ritualId,
  });

  // Helper to create a positive balance condition
  const createPositiveBalanceCondition = useCallback(() => {
    if (networkError) throw new Error(networkError);
    return createConditions.positiveBalance();
  }, [createConditions, networkError]);

  // Helper to create a time window condition
  const createTimeWindowCondition = useCallback(
    async (timeWindowInSeconds: number) => {
      if (networkError) throw new Error(networkError);
      return await createConditions.withinNumberOfSeconds(timeWindowInSeconds);
    },
    [createConditions, networkError]
  );

  // Log initialization status for debugging
  useEffect(() => {
    console.log("TACo initialization status:", {
      isTacoInit,
      networkError,
      walletConnected,
    });
  }, [isTacoInit, networkError, walletConnected]);

  // Context value
  const contextValue: TacoContextType = {
    isTacoInit,
    networkError,
    encryptDataToBytes,
    decryptDataFromBytes,
    createPositiveBalanceCondition,
    createTimeWindowCondition,
    useEncryption,
    setUseEncryption,
    accessConditionType,
    setAccessConditionType,
    windowTimeSeconds,
    setWindowTimeSeconds,
    ritualId,
    domain: domain.toString(),
  };

  return (
    <TacoContext.Provider value={contextValue}>{children}</TacoContext.Provider>
  );
}
