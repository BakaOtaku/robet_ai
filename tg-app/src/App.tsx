import React, { useEffect, useState } from "react";
import { Home, Gamepad2 } from "lucide-react";
import {
  useHapticFeedback,
  useWebApp,
} from "@vkruglikov/react-telegram-web-app";
import HomePage from "@/pages/Home";
import AboutPage from "@/pages/About";
import { Toaster } from "@/components/ui/toaster";

const App: React.FC = () => {
  const WebApp = useWebApp();
  const [impactOccurred] = useHapticFeedback();
  const [currentPage, setCurrentPage] = useState<"home" | "about">("home");
  const [userState, setUserState] = useState<"loading" | "no-user" | "active">(
    "loading"
  );

  useEffect(() => {
    const checkUserState = async () => {
      try {
        setUserState("active");
      } catch (error) {
        console.error("Error checking user state:", error);
        setUserState("active");
      }
    };

    checkUserState();
  }, [WebApp.initDataUnsafe.user?.id]);

  const renderPage = () => {
    if (userState === "loading") {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin w-8 h-8 border-4 border-[#2F5F71] border-t-transparent rounded-full" />
        </div>
      );
    }

    switch (currentPage) {
      case "home":
        return <HomePage />;
      case "about":
        return <AboutPage />;
    }
  };

  const handlePageChange = (page: "home" | "about") => {
    impactOccurred("medium");
    setCurrentPage(page);
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-cover bg-center text-[#F0EDC4]">
      {renderPage()}

      {userState === "active" && (
        <nav className="fixed bottom-0 left-0 right-0 bg-[#19324A] rounded-t-3xl">
          <div className="flex justify-around items-center h-16">
            <button
              className={`flex flex-col items-center justify-center w-max py-2 px-4 ${
                currentPage === "home" ? "bg-[#2F5F71] rounded-lg" : ""
              }`}
              onClick={() => handlePageChange("home")}
            >
              <Home className="w-5 h-5" />
              <span className="text-xs mt-1 font-semibold">Home</span>
            </button>
            <button
              className={`flex flex-col items-center justify-center w-max py-2 px-4 ${
                currentPage === "about" ? "bg-[#2F5F71] rounded-lg" : ""
              }`}
              onClick={() => handlePageChange("about")}
            >
              <Gamepad2 className="w-5 h-5" />
              <span className="text-xs mt-1 font-semibold">About</span>
            </button>
          </div>
        </nav>
      )}
      <Toaster />
    </div>
  );
};

export default App;
