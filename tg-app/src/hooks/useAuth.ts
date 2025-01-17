import { useEffect, useState } from "react";
import {
  useAbstraxionAccount,
  useAbstraxionSigningClient,
} from "@burnt-labs/abstraxion";
import { useSearchParams } from "react-router-dom";

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  address: string;
  disconnect: (() => void) | null;
}

export function useAuth() {
  const [searchParams] = useSearchParams();
  const { data: account, isConnected } = useAbstraxionAccount();
  const { client, logout } = useAbstraxionSigningClient();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    address: "",
    disconnect: null,
  });

  useEffect(() => {
    const granted = searchParams.get("granted");
    const granter = searchParams.get("granter");
    console.log("granted", granted);
    const initAuth = async () => {
      if (isConnected && account.bech32Address) {
        try {
          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            address: account.bech32Address,
            disconnect: logout || null,
          });

          // Clean up URL parameters after successful auth
          if (granted && granter) {
            const newUrl = window.location.pathname;
            window.history.replaceState({}, "", newUrl);
          }
        } catch (error) {
          console.error("Error initializing auth:", error);
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            address: "",
            disconnect: null,
          });
        }
      } else {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          address: "",
          disconnect: null,
        });
      }
    };

    if (granted && granter) {
      initAuth();
    } else if (isConnected) {
      initAuth();
    } else {
      setAuthState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [isConnected, account.bech32Address, logout, searchParams]);

  return {
    ...authState,
    client,
  };
}
