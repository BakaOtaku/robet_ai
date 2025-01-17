import { useWebApp } from "@vkruglikov/react-telegram-web-app";

// Auth hook
export function useTelegramAuth() {
  const WebApp = useWebApp();

  const getAuthHeaders = () => {
    const initData = WebApp.initData;

    // Log the init data for debugging
    console.log("Sending init data:", {
      raw: initData,
      parsed: Object.fromEntries(new URLSearchParams(initData).entries()),
    });

    return {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    };
  };

  // Include authenticated fetch in the hook
  const authenticatedFetch = async (
    endpoint: string,
    options: RequestInit = {}
  ) => {
    const headers = getAuthHeaders();

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers: {
          ...headers,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Request failed:", errorData);
        throw new Error(errorData.error || "Request failed");
      }

      return await response.json();
    } catch (error) {
      console.error("Request error:", error);
      throw error;
    }
  };

  // Return both the headers utility and the authenticated fetch
  return {
    getAuthHeaders,
    authenticatedFetch,
  };
}

// Example usage in a component:
/*
function YourComponent() {
  const { authenticatedFetch } = useTelegramAuth();

  const handleAction = async () => {
    try {
      const data = await authenticatedFetch('/api/endpoint', {
        method: 'POST',
        body: JSON.stringify({ someData: 'value' }),
      });
      // Handle response
    } catch (error) {
      // Handle error
    }
  };

  return <div>Your component content</div>;
}
*/
