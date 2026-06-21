import React from 'react';

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "object-contain w-full h-full p-1" }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background dark shield structure */}
      <path
        d="M50 90C72 80 85 58 85 35V15L50 5L15 15V35C15 58 28 80 50 90Z"
        fill="url(#shieldGrad)"
        stroke="url(#strokeGrad)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* Glowing medical/heartbeat cross symbol */}
      <path
        d="M50 25V65M30 45H70"
        stroke="#14b8a6"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
      />
      <path
        d="M50 25V65M30 45H70"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dynamic heartbeat pulse overlay inside the cross */}
      <path
        d="M32 45H42L46 32L54 58L58 45H68"
        stroke="#06b6d4"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Gradient & Glow Definitions */}
      <defs>
        <linearGradient id="shieldGrad" x1="50" y1="5" x2="50" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f172a" />
          <stop offset="1" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="strokeGrad" x1="15" y1="5" x2="85" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14b8a6" />
          <stop offset="0.5" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
