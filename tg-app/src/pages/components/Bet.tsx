import { Clock, Check } from "lucide-react";
import { formatTime } from "@/utils";
import type { Bet } from "@/types/bet";

const BetCard: React.FC<{ bet: Bet }> = ({ bet }) => {
  const timeLeft = Math.max(0, Math.floor((bet.end_time - Date.now()/1000)));

  return (
    <div className="bg-[#192D56] rounded-xl p-4 space-y-3 hover:bg-[#1E3466] transition-colors">
      <div className="flex justify-between items-start">
        <h3 className="text-lg font-bold text-[#FFFACD] flex-1">
          {bet.description}
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <Clock size={14} />
          <span>{formatTime(timeLeft)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-300">{bet.description}</p>

      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <div className="text-green-400">
            <div className="text-xs">Yes</div>
            <div className="font-bold">{(bet.total_yes / 1000000).toFixed(3)} XION</div>
          </div>
          <div className="text-red-400">
            <div className="text-xs">No</div>
            <div className="font-bold">{(bet.total_no / 1000000).toFixed(3)} XION</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {bet.resolved === true ? (
            <span className="bg-gray-600 px-2 py-1 rounded text-xs flex items-center gap-1">
              <Check size={12} /> Resolved
            </span>
          ) : (
            <span className="bg-green-600 px-2 py-1 rounded text-xs flex items-center gap-1">
              <Check size={12} /> Active
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default BetCard;
