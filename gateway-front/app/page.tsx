"use client";

import { Suspense, useState } from "react";
import { ethers } from "ethers";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

// --------------------------------------------------
// FIX: Adiciona ethereum ao tipo Window (TS build fix)
// --------------------------------------------------
declare global {
  interface Window {
    ethereum?: any;
  }
}

// --------------------------------------------------
// ERC20 ABI
// --------------------------------------------------
const ERC20_ABI = [
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 value) returns (bool)"
];

// --------------------------------------------------
// Import dinâmico para o Polkadot Extension
// --------------------------------------------------
let web3Enable: any = null;
let web3Accounts: any = null;
let web3FromAddress: any = null;

async function loadPolkadotExtension() {
  if (typeof window === "undefined") return;

  if (!web3Enable) {
    const mod = await import("@polkadot/extension-dapp");
    web3Enable = mod.web3Enable;
    web3Accounts = mod.web3Accounts;
    web3FromAddress = mod.web3FromAddress;
  }
}

// --------------------------------------------------
// Redes
// --------------------------------------------------
type NetworkKey = "polkadot" | "bsc" | "arbitrum" | "polygon";
type TokenKey = "USDT" | "USDC";

const NETWORKS: Record<
  NetworkKey,
  {
    name: string;
    type: "substrate" | "evm";
    chainId?: string;
    rpc: string;
    tokens: Record<TokenKey, any>;
  }
> = {
  polkadot: {
    name: "Polkadot",
    type: "substrate",
    rpc: "wss://rpc.polkadot.io",
    tokens: {
      USDT: { assetId: 1984 },
      USDC: { assetId: 1337 }
    }
  },
  bsc: {
    name: "BNB Chain",
    type: "evm",
    chainId: "0x38",
    rpc: "https://bsc-dataseed.binance.org/",
    tokens: {
      USDT: "0x55d398326f99059fF775485246999027B3197955",
      USDC: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d"
    }
  },
  arbitrum: {
    name: "Arbitrum",
    type: "evm",
    chainId: "0xa4b1",
    rpc: "https://arb1.arbitrum.io/rpc",
    tokens: {
      USDT: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      USDC: "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
    }
  },
  polygon: {
    name: "Polygon",
    type: "evm",
    chainId: "0x89",
    rpc: "https://polygon-rpc.com",
    tokens: {
      USDT: "0x3813e82e6f7098b9583FC0F33a962D02018B6803",
      USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
    }
  }
};

// --------------------------------------------------
// Recipients
// --------------------------------------------------
const FIXED_RECEIVER_POLKADOT =
  "1YuVjps3qUA5FAqLpi6NxCekMpEHvHuPjqafdp7dVZSGC15";

const FIXED_RECEIVER_EVM =
  "0xed14922507cee9938faaf2958d577a2aeea9c4e7";

// --------------------------------------------------
// Detect MetaMask
// --------------------------------------------------
function getEthereum() {
  if (typeof window === "undefined") return null;

  const eth = window.ethereum;
  if (!eth) return null;

  if (eth.isMetaMask) return eth;

  if (Array.isArray(eth.providers)) {
    return eth.providers.find((p: any) => p.isMetaMask) || eth.providers[0];
  }

  return eth;
}

// --------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------
const Gateway = () => {
  const [status, setStatus] = useState<string | null>(null);

  const [walletAddressEVM, setWalletAddressEVM] = useState<string | null>(null);
  const [walletAddressDOT, setWalletAddressDOT] = useState<string | null>(null);

  const [dotApi, setDotApi] = useState<ApiPromise | null>(null);

  const DOT_DECIMALS = 6;

  const [network, setNetwork] = useState<NetworkKey>("polkadot");
  const [token, setToken] = useState<TokenKey>("USDT");
  const [amount, setAmount] = useState<string>("");

  const isEvm = NETWORKS[network].type === "evm";

  // --------------------------------------------------
  // Conexão EVM
  // --------------------------------------------------
  const connectEvmWallet = async () => {
    try {
      const eth = getEthereum();
      if (!eth) return setStatus("MetaMask not detected.");

      const provider = new ethers.BrowserProvider(eth);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();

      setWalletAddressEVM(await signer.getAddress());
      setStatus("EVM wallet connected!");
    } catch (e) {
      setStatus("EVM connection failed.");
    }
  };

  // --------------------------------------------------
  // Conexão Polkadot
  // --------------------------------------------------
  const connectDotWallet = async () => {
    try {
      await loadPolkadotExtension();

      const extensions = await web3Enable("Gateway");
      if (!extensions.length) return setStatus("Polkadot extension missing.");

      const accounts = await web3Accounts();
      if (!accounts.length) return setStatus("No Polkadot accounts.");

      setWalletAddressDOT(accounts[0].address);

      const api = await ApiPromise.create({
        provider: new WsProvider(NETWORKS.polkadot.rpc),
      });

      setDotApi(api);
      setStatus("Polkadot wallet connected!");
    } catch (e) {
      setStatus("Polkadot connection error.");
    }
  };

  const handleConnect = async () => {
    if (isEvm) return connectEvmWallet();
    return connectDotWallet();
  };

  // --------------------------------------------------
  // Send ERC20 (EVM)
  // --------------------------------------------------
  const sendEvmTransfer = async () => {
    try {
      const eth = getEthereum();
      if (!eth) return setStatus("MetaMask required.");

      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();

      const tokenAddress = NETWORKS[network].tokens[token];
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      const decimals = await contract.decimals();
      const amountWei = ethers.parseUnits(amount.replace(",", "."), decimals);

      const tx = await contract.transfer(FIXED_RECEIVER_EVM, amountWei);

      setStatus("Tx sent: " + tx.hash);
    } catch (e) {
      setStatus("EVM transfer failed.");
    }
  };

  // --------------------------------------------------
  // Send Polkadot
  // --------------------------------------------------
  const sendDotTransfer = async () => {
    try {
      if (!walletAddressDOT) return setStatus("Connect Polkadot wallet.");
      if (!dotApi) return setStatus("API not ready.");

      const injector = await web3FromAddress(walletAddressDOT);

      const float = parseFloat(amount.replace(",", "."));
      const value = BigInt(float * 10 ** DOT_DECIMALS);

      const assetId = NETWORKS.polkadot.tokens[token].assetId;

      const tx = dotApi.tx.assets.transfer(
        assetId,
        FIXED_RECEIVER_POLKADOT,
        value
      );

      const unsub = await tx.signAndSend(
        walletAddressDOT,
        { signer: injector.signer },
        (result) => {
          if (result.isInBlock) {
            setStatus("Polkadot transfer confirmed!");
            unsub();
          }
        }
      );
    } catch (e) {
      setStatus("Polkadot transfer failed.");
    }
  };

  const handleSend = async () => {
    if (!amount) return setStatus("Enter amount.");

    if (isEvm) return sendEvmTransfer();
    return sendDotTransfer();
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <img src="/nativefi.svg" alt="Logo" className="h-12 mx-auto" />
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Network */}
          <div>
            <Label>Network</Label>
            <Select
              value={network}
              onChange={(e) => setNetwork(e.target.value as NetworkKey)}
            >
              {Object.keys(NETWORKS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </div>

          {/* Token */}
          <div>
            <Label>Token</Label>
            <Select
              value={token}
              onChange={(e) => setToken(e.target.value as TokenKey)}
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </Select>
          </div>

          {/* Amount */}
          <div>
            <Label>Amount</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          {/* Receiver */}
          <div>
            <Label>Receiver</Label>
            <div className="p-3 bg-muted rounded font-mono text-sm break-all">
              {isEvm ? FIXED_RECEIVER_EVM : FIXED_RECEIVER_POLKADOT}
            </div>
          </div>

          {/* Connect */}
          {!walletAddressDOT && !walletAddressEVM && (
            <Button className="w-full" onClick={handleConnect}>Connect Wallet</Button>
          )}

          {(walletAddressDOT || walletAddressEVM) && (
            <Button className="w-full" onClick={handleSend}>Confirm Transaction</Button>
          )}

          {/* Status */}
          {status && (
            <div className="p-4 bg-muted border rounded text-sm">{status}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// --------------------------------------------------
// Suspense Wrapper
// --------------------------------------------------
export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Gateway />
    </Suspense>
  );
}
