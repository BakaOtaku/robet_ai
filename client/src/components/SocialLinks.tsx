import React from 'react';
import { Github, Twitter } from 'lucide-react';

export function SocialLinks() {
  return (
    <div className="flex items-center justify-center gap-4">
      <a
        href="https://github.com/BakaOtaku/robet_ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-500 hover:text-purple-500 transition-colors duration-300"
      >
        <Github className="w-6 h-6" />
      </a>
      <a
        href="https://x.com/robet_ai"
        target="_blank"
        rel="noopener noreferrer"
        className="text-gray-500 hover:text-purple-500 transition-colors duration-300"
      >
        <Twitter className="w-6 h-6" />
      </a>
    </div>
  );
}