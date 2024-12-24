import React from 'react';
import { Bot } from 'lucide-react';
import { SocialLinks } from './SocialLinks';

export function Footer() {
  return (
    <footer className="py-8 bg-white">
      <div className="container mx-auto px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Bot className="w-6 h-6 text-purple-500" />
          <span className="text-xl font-bold gradient-text">ROBET</span>
        </div>
        <p className="text-gray-600 mb-4">Revolutionizing Prediction Markets with AI</p>
        <SocialLinks />
      </div>
    </footer>
  );
}