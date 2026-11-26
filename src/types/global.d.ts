export { };

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
    getDisplays?: () => Promise<{
      displays: import('./studio').DisplayInfo[];
      currentDisplayId: number | string | null;
    }>;
    moveToDisplay?: (targetDisplay: number | string) => Promise<{
      ok: boolean;
      currentDisplayId?: number | string | null;
      bounds?: { x: number; y: number; width: number; height: number };
      displays?: import('./studio').DisplayInfo[];
    }>;
    captureScreen?: () => Promise<{
      ok: boolean;
      dataUrl?: string;
      base64?: string;
      mimeType?: string;
      error?: string;
    }>;
    fetchJapaneseTts?: (spokenText: string) => Promise<{
      ok: boolean;
      mimeType?: string;
      base64?: string;
      error?: string;
    }>;
    checkLocalAi?: () => Promise<{ ok: boolean; model?: string; error?: string }>;
    queryLocalAi?: (params: {
      messages: { role: string; content: string }[];
      temperature?: number;
      maxTokens?: number;
    }) => Promise<{ ok: boolean; text?: string; resolvedModel?: string; error?: string }>;
    synthesizeVoicevox?: (params: {
      text: string;
      speakerId?: number;
    }) => Promise<{ ok: boolean; base64?: string; mimeType?: string; error?: string }>;
    transcribeAudio?: (params: {
      base64Audio: string;
      mimeType?: string;
      lang?: string;
    }) => Promise<{ ok: boolean; text?: string; error?: string }>;
    requestGeminiTts?: (params: {
      apiKey: string;
      model?: string;
      prompt: string;
      voiceName?: string;
    }) => Promise<{
      ok: boolean;
      status?: number;
      base64?: string;
      mimeType?: string;
      errBody?: string;
    }>;
  }

  interface DesktopBridgeAPI {
    isElectron: boolean;
    setRoamOverlay: (
      enabled: boolean,
      targetDisplay?: number | string
    ) => Promise<{ ok: boolean; enabled?: boolean; currentDisplay?: number | string | null }>;
    setClickThrough: (ignore: boolean, forward?: boolean) => void;
    getActiveWindowTitle?: () => Promise<{ appName: string | null }>;
    getDisplays?: () => Promise<{
      displays: import('./studio').DisplayInfo[];
      currentDisplayId: number | string | null;
    }>;
    moveToDisplay?: (targetDisplay: number | string) => Promise<{
      ok: boolean;
      currentDisplayId?: number | string | null;
      bounds?: { x: number; y: number; width: number; height: number };
      displays?: import('./studio').DisplayInfo[];
    }>;
    readApiKey?: () => Promise<{ apiKey: string }>;
    saveApiKey?: (apiKey: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    captureScreen?: () => Promise<{
      ok: boolean;
      dataUrl?: string;
      base64?: string;
      mimeType?: string;
      error?: string;
    }>;
    fetchJapaneseTts?: (spokenText: string) => Promise<{
      ok: boolean;
      mimeType?: string;
      base64?: string;
      error?: string;
    }>;
    checkLocalAi?: () => Promise<{ ok: boolean; model?: string; error?: string }>;
    queryLocalAi?: (params: {
      messages: { role: string; content: string }[];
      temperature?: number;
      maxTokens?: number;
    }) => Promise<{ ok: boolean; text?: string; resolvedModel?: string; error?: string }>;
    synthesizeVoicevox?: (params: {
      text: string;
      speakerId?: number;
    }) => Promise<{ ok: boolean; base64?: string; mimeType?: string; error?: string }>;
    transcribeAudio?: (params: {
      base64Audio: string;
      mimeType?: string;
      lang?: string;
    }) => Promise<{ ok: boolean; text?: string; error?: string }>;
    requestGeminiTts?: (params: {
      apiKey: string;
      model?: string;
      prompt: string;
      voiceName?: string;
    }) => Promise<{
      ok: boolean;
      status?: number;
      base64?: string;
      mimeType?: string;
      errBody?: string;
    }>;
  }

  interface Window {
    desktopBridge?: DesktopBridgeAPI;
    studioAPI?: StudioElectronAPI;
    aistudio?: AIStudioBridge;
  }
}
