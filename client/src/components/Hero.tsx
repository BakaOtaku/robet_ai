import React from 'react';
import { Bot, ArrowRight } from 'lucide-react';

export function Hero() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(168,85,247,0.15),rgba(168,85,247,0))]"></div>
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center max-w-4xl mx-auto">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Bot className="w-16 h-16 text-purple-500 animate-float" />
            <h1 className="text-6xl font-bold gradient-text">ROBET</h1>
          </div>
          <div className="inline-block px-4 py-1 bg-purple-100 rounded-full text-purple-600 text-sm font-semibold mb-6">
            Coming Soon 🚀
          </div>
          <p className="text-2xl text-purple-800 font-semibold mb-6">
            AI Agents for Automated Prediction Market Resolutions
          </p>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Create and resolve prediction markets instantly using AI - no more waiting for human resolvers
          </p>
          <button className="bg-gradient-to-r from-purple-600 to-pink-500 text-white px-8 py-3 rounded-full font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 inline-flex items-center gap-2">
            Get Notified <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}