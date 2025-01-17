import React from "react";
import { X, Loader2 } from "lucide-react";
import type { Bet } from "@/types/bet";
import { formatTime } from "@/utils";

interface BetDetailModalProps {
  bet: Bet;
  onClose: () => void;
  onBet: (choice: "yes" | "no", amount: number) => Promise<void>;
}

export const BetDetailModal: React.FC<BetDetailModalProps> = ({ bet, onClose, onBet }) => {
  const [amount, setAmount] = React.useState<number>(0.1);
  const [loading, setLoading] = React.useState(false);
  const timeLeft = Math.max(0, Math.floor((bet.end_time - Date.now()) / 1000));

  const handleBet = async (choice: "yes" | "no") => {
    setLoading(true);
    try {
      await onBet(choice, amount);
    } catch (error) {
      console.error("Error placing bet:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 font-playpen">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <div className="absolute inset-0 overflow-y-auto py-8">
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-[#192D56] rounded-xl shadow-xl animate-scale-up">
            <div className="sticky top-0 z-10 bg-[#192D56]/95 backdrop-blur-sm border-b border-[#2A3C61] p-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#FFFACD]">{bet.description}</h2>
                <button onClick={onClose} className="p-1 hover:bg-[#2A3C61] rounded-full transition-colors">
                  <X size={20} className="text-[#FFFACD]" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-gray-300">{bet.description}</p>
              
              <div className="flex justify-between items-center text-sm">
                <span>Time Remaining:</span>
                <span className="text-[#FFFACD]">{formatTime(timeLeft)}</span>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between">
                  <div className="text-green-400">
                    <div className="text-sm">Yes Pool</div>
                    <div className="font-bold">{bet.total_yes} XION</div>
                  </div>
                  <div className="text-red-400">
                    <div className="text-sm">No Pool</div>
                    <div className="font-bold">{bet.total_no} XION</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm">Bet Amount (XION)</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    min={0.1}
                    step={0.1}
                    className="w-full bg-[#2A3C61] rounded p-2 text-white"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => handleBet("yes")}
                    disabled={loading}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 font-bold disabled:opacity-50 relative"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      "Bet Yes"
                    )}
                  </button>
                  <button
                    onClick={() => handleBet("no")}
                    disabled={loading}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 font-bold disabled:opacity-50 relative"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      "Bet No"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 