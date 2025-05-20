import {
  conditions,
  decrypt,
  Domain,
  encrypt,
  initialize,
  ThresholdMessageKit,
} from "@nucypher/taco";
import {
  EIP4361AuthProvider,
  USER_ADDRESS_PARAM_DEFAULT,
} from "@nucypher/taco-auth";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";

interface UseTacoParams {
  ritualId: number;
  domain: Domain;
  provider: ethers.providers.Provider | undefined;
}

const SUPPORTED_CHAIN_IDS = [80001, 80002]; // Mumbai and Amoy testnets

export default function useTaco({ ritualId, domain, provider }: UseTacoParams) {
  const [isInit, setIsInit] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!provider) {
        console.log("useTaco: Provider not available for TACo initialization.");
        return;
      }
      try {
        const network = await provider.getNetwork();
        console.log('useTaco: Connected to network for TACo init:', network);
        if (!SUPPORTED_CHAIN_IDS.includes(network.chainId)) {
          const error = `Network not supported for TACo initialization. Please connect to Polygon Mumbai (80001) or Amoy (80002) testnet. Current network: ${network.chainId}`;
          console.error('useTaco:', error);
          setNetworkError(error);
          return;
        }
        setNetworkError(null);
        await initialize();
        setIsInit(true);
        console.log('useTaco: TACo initialized successfully.');
      } catch (error) {
        console.error('useTaco: Error initializing TACo:', error);
        setNetworkError(error instanceof Error ? error.message : 'Unknown error initializing TACo');
      }
    };
    init();
  }, [provider]);

  const decryptDataFromBytes = async (
    encryptedBytes: Uint8Array,
    signer: ethers.Signer
  ) => {
    console.log("useTaco: Attempting to decrypt data...");
    if (!isInit || !provider) {
        console.error("useTaco: Decryption pre-check failed:", { isInit, providerExists: !!provider });
        if (networkError && !isInit) { 
          throw new Error(`Cannot decrypt: ${networkError}`);
        } else if (!isInit) {
          throw new Error("TACo library not initialized. Cannot decrypt.");
        } else { 
          throw new Error("Web3 provider not available. Cannot decrypt.");
        }
    }
    if (networkError) {
      console.warn(`useTaco: Continuing decryption attempt despite network error state: ${networkError}. Ensure your wallet can satisfy conditions on their respective chains.`);
    }

    const messageKit = ThresholdMessageKit.fromBytes(encryptedBytes);
    if (!provider) throw new Error("Provider became unavailable for EIP4361AuthProvider.");

    const authProvider = new EIP4361AuthProvider(provider, signer);
    const conditionContext =
      conditions.context.ConditionContext.fromMessageKit(messageKit);
    conditionContext.addAuthProvider(USER_ADDRESS_PARAM_DEFAULT, authProvider);

    console.log("useTaco: Decrypting with (messageKit, conditionContext):", messageKit, conditionContext);
    return await decrypt(provider, domain, messageKit, conditionContext);
  };

  const encryptDataToBytes = useCallback(
    async (
      data: string | Uint8Array,
      condition: conditions.condition.Condition, 
      encryptorSigner: ethers.Signer
    ) => {
      console.log("useTaco: Attempting to encrypt data...");
      if (!isInit || !provider) {
        console.error("useTaco: Encryption pre-check failed:", { isInit, providerExists: !!provider });
        if (networkError && !isInit) throw new Error(`Cannot encrypt: ${networkError}`);
        throw new Error("TACo not initialized or provider not available for encryption.");
      }
      try {
         if (!provider) throw new Error("Provider became unavailable for encrypt.");
        const messageKit = await encrypt(
          provider, 
          domain,
          data,
          condition, 
          ritualId,
          encryptorSigner
        );
        console.log("useTaco: Data has been encrypted successfully.");
        return messageKit.toBytes();
      } catch (error) {
        console.error("useTaco: Error during TACo encryption:", error);
        throw error;
      }
    },
    [isInit, provider, domain, ritualId, networkError] 
  );

  const createConditions = {
    positiveBalance: () => {
      console.log("useTaco: Creating positive balance condition...");
      if (networkError && !isInit) throw new Error(`Cannot create condition: ${networkError}`);
      return new conditions.base.rpc.RpcCondition({
        chain: 80002, 
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">",
          value: 0,
        },
      });
    },

    withinNumberOfSeconds: async (timeWindowInSeconds: number) => {
      console.log("useTaco: Creating time condition...");
      if (networkError && !isInit) throw new Error(`Cannot create condition: ${networkError}`);
      if (!provider) throw new Error("Provider not available for determining current network for time condition.");
      const network = await provider.getNetwork();
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expirationTimestamp = currentTimestamp + timeWindowInSeconds;
      console.log('useTaco: Time condition details:', { 
        currentNetworkChainId: network.chainId, 
        currentTimestamp, 
        timeWindowInSeconds, 
        expirationTimestamp 
      });
      return new conditions.base.time.TimeCondition({
        chain: network.chainId, 
        method: "blocktime",
        returnValueTest: {
          comparator: "<=",
          value: expirationTimestamp,
        },
      });
    },

    // MODIFIED: Function now accepts parameters for contractAddress and minimumBalance
    isAmoyNFTOwner: (nftContractAddress: string, minimumBalance: number = 1) => {
      console.log(`useTaco: Creating Amoy NFT ownership condition for contract: ${nftContractAddress}, min balance: ${minimumBalance}`);
      if (networkError && !isInit) throw new Error(`Cannot create condition: ${networkError}`);

      // Validate the provided address format (basic check, ethers.utils.getAddress will do more)
      if (!ethers.utils.isAddress(nftContractAddress)) {
        throw new Error(`Invalid NFT contract address provided: ${nftContractAddress}`);
      }

      const checksummedContractAddress = ethers.utils.getAddress(nftContractAddress);
      console.log("useTaco: Amoy NFT contract (checksummed for SDK):", checksummedContractAddress);

      // Note: The try-catch for JS SDK constructor for checksum vs lowercase might still be relevant
      // if the SDK is very particular. For now, we'll assume ethers.utils.getAddress() output is fine.
      // If you get "Invalid Ethereum address" from the JS SDK during encryption, re-introduce the try-catch.
      return new conditions.base.contract.ContractCondition({
        chain: 80002, // Polygon Amoy testnet
        contractAddress: checksummedContractAddress, 
        method: "balanceOf",
        parameters: [":userAddress"],
        returnValueTest: {
          comparator: ">=",
          value: minimumBalance, 
        },
        standardContractType: "ERC721",
      });
    },
  };

  return {
    isInit,
    networkError,
    encryptDataToBytes,
    decryptDataFromBytes,
    createConditions,
  };
}
