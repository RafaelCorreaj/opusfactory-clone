import React, { createContext, useContext, useState } from 'react';

export interface VideoInfo {
  path: string;
  name: string;
  duration: number;
  size: number;
  status: 'pending' | 'processing' | 'processed' | 'error' | 'queued';
  progress?: number;
  error?: string;
}

export interface ClipInfo {
  videoName: string;
  start: number;
  end: number;
  reason: string;
  outputPath: string;
  thumbnailPath?: string;
  scores?: {
    semantic: number;
    emotional: number;
    narrative: number;
  };
}

interface AppContextType {
  videos: VideoInfo[];
  setVideos: (videos: VideoInfo[] | ((prev: VideoInfo[]) => VideoInfo[])) => void;
  clips: ClipInfo[];
  setClips: (clips: ClipInfo[] | ((prev: ClipInfo[]) => ClipInfo[])) => void;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [clips, setClips] = useState<ClipInfo[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  return (
    <AppContext.Provider value={{ videos, setVideos, clips, setClips, isProcessing, setIsProcessing }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp deve ser usado dentro de AppProvider');
  return context;
};