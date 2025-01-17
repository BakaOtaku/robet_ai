export const formatTime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d:`);
  if (hours > 0) parts.push(`${hours}h:`);
  if (minutes > 0) parts.push(`${minutes}m:`);
  if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);

  return parts.join(" ");
};

export const TWITTER_HANDLE = "@robet_ai";

export const API_BASE_URL = "http://localhost:8080";

export const openTwitterLink = (url: string) => {
  const newWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (newWindow) newWindow.opener = null;
};

export const formatBalance = (amount: string, denom: string): string => {
  const value = parseInt(amount);
  if (denom === "XION") {
    return `${(value / 1_000_000).toFixed(2)} ${denom}`;
  }
  return `${value} ${denom}`;
};


export const CONTRACT_ADDRESS = "xion13vucjv0hu9srmseqygrdatuxqd8ek69xxx0pv2p6ntv54w3pqxgsmkl5nk";