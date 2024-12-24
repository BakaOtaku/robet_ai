import React from 'react';

interface FeatureCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
}

export function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="group relative">
      <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-500 rounded-xl blur opacity-25 group-hover:opacity-50 transition-opacity"></div>
      <div className="relative bg-white p-6 rounded-xl hover:translate-y-[-4px] transition-all duration-300 shadow-lg">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg">
            <Icon className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        </div>
        <p className="text-gray-600">{description}</p>
      </div>
    </div>
  );
}