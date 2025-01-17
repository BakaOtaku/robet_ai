import React from "react";
import { ExternalLink } from "lucide-react";

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0A1A2F] text-[#FFFACD] p-4 pb-24">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="text-center space-y-4 mb-8">
          <h1 className="text-3xl font-bold mt-12">ROBET AI</h1>
          <p className="text-xl">
            Decentralized AI-Powered Prediction Markets Platform
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Introduction</h2>
          <p className="text-gray-300">
            ROBET is a decentralized, AI-powered Prediction Markets platform
            built on XION chain, designed to empower users to create and
            participate in bets on any event. Unlike traditional platforms,
            ROBET removes the restrictions of whitelisting and human resolvers,
            enabling real-time, scalable, and transparent betting.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Key Features</h2>
          <div className="grid gap-6">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                1. Seamless Bet Creation
              </h3>
              <p className="text-gray-300">
                Users can easily create bets by sharing a broadcast link with
                their prediction question. ROBET analyzes feasibility and
                deploys smart contracts on XION chain for transparent and secure
                betting.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                2. AI-Powered Resolution
              </h3>
              <p className="text-gray-300">
                ROBET leverages advanced AI models to analyze event outcomes,
                ensuring fast and accurate resolutions. Winners receive their
                rewards instantly via XION blockchain.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                3. Incentivized Bet Creators
              </h3>
              <p className="text-gray-300">
                Content creators can enhance audience engagement by adding live
                bets during streams, earning rewards through our creator economy
                model.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-semibold">
                4. Decentralized and Scalable
              </h3>
              <p className="text-gray-300">
                Built on XION chain, our platform ensures trustless execution,
                minimal fees, and fast transaction speeds. AI handles large
                volumes of custom, short-term bets without delays.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">How It Works</h2>
          <div className="space-y-4">
            <div className="bg-[#192D56] p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Step 1: Creating a Bet</h3>
              <p className="text-gray-300">
                Share a broadcast link with your prediction question. ROBET
                evaluates feasibility and creates a smart contract for
                participation.
              </p>
            </div>

            <div className="bg-[#192D56] p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Step 2: Joining a Bet</h3>
              <p className="text-gray-300">
                Connect your wallet and participate in bets using XION tokens.
                Funds are securely held in smart contracts until resolution.
              </p>
            </div>

            <div className="bg-[#192D56] p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Step 3: Resolution</h3>
              <p className="text-gray-300">
                AI determines results by analyzing event feeds. Winners
                automatically receive rewards in their XION wallets.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Benefits</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300">
            <li>Real-time bet creation and resolution</li>
            <li>Minimal fees through XION chain</li>
            <li>Instant, automated payouts</li>
            <li>Rewards for content creators</li>
            <li>Transparent and trustless execution</li>
          </ul>
        </section>

        <footer className="pt-8 text-center">
          <a
            href="https://x.com/robet_ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[#5DB7C3] hover:text-[#4CA6B2]"
          >
            Learn more about Robet
            <ExternalLink size={16} />
          </a>
        </footer>
      </div>
    </div>
  );
};

export default AboutPage;
