// components/files/FileRow.tsx
import { Button } from "@/components/ui/button";
import { Copy, Download, File, FileText, Image as ImageIcon } from "lucide-react";
import { useFileTransfer } from "@/context/FileTransferContext";
import EncryptionBadge from "./EncryptionBadge";

import { FileItem } from "@/context/FileTransferContext";

interface Props {
  item: FileItem;
}

const getFileIcon = (type: string) => {
  if (type.startsWith("image")) return <ImageIcon size={18} />;
  if (type.includes("pdf")) return <FileText size={18} />;
  return <File size={18} />;
};

export default function FileRow({ item }: Props) {
  const { copyFileCid, downloadFile, copySuccess } = useFileTransfer();

  return (
    <div className="flex items-center justify-between p-2 bg-muted rounded-md border border-border hover:bg-accent/40 transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
        <div className="p-1 rounded bg-card text-primary border border-border hover:border-primary/20 hover:bg-accent/50 transition-colors flex-shrink-0">
          {getFileIcon(item.type)}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden font-medium text-sm font-mono truncate">
          <p className="truncate font-mono text-sm">
            {item.name}
          </p>
          <p className="text-xs text-muted-foreground truncate font-mono">
            {item.size.toFixed(2)} MB • {item.timestamp}
          </p>
          {item.fileId && (
            <p className="text-xs text-primary/70 font-mono truncate" title={item.fileId}>
              CID: {item.fileId.substring(0, 8)}...{item.fileId.substring(item.fileId.length - 6)}
            </p>
          )}
          {item.isEncrypted && <EncryptionBadge accessCondition={item.accessCondition} />}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => copyFileCid(item.id.toString())}
          className="h-7 w-7 p-0"
          disabled={!item.fileId}
        >
          {copySuccess === item.id.toString() ? <span className="text-green-500">✓</span> : <Copy size={14} />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => downloadFile(item.id.toString())}
          className="h-7 w-7 p-0"
          disabled={!item.fileId}
        >
          <Download size={14} />
        </Button>
      </div>
    </div>
  );
}
