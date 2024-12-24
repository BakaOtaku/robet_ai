import React from 'react';
import { Target, Clock, Users } from 'lucide-react';
import { FeatureCard } from './FeatureCard';

export function Problems() {
  return (
    <div className="py-16 bg-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-4 gradient-text">The Problem with Existing Platforms</h2>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Traditional prediction markets are slow, centralized, and inefficient
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={Target}
            title="Limited Freedom"
            description="Traditional platforms restrict custom bet creation through centralized whitelisting processes."
          />
          <FeatureCard
            icon={Clock}
            title="Slow Resolution"
            description="Human-driven resolution is time-consuming and doesn't scale for fast-paced events."
          />
          <FeatureCard
            icon={Users}
            title="Trust Issues"
            description="Few resolvers control most markets, creating bottlenecks and scalability issues."
          />
        </div>
      </div>
    </div>
  );
}