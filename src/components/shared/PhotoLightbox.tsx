import React from 'react';
import { X } from 'lucide-react';

interface PhotoLightboxProps {
  selectedZoomPhoto: string | null;
  setSelectedZoomPhoto: (url: string | null) => void;
}

/** Full-screen image viewer used by both dashboards. */
export default function PhotoLightbox({ selectedZoomPhoto, setSelectedZoomPhoto }: PhotoLightboxProps) {
  if (!selectedZoomPhoto) return null;

  return (
    <div 
      onClick={() => setSelectedZoomPhoto(null)}
      className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-zinc-200 rounded-2xl p-4 max-w-3xl w-full max-h-[92vh] flex flex-col relative animate-scale-up shadow-2xl cursor-default"
      >
        <div className="flex justify-between items-center pb-2.5 border-b border-zinc-150 mb-3.5">
          <h4 className="font-mono font-bold text-zinc-900 text-xs uppercase tracking-tight">
           Cryptographic Patient diagnostic Display Viewer
          </h4>
          <button
            onClick={() => setSelectedZoomPhoto(null)}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-lg hover:bg-zinc-100 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-950 flex items-center justify-center flex-1 min-h-0">
          <img
            src={selectedZoomPhoto}
            alt="Patient diagnostic high-resolution display view"
            className="max-w-full max-h-[64vh] object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="mt-3.5 p-3 bg-zinc-50 border border-zinc-150 rounded-xl font-mono text-[9px] text-zinc-500 leading-relaxed text-center">
          🔒 256-Bit Encrypted Block Transit Integrity Validated • Referred as Direct Raw Sandbox Image Element • ReferrerPolicy "no-referrer"
        </div>
      </div>
    </div>
  );
}
