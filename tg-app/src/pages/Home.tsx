import React, { useState, useEffect, forwardRef, useCallback } from "react";
import { Loader2, Copy, ChevronDown, ExternalLink } from "lucide-react";
import {
  Abstraxion,
  useAbstraxionSigningClient,
  useModal,
} from "@burnt-labs/abstraxion";
import { Button } from "@burnt-labs/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BetDetailModal } from "@/pages/components/BetDetailModal";
import type { Bet } from "@/types/bet";
import BetCard from "@/pages/components/Bet";
import { useAuth } from "@/hooks/useAuth";
import { CONTRACT_ADDRESS } from "@/utils";
import { useToast } from "@/hooks/use-toast";

const HomePage: React.FC = () => {
  const { isAuthenticated, address } = useAuth();
  const { client, logout } = useAbstraxionSigningClient();
  const [, setShow] = useModal();
  const [loading, setLoading] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);
  const [selectedBet, setSelectedBet] = useState<Bet | null>(null);
  const { toast } = useToast();

  const loadBets = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fetchedBets: Bet[] = [];
      let canFetchNext = true;
      for (let i = 1; canFetchNext; ++i) {
        try {
          const fetchedData = await client.queryContractSmart(
            CONTRACT_ADDRESS,
            {
              GetBet: {
                bet_id: i,
              },
            }
          );
          console.log(fetchedData);
          fetchedBets.push(fetchedData);
        } catch (error) {
          canFetchNext = false;
        }
      }
      console.log(fetchedBets);
      setBets(fetchedBets);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching bets:", error);
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadBets();
  }, [loadBets]);

  const handleBet = async (choice: "yes" | "no", amount: number) => {
    if (!client) {
      setShow(true);
      return;
    }
    // Implement bet logic here using the client
    console.log("Placing bet:", {
      choice,
      amount,
      betId: selectedBet?.id,
      address,
    });
    const amountFinal = amount * 1000000;

    try {
      const tx = await client.execute(
        address,
        CONTRACT_ADDRESS,
        {
          PlaceBet: {
            bet_id: parseInt(selectedBet?.id?.toString() || "0"),
            outcome: choice === "yes",
          },
        },
        "auto",
        undefined,
        [
          {
            denom: "uxion",
            amount: amountFinal.toString(),
          },
        ]
      );

      toast({
        title: "Bet placed successfully!",
        description: (
          <div className="flex flex-col gap-2">
            <p>Your bet has been placed successfully.</p>
            <a
              href={`https://explorer.burnt.com/xion-testnet-1/tx/${tx.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#5DB7C3] hover:underline flex items-center gap-1"
            >
              View on Explorer <ExternalLink size={14} />
            </a>
          </div>
        ),
      });

      loadBets();
    } catch (error) {
      console.error("Error executing bet transaction:", error);
      toast({
        variant: "destructive",
        title: "Error placing bet",
        description: "There was an error placing your bet. Please try again.",
      });
      throw error;
    }
  };

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      // You may want to add a toast notification here
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen text-white bg-[#0A1A2F]">
      {/* Navbar */}
      <div className="sticky top-0 z-10 bg-[#0A1A2F]/95 backdrop-blur-sm border-b border-[#2A3C61]">
        <div className="flex justify-between items-center py-4 px-4">
          <div className="flex gap-2 items-center">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 rounded-full" />
            <span className="text-lg font-bold text-[#FFFACD]">Robet AI</span>
          </div>
          <div className="flex gap-2">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <CustomButton>
                    <div className="flex items-center gap-2">
                      <span>
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                      </span>
                      <ChevronDown size={14} />
                    </div>
                  </CustomButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48 bg-[#192D56] border border-[#5DB7C3] text-[#FFFACD] rounded-md p-1">
                  <DropdownMenuItem
                    onClick={handleCopyAddress}
                    className="flex items-center gap-2 cursor-pointer text-sm rounded-sm px-2 py-2 hover:bg-[#5DB7C3] hover:text-[#192D56] focus:bg-[#5DB7C3] focus:text-[#192D56] transition-colors"
                  >
                    <Copy size={14} />
                    <span>Copy Address</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (logout) {
                        logout();
                      }
                    }}
                    className="flex items-center gap-2 cursor-pointer text-sm rounded-sm px-2 py-2 hover:bg-[#5DB7C3] hover:text-[#192D56] focus:bg-[#5DB7C3] focus:text-[#192D56] transition-colors"
                  >
                    <span>Disconnect</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                onClick={() => setShow(true)}
                className="!bg-[#192D56] hover:!bg-[#233B6B] !text-[#FFFACD] !border !border-[#5DB7C3] !font-normal"
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </div>

      {!isAuthenticated ? (
        // Compact welcome section
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-[#FFFACD] mb-4">
              Robet AI - Prediction Markets
            </h1>
            <p className="text-lg text-[#FFFACD] mb-6">
              Connect your wallet to start placing bets on various events using
              our AI-powered platform.
            </p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-[#192D56] rounded-lg">
                <h3 className="font-bold mb-1">Seamless Betting</h3>
                <p className="text-xs text-gray-300">
                  Easy participation in prediction markets
                </p>
              </div>
              <div className="p-3 bg-[#192D56] rounded-lg">
                <h3 className="font-bold mb-1">AI-Powered</h3>
                <p className="text-xs text-gray-300">
                  Quick and accurate resolutions
                </p>
              </div>
              <div className="p-3 bg-[#192D56] rounded-lg">
                <h3 className="font-bold mb-1">Decentralized</h3>
                <p className="text-xs text-gray-300">Built on XION chain</p>
              </div>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-[#5DB7C3]" />
          <p className="text-[#FFFACD]">Loading bets...</p>
        </div>
      ) : (
        <div className="flex-1 p-4">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-xl font-bold text-[#FFFACD] mb-4">
              Active Bets
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bets.map((bet) => (
                <div
                  key={bet.id}
                  onClick={() => setSelectedBet(bet)}
                  className="cursor-pointer"
                >
                  <BetCard bet={bet} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedBet && (
        <BetDetailModal
          bet={selectedBet}
          onClose={() => setSelectedBet(null)}
          onBet={handleBet}
        />
      )}
      <Abstraxion onClose={() => setShow(false)} />
    </div>
  );
};

export default HomePage;

// Add this custom button component
const CustomButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>((props, ref) => {
  return (
    <button
      ref={ref}
      {...props}
      className="!bg-[#192D56] hover:!bg-[#233B6B] !text-[#FFFACD] !border !border-[#5DB7C3] !font-normal px-4 py-2 rounded-md flex items-center gap-2 text-sm"
    >
      {props.children}
    </button>
  );
});
CustomButton.displayName = "CustomButton";
