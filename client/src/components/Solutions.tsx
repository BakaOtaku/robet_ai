import React from 'react';
import { Twitter, Zap, Award } from 'lucide-react';
import { FeatureCard } from './FeatureCard';

export function Solutions() {
  return (
    <div className="py-16 relative bg-purple-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-4 gradient-text">Solution: Robet</h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          An AI-powered betting platform on Twitter that enables instant market creation and resolution
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={Twitter}
            title="Seamless Integration"
            description="Create bets directly through Twitter by sharing links and questions."
          />
          <FeatureCard
            icon={Zap}
            title="Instant Resolution"
            description="AI-powered analysis provides quick and accurate market resolutions."
          />
          <FeatureCard
            icon={Award}
            title="Creator Economy"
            description="Reward content creators for engaging their audience with interactive bets."
          />
        </div>
      </div>
    </div>
  );
}