// components/layout/TopBar.tsx
import { Github, Edit, Check, Copy, Waypoints } from "lucide-react";
import SettingsSheet from "@/components/settings/SettingsSheet";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/context/SettingsContext";
import { useFileTransfer } from "@/context/FileTransferContext";
import { cn } from "@/lib/utils";
import WakuStatusIndicatorDot from "@/components/waku/WakuStatusIndicatorDot";

export default function TopBar() {
  const [roomId, setRoomId] = useState("XYZ123");
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  const { wakuNodeType } = useSettings();
  const { isWakuConnected, wakuPeerCount } = useFileTransfer();
  
  // Only show client-side elements after component mounts to prevent hydration errors
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <header className="flex items-center justify-between p-4 border-b border-border w-full flex-wrap gap-3">
      {/* Logo section */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="p-1.5 rounded-md bg-primary/15 border border-primary/10">
          <Waypoints size={18} className="text-primary" />
        </div>
        <h1 className="font-mono text-lg tracking-tight">CypherShare</h1>
        <span className="hidden md:flex items-center h-5 px-2 rounded-full bg-muted/60 border border-border text-[10px] font-medium text-muted-foreground font-mono">alpha</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Room ID control - centered */}
        <div className="inline-flex items-center gap-2 border border-border rounded-md px-3 py-1.5 bg-card shadow-sm relative flex-shrink-0 flex-wrap">
          <span className="text-sm font-medium text-secondary-foreground whitespace-nowrap font-mono hidden md:inline">Room ID:</span>
          <div className="relative w-[80px] sm:w-[90px] md:w-[120px]">
            <Input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              disabled={!isEditing}
              className={cn("h-7 font-mono text-sm px-2", isEditing && "border-primary ring-1 ring-primary/30")}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(!isEditing)} className="h-7 w-7 p-0 hover:bg-accent"
              aria-label={isEditing ? "Save room ID" : "Edit room ID"}>
              {isEditing ? <Check size={14} className="text-primary" /> : <Edit size={14} />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 w-7 p-0 hover:bg-accent" aria-label="Copy room ID">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </Button>
          </div>
          {/* Waku status dot*/}
          {mounted && (
            <WakuStatusIndicatorDot />
          )}
          <div className="absolute inset-0 pointer-events-none opacity-10 bg-scanline" />
        </div>
        <a
          href="https://github.com/hackyguru/cyphershare"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2.5 rounded-full hover:bg-accent/80 transition-colors border border-primary/20 flex-shrink-0"
          aria-label="View on GitHub"
        >
          <Github size={20} className="text-primary" />
        </a>
        <WalletConnectButton className="h-8" />
        <SettingsSheet />
      </div>
    </header>
  );
}
