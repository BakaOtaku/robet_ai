import React from 'react';
import { Coins } from 'lucide-react';

export function Revenue() {
  return (
    <div className="py-16 relative bg-purple-50">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-8 gradient-text">Revenue Model</h2>
        <div className="flex items-center justify-center gap-4 mb-6">
          <Coins className="w-12 h-12 text-purple-500 animate-float" />
          <p className="text-xl text-gray-700">
            0.1% of total bet volume distributed between AI agent and Creator
          </p>
        </div>
      </div>
    </div>
  );
}