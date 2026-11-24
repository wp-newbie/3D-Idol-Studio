export {};

declare global {
  const __ENV_GEMINI_API_KEY__: string;
  const __DEFAULT_GEMINI_API_KEY__: string;

  interface AIStudioBridge {
    hasSelectedApiKey?: () => Promise<boolean>;
    openSelectKey?: () => Promise<void>;
    getApiKey?: () => Promise<string | undefined> | string | undefined;
  }

  interface StudioElectronAPI {
    isElectron: boolean;
    readState: () => Promise<unknown | null>;
    writeState: (payload: unknown) => Promise<{ ok: boolean; path?: string; error?: string }>;
    getStorageInfo: () => Promise<{
      isElectron: boolean;
      userDataPath: string;
      stateFilePath: string;
      stateFileBytes: number;
    }>;
    exportJson: (
      defaultName: string,
      jsonText: string
    ) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>;
    readLocalEnvKey?: () => Promise<{ key: string; source: string }>;
    setDesktopRoamMode?: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean }>;
    setIgnoreMouseEvents?: (ignore: boolean, forward?: boolean) => void;
    getActiveWindowTitle?: () => Promise<{ appName: string | null }>;
    getSystemIdleAndFullscreenState?: () => Promise<{
      idleSeconds: number;
      isFullscreenApp: boolean;
    }>;
    revealOverlayForCheckIn?: () => void;
    windowControl?: (action: 'minimize' | 'maximize' | 'close') => void;
  }

  interface DesktopBridgeAPI {
    isElectron: boolean;
    setRoamOverlay: (enabled: boolean) => Promise<{ ok: boolean; enabled?: boolean }>;
    setClickThrough: (ignore: boolean, forward?: boolean) => void;
    getActiveWindowTitle?: () => Promise<{ appName: string | null }>;
    readApiKey?: () => Promise<{ apiKey: string }>;
    saveApiKey?: (apiKey: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  }

  interface Window {
    desktopBridge?: DesktopBridgeAPI;
    studioAPI?: StudioElectronAPI;
    aistudio?: AIStudioBridge;
  }
}
