import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { WalletProvider } from "@/context/wallet-context";
import { SettingsProvider } from "@/context/SettingsContext";
import { TacoProvider } from "@/context/TacoContext";
import { FileTransferProvider } from "@/context/FileTransferContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider defaultTheme="system">
      <SettingsProvider>
        <WalletProvider>
          <TacoProvider>
            <FileTransferProvider>
              <Component {...pageProps} />
              <Toaster richColors position="top-center" />
            </FileTransferProvider>
          </TacoProvider>
        </WalletProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
