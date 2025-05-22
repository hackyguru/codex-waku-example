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

  // Validate network and initialize TACo
  useEffect(() => {
    const init = async () => {
      if (!provider) return;

      try {
        const network = await provider.getNetwork();
        console.log("Connected to network:", network);

        if (!SUPPORTED_CHAIN_IDS.includes(network.chainId)) {
          const error = `Network not supported. Please connect to Polygon Mumbai (80001) or Amoy (80002) testnet. Current network: ${network.chainId}`;
          console.error(error);
          setNetworkError(error);
          return;
        }

        setNetworkError(null);
        await initialize();
        setIsInit(true);
      } catch (error) {
        console.error("Error initializing TACo:", error);
        setNetworkError(
          error instanceof Error
            ? error.message
            : "Unknown error initializing TACo"
        );
      }
    };

    init();
  }, [provider]);

  /**
   * Decrypt ciphertext returned as raw bytes (Uint8Array)
   */
  const decryptDataFromBytes = async (
    encryptedBytes: Uint8Array,
    signer: ethers.Signer
  ) => {
    console.log("Decrypting data...");
    if (!isInit) {
      throw new Error("TACo not initialized - please try again in a moment");
    }
    if (!provider) {
      throw new Error(
        "Provider not available - please check wallet connection"
      );
    }
    if (networkError) {
      throw new Error(networkError);
    }

    try {
      const messageKit = ThresholdMessageKit.fromBytes(encryptedBytes);
      const authProvider = new EIP4361AuthProvider(provider, signer);
      const conditionContext =
        conditions.context.ConditionContext.fromMessageKit(messageKit);
      conditionContext.addAuthProvider(
        USER_ADDRESS_PARAM_DEFAULT,
        authProvider
      );

      console.log("Decrypting data...", messageKit, conditionContext);
      const result = await decrypt(
        provider,
        domain,
        messageKit,
        conditionContext
      );
      if (!result) {
        throw new Error("Decryption returned empty result");
      }
      return result;
    } catch (error) {
      console.log("Decryption error:", error);

      // Format standard error for TACo decryption failures
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isTacoConditionFailure = errorMessage.includes(
        "Threshold of responses not met"
      );

      throw new Error(
        isTacoConditionFailure
          ? "Access denied: TACo condition not satisfied"
          : `Decryption failed: ${errorMessage}`
      );
    }
  };

  /**
   * Encrypt arbitrary data (string or bytes) under a single access condition.
   * Returns the ciphertext as raw bytes (Uint8Array) that can be uploaded to Codex.
   */
  const encryptDataToBytes = useCallback(
    async (
      data: string | Uint8Array,
      condition: conditions.condition.Condition,
      encryptorSigner: ethers.Signer
    ) => {
      console.log("Encrypting data...");
      if (!isInit || !provider) return;
      if (networkError) throw new Error(networkError);

      try {
        const messageKit = await encrypt(
          provider,
          domain,
          data,
          condition,
          ritualId,
          encryptorSigner
        );

        console.log("Data has been encrypted...");

        return messageKit.toBytes();
      } catch (error) {
        console.error("Error encrypting data:", error);
        throw error;
      }
    },
    [isInit, provider, domain, ritualId, networkError]
  );

  /**
   * Helpers to create common access conditions
   */
  const createConditions = {
    positiveBalance: () => {
      console.log("Creating positive balance condition...");
      if (networkError) throw new Error(networkError);

      return new conditions.base.rpc.RpcCondition({
        chain: 80002, // Polygon Amoy testnet
        method: "eth_getBalance",
        parameters: [":userAddress", "latest"],
        returnValueTest: {
          comparator: ">",
          value: 0,
        },
      });
    },

    // Condition for time-limited access based on seconds from now
    withinNumberOfSeconds: async (timeWindowInSeconds: number) => {
      console.log("Creating time condition...");
      if (networkError) throw new Error(networkError);

      if (!provider) throw new Error("Provider not available");

      const network = await provider.getNetwork();

      // Get current timestamp in seconds
      const currentTimestamp = Math.floor(Date.now() / 1000);
      // Calculate future timestamp
      const expirationTimestamp = currentTimestamp + timeWindowInSeconds;

      console.log("Network:", network);
      console.log("Current timestamp:", currentTimestamp);
      console.log("Time window (seconds):", timeWindowInSeconds);
      console.log("Expiration timestamp:", expirationTimestamp);

      return new conditions.base.time.TimeCondition({
        chain: network.chainId,
        method: "blocktime",
        returnValueTest: {
          comparator: "<=",
          value: expirationTimestamp,
        },
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
