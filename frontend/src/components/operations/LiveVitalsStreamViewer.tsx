import React from 'react';
import { Activity, WifiOff } from 'lucide-react';

export const LiveVitalsStreamViewer: React.FC = () => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-slate-400" />
          <h3 className="text-base font-semibold text-slate-100">
            Real-Time ICU Telemetry & Vitals Stream
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-slate-500/10 text-slate-400 border border-slate-500/20">
            <WifiOff className="w-3 h-3" />
            Offline — No live feed configured
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Activity className="w-10 h-10 text-slate-600 mb-3" />
        <p className="text-sm text-slate-400 max-w-md">
          Real-time telemetry requires a connected vital-signs feed.
          No live data source is currently configured.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Connect a compatible patient monitor or IoT gateway to enable live streaming.
        </p>
      </div>
    </div>
  );
};
