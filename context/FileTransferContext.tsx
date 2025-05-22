// /context/FileTransferContext.tsx
// Central provider for file transfer + encryption + Waku messaging logic.
// This code is largely extracted from the former pages/index.tsx monolithic component so we keep identical behaviour.

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useRef,
  useEffect,
} from "react";
import { toast } from "sonner";
import { useSettings } from "./SettingsContext";
import { useWallet } from "./wallet-context";
import { useTacoContext } from "./TacoContext";
import { useCodex } from "@/hooks/useCodex";
import useWaku, { WakuFileMessage } from "@/hooks/useWaku";
import { ethers } from "ethers";


//-----------------------------------------------------------------------------
// Types (mostly lifted from the old index.tsx)
//-----------------------------------------------------------------------------
export interface FileItem {
  id: number | string;
  name: string;
  size: number; // MB
  type: string;
  timestamp: string;
  fileId?: string;
  isEncrypted?: boolean;
  accessCondition?: string;
  isUploading?: boolean;
  progress?: number;
}

interface FileTransferContextType {
  // State
  sentFiles: FileItem[];
  receivedFiles: FileItem[];
  uploadingFiles: Record<
    string,
    {
      progress: number;
      name: string;
      size: number;
      type: string;
      timestamp?: string;
      isEncrypted?: boolean;
      accessCondition?: string;
    }
  >;
  uploadError: string | null;
  copySuccess: string | null;
  // Actions
  sendFiles: (files: File[]) => Promise<void>;
  copyFileCid: (fileId: string) => Promise<void>;
  downloadFile: (fileId: string) => Promise<void>;
  // TaCo status (forwarded from TacoContext)
  isTacoInit: boolean;
  // Waku status helpers
  wakuPeerCount: number;
  isWakuConnected: boolean;
  isWakuConnecting: boolean;
}

const FileTransferContext = createContext<FileTransferContextType | null>(null);
export const useFileTransfer = () => {
  const ctx = useContext(FileTransferContext);
  if (!ctx) throw new Error("useFileTransfer must be used within <FileTransferProvider>");
  return ctx;
};

//-----------------------------------------------------------------------------
// Provider implementation
//-----------------------------------------------------------------------------
interface Props {
  children: ReactNode;
}

export function FileTransferProvider({ children }: Props) {
  const { codexNodeUrl, codexEndpointType, wakuNodeUrl, wakuNodeType } = useSettings();
  const {
    provider,
    signer,
    walletConnected,
    connectWallet,
  } = useWallet();

  // Get TACo functionality from the TacoContext
  const {
    isTacoInit,
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
  } = useTacoContext();

  // Codex hook
  const {
    isNodeActive: isCodexNodeActive,
    isLoading: isCodexLoading,
    updateConfig: updateCodexConfig,
    checkNodeStatus: checkCodexStatus,
    error: codexError,
    getNodeInfo,
    getCodexClient,
    uploadFile: codexUploadFile,
    downloadFile: codexDownloadFile,
  } = useCodex(codexNodeUrl);

  // State mirrors
  const [sentFiles, setSentFiles] = useState<FileItem[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<FileItem[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, any>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // TACo settings are now managed by TacoContext

  // Waku hook (contentTopic depends on default room XYZ123)
  const {
    isConnecting: isWakuConnecting,
    isConnected: isWakuConnected,
    error: wakuError,
    sendFileMessage,
    peerCount: wakuPeerCount,
    contentTopic: wakuContentTopic,
  } = useWaku({
    roomId: "XYZ123",
    wakuNodeUrl,
    wakuNodeType: wakuNodeType as "light" | "relay",
    onFileReceived: (msg) => handleFileReceived(msg),
  });

  //-----------------------------------------------------------------------------
  // File receive handler (same logic as old)
  //-----------------------------------------------------------------------------
  const handleFileReceived = useCallback(
    (fileMessage: WakuFileMessage) => {
      const ourSenderId = sessionStorage.getItem("wakuSenderId");
      const isSentByUs = ourSenderId && fileMessage.sender === ourSenderId;
      if (isSentByUs) {
        return; // ignore our own
      }

      // Don’t double-add
      setReceivedFiles((prev) => {
        if (prev.some((f) => f.fileId === fileMessage.fileId)) return prev;
        const newItem: FileItem = {
          id: Date.now(),
          name: fileMessage.fileName,
          size: fileMessage.fileSize,
          type: fileMessage.fileType,
          timestamp: new Date(fileMessage.timestamp).toLocaleTimeString(),
          fileId: fileMessage.fileId,
          isEncrypted: fileMessage.isEncrypted,
          accessCondition: fileMessage.accessCondition,
        };
        return [newItem, ...prev];
      });
    },
    []
  );

  //-----------------------------------------------------------------------------
  // Send files (drop handler extracted)
  //-----------------------------------------------------------------------------
  const sendFiles = useCallback(
    async (files: File[]) => {
      if (!isCodexNodeActive) {
        setUploadError("Codex node is not active");
        toast.error("Codex node is not active. Cannot upload files.");
        return;
      }

      // If encryption is intended, ensure wallet is connected and TACo is ready.
      if (useEncryption) {
        if (!walletConnected) {
          toast.error("Encryption requested, but wallet is not connected. Please connect your wallet.");
          setUploadError("Wallet not connected for encryption.");
          return;
        }
        if (!signer) {
          toast.error("Encryption requested, but wallet signer is not available. Please reconnect your wallet.");
          setUploadError("Wallet signer not available for encryption.");
          return;
        }
        if (!isTacoInit) {
          toast.error("Encryption service (TACo) is not ready. Please try again in a moment.");
          setUploadError("Encryption service not ready.");
          return;
        }
      }

      for (const file of files) {
        const fileId = `upload-${Date.now()}-${file.name}`;
        setUploadingFiles((prev) => ({
          ...prev,
          [fileId]: {
            progress: 0,
            name: file.name,
            size: file.size / (1024 * 1024),
            type: file.type,
          },
        }));

        let uploadFileObj: File | Blob = file;
        let encrypted = false;
        let accessCond: any = undefined;

        if (useEncryption && walletConnected && signer && isTacoInit) {
          encrypted = true;
          // Prepare condition
          let accessCond;
          if (accessConditionType === "positive") {
            console.log("Creating positive balance condition...");
            accessCond = createPositiveBalanceCondition();
          } else if (accessConditionType === "time") {
            console.log("Creating time window condition...");
            const timeSeconds = parseInt(windowTimeSeconds) || 60; // default 60 seconds
            accessCond = await createTimeWindowCondition(timeSeconds);
          } else {
            throw new Error(`Unknown condition type: ${accessConditionType}`);
          }

          // Read file bytes
          const arrayBuff = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuff);
          const cipherBytes = await encryptDataToBytes(bytes, accessCond, signer);
          if (!cipherBytes) throw new Error("Encryption failed");

          uploadFileObj = new File([cipherBytes], `${file.name}.enc`, {
            type: "application/octet-stream",
          });
        }

        try {
          const res = await codexUploadFile(uploadFileObj as any, (progress) => {
            setUploadingFiles((prev) => ({
              ...prev,
              [fileId]: {
                ...(prev[fileId] || {}),
                progress,
              },
            }));
          });

          const newSentFile: FileItem = {
            id: fileId,
            name: file.name,
            size: file.size / (1024 * 1024),
            type: file.type,
            timestamp: new Date().toLocaleTimeString(),
            fileId: (res as any).id ?? undefined,
            isEncrypted: encrypted,
            accessCondition: encrypted ? accessConditionType : undefined,
          };
          setSentFiles((prev) => [newSentFile, ...prev]);
          // Notify others via Waku
          await sendFileMessage({
            fileName: newSentFile.name,
            fileSize: newSentFile.size,
            fileType: newSentFile.type,
            fileId: newSentFile.fileId!,
            isEncrypted: newSentFile.isEncrypted,
            accessCondition: newSentFile.accessCondition,
          });
        } catch (err) {
          setUploadError("Upload failed: " + (err instanceof Error ? err.message : ""));
        } finally {
          setUploadingFiles((prev) => {
            const { [fileId]: _removed, ...rest } = prev;
            return rest;
          });
        }
      }
    },
    [
      isCodexNodeActive,
      useEncryption,
      walletConnected,
      signer,
      isTacoInit,
      setUploadError,
      codexUploadFile,
      sendFileMessage,
      accessConditionType,
      createPositiveBalanceCondition,
      createTimeWindowCondition,
      windowTimeSeconds,
      encryptDataToBytes,
    ]
  );

  //-----------------------------------------------------------------------------
  // Copy & Download helpers (simplified)
  //-----------------------------------------------------------------------------
  const copyFileCid = useCallback(async (fid: string) => {
    const file = [...sentFiles, ...receivedFiles].find((f) => f.id.toString() === fid);
    if (!file || !file.fileId) return;
    try {
      await navigator.clipboard.writeText(file.fileId);
      setCopySuccess("CID copied");
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      setUploadError("Failed to copy CID");
    }
  }, [sentFiles, receivedFiles]);

  const downloadFile = useCallback(
    async (fid: string) => {
      console.log(`Starting download for file ID: ${fid}`);
      const file = [...sentFiles, ...receivedFiles].find((f) => f.id.toString() === fid);
      if (!file || !file.fileId) {
        setUploadError("File not found");
        console.error(`File not found for ID: ${fid}`);
        return;
      }

      console.log(`Processing download for: ${file.name} (encrypted: ${file.isEncrypted ? 'yes' : 'no'})`);
      
      try {
        setUploadError(null); // Clear any previous errors
        setCopySuccess(`Downloading ${file.name}...`);
        
        const res = await codexDownloadFile(file.fileId);
        if (!res.success || !res.data) {
          setUploadError(res.error || "Download failed");
          console.error(`Codex download failed:`, res.error);
          return;
        }

        let blob: Blob | null = null;

        // Handle encrypted files
        if (file.isEncrypted) {
          console.log(`Processing encrypted file with condition: ${file.accessCondition}`);
          
          // Ensure wallet is connected
          if (!walletConnected) {
            setUploadError("Wallet not connected – connect wallet to decrypt");
            console.error("Wallet not connected for decryption");
            return;
          }
          
          // Ensure signer is available
          if (!signer) {
            setUploadError("Wallet not providing signer – please reconnect");
            console.error("No signer available");
            return;
          }
          
          // Ensure TACo is initialized
          if (!isTacoInit) {
            setUploadError("TACo not initialized - please try again in a moment");
            console.error("TACo not initialized");
            return;
          }

          setCopySuccess(`Decrypting ${file.name}...`);
          const bytes = new Uint8Array(await res.data.arrayBuffer());
          
          try {
            console.log(`Starting decryption for ${file.name}...`);
            const plainBytes = await decryptDataFromBytes(bytes, signer);
            console.log(`Decryption complete, creating blob...`);
            
            if (!plainBytes) {
              throw new Error("Decryption returned empty result");
            }
            
            blob = new Blob([plainBytes], { type: file.type || "application/octet-stream" });
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            console.log(`Decryption error:`, errorMsg);
            
            // User-friendly error message
            let userMessage = "";
            if (errorMsg.includes("Threshold of responses not met") || errorMsg.includes("condition not satisfied")) {
              // Generate condition-specific error description
              let conditionDesc = "";
              if (file.accessCondition === "positive") {
                conditionDesc = "Your wallet must have a positive balance to access this file";
              } else if (file.accessCondition === "time") {
                conditionDesc = `This file is time-locked and can only be accessed within the specified time window`;
              } else {
                conditionDesc = `The file "${file.name}" requires specific conditions to be met for decryption`;
              }
              
              userMessage = "Access denied: TACo condition not satisfied";
              // Show toast notification for access denied
              toast.error(userMessage, {
                description: conditionDesc,
                duration: 10000
              });
            } else {
              userMessage = `Decryption failed: ${errorMsg}`;
              toast.error("Decryption failed", {
                description: errorMsg,
                duration: 10000
              });
            }
            
            setUploadError(userMessage);
            setCopySuccess(null);
            return;
          }
        } else {
          // Handle regular files
          blob = res.data as Blob;
        }

        console.log(`Creating download for ${file.name}...`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setCopySuccess(`Downloaded ${file.name} successfully`);
        setTimeout(() => setCopySuccess(null), 3000);
        console.log(`Download complete for ${file.name}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown download error";
        console.error(`Download error:`, errorMsg);
        setUploadError(errorMsg);
        setCopySuccess(null);
      }
    },
    [sentFiles, receivedFiles, codexDownloadFile, walletConnected, signer, isTacoInit, decryptDataFromBytes]
  );

  //-----------------------------------------------------------------------------
  // Provider value
  //-----------------------------------------------------------------------------
  const ctxValue: FileTransferContextType = {
    sentFiles,
    receivedFiles,
    uploadingFiles,
    uploadError,
    copySuccess,
    sendFiles,
    copyFileCid,
    downloadFile,
    isTacoInit,
    wakuPeerCount,
    isWakuConnected,
    isWakuConnecting,
  } as FileTransferContextType;

  return (
    <FileTransferContext.Provider value={ctxValue}>{children}</FileTransferContext.Provider>
  );
}
