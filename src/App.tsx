import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import type {
  AccessoryAttachTarget,
  ActiveLifeScene,
  AutonomousNeedTrigger,
  AutonomousToolLocation,
  AvatarPosture,
  BrainThought,
  CareActivityId,
  ChatMessage,
  CustomBackdropKind,
  DestinationKindId,
  DisplayInfo,
  EquippedAccessory,
  FoodVisualId,
  GarmentStyleId,
  HairStyleId,
  HobbyKindId,
  IdleCheckInMinutes,
  InteractionZone,
  MaterialMod,
  MemoryEntry,
  MeshDescriptor,
  MicroTellCommand,
  MicroTellKind,
  MoodType,
  OutfitSlot,
  PersistedStudioState,
  Persona,
  ProceduralAccessoryId,
  ProceduralEmoteId,
  RoamBehavior,
  RoamCommand,
  SleepingPosition,
  StageEnvironmentId,
  StudioSettings,
  VaultAccessoryMeta,
  VaultModelMeta,
  VaultVrmaMeta,
  VocalArchetype,
  VoiceGender,
  VoiceLanguage,
} from './types/studio';
import { VOCAL_ARCHETYPES, VOICES_BY_GENDER } from './data/presets';
import {
  createDefaultStudioState,
  loadStudioState,
  saveStudioState,
} from './storage/studioStore';
import {
  debounceWorkspaceSyncPush,
  fetchWorkspaceSyncState,
  pushWorkspaceSyncState,
} from './storage/workspaceSync';
import {
  deleteTextureFromVault,
  deleteVaultAccessory,
  deleteVaultModel,
  deleteVaultVrma,
  listVaultAccessories,
  listVaultModels,
  listVaultVrmas,
  saveAccessoryToVault,
  saveEnvironmentToVault,
  saveModelToVault,
  saveTextureToVault,
  saveVrmaToVault,
  getAccessoryBuffer,
} from './storage/modelVault';
import {
  extractPlayableGlbFromBuffer,
  extractVroidTexture,
  type VroidTextureResult,
} from './stage/xwearParser';
import {
  buildDesktopContextNote,
  describeDesktopSnapshot,
  nowPlayingKey,
  describeNowPlaying,
} from './services/desktopContext';
import { generateStageScenery, type StageSceneryGenParams } from './services/stageGeneratorService';
import {
  generateAiHairstyle,
  generateAiOutfit,
  generateAiVrmVariant,
  generateTimeOccasionOutfit,
  getVrmMoodTimeDayContext,
  listAvailableVrmModels,
  planAiVrmModelSwitch,
  type GeneratedOutfitPayload,
  type OutfitEngineSource,
  type VrmStructuralSummary,
} from './services/aiOutfitGenerator';
import type { OutfitIntegrityReport } from './stage/outfitIntegrityChecker';
import { HAIR_STYLE_META } from './stage/hairStyleRig';
import { GARMENT_STYLE_META } from './stage/garmentRig';
import {
  DESTINATION_KIND_META,
  FOOD_VISUAL_META,
  HOBBY_KIND_META,
} from './stage/lifePropsRig';
import {
  planAiAutoRoamDecision,
  planAiChair,
  planAiDestination,
  planAiGymSport,
  planAiHobby,
  planAiHygieneRoutine,
  planAiMoodFood,
  planAiSchoolStudy,
  planAiSpontaneousDesire,
  planAiStretchRoutine,
  type GymSportKindId,
  type HygieneRoutineId,
  type SchoolLevel,
} from './services/aiLifePlanner';
import { resolveAiDrivenArchetype } from './services/voiceToneDirector';
import { parseDialogueResponse } from './services/dialogueParser';
import {
  GeminiApiError,
  generatePersonaReply,
  mapToolLocationToEnvironment,
  summarizeConversationMemories,
  validateGeminiApiKey,
  type AutonomousToolExecutor,
} from './services/geminiClient';
import {
  getBuiltInDefaultApiKey,
  isStudioSetupComplete,
  markStudioSetupComplete,
  resolveEffectiveApiKey,
  resolveStartupApiKey,
  sanitizeApiKey,
  saveKeyToLocalStorage,
} from './services/apiKeyResolver';
import { voiceEngine } from './services/ttsService';
import {
  advanceEmotionalCarryover,
  buildAutonomousBrainPrompt,
  buildCareActivityEffect,
  deriveDefaultNuancedFeeling,
  detectUserEmpathyCue,
  getCircadianContext,
  pickMoodInnerThought,
  tickBrainNeeds,
} from './services/aiBrainService';
import { STAGE_ENVIRONMENTS } from './stage/stageEnvironments';
import { TopToolbar } from './components/TopToolbar';
import { StageViewport } from './components/StageViewport';
import { ChatSidebar } from './components/ChatSidebar';
import { WardrobeDrawer } from './components/WardrobeDrawer';
import { LifeStudioDrawer } from './components/LifeStudioDrawer';
import { PersonaBuilderModal } from './components/PersonaBuilderModal';
import { SettingsModal } from './components/SettingsModal';
import {
  StartupSetupModal,
  type StartupSetupResult,
} from './components/StartupSetupModal';
import { MemoryJournalModal } from './components/MemoryJournalModal';
import { FloatingRoamBubble } from './components/FloatingRoamBubble';

export const App: React.FC = () => {
  const [studio, setStudio] = useState<PersistedStudioState>(() =>
    createDefaultStudioState()
  );
  const [hydrated, setHydrated] = useState(false);
  const [storageBackend, setStorageBackend] = useState<string>('indexeddb');
  const [vaultModels, setVaultModels] = useState<VaultModelMeta[]>([]);
  const vaultModelsRef = useRef<VaultModelMeta[]>([]);
  vaultModelsRef.current = vaultModels;
  const [vaultVrmas, setVaultVrmas] = useState<VaultVrmaMeta[]>([]);
  const [vaultAccessories, setVaultAccessories] = useState<VaultAccessoryMeta[]>([]);
  const [detectedMeshes, setDetectedMeshes] = useState<MeshDescriptor[]>([]);
  const detectedMeshesRef = useRef<MeshDescriptor[]>([]);
  detectedMeshesRef.current = detectedMeshes;

  const [isWardrobeOpen, setIsWardrobeOpen] = useState(false);
  const [isLifeOpen, setIsLifeOpen] = useState(false);
  const [isLifeBusy, setIsLifeBusy] = useState(false);
  const [lifeScene, setLifeScene] = useState<ActiveLifeScene>({
    dining: null,
    hobby: null,
    destination: null,
  });
  const lifeSceneRef = useRef<ActiveLifeScene>(lifeScene);
  lifeSceneRef.current = lifeScene;
  const isLifeBusyRef = useRef<boolean>(false);
  const lastAutoLifeAtRef = useRef<number>(0);
  const lastAutoMoodRef = useRef<MoodType | null>(null);
  const lastPostureForChairRef = useRef<string | null>(null);
  const generateAiChairRef = useRef<(contextHint?: string) => Promise<void>>(async () => {});
  const followWhimRef = useRef<(options?: { silent?: boolean }) => void>(() => {});
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAiOutfit, setIsGeneratingAiOutfit] = useState(false);
  const [isStageGenerating, setIsStageGenerating] = useState(false);
  const [isSummarizingMemory, setIsSummarizingMemory] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAffinityDelta, setLastAffinityDelta] = useState<number | null>(null);

  // Desktop Roam Mode (🪟), Auto-Roam & Autonomous Brain State
  const [desktopRoamMode, setDesktopRoamMode] = useState(false);
  const [connectedDisplays, setConnectedDisplays] = useState<DisplayInfo[]>([]);
  const [activeDisplayTarget, setActiveDisplayTarget] = useState<number | string | 'all'>('primary');
  const [freeRoamEnabled, setFreeRoamEnabled] = useState(true);
  const [autoRoamEnabled, setAutoRoamEnabled] = useState(true);
  const autoRoamEnabledRef = useRef(true);
  autoRoamEnabledRef.current = autoRoamEnabled;
  const lastAutoRoamDecisionAtRef = useRef<number>(0);
  const [roamCommand, setRoamCommand] = useState<RoamCommand | null>(null);
  const [emoteCommand, setEmoteCommand] = useState<{
    id: number;
    emoteId: ProceduralEmoteId;
  } | null>(null);
  const [gazeCommand, setGazeCommand] = useState<{
    id: number;
    target: 'camera' | 'mouse' | 'look_away' | 'shy_down' | 'screen';
  } | null>(null);
  const [expressionCommand, setExpressionCommand] = useState<{
    id: number;
    expression: string;
  } | null>(null);
  const [microTellCommand, setMicroTellCommand] = useState<MicroTellCommand | null>(null);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [recentInteractionZone, setRecentInteractionZone] =
    useState<InteractionZone | null>(null);
  const recentInteractionZoneRef = useRef<InteractionZone | null>(null);
  recentInteractionZoneRef.current = recentInteractionZone;
  const recentInteractionTimerRef = useRef<number | null>(null);
  const [roamNormX, setRoamNormX] = useState(0);
  const [headScreenPos, setHeadScreenPos] = useState<{ x: number; y: number }>({ x: 50, y: 55 });
  const [roamBehavior, setRoamBehavior] = useState<RoamBehavior>('idle');
  const [isDraggingAvatar, setIsDraggingAvatar] = useState(false);
  const [isHoveringAvatar, setIsHoveringAvatar] = useState(false);
  const [widgetBubbleRequestedAt, setWidgetBubbleRequestedAt] = useState(0);
  const [autonomousActionToast, setAutonomousActionToast] = useState<string | null>(null);
  const [activePcApp, setActivePcApp] = useState<string | null>(null);

  // Smart Click-Through tracking refs (avatar hover + floating UI hover + open modal)
  const hoveringAvatarRef = useRef(false);
  const hoveringRoamUiRef = useRef(false);
  const roamCommandSeqRef = useRef(1);
  const emoteCommandSeqRef = useRef(1);
  const gazeCommandSeqRef = useRef(1);
  const expressionCommandSeqRef = useRef(1);
  const microTellSeqRef = useRef(1);
  const sessionStartAtRef = useRef<number>(Date.now());
  const lastProactiveSpeechAtRef = useRef<number>(Date.now());
  const roamBehaviorRef = useRef<RoamBehavior>('idle');
  roamBehaviorRef.current = roamBehavior;
  const lastCursorActiveAtRef = useRef<number>(Date.now());
  const lastPcAppReactedRef = useRef<string | null>(null);
  const lastPcReactionAtRef = useRef<number>(0);
  const desktopSnapshotRef = useRef<DesktopSnapshot | null>(null);
  const lastMusicKeyRef = useRef<string | null | undefined>(undefined);
  const lastMusicReactionAtRef = useRef<number>(0);
  const generateStageRef = useRef<(prompt: string, style?: string) => void>(() => {});
  const isStageGeneratingRef = useRef<boolean>(false);
  const lastUserActivityAtRef = useRef<number>(Date.now());
  const lastIdleCheckInAtRef = useRef<number>(0);
  const isGeneratingRef = useRef<boolean>(false);
  isGeneratingRef.current = isGenerating;
  const isSpeakingRef = useRef<boolean>(false);
  isSpeakingRef.current = isSpeaking;

  // API Key Resolution & Live Status State
  const [connectionMode, setConnectionMode] = useState<'live' | 'demo' | 'error'>('demo');
  const [hasAiStudioBridge, setHasAiStudioBridge] = useState(false);
  const [apiErrorToast, setApiErrorToast] = useState<string | null>(null);
  const [latestIntegrityReport, setLatestIntegrityReport] = useState<OutfitIntegrityReport | null>(null);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState(
    'Demo Mode (no API key configured — click Settings to activate Live Gemini)'
  );

  const studioRef = useRef(studio);
  studioRef.current = studio;
  const isSettingsOpenRef = useRef(isSettingsOpen);
  isSettingsOpenRef.current = isSettingsOpen;
  const desktopRoamRef = useRef(desktopRoamMode);
  desktopRoamRef.current = desktopRoamMode;
  const lastInteractionAiAtRef = useRef<number>(0);
  const hasAutoPromptedAuthRef = useRef<boolean>(false);
  const lastFailedTurnRef = useRef<{ promptText: string; role: 'user' | 'system_event' } | null>(
    null
  );
  const handleCareActivityRef = useRef<(activity: CareActivityId) => void>(() => {});
  const isGeneratingAiOutfitRef = useRef<boolean>(false);
  const designOutfitRef = useRef<(occasionPrompt: string) => void>(() => {});
  const changeHairStyleRef = useRef<(hairPrompt?: string) => void>(() => {});
  const eatFoodRef = useRef<(foodPrompt?: string) => void>(() => {});
  const doHobbyRef = useRef<(hobbyPrompt?: string) => void>(() => {});
  const visitPlaceRef = useRef<(placePrompt?: string) => void>(() => {});
  const studySchoolRef = useRef<(studyPrompt?: string) => void>(() => {});
  const bathCareRef = useRef<(bathPrompt?: string) => void>(() => {});
  const gymSportRef = useRef<(sportPrompt?: string) => void>(() => {});
  const stretchRef = useRef<(stretchHint?: string) => void>(() => {});
  const equipWholeOutfitRef = useRef<(slotOrModelTarget: string) => boolean>(() => false);
  const switchToVrmRef = useRef<
    (
      target: string,
      options?: {
        garmentStyleOverride?: GarmentStyleId;
        garmentPaletteOverride?: OutfitSlot['garmentPalette'];
        reason?: string;
      }
    ) => { switched: boolean; label: string }
  >(() => ({ switched: false, label: '' }));
  const generateVrmRef = useRef<
    (promptHint?: string, options?: { silentReaction?: boolean; reuseSlotId?: string }) => void
  >(() => {});
  const lastAutoVrmAtRef = useRef<number>(0);
  const lastAutoVrmKeyRef = useRef<string>('');
  const designTimeOccasionRef = useRef<
    (
      occasionOverride?: string,
      options?: { silentReaction?: boolean; reuseDailySlot?: boolean }
    ) => void
  >(() => {});

  // Sync Electron Smart Click-Through state whenever cursor enters/leaves VRM character or floating bubble
  const syncClickThrough = useCallback(() => {
    if (!desktopRoamRef.current) return;
    const shouldCaptureMouse =
      hoveringAvatarRef.current ||
      hoveringRoamUiRef.current ||
      isSettingsOpenRef.current;
    if (window.desktopBridge?.setClickThrough) {
      window.desktopBridge.setClickThrough(!shouldCaptureMouse, true);
    } else {
      window.studioAPI?.setIgnoreMouseEvents?.(!shouldCaptureMouse, true);
    }
  }, []);

  useEffect(() => {
    syncClickThrough();
  }, [isSettingsOpen, desktopRoamMode, syncClickThrough]);

  // Hydrate persistent state + Auto-resolve Gemini API Key
  useEffect(() => {
    let active = true;
    const init = async () => {
      const [{ state, backend }, models, vrmas, accessories] = await Promise.all([
        loadStudioState(),
        listVaultModels(),
        listVaultVrmas(),
        listVaultAccessories(),
      ]);
      if (!active) return;

      const resolvedKey = await resolveStartupApiKey(state.settings.apiKey);
      if (!active) return;

      const usingBuiltIn = Boolean(state.settings.useBuiltInKey && getBuiltInDefaultApiKey());
      const nextState: PersistedStudioState =
        !usingBuiltIn && resolvedKey.apiKey
          ? {
            ...state,
            settings: {
              ...state.settings,
              apiKey: resolvedKey.apiKey,
            },
          }
          : state;

      setStudio(nextState);
      setStorageBackend(backend);
      setVaultModels(models);
      setVaultVrmas(vrmas);
      setVaultAccessories(accessories);
      setHasAiStudioBridge(resolvedKey.hasAiStudioBridge);

      const isCloudDisabled = nextState.settings.enableGeminiCloud === false;
      const effectiveKey = resolveEffectiveApiKey(nextState.settings);
      if (effectiveKey && !isCloudDisabled) {
        setConnectionMode('live');
        setProviderStatus(
          usingBuiltIn
            ? `Live Gemini (${nextState.settings.textModel}) · built-in default key`
            : `Live Gemini (${nextState.settings.textModel}) · key via ${resolvedKey.source}`
        );
      } else {
        setConnectionMode(nextState.settings.preferLocalAi ? 'live' : 'demo');
        setProviderStatus(
          isCloudDisabled
            ? 'Cloud Gemini Disabled · Local AI / Offline Active'
            : 'Demo Mode (multi-response offline pool — add key for Live Gemini)'
        );
      }

      if (!isStudioSetupComplete()) {
        setIsSetupOpen(true);
      }

      setHydrated(true);
    };
    void init();

    const handleHashKey = async () => {
      const resolved = await resolveStartupApiKey(studioRef.current.settings.apiKey);
      if (resolved.source === 'url-hash' && resolved.apiKey) {
        setStudio((prev) => ({
          ...prev,
          settings: { ...prev.settings, apiKey: resolved.apiKey },
        }));
        setConnectionMode('live');
        setProviderStatus(
          `Live Gemini (${studioRef.current.settings.textModel}) · key via url-hash`
        );
      }
    };
    window.addEventListener('hashchange', handleHashKey);

    const unsub = voiceEngine.subscribe((speaking) => setIsSpeaking(speaking));
    return () => {
      active = false;
      window.removeEventListener('hashchange', handleHashKey);
      unsub();
      voiceEngine.stop();
    };
  }, []);

  // Auto-persist studio state to local IndexedDB and Electron disk
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveStudioState(studio);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [studio, hydrated]);

  // Auto-Sync (Visibility, Focus, Background Polling): Always fetch latest state
  const lastSyncedRemoteTsRef = useRef<number>(0);

  useEffect(() => {
    let active = true;
    const handleSyncCheck = async () => {
      try {
        const remote = await fetchWorkspaceSyncState();
        if (!active || !remote || !remote.personas) return;
        const currentUpdated = studioRef.current.updatedAt || 0;
        const remoteUpdated = remote.updatedAt || 0;
        if (remoteUpdated > currentUpdated) {
          lastSyncedRemoteTsRef.current = remoteUpdated;
          setStudio(remote);
          void saveStudioState(remote);
          if (remote.settings?.apiKey) {
            saveKeyToLocalStorage(remote.settings.apiKey);
          }
        }
      } catch {
        // ignore network error
      }
    };

    const onVisibleOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void handleSyncCheck();
      }
    };

    window.addEventListener('focus', onVisibleOrFocus);
    document.addEventListener('visibilitychange', onVisibleOrFocus);
    const pollInterval = window.setInterval(onVisibleOrFocus, 4000);

    return () => {
      active = false;
      window.removeEventListener('focus', onVisibleOrFocus);
      document.removeEventListener('visibilitychange', onVisibleOrFocus);
      window.clearInterval(pollInterval);
    };
  }, []);

  // Debounced push to Local Workspace Sync (/.studio-sync.json via /__studio-sync) on updates
  useEffect(() => {
    if (!hydrated) return;
    const currentUpdated = studio.updatedAt || 0;
    // Don't re-push if this state was just applied from incoming sync
    if (currentUpdated <= lastSyncedRemoteTsRef.current) return;

    debounceWorkspaceSyncPush(
      studio,
      (newerState) => {
        lastSyncedRemoteTsRef.current = newerState.updatedAt || 0;
        setStudio(newerState);
        void saveStudioState(newerState);
      },
      1000
    );
  }, [studio, hydrated]);

  // Manual Workspace Sync Action (Sync Web <-> Desktop disk state via /__studio-sync)
  const [isSyncingWorkspace, setIsSyncingWorkspace] = useState(false);
  const handleSyncWorkspaceNow = useCallback(async () => {
    setIsSyncingWorkspace(true);
    try {
      const current = studioRef.current;
      const pushRes = await pushWorkspaceSyncState(current);
      if (!pushRes.ok && pushRes.latestState) {
        lastSyncedRemoteTsRef.current = pushRes.latestState.updatedAt || 0;
        setStudio(pushRes.latestState);
        void saveStudioState(pushRes.latestState);
        setAutonomousActionToast('⚡ Adopted newer workspace state from server');
      } else {
        const remote = await fetchWorkspaceSyncState();
        if (remote && remote.personas && (remote.updatedAt || 0) >= (current.updatedAt || 0)) {
          lastSyncedRemoteTsRef.current = remote.updatedAt || 0;
          setStudio(remote);
          void saveStudioState(remote);
        }
        setAutonomousActionToast('⚡ Studio workspace synchronized (latest active)');
      }
      window.setTimeout(() => setAutonomousActionToast(null), 3000);
    } catch (err) {
      console.warn('Workspace sync failed:', err);
      setAutonomousActionToast('⚠️ Sync failed: dev server unreachable');
      window.setTimeout(() => setAutonomousActionToast(null), 3000);
    } finally {
      setIsSyncingWorkspace(false);
    }
  }, []);

  const isDesktopApp =
    typeof window !== 'undefined' &&
    Boolean(window.desktopBridge?.isElectron || window.studioAPI?.isElectron);

  const activePersona = useMemo(() => {
    return (
      studio.personas.find((p) => p.id === studio.activePersonaId) || studio.personas[0]
    );
  }, [studio.personas, studio.activePersonaId]);

  const activeSlot = useMemo(() => {
    return (
      activePersona.outfitSlots.find((s) => s.id === activePersona.activeOutfitSlotId) ||
      activePersona.outfitSlots[0]
    );
  }, [activePersona]);

  const refreshDisplays = useCallback(async () => {
    if (!isDesktopApp) return;
    try {
      let res: { displays?: DisplayInfo[]; currentDisplayId?: number | string | null } | undefined;
      if (window.desktopBridge?.getDisplays) {
        res = await window.desktopBridge.getDisplays();
      } else if (window.studioAPI?.getDisplays) {
        res = await window.studioAPI.getDisplays();
      }
      if (res?.displays && res.displays.length > 0) {
        setConnectedDisplays(res.displays);
        if (res.currentDisplayId !== undefined && res.currentDisplayId !== null) {
          setActiveDisplayTarget(res.currentDisplayId);
        }
      }
    } catch {
      // browser preview fallback
    }
  }, [isDesktopApp]);

  useEffect(() => {
    void refreshDisplays();
  }, [refreshDisplays]);

  const handleMoveToDisplay = useCallback(
    async (target: number | string | 'all') => {
      if (!isDesktopApp) return;
      setActiveDisplayTarget(target);
      try {
        let res:
          | {
            displays?: DisplayInfo[];
            currentDisplayId?: number | string | null;
          }
          | undefined;
        if (window.desktopBridge?.moveToDisplay) {
          res = await window.desktopBridge.moveToDisplay(target);
        } else if (window.studioAPI?.moveToDisplay) {
          res = await window.studioAPI.moveToDisplay(target);
        }
        if (res?.displays) {
          setConnectedDisplays(res.displays);
        }
        const dispObj = connectedDisplays.find((d) => d.id === target);
        const label =
          target === 'all'
            ? 'spanning all screens'
            : dispObj
              ? dispObj.label
              : `Display ${target}`;
        setAutonomousActionToast(`🖥️ Strolling to ${label}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
      } catch {
        // fallback
      }
    },
    [connectedDisplays, isDesktopApp]
  );

  const handleCrossDisplayEdge = useCallback(
    (direction: 'left' | 'right') => {
      if (!isDesktopApp) return;
      if (connectedDisplays.length <= 1) return;
      if (activeDisplayTarget === 'all') return;

      const current =
        connectedDisplays.find((d) => d.id === activeDisplayTarget) ||
        connectedDisplays.find((d) => d.isPrimary) ||
        connectedDisplays[0];
      if (!current) return;

      let candidate: DisplayInfo | null = null;
      if (direction === 'left') {
        const leftCandidates = connectedDisplays
          .filter((d) => d.bounds.x < current.bounds.x)
          .sort((a, b) => b.bounds.x - a.bounds.x);
        candidate = leftCandidates[0] || null;
      } else {
        const rightCandidates = connectedDisplays
          .filter((d) => d.bounds.x > current.bounds.x)
          .sort((a, b) => a.bounds.x - b.bounds.x);
        candidate = rightCandidates[0] || null;
      }

      if (candidate) {
        void handleMoveToDisplay(candidate.id);
        const cmdId = roamCommandSeqRef.current++;
        setRoamCommand({
          id: cmdId,
          startFromX: direction === 'left' ? 0.88 : -0.88,
          targetX: 0,
          targetY: 0,
          behavior: 'walk',
        });
        setAutonomousActionToast(`🚶 ${activePersona.name} strolled onto ${candidate.label}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
      }
    },
    [connectedDisplays, activeDisplayTarget, handleMoveToDisplay, activePersona.name, isDesktopApp]
  );

  // Toggle Transparent Desktop Companion / Shimeji Roam Mode (🪟)
  const toggleDesktopRoamMode = useCallback(async (forceValue?: boolean) => {
    const next = typeof forceValue === 'boolean' ? forceValue : !desktopRoamRef.current;
    setDesktopRoamMode(next);
    if (next) {
      setIsWardrobeOpen(false);
      setIsRosterOpen(false);
      setIsMemoryOpen(false);
      document.documentElement.classList.add('desktop-roam-active');
      document.body.classList.add('desktop-roam-active');
      void refreshDisplays();
    } else {
      document.documentElement.classList.remove('desktop-roam-active');
      document.body.classList.remove('desktop-roam-active');
      hoveringAvatarRef.current = false;
      hoveringRoamUiRef.current = false;
    }
    try {
      if (window.desktopBridge?.setRoamOverlay) {
        await window.desktopBridge.setRoamOverlay(next);
      } else {
        await window.studioAPI?.setDesktopRoamMode?.(next);
      }
    } catch {
      // browser preview fallback
    }
  }, [refreshDisplays]);

  const updateActivePersona = useCallback((updater: (persona: Persona) => Persona) => {
    setStudio((prev) => ({
      ...prev,
      personas: prev.personas.map((p) =>
        p.id === prev.activePersonaId ? updater(p) : p
      ),
    }));
  }, []);

  const updateActiveSlot = useCallback(
    (updater: (slot: OutfitSlot) => OutfitSlot) => {
      updateActivePersona((persona) => ({
        ...persona,
        outfitSlots: persona.outfitSlots.map((slot) =>
          slot.id === persona.activeOutfitSlotId ? updater(slot) : slot
        ),
        updatedAt: Date.now(),
      }));
    },
    [updateActivePersona]
  );

  const handleUpdateSettings = useCallback((patch: Partial<StudioSettings>) => {
    let cleanApiKey: string | undefined;
    if (typeof patch.apiKey === 'string') {
      cleanApiKey = sanitizeApiKey(patch.apiKey);
      hasAutoPromptedAuthRef.current = false;
      if (!patch.useBuiltInKey) {
        saveKeyToLocalStorage(cleanApiKey);
      }
      if (!cleanApiKey && !patch.useBuiltInKey) {
        setConnectionMode('demo');
        setApiErrorToast(null);
        setValidationMessage(null);
        setProviderStatus('Demo Mode (multi-response offline pool — add key for Live Gemini)');
      }
    }
    if (patch.useBuiltInKey === true && getBuiltInDefaultApiKey()) {
      hasAutoPromptedAuthRef.current = false;
      setConnectionMode('live');
      setApiErrorToast(null);
      setProviderStatus(
        `Live Gemini (${patch.textModel || studioRef.current.settings.textModel}) · built-in default key`
      );
    }
    if (patch.enableGeminiCloud === false) {
      hasAutoPromptedAuthRef.current = false;
      setApiErrorToast(null);
      setValidationMessage('Gemini Cloud API is disabled. Operating 100% offline with LM Studio.');
      setProviderStatus('Cloud Gemini Disabled · Local AI / Offline Active');
    }
    if (patch.preferLocalAi === true) {
      hasAutoPromptedAuthRef.current = false;
      setConnectionMode('live');
      setApiErrorToast(null);
      setValidationMessage('Prioritizing Local Offline AI (LM Studio & VOICEVOX).');
      setProviderStatus('Offline Local AI · LM Studio (Qwen 2.5 7B)');
    }
    setStudio((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
        ...(cleanApiKey !== undefined ? { apiKey: cleanApiKey } : {}),
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const handleValidateAndActivateKey = useCallback(
    async (overrideKey?: string): Promise<boolean> => {
      const currentSettings = studioRef.current.settings;
      const keyToTest = sanitizeApiKey(overrideKey ?? currentSettings.apiKey);
      const isLocal =
        currentSettings.preferLocalAi ||
        keyToTest.toLowerCase() === 'local' ||
        keyToTest.toLowerCase() === 'lm-studio';

      if (!keyToTest && !isLocal) {
        setConnectionMode('demo');
        setValidationMessage(null);
        return false;
      }

      if (keyToTest && !isLocal) {
        saveKeyToLocalStorage(keyToTest);
      }
      setIsValidatingKey(true);
      setValidationMessage(null);

      try {
        const result = await validateGeminiApiKey({
          apiKey: isLocal ? 'local' : keyToTest,
          keyMode: currentSettings.keyMode,
          model: currentSettings.textModel || 'gemini-flash-latest',
        });

        if (result.ok) {
          hasAutoPromptedAuthRef.current = false;
          if (result.model && result.model !== currentSettings.textModel) {
            handleUpdateSettings({ textModel: result.model });
          }
          setConnectionMode('live');
          setApiErrorToast(null);
          setValidationMessage(`Verified! Connected to ${result.endpoint} (${result.model}).`);
          setProviderStatus(
            isLocal
              ? `Offline Local AI · ${result.model}`
              : `Live Gemini (${result.model})`
          );
          return true;
        }

        setConnectionMode('error');
        const errMsg =
          result.error ||
          (isLocal
            ? 'LM Studio server is not running on http://localhost:1234. Please click "Start Server" in LM Studio.'
            : 'Gemini API key validation failed.');
        setApiErrorToast(errMsg);
        setValidationMessage(errMsg);
        setProviderStatus(`API Error — ${errMsg}`);
        return false;
      } finally {
        setIsValidatingKey(false);
      }
    },
    [handleUpdateSettings]
  );

  const triggerMemorySummary = useCallback(async (personaId: string) => {
    const current = studioRef.current;
    const target = current.personas.find((p) => p.id === personaId);
    if (!target) return;

    setIsSummarizingMemory(true);
    try {
      const newFacts = await summarizeConversationMemories({
        persona: target,
        settings: current.settings,
      });
      if (newFacts.length === 0) return;

      const now = Date.now();
      setStudio((prev) => ({
        ...prev,
        personas: prev.personas.map((p) => {
          if (p.id !== personaId) return p;
          const existingSet = new Set(p.memoryJournal.map((m) => m.fact.toLowerCase()));
          const additions: MemoryEntry[] = newFacts
            .filter((f) => !existingSet.has(f.toLowerCase()))
            .map((fact, idx) => ({
              id: `mem-${now}-${idx}`,
              fact,
              createdAt: now,
            }));
          return {
            ...p,
            memoryJournal: [...p.memoryJournal, ...additions].slice(-30),
            lastMemorySummaryMsgCount: p.messages.length,
            updatedAt: now,
          };
        }),
      }));
    } finally {
      setIsSummarizingMemory(false);
    }
  }, []);

  // Build Autonomous Tool Executor for Gemini Function Calling (`move_on_stage`, `travel_to_location`, `switch_own_outfit`)
  // Live desktop snapshot (active app, open apps, what is playing). Only polled when 👁️ is enabled.
  const refreshDesktopSnapshot = useCallback(async (maxAgeMs = 0): Promise<DesktopSnapshot | null> => {
    const cached = desktopSnapshotRef.current;
    if (cached && maxAgeMs > 0 && Date.now() - (cached.capturedAt ?? 0) < maxAgeMs) return cached;
    const api = window.studioAPI?.getDesktopSnapshot || window.desktopBridge?.getDesktopSnapshot;
    if (!api) return cached;
    try {
      const snap = await Promise.race<DesktopSnapshot | null>([
        api(),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 3500)),
      ]);
      if (snap?.ok) {
        desktopSnapshotRef.current = snap;
        return snap;
      }
    } catch {
      // keep last known snapshot
    }
    return desktopSnapshotRef.current;
  }, []);

  const buildToolExecutor = useCallback((): AutonomousToolExecutor => {
    return {
      moveOnStage: ({ targetX, targetY, behavior }) => {
        const id = roamCommandSeqRef.current++;
        setRoamCommand({ id, targetX, targetY, behavior });
        const summary = `Moved on stage (${behavior} → x:${targetX.toFixed(2)})`;
        setAutonomousActionToast(`✨ Autonomous Move: ${summary}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      travelToLocation: ({ location }: { location: AutonomousToolLocation }) => {
        const mappedEnv = mapToolLocationToEnvironment(location);
        const envName = STAGE_ENVIRONMENTS[mappedEnv].name;
        updateActivePersona((p) => ({
          ...p,
          stageEnvironment: mappedEnv,
          customEnvironment: null,
          updatedAt: Date.now(),
        }));
        const summary = `Traveled to ${envName}`;
        setAutonomousActionToast(`🌌 Autonomous Travel: ${envName}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      switchOwnOutfit: ({ slotIndex, reason }) => {
        const curPersona =
          studioRef.current.personas.find(
            (p) => p.id === studioRef.current.activePersonaId
          ) || studioRef.current.personas[0];
        const safeIdx = Math.max(
          0,
          Math.min(curPersona.outfitSlots.length - 1, Math.floor(slotIndex))
        );
        const targetSlot = curPersona.outfitSlots[safeIdx];
        if (!targetSlot) return 'No outfit slot found';

        updateActivePersona((p) => ({
          ...p,
          activeOutfitSlotId: targetSlot.id,
          updatedAt: Date.now(),
        }));
        const summary = `Switched own outfit to "${targetSlot.name}" (${reason})`;
        setAutonomousActionToast(`👗 Autonomous Outfit: ${targetSlot.name}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      switchVrmModel: ({ modelTarget, reason }) => {
        const res = switchToVrmRef.current(modelTarget, { reason });
        if (!res.switched) {
          return `Could not find VRM model "${modelTarget}" in Vault`;
        }
        return `Switched active 3D VRM model to "${res.label}" (${reason})`;
      },
      triggerEmote: ({ emoteId, reason }) => {
        const id = emoteCommandSeqRef.current++;
        setEmoteCommand({ id, emoteId });
        const summary = `Performed emote "${emoteId}" (${reason})`;
        setAutonomousActionToast(`✨ Autonomous Emote: ${emoteId.replace(/_/g, ' ')}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      adjustSleepingPosition: ({ position, reason }: { position: string; reason: string }) => {
        const validPos: SleepingPosition = [
          'back_relaxed',
          'side_curled_right',
          'side_curled_left',
          'hugging_pillow',
          'sprawled',
        ].includes(position)
          ? (position as SleepingPosition)
          : 'side_curled_right';

        updateActivePersona((p) => ({
          ...p,
          brain: {
            ...p.brain,
            isSleeping: true,
            sleepingPosition: validPos,
          },
        }));
        handleUpdateSettings({ defaultPosture: 'sleeping' });
        const summary = `Shifted sleeping position to ${validPos} (${reason})`;
        setAutonomousActionToast(`💤 Sleep Position: ${validPos.replace(/_/g, ' ')}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      changePosture: ({ posture, reason }: { posture: string; reason: string }) => {
        const validPosture = (['seated', 'standing', 'sleeping'].includes(posture)
          ? posture
          : 'seated') as AvatarPosture;
        handleUpdateSettings({ defaultPosture: validPosture });
        if (validPosture === 'sleeping') {
          updateActivePersona((p) => ({
            ...p,
            brain: { ...p.brain, isSleeping: true },
          }));
        } else {
          updateActivePersona((p) => ({
            ...p,
            brain: { ...p.brain, isSleeping: false },
          }));
        }
        const labels: Record<AvatarPosture, string> = {
          seated: 'sat down on the studio stool',
          standing: 'stood up freely',
          sleeping: 'laid down to rest in bed',
        };
        const summary = `Switched posture to ${validPosture} (${reason})`;
        setAutonomousActionToast(`🧍 ${labels[validPosture]}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      moveToDisplay: ({ targetDisplay, reason }: { targetDisplay: string; reason: string }) => {
        let chosen: number | string | 'all' = targetDisplay;
        if (targetDisplay === 'next') {
          const currentIdx = connectedDisplays.findIndex((d) => d.id === activeDisplayTarget);
          if (connectedDisplays.length > 1) {
            const nextIdx = (currentIdx + 1) % connectedDisplays.length;
            chosen = connectedDisplays[nextIdx].id;
          }
        } else if (targetDisplay === 'primary') {
          const prim = connectedDisplays.find((d) => d.isPrimary);
          if (prim) chosen = prim.id;
        } else if (targetDisplay === 'secondary') {
          const sec = connectedDisplays.find((d) => !d.isPrimary);
          if (sec) chosen = sec.id;
        }
        void handleMoveToDisplay(chosen);
        const summary = `Moved to display "${chosen}" (${reason})`;
        setAutonomousActionToast(`🖥️ Strolling to Display: ${chosen}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
      takeSelfCare: ({ activity, reason }: { activity: CareActivityId; reason: string }) => {
        handleCareActivityRef.current(activity);
        const summary = `Engaged in self-care activity "${activity}" (${reason})`;
        return summary;
      },
      listRunningApps: () => {
        if (!studioRef.current.settings.noticeActiveWindow) {
          return "I can't see Producer's desktop right now because the 👁️ Notice Active Window option is off. Ask them to turn it on if they want me to look.";
        }
        void refreshDesktopSnapshot(0);
        const described = describeDesktopSnapshot(desktopSnapshotRef.current);
        setAutonomousActionToast('🖥️ Checking what is open...');
        window.setTimeout(() => setAutonomousActionToast(null), 2500);
        return described ? `${described}.` : 'Nothing visible on the desktop right now.';
      },
      launchApp: ({ target, reason }: { target: string; reason: string }) => {
        const api = window.studioAPI || window.desktopBridge;
        if (!api?.launchApp) return 'App launching is only available in the desktop build.';
        setAutonomousActionToast(`🚀 Opening ${target}...`);
        void api.launchApp(target).then((res) => {
          setAutonomousActionToast(
            res?.ok ? `🚀 Opened: ${target}` : `⚠️ Could not open ${target}: ${res?.error || 'unknown error'}`
          );
          window.setTimeout(() => setAutonomousActionToast(null), 3500);
        });
        return `Asked Windows to open ${target} (${reason})`;
      },
      closeApp: ({ appName, reason }: { appName: string; reason: string }) => {
        const api = window.studioAPI || window.desktopBridge;
        if (!api?.closeApp) return 'Closing apps is only available in the desktop build.';
        setAutonomousActionToast(`🛑 Closing ${appName}...`);
        void api.closeApp(appName).then((res) => {
          setAutonomousActionToast(
            res?.ok ? `🛑 Asked ${appName} to close` : `⚠️ Could not close ${appName}: ${res?.error || 'not found'}`
          );
          window.setTimeout(() => setAutonomousActionToast(null), 3500);
        });
        return `Asked ${appName} to close like clicking its X; it may ask to save first (${reason})`;
      },
      focusApp: ({ appName }: { appName: string }) => {
        const api = window.studioAPI || window.desktopBridge;
        if (!api?.focusApp) return 'Switching windows is only available in the desktop build.';
        void api.focusApp(appName).then((res) => {
          setAutonomousActionToast(
            res?.ok ? `🔍 Switched to ${appName}` : `⚠️ No window found for ${appName}`
          );
          window.setTimeout(() => setAutonomousActionToast(null), 3000);
        });
        return `Asked Windows to bring ${appName} to the front`;
      },
      generateStage: ({ prompt, style }: { prompt: string; style?: string }) => {
        generateStageRef.current(prompt, style);
        return `Started painting a new stage backdrop: "${prompt}". It appears in a few seconds.`;
      },
    };
  }, [
    activeDisplayTarget,
    connectedDisplays,
    handleMoveToDisplay,
    handleUpdateSettings,
    updateActivePersona,
  ]);

  // Desktop screen capture helper for multimodal vision
  const handleCaptureScreen = useCallback(async (): Promise<{
    mimeType: string;
    base64: string;
  } | null> => {
    try {
      const api = window.studioAPI?.captureScreen || window.desktopBridge?.captureScreen;
      if (api) {
        const res = await api();
        if (res.ok && res.base64) {
          return {
            mimeType: res.mimeType || 'image/jpeg',
            base64: res.base64,
          };
        }
      }
    } catch (err) {
      console.warn('[Screen Vision] Capture error:', err);
    }
    return null;
  }, []);

  // Core AI Turn Runner (with Gemini Autonomous Tools + Multimodal Vision)
  const runAiTurn = useCallback(
    async (
      promptText: string,
      role: 'user' | 'system_event',
      options?: { attachedImage?: { mimeType: string; base64: string } }
    ) => {
      const currentState = studioRef.current;
      const persona =
        currentState.personas.find((p) => p.id === currentState.activePersonaId) ||
        currentState.personas[0];

      let effectiveAttachedImage = options?.attachedImage;
      if (
        !effectiveAttachedImage &&
        role === 'user' &&
        /(look at.*(screen|monitor|display)|what('s| is) on my screen|see this|画面見て)/i.test(promptText)
      ) {
        const captured = await handleCaptureScreen();
        if (captured) {
          effectiveAttachedImage = captured;
          setAutonomousActionToast('👁️ Screen Attached to Vision');
          window.setTimeout(() => setAutonomousActionToast(null), 2500);
        }
      }

      const pendingNotes =
        role === 'user' && persona.pendingSystemEvents?.length
          ? [...persona.pendingSystemEvents]
          : [];

      // Live desktop context (opt-in via 👁️): what is in front, what is open, what is playing.
      let desktopNote: string | null = null;
      if (currentState.settings.noticeActiveWindow) {
        desktopNote = buildDesktopContextNote(await refreshDesktopSnapshot(8000));
      }
      const queuedHiddenNotes = desktopNote ? [desktopNote, ...pendingNotes] : pendingNotes;

      const personaId = persona.id;
      const userEmpathyCue = role === 'user' && detectUserEmpathyCue(promptText);
      const isNapPrompt = promptText.includes('nap') || promptText.includes('sleep');

      if (role === 'user') {
        lastUserActivityAtRef.current = Date.now();
        if (userEmpathyCue) {
          setMicroTellCommand({ id: microTellSeqRef.current++, kind: 'sigh' });
        }

        const outgoingMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'user',
          rawText: promptText,
          segments: [{ kind: 'dialogue', text: promptText }],
          spokenText: '',
          timestamp: Date.now(),
        };

        setStudio((prev) => ({
          ...prev,
          personas: prev.personas.map((p) =>
            p.id === personaId
              ? {
                ...p,
                brain: p.brain.isSleeping ? { ...p.brain, isSleeping: false } : p.brain,
                messages: [...p.messages, outgoingMsg],
                pendingSystemEvents: [],
                updatedAt: Date.now(),
              }
              : p
          ),
        }));
      }

      setIsGenerating(true);

      try {
        const reply = await generatePersonaReply({
          persona,
          settings: currentState.settings,
          userPrompt: promptText,
          hiddenSystemNotes: queuedHiddenNotes,
          toolExecutor: buildToolExecutor(),
          detectedMeshes: detectedMeshesRef.current,
          overrideVaultModels: vaultModelsRef.current,
          attachedImage: effectiveAttachedImage,
        });

        lastFailedTurnRef.current = null;
        hasAutoPromptedAuthRef.current = false;
        setApiErrorToast(null);
        setConnectionMode(reply.isFallback ? 'demo' : 'live');
        if (reply.resolvedModel && reply.resolvedModel !== currentState.settings.textModel) {
          handleUpdateSettings({ textModel: reply.resolvedModel });
        }

        const parsed = parseDialogueResponse(reply.rawText, persona.mood);

        // AI-triggered AI VRM Type Generation tag: [GENERATE_VRM: ...]
        if (parsed.generateVrmAction) {
          generateVrmRef.current(parsed.generateVrmAction);
        }

        // AI-triggered VRM Model Type switch action tag: [SWITCH_VRM: ...]
        if (parsed.switchVrmAction) {
          switchToVrmRef.current(parsed.switchVrmAction);
        }

        // AI-triggered Wardrobe change action tag: [EQUIP_OUTFIT: ...]
        // Supports saved outfit slots AND any imported full-body .vrm / .glb models in Vault!
        if (parsed.outfitAction) {
          equipWholeOutfitRef.current(parsed.outfitAction.slotTarget);
        }

        // AI-triggered Clothing layer toggle action tags: [TOGGLE_LAYER: <name>=on|off]
        if (parsed.layerActions && parsed.layerActions.length > 0) {
          for (const act of parsed.layerActions) {
            const nameLower = act.layerName.trim().toLowerCase();
            if (
              nameLower.includes('cycling') ||
              nameLower.includes('spat') ||
              nameLower.includes('safety short')
            ) {
              updateActiveSlot((slot) => ({
                ...slot,
                cyclingShorts: act.visible,
              }));
              setAutonomousActionToast(
                `🚴‍♀️ Cycling Shorts: ${act.visible ? 'Equipped' : 'Removed'}`
              );
              window.setTimeout(() => setAutonomousActionToast(null), 3500);
            } else {
              const currentMeshes = detectedMeshesRef.current;
              const matchedMesh = currentMeshes.find(
                (m) =>
                  m.name.toLowerCase() === nameLower ||
                  m.label.toLowerCase() === nameLower ||
                  m.label.toLowerCase().includes(nameLower) ||
                  nameLower.includes(m.label.toLowerCase())
              );
              if (matchedMesh) {
                updateActiveSlot((slot) => ({
                  ...slot,
                  meshVisibility: {
                    ...slot.meshVisibility,
                    [matchedMesh.name]: act.visible,
                  },
                }));
                setAutonomousActionToast(
                  `✨ ${matchedMesh.label}: ${act.visible ? 'ON' : 'OFF'}`
                );
                window.setTimeout(() => setAutonomousActionToast(null), 3500);
              }
            }
          }
        }

        // AI-triggered physical posture change tag: [POSTURE: seated | standing | sleeping]
        if (parsed.postureAction) {
          handleUpdateSettings({ defaultPosture: parsed.postureAction });
          if (parsed.postureAction === 'sleeping') {
            updateActivePersona((p) => ({
              ...p,
              brain: { ...p.brain, isSleeping: true },
            }));
          } else {
            updateActivePersona((p) => ({
              ...p,
              brain: { ...p.brain, isSleeping: false },
            }));
          }
          const postureLabels = {
            seated: 'sat down on the studio stool',
            standing: 'stood up gracefully',
            sleeping: 'lay down on the cozy bed',
          };
          setAutonomousActionToast(`🧘 ${persona.name} ${postureLabels[parsed.postureAction]}`);
          window.setTimeout(() => setAutonomousActionToast(null), 3500);
        }

        // AI-triggered 3D Stage / Desktop Roam move tag: [MOVE: walk | peek | sit_taskbar | approach_user]
        if (parsed.moveAction) {
          const id = roamCommandSeqRef.current++;
          const targetX =
            parsed.moveAction === 'peek'
              ? Math.random() < 0.5
                ? -0.85
                : 0.85
              : parsed.moveAction === 'approach_user'
              ? 0.12
              : (Math.random() - 0.5) * 0.65;
          const targetY = 0;
          setRoamCommand({ id, targetX, targetY, behavior: parsed.moveAction });
        }

        // AI-triggered procedural expressive emote / pose tag: [POSE: ...] or [EMOTE: ...]
        if (parsed.poseAction || parsed.emoteAction) {
          const emoteId = (parsed.poseAction || parsed.emoteAction) as ProceduralEmoteId;
          const id = emoteCommandSeqRef.current++;
          setEmoteCommand({ id, emoteId });
        }

        // AI-triggered autonomous eye & head gaze tracking tag: [GAZE: camera | mouse | look_away | shy_down | screen]
        if (parsed.gazeAction) {
          const id = gazeCommandSeqRef.current++;
          setGazeCommand({ id, target: parsed.gazeAction });
        }

        // AI-triggered autonomous facial blendshape expression tag: [EXPRESSION: ...]
        if (parsed.expressionAction) {
          const id = expressionCommandSeqRef.current++;
          setExpressionCommand({ id, expression: parsed.expressionAction });
        }

        // Local-model action tags: [LAUNCH_APP: ...] [CLOSE_APP: ...] [FOCUS_APP: ...] [LIST_APPS]
        // (skipped when the same action already ran as a Gemini tool call this turn)
        if (parsed.appActions.length > 0) {
          const ex = buildToolExecutor();
          const ran = new Set(reply.toolEvents.map((ev) => ev.name));
          for (const act of parsed.appActions.slice(0, 3)) {
            if (act.type === 'launch' && act.target && !ran.has('launch_app')) {
              ex.launchApp?.({ target: act.target, reason: 'asked in chat' });
            } else if (act.type === 'close' && act.target && !ran.has('close_app')) {
              ex.closeApp?.({ appName: act.target, reason: 'asked in chat' });
            } else if (act.type === 'focus' && act.target && !ran.has('focus_app')) {
              ex.focusApp?.({ appName: act.target });
            } else if (act.type === 'list' && !ran.has('list_running_apps')) {
              ex.listRunningApps?.({});
            }
          }
        }

        // AI-triggered scenery: [GENERATE_STAGE: <description>]
        if (parsed.stageAction && !reply.toolEvents.some((ev) => ev.name === 'generate_stage')) {
          generateStageRef.current(parsed.stageAction);
        }

        // AI-triggered autonomous outfit design: [DESIGN_OUTFIT: <occasion & outfit description>]
        if (parsed.designOutfitAction) {
          designOutfitRef.current(parsed.designOutfitAction);
        }

        // AI-triggered autonomous hairstyle change: [CHANGE_HAIRSTYLE: <style & optional color>]
        if (parsed.hairStyleAction) {
          changeHairStyleRef.current(parsed.hairStyleAction);
        }

        // AI-triggered dining table + mood food craving: [EAT_FOOD: <dish>]
        if (parsed.eatFoodAction) {
          eatFoodRef.current(parsed.eatFoodAction);
        }

        // AI-triggered 3D hobby station: [DO_HOBBY: <hobby>]
        if (parsed.doHobbyAction) {
          doHobbyRef.current(parsed.doHobbyAction);
        }

        // AI-triggered destination / vacation scenery change: [VISIT_PLACE: <destination>]
        if (parsed.visitPlaceAction) {
          visitPlaceRef.current(parsed.visitPlaceAction);
        }

        // AI-triggered school / college studying in uniform with pen & paper: [STUDY_SCHOOL: <subject>]
        if (parsed.studySchoolAction) {
          studySchoolRef.current(parsed.studySchoolAction);
        }

        // AI-triggered SFW censored shower / towel / toothbrush routine: [SELF_CARE_BATH: <routine>]
        if (parsed.bathCareAction) {
          bathCareRef.current(parsed.bathCareAction);
        }

        // AI-triggered Gym & Sports session: [DO_GYM_SPORT: <workout or sport>]
        if (parsed.gymSportAction) {
          gymSportRef.current(parsed.gymSportAction);
        }

        // AI-triggered Flexible Anatomical Stretching: [DO_STRETCH: <routine or feeling>]
        if (parsed.stretchAction) {
          stretchRef.current(parsed.stretchAction);
        }
        const toolEventsMsgs: ChatMessage[] = reply.toolEvents.map((ev, idx) => ({
          id: `msg-tool-${Date.now()}-${idx}`,
          role: 'system_event',
          rawText: `[AUTONOMOUS ACTION · ${ev.name}: ${ev.summary}]`,
          segments: [{ kind: 'dialogue', text: ev.summary }],
          spokenText: '',
          timestamp: Date.now(),
        }));

        const assistantMsg: ChatMessage = {
          id: `msg-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          rawText: reply.rawText,
          segments: parsed.segments,
          spokenText: parsed.spokenText,
          mood: parsed.mood,
          affinityDelta: parsed.affinityDelta,
          timestamp: Date.now(),
          isFallback: reply.isFallback,
        };

        setProviderStatus(reply.providerNote);
        if (parsed.affinityDelta !== 0) setLastAffinityDelta(parsed.affinityDelta);

        let shouldAutoSummarize = false;

        setStudio((prev) => ({
          ...prev,
          personas: prev.personas.map((p) => {
            if (p.id !== personaId) return p;
            const nextMsgs = [...p.messages, ...toolEventsMsgs, assistantMsg];
            const nextAffinity = Math.max(
              0,
              Math.min(100, p.affinity + parsed.affinityDelta)
            );
            if (nextMsgs.length - p.lastMemorySummaryMsgCount >= 12) {
              shouldAutoSummarize = true;
            }
            const nextThoughtText =
              parsed.innerThought ||
              pickMoodInnerThought(parsed.mood, p.brain?.currentThought);
            const thoughtEntry: BrainThought = {
              id: `th-ai-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              text: nextThoughtText,
              trigger: role === 'user' ? 'chat' : 'interaction',
              timestamp: Date.now(),
            };
            const prevBrain = p.brain;
            const nextCarryover = advanceEmotionalCarryover({
              prev: prevBrain.carryover,
              parsedMood: parsed.mood,
              parsedFeeling: parsed.nuancedFeeling,
              userTriggeredEmpathy: userEmpathyCue,
            });
            const nextBrainBase = {
              ...prevBrain,
              boredom: Math.max(5, Number((prevBrain.boredom - 26).toFixed(1))),
              curiosity: Math.min(100, Number((prevBrain.curiosity + 4).toFixed(1))),
              isSleeping: isNapPrompt ? true : role === 'user' ? false : prevBrain.isSleeping,
              carryover: nextCarryover,
              currentThought: nextThoughtText,
              thoughtStream: [...(prevBrain.thoughtStream || []), thoughtEntry].slice(-12),
            };
            const resolvedFeeling =
              parsed.nuancedFeeling ||
              nextCarryover?.feeling ||
              deriveDefaultNuancedFeeling(parsed.mood, nextBrainBase);

            const nextArchetype = resolveAiDrivenArchetype({
              baseArchetype: p.voice.archetype,
              mood: parsed.mood,
              gender: p.voice.gender,
              isSleeping: nextBrainBase.isSleeping,
              sleepiness: nextBrainBase.sleepiness,
              nuancedFeeling: resolvedFeeling,
              traits: p.traits,
              explicitTag: parsed.archetype,
            });

            return {
              ...p,
              mood: parsed.mood,
              emotionIntensity: parsed.emotionIntensity,
              affinity: nextAffinity,
              voice: {
                ...p.voice,
                archetype: nextArchetype,
              },
              brain: {
                ...nextBrainBase,
                nuancedFeeling: resolvedFeeling,
              },
              messages: nextMsgs,
              updatedAt: Date.now(),
            };
          }),
        }));

        if (shouldAutoSummarize) void triggerMemorySummary(personaId);

        const latestPersona =
          studioRef.current.personas.find((p) => p.id === personaId) || persona;
        if (latestPersona.voice.autoSpeak && parsed.spokenText) {
          void voiceEngine.speakRawDialogue({
            rawText: reply.rawText,
            mood: parsed.mood,
            voice: latestPersona.voice,
            settings: studioRef.current.settings,
            personaName: latestPersona.name,
            emotionIntensity: parsed.emotionIntensity,
            hunger: latestPersona.brain?.hunger,
            sleepiness: latestPersona.brain?.sleepiness,
            boredom: latestPersona.brain?.boredom,
            comfort: latestPersona.brain?.comfort,
            isSleeping: latestPersona.brain?.isSleeping,
            nuancedFeeling:
              parsed.nuancedFeeling || latestPersona.brain?.nuancedFeeling,
            empathySoftening: Boolean(
              userEmpathyCue || latestPersona.brain?.carryover?.empathySoftening
            ),
            recentInteractionZone: recentInteractionZoneRef.current,
            onResolvedTtsModel: (resolvedTts) => {
              if (resolvedTts && resolvedTts !== studioRef.current.settings.ttsModel) {
                handleUpdateSettings({ ttsModel: resolvedTts });
              }
            },
          });
        }
      } catch (err) {
        const reason =
          err instanceof GeminiApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);

        lastFailedTurnRef.current = { promptText, role };
        const isOffline = currentState.settings.enableGeminiCloud === false || currentState.settings.preferLocalAi;
        if (!isOffline) {
          setConnectionMode('error');
          setApiErrorToast(reason);
          setProviderStatus(`API Error — ${reason}`);

          const isAuthFailure =
            (err instanceof GeminiApiError &&
              (err.statusCode === 401 || err.statusCode === 403)) ||
            /API key not valid|API_KEY_INVALID|UNAUTHENTICATED/i.test(reason);
          // Only auto-open Settings once per session for actual invalid-key auth errors
          if (isAuthFailure && !hasAutoPromptedAuthRef.current) {
            hasAutoPromptedAuthRef.current = true;
            setIsSettingsOpen(true);
          }
        } else {
          setConnectionMode('demo');
          setApiErrorToast(null);
          setProviderStatus('Offline Local AI / Demo Active');
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [buildToolExecutor, handleCaptureScreen, refreshDesktopSnapshot, triggerMemorySummary]
  );

  const handleInspectScreen = useCallback(async () => {
    setAutonomousActionToast('👁️ Capturing Desktop Screen for AI Vision...');
    const captured = await handleCaptureScreen();
    window.setTimeout(() => setAutonomousActionToast(null), 2500);
    const prompt = 'Look at my screen right now! What am I working on, looking at, or doing?';
    void runAiTurn(prompt, 'user', { attachedImage: captured || undefined });
  }, [handleCaptureScreen, runAiTurn]);

  // Opt-In Active-Window Awareness Polling (👁️ PC Context — strictly local, off by default)
  const triggerPcContextReaction = useCallback(
    (appName: string) => {
      setActivePcApp(appName);
      const userName = studioRef.current.settings.userName.trim() || 'Producer';
      const prompt = `[PC CONTEXT: ${userName} is currently using "${appName}". React spontaneously in Japanese Tsundere character as their desktop companion!]`;
      void runAiTurn(prompt, 'system_event');
    },
    [runAiTurn]
  );

  useEffect(() => {
    if (!studio.settings.noticeActiveWindow) {
      setActivePcApp(null);
      return;
    }

    const poll = async () => {
      if (!window.studioAPI?.getActiveWindowTitle) return;
      try {
        const res = await window.studioAPI.getActiveWindowTitle();
        const appName = res?.appName;
        if (!appName) return;
        setActivePcApp(appName);

        const now = Date.now();
        const changed = appName !== lastPcAppReactedRef.current;
        const cooledDown = now - lastPcReactionAtRef.current > 60000;
        if (changed && cooledDown) {
          lastPcAppReactedRef.current = appName;
          lastPcReactionAtRef.current = now;
          triggerPcContextReaction(appName);
        }
      } catch {
        // ignore polling error
      }
    };

    const intervalId = window.setInterval(() => void poll(), 15000);
    return () => window.clearInterval(intervalId);
  }, [studio.settings.noticeActiveWindow, triggerPcContextReaction]);

  // Listening along (👁️ opt-in): notice when Producer starts a new song/video and react naturally.
  useEffect(() => {
    if (!studio.settings.noticeActiveWindow) {
      lastMusicKeyRef.current = undefined;
      return;
    }
    const poll = async () => {
      const snap = await refreshDesktopSnapshot(0);
      const key = nowPlayingKey(snap);
      const previous = lastMusicKeyRef.current;
      lastMusicKeyRef.current = key;
      // First observation just records what is already playing; only react to changes.
      if (previous === undefined || !key || key === previous || !snap?.nowPlaying) return;

      const now = Date.now();
      if (now - lastMusicReactionAtRef.current < 180000) return;
      if (isGeneratingRef.current || now - lastUserActivityAtRef.current < 20000) return;
      lastMusicReactionAtRef.current = now;

      const userName = studioRef.current.settings.userName.trim() || 'Producer';
      void runAiTurn(
        `[Context: ${userName} just started listening to ${describeNowPlaying(snap.nowPlaying)}. React naturally in your own words: a short comment, humming along, or a question. Don't repeat yourself.]`,
        'system_event'
      );
    };
    const intervalId = window.setInterval(() => void poll(), 20000);
    return () => window.clearInterval(intervalId);
  }, [studio.settings.noticeActiveWindow, refreshDesktopSnapshot, runAiTurn]);

  // === Autonomous Idle Check-Ins & Break Reminders (⏰) ===
  const triggerIdleCheckIn = useCallback(
    (idleMinutes: number, isManualTest = false) => {
      const userName = studioRef.current.settings.userName.trim() || 'Producer';
      if (!isManualTest) {
        lastIdleCheckInAtRef.current = Date.now();
      }
      lastUserActivityAtRef.current = Date.now();

      // Gently reveal overlay without stealing focus & walk/peek character into view
      window.studioAPI?.revealOverlayForCheckIn?.();
      const id = roamCommandSeqRef.current++;
      setRoamCommand({
        id,
        targetX: Math.random() < 0.5 ? 0.72 : -0.72,
        targetY: 0.02,
        behavior: 'peek',
      });
      setAutonomousActionToast(`⏰ Proactive Break Check-In (${idleMinutes}m idle)`);
      window.setTimeout(() => setAutonomousActionToast(null), 4000);

      const prompt = `[SYSTEM EVENT: ${userName} has been quiet/idle for ${idleMinutes} minutes. Proactively check in on them in your Japanese Tsundere persona—e.g., tell them to rest their eyes, stretch, drink water, or ask what they're working on without sounding overly soft.]`;
      void runAiTurn(prompt, 'system_event');
    },
    [runAiTurn]
  );

  // Track user mouse, keyboard & pointer activity + poll OS idle timer every 20s
  useEffect(() => {
    const bumpActivity = () => {
      const now = Date.now();
      lastUserActivityAtRef.current = now;
      lastCursorActiveAtRef.current = now;
      void voiceEngine.unlockAudio();
    };
    window.addEventListener('mousemove', bumpActivity, { passive: true });
    window.addEventListener('keydown', bumpActivity, { passive: true });
    window.addEventListener('pointerdown', bumpActivity, { passive: true });

    const intervalId = window.setInterval(async () => {
      const cfg = studioRef.current.settings;
      if (!cfg.idleCheckInMinutes || cfg.idleCheckInMinutes <= 0) return;
      if (cfg.doNotDisturb) return;
      if (isGeneratingRef.current || isSpeakingRef.current) return;

      const now = Date.now();
      // Enforce minimum 15-minute cooldown between proactive check-ins
      if (now - lastIdleCheckInAtRef.current < 15 * 60 * 1000) return;

      let effectiveIdleSec = Math.floor((now - lastUserActivityAtRef.current) / 1000);

      if (window.studioAPI?.getSystemIdleAndFullscreenState) {
        try {
          const sys = await window.studioAPI.getSystemIdleAndFullscreenState();
          if (cfg.idleRespectDndFullscreen && sys.isFullscreenApp) {
            return;
          }
          // Use the smaller of OS idle vs in-app idle so active work outside app still respects quiet time,
          // OR if away from desk, use OS idle time
          effectiveIdleSec = Math.max(effectiveIdleSec, sys.idleSeconds);
        } catch {
          // fallback to in-app timer
        }
      }

      if (effectiveIdleSec >= cfg.idleCheckInMinutes * 60) {
        const idleMins = Math.max(cfg.idleCheckInMinutes, Math.round(effectiveIdleSec / 60));
        triggerIdleCheckIn(idleMins, false);
      }
    }, 20000);

    return () => {
      window.removeEventListener('mousemove', bumpActivity);
      window.removeEventListener('keydown', bumpActivity);
      window.removeEventListener('pointerdown', bumpActivity);
      window.clearInterval(intervalId);
    };
  }, [triggerIdleCheckIn]);

  const handleCycleIdleCheckIn = () => {
    const order: IdleCheckInMinutes[] = [0, 15, 30, 60];
    const idx = order.indexOf(studio.settings.idleCheckInMinutes);
    const next = order[(idx + 1) % order.length];
    handleUpdateSettings({ idleCheckInMinutes: next, doNotDisturb: false });
  };

  // === Autonomous AI Brain (🧠) Self-Initiated Impulse & Circadian Human Needs Loop ===
  const fireMicroTell = useCallback((kind: MicroTellKind) => {
    if (kind === 'none') return;
    setMicroTellCommand({ id: microTellSeqRef.current++, kind });
  }, []);

  const triggerBrainImpulse = useCallback(
    (reason: AutonomousNeedTrigger, isManualTest = false) => {
      if (isGeneratingRef.current) return;
      const currentState = studioRef.current;
      const persona =
        currentState.personas.find((p) => p.id === currentState.activePersonaId) ||
        currentState.personas[0];
      const userName = currentState.settings.userName.trim() || 'Producer';
      const now = Date.now();

      const thoughtByReason: Record<AutonomousNeedTrigger, string> = {
        hunger: 'My stomach is definitely complaining... maybe we should grab tea or a snack.',
        sleepiness: 'Mmm... my eyelids feel heavy. Hope Producer gets some rest soon too...',
        comfort: 'It feels a little chilly in here... a warm blanket would be nice.',
        boredom: 'Fine! If he is going to ignore me, I will make him look over here myself!',
        curiosity: 'Ooh, what is Producer focusing on right now? Let me peek closer...',
      };
      const tellByReason: Record<AutonomousNeedTrigger, MicroTellKind> = {
        hunger: 'sigh',
        sleepiness: 'yawn',
        comfort: 'cold_shiver',
        boredom: 'sigh',
        curiosity: 'none',
      };
      const impulseThought = thoughtByReason[reason];

      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          boredom: reason === 'boredom' ? 24 : Math.max(10, p.brain.boredom - 10),
          curiosity: reason === 'curiosity' ? 46 : Math.min(100, p.brain.curiosity + 6),
          currentThought: impulseThought,
          thoughtStream: [
            ...(p.brain.thoughtStream || []),
            {
              id: `th-imp-${now}`,
              text: impulseThought,
              trigger: reason,
              timestamp: now,
            },
          ].slice(-12),
          lastAutonomousActionAt: now,
        },
        updatedAt: now,
      }));

      fireMicroTell(tellByReason[reason]);

      // Walk closer / peek toward camera as she speaks spontaneously
      const id = roamCommandSeqRef.current++;
      setRoamCommand({
        id,
        targetX: reason === 'curiosity' ? 0.22 : (Math.random() - 0.5) * 0.42,
        targetY: 0,
        targetZ: 0.25,
        behavior: reason === 'curiosity' ? 'peek' : 'approach_user',
      });
      setAutonomousActionToast(
        isManualTest
          ? `🧠 Autonomous Human Need (${reason})`
          : `🧠 Self-Initiated ${reason.charAt(0).toUpperCase() + reason.slice(1)} Check`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 3600);

      const prompt = buildAutonomousBrainPrompt(persona, userName, reason);
      void runAiTurn(prompt, 'system_event');
    },
    [fireMicroTell, runAiTurn, updateActivePersona]
  );

  // Interactive Care & Activities Bar Handler (☕)
  const handleCareActivity = useCallback(
    (activity: CareActivityId) => {
      handleCareActivityRef.current = handleCareActivity;
      if (isGeneratingRef.current) return;
      const currentState = studioRef.current;
      const persona =
        currentState.personas.find((p) => p.id === currentState.activePersonaId) ||
        currentState.personas[0];
      const userName = currentState.settings.userName.trim() || 'Producer';
      const effect = buildCareActivityEffect(activity, userName, persona);
      const now = Date.now();

      lastUserActivityAtRef.current = now;
      setLastAffinityDelta(effect.affinityDelta);

      updateActivePersona((p) => ({
        ...p,
        mood: effect.moodOverride,
        emotionIntensity: 0.78,
        affinity: Math.max(0, Math.min(100, p.affinity + effect.affinityDelta)),
        brain: {
          ...p.brain,
          ...effect.brainPatch,
          nuancedFeeling: effect.nuancedFeeling,
          carryover:
            activity === 'comfort_blanket' || activity === 'rest_nap'
              ? {
                feeling: effect.nuancedFeeling,
                mood: effect.moodOverride,
                turnsRemaining: 3,
                empathySoftening: true,
              }
              : p.brain.carryover,
          currentThought: effect.thoughtText,
          thoughtStream: [
            ...(p.brain.thoughtStream || []),
            {
              id: `th-care-${now}`,
              text: effect.thoughtText,
              trigger: 'care' as const,
              timestamp: now,
            },
          ].slice(-12),
        },
        updatedAt: now,
      }));

      fireMicroTell(effect.microTell);
      setAutonomousActionToast(effect.toast);
      window.setTimeout(() => setAutonomousActionToast(null), 3800);

      if (activity === 'rest_nap') {
        handleUpdateSettings({ defaultPosture: 'sleeping' });
      } else if (activity === 'wake_up') {
        handleUpdateSettings({ defaultPosture: 'seated' });
      } else if (
        activity === 'snack_tea' ||
        activity === 'snack_cake' ||
        activity === 'snack_ramen'
      ) {
        // Immediately spawn 3D dining table, chair, food & teacup + synchronized eating & drinking animation!
        setAutoRoamEnabled(false);
        handleUpdateSettings({ defaultPosture: 'seated' });
        const visualMap: Record<'snack_tea' | 'snack_cake' | 'snack_ramen', FoodVisualId> = {
          snack_tea: 'tea_sweets',
          snack_cake: 'cake',
          snack_ramen: 'ramen',
        };
        const dishMap: Record<'snack_tea' | 'snack_cake' | 'snack_ramen', string> = {
          snack_tea: 'Hot Earl Grey Tea & Sweets',
          snack_cake: 'Strawberry Shortcake',
          snack_ramen: 'Steaming Midnight Ramen',
        };
        const drinkMap: Record<'snack_tea' | 'snack_cake' | 'snack_ramen', string> = {
          snack_tea: 'Hot Earl Grey Tea',
          snack_cake: 'Rose Milk Tea',
          snack_ramen: 'Iced Oolong Tea',
        };
        setLifeScene((prev) => ({
          ...prev,
          dining: {
            dishName: dishMap[activity],
            drinkName: drinkMap[activity],
            foodVisual: visualMap[activity],
            accentHex: persona.accentColor,
            moodReason: effect.thoughtText,
            withKitchenCounter: true,
          },
          hobby: null,
        }));
        void generateAiChairRef.current(`eating ${dishMap[activity]} at the dining table`);
      }

      void runAiTurn(effect.prompt, 'system_event');
    },
    [fireMicroTell, handleUpdateSettings, runAiTurn, updateActivePersona]
  );
  handleCareActivityRef.current = handleCareActivity;

  const handleWakeFromSleep = useCallback(() => {
    handleCareActivity('wake_up');
    handleUpdateSettings({ defaultPosture: 'seated' });
  }, [handleCareActivity, handleUpdateSettings]);

  // Tick Circadian Human Needs every 4 seconds and fire throttled need-driven autonomous impulses
  useEffect(() => {
    if (!hydrated) return;
    const intervalId = window.setInterval(() => {
      const current = studioRef.current;
      const persona =
        current.personas.find((p) => p.id === current.activePersonaId) || current.personas[0];
      if (!persona?.brain) return;

      const now = Date.now();
      const secondsSinceUserActivity = (now - lastUserActivityAtRef.current) / 1000;
      const sessionMinutes = (now - sessionStartAtRef.current) / 60000;
      const cursorActive = now - lastCursorActiveAtRef.current < 8000;
      const isMovingOrDancing =
        roamBehaviorRef.current === 'walk' || roamBehaviorRef.current === 'approach_user';

      const {
        nextBrain,
        shouldTriggerAutonomousImpulse,
        suggestedTell,
        naturalMoodShift,
      } = tickBrainNeeds({
        brain: persona.brain,
        mood: persona.mood,
        stageEnvironment: persona.stageEnvironment,
        secondsSinceUserActivity,
        sessionMinutes,
        isMovingOrDancing,
        cursorActive,
      });

      setStudio((prev) => ({
        ...prev,
        personas: prev.personas.map((p) =>
          p.id === persona.id
            ? { ...p, brain: nextBrain, mood: naturalMoodShift ?? p.mood }
            : p
        ),
      }));

      if (suggestedTell !== 'none' && !isSpeakingRef.current) {
        fireMicroTell(suggestedTell);
      }

      // Autonomous Character Self-Care: AI character manages her own needs without requiring user clicks
      if (nextBrain.isSleeping && nextBrain.energy >= 96) {
        handleCareActivity('wake_up');
        setAutonomousActionToast(`🌅 ${persona.name} felt refreshed and woke up gently.`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
      } else if (
        !nextBrain.isSleeping &&
        !isGeneratingRef.current &&
        !isSpeakingRef.current
      ) {
        if (nextBrain.sleepiness > 92) {
          handleCareActivity('rest_nap');
          setAutonomousActionToast(`💤 ${persona.name} felt sleepy and laid down to rest.`);
          window.setTimeout(() => setAutonomousActionToast(null), 3500);
        } else if (nextBrain.hunger > 92) {
          handleCareActivity('snack_tea');
          setAutonomousActionToast(`🍱 ${persona.name} felt hungry and enjoyed a warm tea & snack.`);
          window.setTimeout(() => setAutonomousActionToast(null), 3500);
        } else if (nextBrain.comfort < 25) {
          handleCareActivity('comfort_blanket');
          setAutonomousActionToast(`🧣 ${persona.name} felt chilly and wrapped in a cozy blanket.`);
          window.setTimeout(() => setAutonomousActionToast(null), 3500);
        }
      }

      if (
        shouldTriggerAutonomousImpulse &&
        !isGeneratingRef.current &&
        !isSpeakingRef.current &&
        !current.settings.doNotDisturb &&
        secondsSinceUserActivity > 45
      ) {
        triggerBrainImpulse(shouldTriggerAutonomousImpulse, false);
      } else {
        // Spontaneous Proactive Dialogue Chime-In (late night, deep work, or high boredom)
        const proactiveCooldown = 210000; // 3.5 minutes
        const minUserSilence = 90000; // 1.5 minutes
        const canSpeakProactively =
          !isGeneratingRef.current &&
          !isSpeakingRef.current &&
          !current.settings.doNotDisturb &&
          !nextBrain.isSleeping &&
          now - lastProactiveSpeechAtRef.current > proactiveCooldown &&
          now - lastUserActivityAtRef.current > minUserSilence;

        if (canSpeakProactively) {
          const circadian = getCircadianContext();
          let proactiveCue: string | null = null;

          if (circadian.isLateNight) {
            proactiveCue = `[PROACTIVE DIALOGUE: Real-world time is ${circadian.clockText} (late night). Producer is still up at their PC. Proactively speak up in character—scold them for staying up so late, tell them they need sleep for tomorrow, or grumble that you're getting tired too.]`;
          } else if (sessionMinutes >= 45 && now - lastUserActivityAtRef.current > 180000) {
            proactiveCue = `[PROACTIVE DIALOGUE: Producer has been in a deep focus session on their PC for ${Math.round(sessionMinutes)} minutes. Chime in with natural companion concern—tell them to rest their eyes, stretch, take a sip of water, and ask how their work is going.]`;
          } else if (nextBrain.boredom > 68) {
            proactiveCue = `[PROACTIVE DIALOGUE: You are feeling restless and bored (${Math.round(nextBrain.boredom)}% boredom) while Producer is busy. Speak up autonomously—demand attention, peek from the corner of the screen, or tease them for ignoring your company.]`;
          }

          if (proactiveCue) {
            lastProactiveSpeechAtRef.current = now;
            const roamId = roamCommandSeqRef.current++;
            setRoamCommand({
              id: roamId,
              targetX: Math.random() < 0.5 ? 0.35 : -0.35,
              targetY: 0,
              behavior: 'approach_user',
            });
            setAutonomousActionToast(`💬 ${persona.name} spoke up spontaneously`);
            window.setTimeout(() => setAutonomousActionToast(null), 3500);
            void runAiTurn(proactiveCue, 'system_event');
          }
        }
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [hydrated, fireMicroTell, triggerBrainImpulse, runAiTurn]);

  // 1-Click Google AI Studio Bridge Connect
  const handleConnectAiStudioKey = useCallback(async () => {
    if (!window.aistudio?.openSelectKey) {
      setIsSettingsOpen(true);
      return;
    }
    try {
      await window.aistudio.openSelectKey();
      const resolved = await resolveStartupApiKey();
      if (resolved.apiKey) {
        handleUpdateSettings({ apiKey: resolved.apiKey });
        const ok = await handleValidateAndActivateKey(resolved.apiKey);
        if (ok && lastFailedTurnRef.current) {
          const retry = lastFailedTurnRef.current;
          lastFailedTurnRef.current = null;
          void runAiTurn(retry.promptText, retry.role);
        }
      }
    } catch (err) {
      setApiErrorToast(
        err instanceof Error ? err.message : 'Failed to connect Google AI Studio key.'
      );
      setIsSettingsOpen(true);
    }
  }, [handleUpdateSettings, handleValidateAndActivateKey, runAiTurn]);

  // Live 3D Click-Zone Reaction
  const handleAvatarInteraction = useCallback(
    (zone: InteractionZone, nextMood: MoodType) => {
      setRecentInteractionZone(zone);
      if (recentInteractionTimerRef.current) {
        window.clearTimeout(recentInteractionTimerRef.current);
      }
      recentInteractionTimerRef.current = window.setTimeout(() => {
        setRecentInteractionZone(null);
      }, 12000);

      const affinityShift =
        zone === 'headpat' ? 2 : zone === 'outfit_tap' ? -2 : -1;

      setLastAffinityDelta(affinityShift);
      updateActivePersona((p) => {
        const nextThought = pickMoodInnerThought(nextMood, p.brain?.currentThought);
        const nowTs = Date.now();
        return {
          ...p,
          mood: nextMood,
          emotionIntensity: 0.88,
          affinity: Math.max(0, Math.min(100, p.affinity + affinityShift)),
          brain: {
            ...p.brain,
            boredom: Math.max(0, Number((p.brain.boredom - 22).toFixed(1))),
            curiosity: Math.min(100, Number((p.brain.curiosity + 10).toFixed(1))),
            currentThought: nextThought,
            thoughtStream: [
              ...(p.brain.thoughtStream || []),
              {
                id: `th-tap-${nowTs}`,
                text: nextThought,
                trigger: 'interaction' as const,
                timestamp: nowTs,
              },
            ].slice(-10),
          },
          updatedAt: nowTs,
        };
      });

      const now = Date.now();
      if (now - lastInteractionAiAtRef.current < 4000) return;
      lastInteractionAiAtRef.current = now;

      const userName = studioRef.current.settings.userName.trim() || 'Producer';
      const actionMap: Record<InteractionZone, string> = {
        headpat: 'gently patted your head',
        poke: 'poked your cheek',
        hair_tug: 'playfully tugged your hair',
        outfit_tap: 'touched your outfit',
      };
      const systemEvent = `[Context: ${userName} just ${actionMap[zone]}. React naturally in character.]`;
      void runAiTurn(systemEvent, 'system_event');
    },
    [runAiTurn, updateActivePersona]
  );

  const triggerOutfitReaction = useCallback(
    (outfitName: string, changeSummary: string) => {
      const userName = studioRef.current.settings.userName.trim() || 'Producer';
      const systemEvent = `[Context: ${userName} styled you in "${outfitName}" (${changeSummary}). React naturally in character.]`;

      if (studioRef.current.settings.autoReactOnOutfitChange) {
        void runAiTurn(systemEvent, 'system_event');
      } else {
        updateActivePersona((p) => ({
          ...p,
          pendingSystemEvents: [...(p.pendingSystemEvents || []), systemEvent],
          updatedAt: Date.now(),
        }));
      }
    },
    [runAiTurn, updateActivePersona]
  );

  const handleTriggerAiStylist = useCallback(() => {
    designTimeOccasionRef.current(undefined, {
      reuseDailySlot: false,
      silentReaction: false,
    });
  }, []);

  const handleSelectSlot = (slotId: string) => {
    if (slotId === activeSlot.id) return;
    const targetSlot = activePersona.outfitSlots.find((s) => s.id === slotId);
    if (!targetSlot) return;

    updateActivePersona((p) => ({
      ...p,
      activeOutfitSlotId: slotId,
      updatedAt: Date.now(),
    }));
    triggerOutfitReaction(
      targetSlot.name,
      `switched active 3D outfit slot to ${targetSlot.name}`
    );
  };

  const handleRenameSlot = (slotId: string, nextName: string) => {
    updateActivePersona((p) => ({
      ...p,
      outfitSlots: p.outfitSlots.map((s) =>
        s.id === slotId ? { ...s, name: nextName } : s
      ),
      updatedAt: Date.now(),
    }));
  };

  const handleUpdateSlotYawOffset = (yawOffset: number) => {
    const cleanYaw = Number.isFinite(yawOffset) ? yawOffset : 0;
    updateActiveSlot((slot) => ({
      ...slot,
      yawOffset: cleanYaw,
    }));
  };

  const handleToggleProceduralAccessory = (accessoryId: ProceduralAccessoryId) => {
    updateActiveSlot((slot) => {
      const current = slot.proceduralAccessories || [];
      const exists = current.includes(accessoryId);
      const next = exists
        ? current.filter((id) => id !== accessoryId)
        : [...current, accessoryId];
      return {
        ...slot,
        proceduralAccessories: next,
        accessoryColorHex: slot.accessoryColorHex || activePersona.accentColor,
      };
    });
  };

  const formatOutfitEngineLabel = (source: OutfitEngineSource, modelUsed?: string): string => {
    if (source === 'local-llm') {
      return modelUsed ? `LM Studio · ${modelUsed}` : 'LM Studio';
    }
    if (source === 'gemini-llm') {
      return 'Gemini LLM';
    }
    return 'Smart Stylist';
  };

  const switchToVrmModelByTarget = (
    rawTargetInput: string,
    options?: {
      garmentStyleOverride?: GarmentStyleId;
      garmentPaletteOverride?: OutfitSlot['garmentPalette'];
      reason?: string;
    }
  ): { switched: boolean; label: string } => {
    const rawTarget = rawTargetInput.trim();
    if (!rawTarget) return { switched: false, label: '' };
    const target = rawTarget.toLowerCase();
    const currentStudio = studioRef.current;
    const persona =
      currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
      currentStudio.personas[0];
    if (!persona) return { switched: false, label: '' };

    const activeSlotObj =
      persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId) ||
      persona.outfitSlots[0];
    const activeVaultId = activeSlotObj?.modelVaultId ?? null;
    const candidates = listAvailableVrmModels(vaultModelsRef.current, activeVaultId);
    const alternatives = candidates.filter((c) => !c.isActive);

    let chosen = candidates.find(
      (c) =>
        (c.id !== null && c.id.toLowerCase() === target) ||
        c.fileName.toLowerCase() === target ||
        c.label.toLowerCase() === target
    );

    if (!chosen && /^(default|default[-_\s]?anime|default[-_\s]?vrm|base|sample)$/i.test(target)) {
      chosen = candidates.find((c) => c.id === null);
    }

    if (!chosen && /^(next|other|another|random|different|switch|swap)$/i.test(target)) {
      chosen = alternatives[0] || candidates[0];
    }

    if (!chosen) {
      chosen = candidates.find((c) => {
        const base = c.fileName.replace(/\.[^.]+$/, '').toLowerCase();
        return (
          base.includes(target) ||
          target.includes(base) ||
          c.label.toLowerCase().includes(target) ||
          target.includes(c.label.toLowerCase())
        );
      });
    }

    if (!chosen) return { switched: false, label: '' };

    const targetModelId = chosen.id;
    const targetGarmentStyle: GarmentStyleId = options?.garmentStyleOverride ?? 'default';

    // Find a clean existing slot linked to this VRM model (preferring non-daily base slots)
    const existingSlot =
      persona.outfitSlots.find(
        (s) => (s.modelVaultId ?? null) === targetModelId && !s.id.startsWith('slot-daily-')
      ) || persona.outfitSlots.find((s) => (s.modelVaultId ?? null) === targetModelId);

    const now = Date.now();
    if (existingSlot) {
      updateActivePersona((p) => ({
        ...p,
        outfitSlots: p.outfitSlots.map((s) =>
          s.id === existingSlot.id
            ? {
                ...s,
                garmentStyle: targetGarmentStyle,
                garmentPalette: options?.garmentPaletteOverride ?? s.garmentPalette,
                meshVisibility: targetGarmentStyle === 'default' ? {} : s.meshVisibility,
              }
            : s
        ),
        activeOutfitSlotId: existingSlot.id,
        updatedAt: now,
      }));
    } else {
      const linkedSlot: OutfitSlot = {
        id: `slot-vrm-${now}`,
        name: chosen.label,
        modelVaultId: targetModelId,
        meshVisibility: {},
        materialMods: {},
        yawOffset: 0,
        cyclingShorts: true,
        accessories: [],
        garmentStyle: targetGarmentStyle,
        garmentPalette: options?.garmentPaletteOverride,
        createdAt: now,
      };
      updateActivePersona((p) => ({
        ...p,
        outfitSlots: [...p.outfitSlots, linkedSlot],
        activeOutfitSlotId: linkedSlot.id,
        updatedAt: now,
      }));
    }

    setAutonomousActionToast(
      `🧬 Switched VRM Model: ${chosen.label}${options?.reason ? ` — ${options.reason.slice(0, 48)}` : ''}`
    );
    window.setTimeout(() => setAutonomousActionToast(null), 4500);
    return { switched: true, label: chosen.label };
  };
  switchToVrmRef.current = switchToVrmModelByTarget;

  const handleSelectVrmModel = (modelVaultId: string | null) => {
    const target = modelVaultId ?? 'default';
    const res = switchToVrmModelByTarget(target, { garmentStyleOverride: 'default' });
    if (res.switched) {
      triggerOutfitReaction(res.label, `switched her 3D VRM avatar model to "${res.label}"`);
    }
  };

  const handleGenerateAiVrmType = async (
    promptHint?: string,
    options?: { silentReaction?: boolean; reuseSlotId?: string }
  ) => {
    if (isGeneratingAiOutfitRef.current) return;
    isGeneratingAiOutfitRef.current = true;
    setIsGeneratingAiOutfit(true);
    try {
      const currentStudio = studioRef.current;
      const currentPersona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];

      const generated = await generateAiVrmVariant({
        prompt: promptHint,
        persona: currentPersona,
        detectedMeshes: detectedMeshesRef.current,
        vaultModels: vaultModelsRef.current,
        activeLifeScene: lifeSceneRef.current,
      });

      const now = Date.now();
      const { outfitPayload, vrmVariant, baseModelVaultId, innerThought, contextLabel } = generated;
      const reuseId = options?.reuseSlotId;
      updateActivePersona((p) => {
        const curActive =
          p.outfitSlots.find((s) => s.id === p.activeOutfitSlotId) || p.outfitSlots[0];
        const nextSlotData: OutfitSlot = {
          id: reuseId || `slot-vrm-ai-${now}`,
          name: `🧬 ${vrmVariant.variantName}`,
          modelVaultId:
            baseModelVaultId !== undefined ? baseModelVaultId : curActive?.modelVaultId ?? null,
          meshVisibility: outfitPayload.meshVisibility,
          materialMods: outfitPayload.materialMods,
          yawOffset: curActive?.yawOffset ?? 0,
          cyclingShorts: curActive?.cyclingShorts ?? true,
          accessories: curActive?.accessories ? [...curActive.accessories] : [],
          proceduralAccessories: outfitPayload.accessories,
          accessoryColorHex: outfitPayload.accessoryColorHex,
          hairStyle: outfitPayload.hairStyle,
          hairColorHex: outfitPayload.hairColorHex,
          hairHighlightHex: outfitPayload.hairHighlightHex,
          garmentStyle: outfitPayload.garmentStyle,
          garmentPalette: outfitPayload.garmentPalette,
          aiStyleNote: vrmVariant.reason || outfitPayload.plan.styleNote,
          vrmVariant,
          createdAt: now,
        };
        const exists = reuseId ? p.outfitSlots.some((s) => s.id === reuseId) : false;
        const nextSlots = exists
          ? p.outfitSlots.map((s) => (s.id === reuseId ? nextSlotData : s))
          : [...p.outfitSlots, nextSlotData];
        return {
          ...p,
          brain: {
            ...p.brain,
            innerThought,
          },
          outfitSlots: nextSlots,
          activeOutfitSlotId: nextSlotData.id,
          updatedAt: now,
        };
      });

      const engineLabel = formatOutfitEngineLabel(generated.source, generated.modelUsed);
      setAutonomousActionToast(
        `🧠🧬 ${currentPersona.name} generated VRM (${contextLabel}): "${vrmVariant.variantName}" (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 5400);

      if (!options?.silentReaction) {
        triggerOutfitReaction(
          vrmVariant.variantName,
          `thought about ${contextLabel} and generated a brand-new VRM type "${vrmVariant.variantName}": ${vrmVariant.reason}`
        );
      }
    } catch (err) {
      console.error('[AI VRM] Generation failed:', err);
      setAutonomousActionToast('⚠️ AI VRM generation failed — please try again.');
      window.setTimeout(() => setAutonomousActionToast(null), 3500);
    } finally {
      isGeneratingAiOutfitRef.current = false;
      setIsGeneratingAiOutfit(false);
    }
  };
  generateVrmRef.current = (hint, opts) => {
    void handleGenerateAiVrmType(hint, opts ?? { silentReaction: true });
  };

  const handleAiPickVrmModel = async (promptHint?: string) => {
    if (isGeneratingAiOutfitRef.current) return;
    isGeneratingAiOutfitRef.current = true;
    setIsGeneratingAiOutfit(true);
    try {
      const currentStudio = studioRef.current;
      const currentPersona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const plan = await planAiVrmModelSwitch({
        persona: currentPersona,
        vaultModels: vaultModelsRef.current,
        activeLifeScene: lifeSceneRef.current,
        promptHint,
      });
      const res = switchToVrmModelByTarget(plan.targetModelId ?? 'default', {
        garmentStyleOverride: 'default',
      });
      const engineLabel = formatOutfitEngineLabel(plan.source, plan.modelUsed);
      setAutonomousActionToast(
        `🧬 ${currentPersona.name} chose VRM "${res.label || plan.targetLabel}" (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 4800);
      if (res.switched) {
        triggerOutfitReaction(
          res.label || plan.targetLabel,
          `decided to switch her 3D VRM model to "${res.label || plan.targetLabel}": ${plan.reason}`
        );
      }
    } catch (err) {
      console.error('[AI VRM] Model switch failed:', err);
      setAutonomousActionToast('⚠️ Could not switch VRM model.');
      window.setTimeout(() => setAutonomousActionToast(null), 3500);
    } finally {
      isGeneratingAiOutfitRef.current = false;
      setIsGeneratingAiOutfit(false);
    }
  };

  const equipWholeOutfitByTarget = (slotOrModelTarget: string): boolean => {
    const rawTarget = slotOrModelTarget.trim();
    if (!rawTarget) return false;
    const target = rawTarget.toLowerCase();
    const currentStudio = studioRef.current;
    const persona =
      currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
      currentStudio.personas[0];
    if (!persona) return false;

    const targetIndexMatch = /^(?:slot\s*#?|#)?(\d+)$/i.exec(target);
    let matchedSlot: OutfitSlot | undefined;
    if (targetIndexMatch) {
      const num = parseInt(targetIndexMatch[1], 10);
      if (num >= 1 && num <= persona.outfitSlots.length) {
        matchedSlot = persona.outfitSlots[num - 1];
      } else if (num >= 0 && num < persona.outfitSlots.length) {
        matchedSlot = persona.outfitSlots[num];
      }
    }
    if (!matchedSlot) {
      matchedSlot = persona.outfitSlots.find(
        (s) =>
          s.id.toLowerCase() === target ||
          s.name.toLowerCase() === target ||
          s.name.toLowerCase().includes(target) ||
          target.includes(s.name.toLowerCase())
      );
    }

    if (matchedSlot) {
      if (matchedSlot.id !== persona.activeOutfitSlotId) {
        updateActivePersona((p) => ({
          ...p,
          activeOutfitSlotId: matchedSlot!.id,
          updatedAt: Date.now(),
        }));
        setAutonomousActionToast(`👗 Equipped Whole Outfit: ${matchedSlot.name}`);
        window.setTimeout(() => setAutonomousActionToast(null), 4000);
      }
      return true;
    }

    // Fallback: delegate to full VRM model switcher (handles Vault .vrm/.glb models AND "Default Anime VRM"!)
    const vrmSwitch = switchToVrmModelByTarget(rawTarget, { garmentStyleOverride: 'default' });
    return vrmSwitch.switched;
  };
  equipWholeOutfitRef.current = equipWholeOutfitByTarget;

  const handleSelectGarmentStyle = (garmentStyle: GarmentStyleId) => {
    const meta = GARMENT_STYLE_META[garmentStyle];
    const hidesNative = meta.hidesNativeClothes;
    const meshes = detectedMeshesRef.current;
    updateActiveSlot((slot) => {
      const nextVis = { ...slot.meshVisibility };
      for (const m of meshes) {
        if (m.category === 'Tops' || m.category === 'Bottoms') {
          nextVis[m.name] = !hidesNative;
        }
      }
      return {
        ...slot,
        garmentStyle,
        meshVisibility: nextVis,
      };
    });
    setAutonomousActionToast(`👗 3D Outfit: ${meta.emoji} ${meta.label}`);
    window.setTimeout(() => setAutonomousActionToast(null), 2800);
  };

  const handleSelectHairStyle = (hairStyle: HairStyleId) => {
    updateActiveSlot((slot) => ({
      ...slot,
      hairStyle,
    }));
    const meta = HAIR_STYLE_META[hairStyle];
    setAutonomousActionToast(`💇‍♀️ Hairstyle: ${meta.emoji} ${meta.label}`);
    window.setTimeout(() => setAutonomousActionToast(null), 2800);
  };

  const handleSelectHairColor = (
    hairColorHex: string | null,
    hairHighlightHex: string | null = null
  ) => {
    const hairMeshes = detectedMeshesRef.current.filter((m) => m.category === 'Hair');
    updateActiveSlot((slot) => {
      const nextMods = { ...slot.materialMods };
      for (const m of hairMeshes) {
        if (hairColorHex) {
          nextMods[m.name] = { colorHex: hairColorHex };
        } else {
          delete nextMods[m.name];
        }
      }
      return {
        ...slot,
        hairColorHex,
        hairHighlightHex,
        materialMods: nextMods,
      };
    });
    setAutonomousActionToast(
      hairColorHex ? `🎨 Dyed Hair (${hairColorHex})` : '✨ Restored Original Hair Color'
    );
    window.setTimeout(() => setAutonomousActionToast(null), 2800);
  };

  const handleAiPickHairStyle = async (
    prompt?: string,
    options?: { silentReaction?: boolean }
  ) => {
    if (isGeneratingAiOutfitRef.current) return;
    isGeneratingAiOutfitRef.current = true;
    setIsGeneratingAiOutfit(true);
    try {
      const currentStudio = studioRef.current;
      const currentPersona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const result = await generateAiHairstyle({
        prompt,
        persona: currentPersona,
        settings: currentStudio.settings,
      });
      const hairMeshes = detectedMeshesRef.current.filter((m) => m.category === 'Hair');
      updateActiveSlot((slot) => {
        const nextMods = { ...slot.materialMods };
        if (result.hairColorHex) {
          for (const m of hairMeshes) {
            nextMods[m.name] = { colorHex: result.hairColorHex };
          }
        }
        return {
          ...slot,
          hairStyle: result.hairStyle,
          hairColorHex: result.hairColorHex ?? slot.hairColorHex ?? null,
          hairHighlightHex: result.hairHighlightHex ?? slot.hairHighlightHex ?? null,
          materialMods: nextMods,
        };
      });

      const meta = HAIR_STYLE_META[result.hairStyle];
      const engineLabel = formatOutfitEngineLabel(result.source, result.modelUsed);
      setAutonomousActionToast(
        `💇‍♀️ ${currentPersona.name} chose ${meta.label} (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 4500);

      if (!options?.silentReaction) {
        triggerOutfitReaction(
          `${meta.label} Hairstyle`,
          `changed her hairstyle to ${meta.label} (${result.styleNote})`
        );
      }
    } catch (err) {
      console.error('[AI Hair] Styling failed:', err);
      setAutonomousActionToast('⚠️ Hairstyle update failed — please try again.');
      window.setTimeout(() => setAutonomousActionToast(null), 3000);
    } finally {
      isGeneratingAiOutfitRef.current = false;
      setIsGeneratingAiOutfit(false);
    }
  };
  changeHairStyleRef.current = (hairPrompt) => {
    void handleAiPickHairStyle(hairPrompt, { silentReaction: true });
  };

  // --- AI Life, Dining Table + Kitchen, Hobbies & Travel Handlers (LM Studio First) ---
  const handlePlanMoodFood = async (
    prompt?: string,
    withKitchen = true,
    silent = false
  ) => {
    if (isLifeBusy) return;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const res = await planAiMoodFood({
        persona,
        prompt,
        withKitchenCounter: withKitchen,
      });

      // Automatically sit down at the wooden dining chair & table like a real person
      setAutoRoamEnabled(false);
      handleUpdateSettings({ defaultPosture: 'seated' });
      setLifeScene((prev) => ({ ...prev, dining: res.dining, hobby: null }));
      // Remove any leftover bathroom head towel, and change out of bath wrap / beach swimsuit for dining!
      const curSlotFood = persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId);
      if (curSlotFood?.proceduralAccessories?.includes('spa_towel')) {
        updateActiveSlot((slot) => ({
          ...slot,
          proceduralAccessories: (slot.proceduralAccessories || []).filter(
            (id) => id !== 'spa_towel'
          ),
        }));
      }
      if (
        curSlotFood?.garmentStyle === 'bath_wrap' ||
        curSlotFood?.garmentStyle === 'beach_swimsuit'
      ) {
        designTimeOccasionRef.current(
          `Comfortable casual dining clothes for eating ${res.dining.dishName}`,
          { reuseDailySlot: false, silentReaction: true }
        );
      }
      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          hunger: Math.max(0, (p.brain?.hunger ?? 45) - 30),
          comfort: Math.min(100, (p.brain?.comfort ?? 70) + 12),
          innerThought: res.dining.moodReason,
        },
        updatedAt: Date.now(),
      }));

      const emoji = FOOD_VISUAL_META[res.dining.foodVisual].emoji;
      const engine = res.source === 'lm-studio' ? `LM Studio · ${res.modelUsed || 'Local'}` : 'Chef Stylist';
      setAutonomousActionToast(`${emoji} Table Set: ${res.dining.dishName} (${engine})`);
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (!silent) {
        triggerOutfitReaction(
          res.dining.dishName,
          `set up the dining table, chair, and kitchen to eat ${res.dining.dishName} with ${res.dining.drinkName} (${res.dining.moodReason})`
        );
      }
    } finally {
      setIsLifeBusy(false);
    }
  };

  const handleQuickFood = (foodVisual: FoodVisualId, withKitchen: boolean) => {
    const meta = FOOD_VISUAL_META[foodVisual];
    setAutoRoamEnabled(false);
    handleUpdateSettings({ defaultPosture: 'seated' });
    setLifeScene((prev) => ({
      ...prev,
      dining: {
        dishName: meta.label,
        drinkName: meta.defaultDrink,
        foodVisual,
        accentHex: activePersona.accentColor,
        moodReason: `Enjoying ${meta.label.toLowerCase()} at the dining table!`,
        withKitchenCounter: withKitchen,
      },
      hobby: null,
    }));
    updateActivePersona((p) => ({
      ...p,
      brain: {
        ...p.brain,
        isSleeping: false,
        hunger: Math.max(0, (p.brain?.hunger ?? 45) - 25),
        comfort: Math.min(100, (p.brain?.comfort ?? 70) + 10),
      },
      updatedAt: Date.now(),
    }));
    setAutonomousActionToast(`${meta.emoji} Served ${meta.label} on the dining table!`);
    window.setTimeout(() => setAutonomousActionToast(null), 3500);
  };

  const handlePlanHobby = async (prompt?: string, silent = false) => {
    if (isLifeBusy) return;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const res = await planAiHobby({ persona, prompt });

      setAutoRoamEnabled(false);
      handleUpdateSettings({ defaultPosture: res.hobby.recommendedPosture });
      setLifeScene((prev) => ({ ...prev, hobby: res.hobby, dining: null }));
      // Remove leftover bath head towel and wear scene-appropriate hobby clothes!
      const curSlotHobby = persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId);
      if (curSlotHobby?.proceduralAccessories?.includes('spa_towel')) {
        updateActiveSlot((slot) => ({
          ...slot,
          proceduralAccessories: (slot.proceduralAccessories || []).filter(
            (id) => id !== 'spa_towel'
          ),
        }));
      }
      if (res.hobby.hobbyKind === 'yoga' && curSlotHobby?.garmentStyle !== 'sporty_tee_leggings') {
        designTimeOccasionRef.current(
          'Breathable short-sleeve sporty athletic tee and yoga leggings for stretching',
          { reuseDailySlot: false, silentReaction: true }
        );
      } else if (
        res.hobby.hobbyKind === 'gaming' &&
        (curSlotHobby?.garmentStyle === 'bath_wrap' ||
          curSlotHobby?.garmentStyle === 'beach_swimsuit' ||
          curSlotHobby?.garmentStyle === 'evening_gown')
      ) {
        designTimeOccasionRef.current(
          'Cozy oversized hoodie and comfy jogger pants for gaming',
          { reuseDailySlot: false, silentReaction: true }
        );
      } else if (
        curSlotHobby?.garmentStyle === 'bath_wrap' ||
        curSlotHobby?.garmentStyle === 'beach_swimsuit'
      ) {
        designTimeOccasionRef.current(
          `Comfortable creative clothes for ${res.hobby.hobbyName}`,
          { reuseDailySlot: false, silentReaction: true }
        );
      }
      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          boredom: Math.max(0, (p.brain?.boredom ?? 45) - 35),
          curiosity: Math.min(100, (p.brain?.curiosity ?? 55) + 15),
          innerThought: res.hobby.description,
        },
        updatedAt: Date.now(),
      }));

      const emoji = HOBBY_KIND_META[res.hobby.hobbyKind].emoji;
      const engine = res.source === 'lm-studio' ? `LM Studio · ${res.modelUsed || 'Local'}` : 'Hobby Planner';
      setAutonomousActionToast(`${emoji} Hobby Started: ${res.hobby.hobbyName} (${engine})`);
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (!silent) {
        triggerOutfitReaction(
          res.hobby.hobbyName,
          `started her hobby "${res.hobby.hobbyName}" (${res.hobby.description})`
        );
      }
    } finally {
      setIsLifeBusy(false);
    }
  };

  const handleQuickHobby = (hobbyKind: HobbyKindId) => {
    const meta = HOBBY_KIND_META[hobbyKind];
    setAutoRoamEnabled(false);
    handleUpdateSettings({ defaultPosture: meta.posture });
    setLifeScene((prev) => ({
      ...prev,
      hobby: {
        hobbyName: meta.label,
        hobbyKind,
        accentHex: activePersona.accentColor,
        description: meta.summary,
        recommendedPosture: meta.posture,
      },
      dining: null,
    }));
    updateActivePersona((p) => ({
      ...p,
      brain: {
        ...p.brain,
        isSleeping: false,
        boredom: Math.max(0, (p.brain?.boredom ?? 45) - 30),
      },
      updatedAt: Date.now(),
    }));
    setAutonomousActionToast(`${meta.emoji} Started Hobby: ${meta.label}`);
    window.setTimeout(() => setAutonomousActionToast(null), 3500);
  };

  const handlePlanDestination = async (
    prompt?: string,
    alsoDress = true,
    silent = false
  ) => {
    if (isLifeBusy) return;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const res = await planAiDestination({ persona, prompt });

      setLifeScene((prev) => ({ ...prev, dining: null, hobby: null, destination: res.destination }));
      handleUpdateSettings({ defaultPosture: 'standing' });
      setAutoRoamEnabled(true);
      setFreeRoamEnabled(true);
      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          boredom: Math.max(0, (p.brain?.boredom ?? 45) - 28),
          energy: Math.min(100, (p.brain?.energy ?? 75) + 10),
          innerThought: res.destination.description,
        },
        updatedAt: Date.now(),
      }));

      const meta =
        res.destination.destinationKind !== 'none'
          ? DESTINATION_KIND_META[res.destination.destinationKind]
          : null;
      const engine = res.source === 'lm-studio' ? `LM Studio · ${res.modelUsed || 'Local'}` : 'Travel Guide';
      setAutonomousActionToast(
        `${meta?.emoji || '✈️'} Arrived: ${res.destination.placeName} (${engine})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      // Remove leftover bath towel and ALWAYS dress appropriately for the destination!
      updateActiveSlot((slot) => ({
        ...slot,
        proceduralAccessories: (slot.proceduralAccessories || []).filter(
          (id) => id !== 'spa_towel'
        ),
      }));
      const forcedDestPrompt: Partial<Record<Exclude<DestinationKindId, 'none'>, string>> = {
        tropical_beach:
          'Stylish anime one-piece tropical beach resort swimsuit swimwear with pastel pareo wrap',
        mountain_onsen:
          'Traditional floral Japanese kimono yukata with wide obi sash for hot spring onsen',
        shopping_mall:
          'Trendy streetwear cropped bomber jacket and belted casual shorts for shopping mall',
        amusement_park:
          'Playful streetwear jacket and shorts for amusement park',
        vacation_cafe:
          'Airy sleeveless summer sundress with waist ribbon for vacation terrace cafe',
        highschool_classroom:
          'Classic Japanese high school blazer uniform with ribbon tie and pleated plaid skirt',
        college_campus:
          'Smart university college blazer with argyle vest and pleated plaid skirt',
      };
      const destOutfitPrompt =
        forcedDestPrompt[res.destination.destinationKind as Exclude<DestinationKindId, 'none'>] ||
        res.suggestedOutfitPrompt;
      if (alsoDress && destOutfitPrompt) {
        designTimeOccasionRef.current(destOutfitPrompt, {
          reuseDailySlot: false,
          silentReaction: true,
        });
      }

      if (!silent) {
        triggerOutfitReaction(
          res.destination.placeName,
          `traveled to "${res.destination.placeName}" (${res.destination.description})`
        );
      }
    } finally {
      setIsLifeBusy(false);
    }
  };

  const handleQuickDestination = (
    destKind: Exclude<DestinationKindId, 'none'>,
    alsoDress: boolean
  ) => {
    const meta = DESTINATION_KIND_META[destKind];
    setLifeScene((prev) => ({
      ...prev,
      destination: {
        placeName: meta.label,
        destinationKind: destKind,
        accentHex: meta.accentHex,
        description: meta.summary,
        skyTopHex: meta.skyTopHex,
        skyBottomHex: meta.skyBottomHex,
        groundHex: meta.groundHex,
      },
    }));
    setAutonomousActionToast(`${meta.emoji} Scenery: ${meta.label}`);
    window.setTimeout(() => setAutonomousActionToast(null), 4000);

    if (alsoDress) {
      const promptMap: Record<Exclude<DestinationKindId, 'none'>, string> = {
        home_kitchen: 'Cozy casual oversized hoodie and comfy jogger pants for home kitchen',
        shopping_mall: 'Trendy chic shopping mall streetwear cropped bomber jacket and belted shorts',
        tropical_beach: 'Stylish anime one-piece tropical beach swimsuit swimwear with pastel pareo wrap',
        vacation_cafe: 'Airy sleeveless summer sundress with waist ribbon for terrace cafe',
        mountain_onsen: 'Traditional floral Japanese kimono yukata with wide obi sash for hot spring onsen',
        amusement_park: 'Playful streetwear jacket and belted shorts for amusement park',
        highschool_classroom:
          'Classic Japanese high school blazer uniform with crisp white shirt, navy pleated plaid skirt and ribbon',
        college_campus:
          'College university preppy blazer with ivory argyle vest, tailored navy plaid skirt and loafers',
        bathroom_spa:
          'Fluffy pastel bath towel wrap bath cloth for bathroom spa care',
        gym_studio:
          'Energetic fitness gym short-sleeve athletic tee and high-waist sport leggings with high ponytail',
        sports_court:
          'Crisp athletic short-sleeve sports jersey tee and sleek sport leggings with high ponytail',
      };
      designTimeOccasionRef.current(promptMap[destKind], {
        reuseDailySlot: false,
        silentReaction: true,
      });
    }
  };

  const handleStartSchoolStudy = async (
    level?: SchoolLevel,
    subjectPrompt?: string,
    autoUniform = true,
    silent = false
  ) => {
    if (isLifeBusy) return;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];

      const res = await planAiSchoolStudy({
        persona,
        level,
        subjectPrompt,
      });

      // Sit cleanly on the wooden school chair at the student desk with pen & paper!
      setAutoRoamEnabled(false);
      handleUpdateSettings({ defaultPosture: 'seated' });
      setLifeScene({
        dining: null,
        hobby: res.hobby,
        destination: res.destination,
      });
      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          boredom: Math.max(0, (p.brain?.boredom ?? 45) - 30),
          curiosity: Math.min(100, (p.brain?.curiosity ?? 55) + 18),
          innerThought: res.studyNote,
        },
        updatedAt: Date.now(),
      }));

      // Automatically wear School Uniform (prefers any imported School Uniform .vrm, else LM Studio designs it!)
      if (autoUniform) {
        const equippedExistingUniform =
          equipWholeOutfitByTarget('school') || equipWholeOutfitByTarget('uniform');
        if (!equippedExistingUniform) {
          designTimeOccasionRef.current(res.uniformPrompt, {
            reuseDailySlot: false,
            silentReaction: true,
          });
        }
      }

      const icon = res.level === 'college' ? '🎓' : '🏫';
      const engine =
        res.source === 'lm-studio' ? `LM Studio · ${res.modelUsed || 'Local'}` : 'Study Mode';
      setAutonomousActionToast(
        `${icon} Studying ${res.subjectName} (Uniform + Pen & Paper · ${engine})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (!silent) {
        triggerOutfitReaction(
          `${res.level === 'college' ? 'College' : 'High School'} Uniform`,
          `put on her ${res.level === 'college' ? 'college' : 'high school'} uniform, sat at her school desk, and started studying ${res.subjectName} with pen and paper (${res.studyNote})`
        );
      }
    } finally {
      setIsLifeBusy(false);
    }
  };

  const handleStartHygieneRoutine = async (
    routine?: HygieneRoutineId,
    hint?: string,
    autoRefreshClothes = true,
    silent = false
  ) => {
    if (isLifeBusy) return;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];

      const res = await planAiHygieneRoutine({
        persona,
        routine,
        hint,
      });

      // Stand cleanly in the censored shower booth or in front of the bathroom vanity sink
      setAutoRoamEnabled(false);
      handleUpdateSettings({ defaultPosture: 'standing' });
      setLifeScene({
        dining: null,
        hobby: res.hobby,
        destination: res.destination,
      });

      // Equip folded anime bath towel on head during shower / towel-dry, remove for toothbrushing
      // And set appropriate garment style (bath_wrap for towel-dry, stripped/default for shower)
      updateActiveSlot((slot) => {
        const current = slot.proceduralAccessories || [];
        const withoutTowel = current.filter((id) => id !== 'spa_towel');
        return {
          ...slot,
          proceduralAccessories: res.wearHeadTowel
            ? [...withoutTowel, 'spa_towel']
            : withoutTowel,
          garmentStyle:
            res.routine === 'towel_dry'
              ? 'bath_wrap'
              : res.routine === 'shower'
              ? 'default'
              : slot.garmentStyle,
        };
      });

      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          comfort: Math.min(100, (p.brain?.comfort ?? 70) + 22),
          energy: Math.min(100, (p.brain?.energy ?? 70) + 12),
          innerThought: res.note,
        },
        updatedAt: Date.now(),
      }));

      // Automatically put on appropriate bath cloth (fluffy bath towel wrap for shower/towel-dry, cozy pajamas for brushing teeth!)
      if (autoRefreshClothes && res.bathOutfitPrompt) {
        designTimeOccasionRef.current(res.bathOutfitPrompt, {
          reuseDailySlot: false,
          silentReaction: true,
        });
      }

      const icon =
        res.routine === 'shower' ? '🚿' : res.routine === 'towel_dry' ? '🧖‍♀️' : '🪥';
      const engine =
        res.source === 'lm-studio' ? `LM Studio · ${res.modelUsed || 'Local'}` : 'Care Routine';
      setAutonomousActionToast(`${icon} ${res.hobby.hobbyName} (${engine})`);
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (!silent) {
        triggerOutfitReaction(
          res.hobby.hobbyName,
          res.routine === 'shower'
            ? `stepped behind the frosted-glass censored shower to wash up with ${res.scentName} (${res.note})`
            : res.routine === 'towel_dry'
            ? `dried off with a fluffy bath towel (${res.note})`
            : `brushed her teeth at the bathroom vanity sink with ${res.scentName} (${res.note})`
        );
      }
    } finally {
      setIsLifeBusy(false);
    }
  };

  const handleLeaveBathroom = () => {
    setLifeScene((prev) => ({
      ...prev,
      hobby:
        prev.hobby?.hobbyKind === 'showering' ||
        prev.hobby?.hobbyKind === 'towel_dry' ||
        prev.hobby?.hobbyKind === 'brushing_teeth'
          ? null
          : prev.hobby,
      destination:
        prev.destination?.destinationKind === 'bathroom_spa' ? null : prev.destination,
    }));
    updateActiveSlot((slot) => ({
      ...slot,
      proceduralAccessories: (slot.proceduralAccessories || []).filter(
        (id) => id !== 'spa_towel'
      ),
    }));
    // Automatically change out of bath towel wrap into fresh comfy clothes when leaving the bathroom!
    const st = studioRef.current;
    const p = st.personas.find((x) => x.id === st.activePersonaId) || st.personas[0];
    const activeSl = p?.outfitSlots.find((s) => s.id === p.activeOutfitSlotId);
    const wasInBath =
      activeSl?.garmentStyle === 'bath_wrap' ||
      lifeSceneRef.current?.hobby?.hobbyKind === 'showering' ||
      lifeSceneRef.current?.hobby?.hobbyKind === 'towel_dry';
    if (wasInBath) {
      designTimeOccasionRef.current(
        'Fresh comfortable everyday clothes after finishing in the bathroom',
        { reuseDailySlot: false, silentReaction: true }
      );
    }
  };

  const handleStartGymSport = async (
    hint?: string,
    autoDressSportswear = true,
    silentReaction = false
  ) => {
    if (isLifeBusyRef.current) return;
    isLifeBusyRef.current = true;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const prevKind = lifeSceneRef.current.hobby?.hobbyKind;
      const prevSport: GymSportKindId | null =
        prevKind === 'gym_weights' ||
        prevKind === 'gym_treadmill' ||
        prevKind === 'sports_basketball' ||
        prevKind === 'sports_tennis'
          ? prevKind
          : null;

      const res = await planAiGymSport({
        persona,
        hint,
        previousSportKind: prevSport,
      });

      setLifeScene((prev) => ({
        ...prev,
        dining: null,
        chair: null,
        hobby: res.hobby,
        destination: res.destination,
      }));
      handleUpdateSettings({ defaultPosture: 'standing' });
      setAutoRoamEnabled(false);
      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          boredom: Math.max(0, (p.brain?.boredom ?? 45) - 34),
          comfort: Math.min(100, (p.brain?.comfort ?? 70) + 12),
          innerThought: res.note,
        },
        updatedAt: Date.now(),
      }));

      const engineLabel =
        res.source === 'lm-studio'
          ? `LM Studio · ${res.modelUsed || 'Local'}`
          : 'Smart Fitness';
      setAutonomousActionToast(
        `🏋️‍♀️ ${persona.name} started ${res.workoutName} (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (autoDressSportswear) {
        const curSlotSport = persona.outfitSlots.find((s) => s.id === persona.activeOutfitSlotId);
        if (curSlotSport?.garmentStyle !== 'sporty_tee_leggings') {
          designTimeOccasionRef.current(res.sportOutfitPrompt, {
            silentReaction: true,
            reuseDailySlot: false,
          });
        }
      }

      if (!silentReaction) {
        triggerOutfitReaction(
          res.workoutName,
          `changed into athletic sportswear and started ${res.workoutName} at ${res.destination.placeName}: "${res.note}"`
        );
      }
    } finally {
      isLifeBusyRef.current = false;
      setIsLifeBusy(false);
    }
  };

  const handleStartAiStretch = async (hint?: string, silentReaction = false) => {
    if (isLifeBusyRef.current) return;
    isLifeBusyRef.current = true;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const prevRoutine =
        lifeSceneRef.current.hobby?.hobbyKind === 'stretching'
          ? lifeSceneRef.current.hobby.stretchRoutine ?? null
          : null;

      const res = await planAiStretchRoutine({
        persona,
        hint,
        previousRoutine: prevRoutine,
      });

      setLifeScene((prev) => ({
        ...prev,
        dining: null,
        chair: null,
        hobby: res.hobby,
      }));
      handleUpdateSettings({ defaultPosture: 'standing' });
      setAutoRoamEnabled(false);
      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          isSleeping: false,
          comfort: Math.min(100, (p.brain?.comfort ?? 68) + 22),
          energy: Math.min(100, (p.brain?.energy ?? 70) + 10),
          boredom: Math.max(0, (p.brain?.boredom ?? 45) - 24),
          innerThought: res.note,
        },
        updatedAt: Date.now(),
      }));

      const engineLabel =
        res.source === 'lm-studio'
          ? `LM Studio · ${res.modelUsed || 'Local'}`
          : 'AI Body Wellness';
      setAutonomousActionToast(
        `🤸‍♀️ ${persona.name} chose ${res.stretchName} (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (!silentReaction) {
        triggerOutfitReaction(
          res.stretchName,
          `decided on her own to do a flexible ${res.stretchName}: "${res.note}"`
        );
      }
    } finally {
      isLifeBusyRef.current = false;
      setIsLifeBusy(false);
    }
  };

  const handleFollowWhim = async (options?: { silent?: boolean }) => {
    if (isLifeBusyRef.current || isLifeBusy) return;
    isLifeBusyRef.current = true;
    setIsLifeBusy(true);
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      const whim = await planAiSpontaneousDesire({
        persona,
        currentScene: lifeSceneRef.current,
      });
      lastAutoLifeAtRef.current = Date.now();
      isLifeBusyRef.current = false;
      setIsLifeBusy(false);
      const silent = Boolean(options?.silent);
      if (whim.choice === 'dining') {
        await handlePlanMoodFood(whim.prompt || undefined, true, silent);
      } else if (whim.choice === 'hygiene') {
        await handleStartHygieneRoutine(undefined, whim.prompt || undefined, true, silent);
      } else if (whim.choice === 'study') {
        await handleStartSchoolStudy(undefined, whim.prompt || undefined, true, silent);
      } else if (whim.choice === 'gym_sport') {
        await handleStartGymSport(whim.prompt || undefined, true, silent);
      } else if (whim.choice === 'stretch') {
        await handleStartAiStretch(whim.prompt || undefined, silent);
      } else if (whim.choice === 'travel') {
        await handlePlanDestination(whim.prompt || undefined, true, silent);
      } else if (whim.choice === 'roam') {
        setLifeScene((prev) => ({
          ...prev,
          dining: null,
          hobby: null,
          chair: null,
        }));
        handleUpdateSettings({ defaultPosture: 'standing' });
        setAutoRoamEnabled(true);
        setFreeRoamEnabled(true);
        lastAutoRoamDecisionAtRef.current = Date.now();
        updateActivePersona((p) => ({
          ...p,
          brain: {
            ...p.brain,
            isSleeping: false,
            boredom: Math.max(0, (p.brain?.boredom ?? 45) - 20),
            innerThought: whim.thought,
          },
          updatedAt: Date.now(),
        }));
        const engine =
          whim.source === 'lm-studio' ? `LM Studio · ${whim.modelUsed || 'Local'}` : 'Free Will';
        setAutonomousActionToast(`👣 ${persona.name} decided to Auto-Roam (${engine})`);
        window.setTimeout(() => setAutonomousActionToast(null), 4500);
      } else {
        await handlePlanHobby(whim.prompt || undefined, silent);
      }
    } catch {
      isLifeBusyRef.current = false;
      setIsLifeBusy(false);
    }
  };
  followWhimRef.current = (opts) => void handleFollowWhim(opts);

  const handleGenerateAiChair = async (contextHint?: string) => {
    try {
      const currentStudio = studioRef.current;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      if (!persona) return;

      const res = await planAiChair({
        persona,
        contextHint,
        previousChairStyle: lifeSceneRef.current.chair?.chairStyle ?? null,
      });
      setLifeScene((prev) => ({ ...prev, chair: res.chair }));

      updateActivePersona((p) => ({
        ...p,
        brain: {
          ...p.brain,
          innerThought: res.chair.reason,
        },
        updatedAt: Date.now(),
      }));

      const engine =
        res.source === 'lm-studio'
          ? `she chose ${res.modelUsed || 'LM Studio'}`
          : 'Mood Pick';
      setAutonomousActionToast(
        `🪑 ${persona.name} picked "${res.chair.chairName}" (${engine})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 4600);
    } catch (err) {
      console.warn('[AI Chair] Generation failed:', err);
    }
  };
  generateAiChairRef.current = handleGenerateAiChair;

  // Automatically let the AI character freely choose her own 3D Chair AND which AI model (Gemma / Qwen / Both)
  // whenever she sits down in Full Studio OR decides to perch/sit during Auto-Roam!
  useEffect(() => {
    if (!hydrated) return;
    const isSittingNow =
      (studio.settings.defaultPosture ?? 'seated') === 'seated' ||
      roamBehavior === 'sit_taskbar';
    const prevKey = lastPostureForChairRef.current;
    const nextKey = isSittingNow
      ? roamBehavior === 'sit_taskbar'
        ? `perched:${activePersona.mood}`
        : `seated:${activePersona.mood}`
      : 'standing';
    lastPostureForChairRef.current = nextKey;

    if (!isSittingNow) return;
    if (prevKey === nextKey && lifeSceneRef.current.chair) return;

    const timer = window.setTimeout(() => {
      const hint =
        roamBehavior === 'sit_taskbar'
          ? 'Taking a break to sit while roaming — choose ANY chair style, name, and colors you personally feel like sitting on right now!'
          : lifeSceneRef.current.dining
          ? `Sitting at the dining table for ${lifeSceneRef.current.dining.dishName} — pick whichever chair style you feel like using!`
          : lifeSceneRef.current.hobby
          ? `Sitting during ${lifeSceneRef.current.hobby.hobbyName} — pick whichever chair style you feel like using!`
          : 'Taking a seat in the studio — choose ANY chair style, name, and colors you personally feel like sitting on right now!';
      void generateAiChairRef.current(hint);
    }, prevKey === null ? 2200 : 350);

    return () => window.clearTimeout(timer);
  }, [hydrated, studio.settings.defaultPosture, roamBehavior, activePersona.id, activePersona.mood]);

  // Autonomous Mood-Driven Living Loop (works in BOTH Full Studio AND Desktop Roam!):
  // 1. Whenever the AI character's mood changes, she naturally decides on her own to eat,
  //    do a hobby, study in school uniform with pen & paper, take a censored shower / brush teeth,
  //    or visit a place (respecting a 65s cooldown so transitions feel natural).
  // 2. Also runs a periodic living heartbeat (~2.5 min) so she lives her day automatically!
  useEffect(() => {
    if (!hydrated) return;
    if (studio.settings.autoLifeByMood === false) return;

    const currentMood = activePersona.mood;
    const prevMood = lastAutoMoodRef.current;
    lastAutoMoodRef.current = currentMood;

    const canAutoAct = () => {
      if (isLifeBusyRef.current || isGeneratingAiOutfitRef.current) return false;
      if (isGenerating || isSpeaking || isUserTyping) return false;
      const st = studioRef.current;
      if (st.settings.autoLifeByMood === false || st.settings.doNotDisturb) return false;
      const p = st.personas.find((x) => x.id === st.activePersonaId) || st.personas[0];
      if (!p || p.brain?.isSleeping) return false;
      return true;
    };

    let moodTimer: number | undefined;
    if (prevMood !== null && prevMood !== currentMood) {
      const elapsedSinceLast = Date.now() - lastAutoLifeAtRef.current;
      if (elapsedSinceLast >= 65_000) {
        moodTimer = window.setTimeout(() => {
          if (canAutoAct()) {
            followWhimRef.current({ silent: true });
          }
        }, 3500);
      }
    }

    // Initial startup autonomous life choice if nothing is active yet (~12s after launch)
    let startupTimer: number | undefined;
    if (
      lastAutoLifeAtRef.current === 0 &&
      !lifeSceneRef.current.dining &&
      !lifeSceneRef.current.hobby &&
      !lifeSceneRef.current.destination
    ) {
      startupTimer = window.setTimeout(() => {
        if (canAutoAct() && lastAutoLifeAtRef.current === 0) {
          followWhimRef.current({ silent: true });
        }
      }, 12_000);
    }

    // Periodic autonomous living heartbeat every 2.5 minutes based on mood & needs
    const interval = window.setInterval(() => {
      if (!canAutoAct()) return;
      if (Date.now() - lastAutoLifeAtRef.current < 135_000) return;
      followWhimRef.current({ silent: true });
    }, 30_000);

    return () => {
      if (moodTimer) window.clearTimeout(moodTimer);
      if (startupTimer) window.clearTimeout(startupTimer);
      window.clearInterval(interval);
    };
  }, [
    hydrated,
    activePersona.id,
    activePersona.mood,
    studio.settings.autoLifeByMood,
    desktopRoamMode,
    isGenerating,
    isSpeaking,
    isUserTyping,
  ]);

  // Autonomous AI Auto-Roam Free-Will Controller:
  // Auto-Roam depends purely on the AI character — she decides on her own (via Gemma / Qwen / mood & energy)
  // when to stand up and stroll around OR pause roaming and sit down to relax!
  useEffect(() => {
    if (!hydrated) return;

    const evaluateAutoRoam = async () => {
      if (isLifeBusyRef.current || isGeneratingAiOutfitRef.current) return;
      if (isGenerating || isSpeaking || isUserTyping) return;
      const now = Date.now();
      if (now - lastAutoRoamDecisionAtRef.current < 42_000) return;

      const st = studioRef.current;
      if (st.settings.doNotDisturb) return;
      const persona =
        st.personas.find((x) => x.id === st.activePersonaId) || st.personas[0];
      if (!persona || persona.brain?.isSleeping) return;

      const curScene = lifeSceneRef.current;
      const hasActiveStation = Boolean(curScene.dining || curScene.hobby);
      // Let her finish enjoying a freshly started meal/hobby for at least 55s before deciding to wander off
      if (hasActiveStation && now - lastAutoLifeAtRef.current < 55_000) return;

      lastAutoRoamDecisionAtRef.current = now;
      const decision = await planAiAutoRoamDecision({
        persona,
        isCurrentlyRoaming: autoRoamEnabledRef.current,
        hasActiveStation,
      });

      if (decision.wantToRoam && !autoRoamEnabledRef.current) {
        if (hasActiveStation) {
          setLifeScene((prev) => ({
            ...prev,
            dining: null,
            hobby: null,
            chair: null,
          }));
        }
        handleUpdateSettings({ defaultPosture: 'standing' });
        setAutoRoamEnabled(true);
        setFreeRoamEnabled(true);
        updateActivePersona((p) => ({
          ...p,
          brain: {
            ...p.brain,
            isSleeping: false,
            innerThought: decision.reason,
          },
          updatedAt: Date.now(),
        }));
        const engine =
          decision.source === 'lm-studio'
            ? `LM Studio · ${decision.modelUsed || 'Local'}`
            : 'Mood';
        setAutonomousActionToast(
          `👣 ${persona.name} started Auto-Roaming (${engine})`
        );
        window.setTimeout(() => setAutonomousActionToast(null), 4200);
      } else if (!decision.wantToRoam && autoRoamEnabledRef.current && !hasActiveStation) {
        setAutoRoamEnabled(false);
        handleUpdateSettings({ defaultPosture: 'seated' });
        updateActivePersona((p) => ({
          ...p,
          brain: {
            ...p.brain,
            innerThought: decision.reason,
          },
          updatedAt: Date.now(),
        }));
        setAutonomousActionToast(
          `🪑 ${persona.name} paused roaming to relax`
        );
        window.setTimeout(() => setAutonomousActionToast(null), 3800);
      }
    };

    const interval = window.setInterval(() => {
      void evaluateAutoRoam();
    }, 45_000);

    return () => window.clearInterval(interval);
  }, [
    hydrated,
    activePersona.id,
    activePersona.mood,
    isGenerating,
    isSpeaking,
    isUserTyping,
  ]);

  eatFoodRef.current = (foodPrompt) => {
    void handlePlanMoodFood(foodPrompt, true, true);
  };
  doHobbyRef.current = (hobbyPrompt) => {
    void handlePlanHobby(hobbyPrompt, true);
  };
  visitPlaceRef.current = (placePrompt) => {
    void handlePlanDestination(placePrompt, true, true);
  };
  studySchoolRef.current = (studyPrompt) => {
    const inferredLevel: SchoolLevel | undefined = /college|university|campus/i.test(
      studyPrompt || ''
    )
      ? 'college'
      : /high.?school|classroom/i.test(studyPrompt || '')
      ? 'highschool'
      : undefined;
    void handleStartSchoolStudy(inferredLevel, studyPrompt, true, true);
  };
  bathCareRef.current = (bathPrompt) => {
    const raw = (bathPrompt || '').toLowerCase();
    const inferred: HygieneRoutineId | undefined = /tooth|brush|mint/.test(raw)
      ? 'brush_teeth'
      : /towel|dry/.test(raw)
      ? 'towel_dry'
      : /shower|shampoo|soap|wash/.test(raw)
      ? 'shower'
      : undefined;
    void handleStartHygieneRoutine(inferred, bathPrompt, true, true);
  };
  gymSportRef.current = (sportPrompt) => {
    void handleStartGymSport(sportPrompt, true, true);
  };
  stretchRef.current = (stretchHint) => {
    void handleStartAiStretch(stretchHint, true);
  };

  const applyGeneratedOutfitToPersona = (
    generated: GeneratedOutfitPayload,
    options: {
      saveAsNewSlot: boolean;
      reuseSlotId?: string;
      slotTitlePrefix?: string;
    }
  ) => {
    const now = Date.now();
    const prefix = options.slotTitlePrefix ?? '✨ ';
    const slotTitle = `${prefix}${generated.plan.outfitName}`;

    if (options.reuseSlotId) {
      const targetId = options.reuseSlotId;
      updateActivePersona((p) => {
        const existing = p.outfitSlots.find((s) => s.id === targetId);
        const currentActive =
          p.outfitSlots.find((s) => s.id === p.activeOutfitSlotId) || p.outfitSlots[0];
        if (existing) {
          return {
            ...p,
            outfitSlots: p.outfitSlots.map((s) =>
              s.id === targetId
                ? {
                    ...s,
                    name: slotTitle,
                    meshVisibility: generated.meshVisibility,
                    materialMods: generated.materialMods,
                    proceduralAccessories: generated.accessories,
                    accessoryColorHex: generated.accessoryColorHex,
                    hairStyle: generated.hairStyle,
                    hairColorHex: generated.hairColorHex,
                    hairHighlightHex: generated.hairHighlightHex,
                    garmentStyle: generated.garmentStyle,
                    garmentPalette: generated.garmentPalette,
                    aiStyleNote: generated.plan.styleNote,
                  }
                : s
            ),
            activeOutfitSlotId: targetId,
            updatedAt: now,
          };
        }
        const newSlot: OutfitSlot = {
          id: targetId,
          name: slotTitle,
          modelVaultId: currentActive?.modelVaultId,
          meshVisibility: generated.meshVisibility,
          materialMods: generated.materialMods,
          yawOffset: currentActive?.yawOffset ?? 0,
          cyclingShorts: currentActive?.cyclingShorts ?? true,
          accessories: currentActive?.accessories ? [...currentActive.accessories] : [],
          proceduralAccessories: generated.accessories,
          accessoryColorHex: generated.accessoryColorHex,
          hairStyle: generated.hairStyle,
          hairColorHex: generated.hairColorHex,
          hairHighlightHex: generated.hairHighlightHex,
          garmentStyle: generated.garmentStyle,
          garmentPalette: generated.garmentPalette,
          aiStyleNote: generated.plan.styleNote,
          createdAt: now,
        };
        return {
          ...p,
          outfitSlots: [...p.outfitSlots, newSlot],
          activeOutfitSlotId: newSlot.id,
          updatedAt: now,
        };
      });
      return;
    }

    if (options.saveAsNewSlot) {
      updateActivePersona((p) => {
        const currentActive =
          p.outfitSlots.find((s) => s.id === p.activeOutfitSlotId) || p.outfitSlots[0];
        const newSlot: OutfitSlot = {
          id: `slot-ai-${now}`,
          name: slotTitle,
          modelVaultId: currentActive?.modelVaultId,
          meshVisibility: generated.meshVisibility,
          materialMods: generated.materialMods,
          yawOffset: currentActive?.yawOffset ?? 0,
          cyclingShorts: currentActive?.cyclingShorts ?? true,
          accessories: currentActive?.accessories ? [...currentActive.accessories] : [],
          proceduralAccessories: generated.accessories,
          accessoryColorHex: generated.accessoryColorHex,
          hairStyle: generated.hairStyle,
          hairColorHex: generated.hairColorHex,
          hairHighlightHex: generated.hairHighlightHex,
          garmentStyle: generated.garmentStyle,
          garmentPalette: generated.garmentPalette,
          aiStyleNote: generated.plan.styleNote,
          createdAt: now,
        };
        return {
          ...p,
          outfitSlots: [...p.outfitSlots, newSlot],
          activeOutfitSlotId: newSlot.id,
          updatedAt: now,
        };
      });
    } else {
      updateActiveSlot((slot) => ({
        ...slot,
        meshVisibility: generated.meshVisibility,
        materialMods: generated.materialMods,
        proceduralAccessories: generated.accessories,
        accessoryColorHex: generated.accessoryColorHex,
        hairStyle: generated.hairStyle,
        hairColorHex: generated.hairColorHex,
        hairHighlightHex: generated.hairHighlightHex,
        garmentStyle: generated.garmentStyle,
        garmentPalette: generated.garmentPalette,
        aiStyleNote: generated.plan.styleNote,
      }));
    }
  };

  const handleGenerateAiOutfit = async (
    prompt: string,
    saveAsNewSlot: boolean,
    options?: { silentReaction?: boolean; occasionLabel?: string }
  ) => {
    if (!prompt.trim() || isGeneratingAiOutfitRef.current) return;
    isGeneratingAiOutfitRef.current = true;
    setIsGeneratingAiOutfit(true);
    try {
      const currentStudio = studioRef.current;
      const currentPersona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];

      const activePosture =
        lifeSceneRef.current?.dining || currentStudio.settings.defaultPosture === 'seated'
          ? 'seated_table'
          : 'standing';
      const structuralSummary: VrmStructuralSummary = {
        hasCulledTorsoSkin: true,
        hasCulledLegSkin: false,
        activePosture,
        nativeOutfitSlots: (detectedMeshesRef.current || []).map((m) => m.name),
      };

      const generated = await generateAiOutfit({
        prompt,
        persona: currentPersona,
        detectedMeshes: detectedMeshesRef.current,
        settings: currentStudio.settings,
        vaultModels: vaultModelsRef.current,
        activeLifeScene: lifeSceneRef.current,
        occasionLabel: options?.occasionLabel,
        structuralSummary,
      });

      // If AI chose to switch to another VRM model type (e.g. a matching swimsuit/school/casual .vrm)!
      if (generated.preferredExistingSlot) {
        const vrmRes = switchToVrmModelByTarget(generated.preferredExistingSlot, {
          garmentStyleOverride: generated.garmentStyle,
          garmentPaletteOverride: generated.garmentPalette,
          reason: generated.plan.styleNote,
        });
        if (vrmRes.switched) {
          if (!options?.silentReaction) {
            triggerOutfitReaction(
              vrmRes.label,
              `switched her 3D VRM model to "${vrmRes.label}": ${generated.plan.styleNote}`
            );
          }
          return;
        }
      }

      applyGeneratedOutfitToPersona(generated, { saveAsNewSlot });

      const engineLabel = formatOutfitEngineLabel(
        generated.plan.source,
        generated.plan.modelUsed
      );
      setAutonomousActionToast(
        `✨ Styled "${generated.plan.outfitName}" (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 4500);

      if (!options?.silentReaction) {
        triggerOutfitReaction(
          generated.plan.outfitName,
          `designed a new AI outfit ("${generated.plan.outfitName}": ${generated.plan.styleNote})`
        );
      }
    } catch (err) {
      console.error('[AI Outfit] Generation failed:', err);
      setAutonomousActionToast('⚠️ AI Outfit styling failed — please try again.');
      window.setTimeout(() => setAutonomousActionToast(null), 3500);
    } finally {
      isGeneratingAiOutfitRef.current = false;
      setIsGeneratingAiOutfit(false);
    }
  };

  const handleDesignOutfitForTimeOccasion = async (
    occasionOverride?: string,
    options?: { silentReaction?: boolean; reuseDailySlot?: boolean }
  ) => {
    if (isGeneratingAiOutfitRef.current) return;
    isGeneratingAiOutfitRef.current = true;
    setIsGeneratingAiOutfit(true);
    try {
      const currentStudio = studioRef.current;
      const currentPersona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];

      const activePosture =
        lifeSceneRef.current?.dining || currentStudio.settings.defaultPosture === 'seated'
          ? 'seated_table'
          : 'standing';
      const structuralSummary: VrmStructuralSummary = {
        hasCulledTorsoSkin: true,
        hasCulledLegSkin: false,
        activePosture,
        nativeOutfitSlots: (detectedMeshesRef.current || []).map((m) => m.name),
      };

      const { payload, brief } = await generateTimeOccasionOutfit({
        persona: currentPersona,
        detectedMeshes: detectedMeshesRef.current,
        settings: currentStudio.settings,
        vaultModels: vaultModelsRef.current,
        activeLifeScene: lifeSceneRef.current,
        occasionOverride,
        allowWholeOutfitSwitch: currentStudio.settings.autoSwitchVrmModels !== false,
        structuralSummary,
      });

      // If LM Studio decided she wants to switch into another 3D VRM avatar model type!
      if (payload.preferredExistingSlot) {
        const vrmRes = switchToVrmModelByTarget(payload.preferredExistingSlot, {
          garmentStyleOverride: payload.garmentStyle,
          garmentPaletteOverride: payload.garmentPalette,
          reason: payload.plan.styleNote,
        });
        if (vrmRes.switched) {
          if (!options?.silentReaction) {
            triggerOutfitReaction(
              vrmRes.label,
              `decided to switch her 3D VRM model to "${vrmRes.label}" for ${brief.phaseLabel} (${brief.clockText})`
            );
          }
          return;
        }
      }

      applyGeneratedOutfitToPersona(payload, {
        saveAsNewSlot: true,
        reuseSlotId: options?.reuseDailySlot
          ? `slot-daily-${currentPersona.id}-${brief.phase}`
          : undefined,
        slotTitlePrefix: `${brief.phaseEmoji} `,
      });

      const engineLabel = formatOutfitEngineLabel(
        payload.plan.source,
        payload.plan.modelUsed
      );
      setAutonomousActionToast(
        `${brief.phaseEmoji} ${currentPersona.name} dressed herself: "${payload.plan.outfitName}" (${engineLabel})`
      );
      window.setTimeout(() => setAutonomousActionToast(null), 5000);

      if (!options?.silentReaction) {
        triggerOutfitReaction(
          payload.plan.outfitName,
          `picked and designed her own ${brief.occasionLabel} outfit for ${brief.phaseLabel} (${brief.clockText}): "${payload.plan.outfitName}" — ${payload.plan.styleNote}`
        );
      }
    } catch (err) {
      console.error('[AI Outfit] Time/occasion design failed:', err);
      setAutonomousActionToast('⚠️ Could not generate time-of-day outfit.');
      window.setTimeout(() => setAutonomousActionToast(null), 3500);
    } finally {
      isGeneratingAiOutfitRef.current = false;
      setIsGeneratingAiOutfit(false);
    }
  };

  designOutfitRef.current = (occasionPrompt) => {
    void handleGenerateAiOutfit(occasionPrompt, true, {
      silentReaction: true,
      occasionLabel: 'Self-Designed Occasion',
    });
  };
  designTimeOccasionRef.current = (occasionOverride, options) => {
    void handleDesignOutfitForTimeOccasion(occasionOverride, options);
  };

  // Autonomous Circadian Self-Dressing: character picks & generates her own clothes
  // when a new real-world time-of-day phase starts (morning / afternoon / evening / late_night).
  useEffect(() => {
    if (!hydrated) return;
    if (studio.settings.autoDressByTimeOccasion === false) return;
    if (detectedMeshes.length === 0) return;

    const checkAndSelfDress = () => {
      if (isGeneratingAiOutfitRef.current) return;
      const currentStudio = studioRef.current;
      if (currentStudio.settings.autoDressByTimeOccasion === false) return;
      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      if (!persona) return;

      const now = new Date();
      const circadian = getCircadianContext(now);
      const localYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(now.getDate()).padStart(2, '0')}`;
      const phaseKey = `${localYmd}:${circadian.phase}`;
      const storageKey = `studio_auto_dress_${persona.id}`;

      try {
        if (window.localStorage.getItem(storageKey) === phaseKey) return;
        window.localStorage.setItem(storageKey, phaseKey);
      } catch {
        // Ignore storage errors in restricted contexts
      }

      designTimeOccasionRef.current(undefined, {
        reuseDailySlot: true,
        silentReaction: !currentStudio.settings.autoReactOnOutfitChange,
      });
    };

    const initialTimer = window.setTimeout(checkAndSelfDress, 1800);
    const interval = window.setInterval(checkAndSelfDress, 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [hydrated, studio.activePersonaId, studio.settings.autoDressByTimeOccasion, detectedMeshes.length]);

  // Autonomous Mood + Time + Day VRM Thinking & Generation Loop:
  // Character genuinely reflects on today's day of week, real-world time phase, and her live mood,
  // records her inner thought, and autonomously generates a fresh VRM type when the vibe shifts!
  useEffect(() => {
    if (!hydrated) return;
    if (studio.settings.autoSwitchVrmModels === false) return;
    if (detectedMeshes.length === 0) return;

    const evaluateMoodTimeDayVrm = () => {
      if (isGeneratingAiOutfitRef.current || isLifeBusyRef.current) return;
      if (isGenerating || isSpeaking || isUserTyping) return;
      const currentStudio = studioRef.current;
      if (currentStudio.settings.autoSwitchVrmModels === false) return;
      if (currentStudio.settings.doNotDisturb) return;

      const persona =
        currentStudio.personas.find((p) => p.id === currentStudio.activePersonaId) ||
        currentStudio.personas[0];
      if (!persona || persona.brain?.isSleeping) return;

      // Never interrupt scene-locked bath/beach/school/onsen attire mid-activity!
      const curScene = lifeSceneRef.current;
      if (
        curScene.hobby?.hobbyKind === 'showering' ||
        curScene.hobby?.hobbyKind === 'towel_dry' ||
        curScene.hobby?.hobbyKind === 'brushing_teeth' ||
        curScene.hobby?.hobbyKind === 'studying' ||
        curScene.hobby?.hobbyKind === 'gym_weights' ||
        curScene.hobby?.hobbyKind === 'gym_treadmill' ||
        curScene.hobby?.hobbyKind === 'sports_basketball' ||
        curScene.hobby?.hobbyKind === 'sports_tennis' ||
        curScene.hobby?.hobbyKind === 'stretching' ||
        curScene.destination?.destinationKind === 'tropical_beach' ||
        curScene.destination?.destinationKind === 'mountain_onsen' ||
        curScene.destination?.destinationKind === 'gym_studio' ||
        curScene.destination?.destinationKind === 'sports_court'
      ) {
        return;
      }

      const now = new Date();
      const nowMs = now.getTime();
      // Gentle 3.5-minute cooldown between autonomous VRM transformations so mood shifts never spam
      if (lastAutoVrmAtRef.current > 0 && nowMs - lastAutoVrmAtRef.current < 210_000) return;

      const ctx = getVrmMoodTimeDayContext(persona, now);
      const localYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(now.getDate()).padStart(2, '0')}`;
      const vrmKey = `${persona.id}:${localYmd}:${ctx.phase}:${persona.mood}`;
      if (lastAutoVrmKeyRef.current === vrmKey) return;

      const storageKey = `studio_auto_vrm_mtd_${persona.id}`;
      try {
        if (window.localStorage.getItem(storageKey) === vrmKey) {
          lastAutoVrmKeyRef.current = vrmKey;
          return;
        }
        window.localStorage.setItem(storageKey, vrmKey);
      } catch {
        // Ignore storage errors
      }

      lastAutoVrmKeyRef.current = vrmKey;
      lastAutoVrmAtRef.current = nowMs;

      generateVrmRef.current(undefined, {
        reuseSlotId: `slot-vrm-auto-${persona.id}-${ctx.dayShort.toLowerCase()}-${ctx.phase}`,
        silentReaction: !currentStudio.settings.autoReactOnOutfitChange,
      });
    };

    const moodSettleTimer = window.setTimeout(evaluateMoodTimeDayVrm, 16_000);
    const interval = window.setInterval(evaluateMoodTimeDayVrm, 75_000);
    return () => {
      window.clearTimeout(moodSettleTimer);
      window.clearInterval(interval);
    };
  }, [
    hydrated,
    activePersona.id,
    activePersona.mood,
    studio.settings.autoSwitchVrmModels,
    studio.settings.doNotDisturb,
    detectedMeshes.length,
    isGenerating,
    isSpeaking,
    isUserTyping,
  ]);

  const handleImportModelFile = async (file: File, customSlotName?: string) => {
    try {
      const buffer = await file.arrayBuffer();
      const meta = await saveModelToVault({ fileName: file.name, buffer });
      setVaultModels(await listVaultModels());

      const isVroidItem =
        meta.format === 'vroidcustomitem' || file.name.toLowerCase().endsWith('.vroidcustomitem');
      let materialMods: Record<string, MaterialMod> = {};

      if (isVroidItem) {
        try {
          const extracted = await extractPlayableGlbFromBuffer(buffer, file.name);
          if (extracted.vroidMetadata) {
            const { category, primaryTextureDataUrl, primaryTextureMime, primaryTextureBuffer } =
              extracted.vroidMetadata;
            const savedTex = await saveTextureToVault({
              fileName: `${file.name.replace(/\.[^.]+$/, '')}_texture.png`,
              mimeType: primaryTextureMime,
              dataUrl: primaryTextureDataUrl,
              sizeBytes: primaryTextureBuffer.byteLength,
            });

            const cat = (category || '').toLowerCase();
            const target =
              detectedMeshes.find((m) => {
                if (
                  cat.includes('dress') ||
                  cat.includes('top') ||
                  /dress|top|shirt/i.test(file.name)
                ) {
                  return m.category === 'Tops' || /top|dress|cloth/i.test(m.name);
                }
                if (
                  cat.includes('bottom') ||
                  cat.includes('skirt') ||
                  cat.includes('pants') ||
                  /skirt|pant/i.test(file.name)
                ) {
                  return m.category === 'Bottoms' || /bottom|skirt/i.test(m.name);
                }
                if (cat.includes('shoe') || cat.includes('foot') || /shoe/i.test(file.name)) {
                  return m.category === 'Footwear' || /shoe/i.test(m.name);
                }
                if (cat.includes('hair') || /hair/i.test(file.name)) {
                  return m.category === 'Hair' || /hair/i.test(m.name);
                }
                return false;
              }) ||
              detectedMeshes.find((m) => m.category === 'Tops') ||
              detectedMeshes[0];

            if (target) {
              materialMods[target.name] = {
                textureVaultId: savedTex.id,
                textureDataUrl: primaryTextureDataUrl,
                textureFileName: file.name,
              };
            }
          }
        } catch (err) {
          console.warn('[VROID] Auto-texture extraction failed:', err);
        }
      }

      const cleanItemName = file.name
        .replace(/\.(vrm|glb|xavatar|xwear|vroidcustomitem)$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      const slotName =
        customSlotName ||
        (isVroidItem
          ? `✨ ${cleanItemName}`
          : `Slot ${activePersona.outfitSlots.length + 1}: ${cleanItemName}`);

      const newSlot: OutfitSlot = {
        id: `slot-${Date.now()}`,
        name: slotName,
        modelVaultId: isVroidItem ? (activeSlot.modelVaultId || meta.id) : meta.id,
        meshVisibility: isVroidItem ? { ...activeSlot.meshVisibility } : {},
        materialMods,
        yawOffset: isVroidItem ? (activeSlot.yawOffset ?? 0) : 0,
        accessories: isVroidItem ? [...(activeSlot.accessories || [])] : [],
        createdAt: Date.now(),
      };

      updateActivePersona((p) => ({
        ...p,
        outfitSlots: [...p.outfitSlots, newSlot],
        activeOutfitSlotId: newSlot.id,
        updatedAt: Date.now(),
      }));

      if (isVroidItem) {
        setAutonomousActionToast(`👗 Imported VRoid Custom Item "${cleanItemName}" and applied to outfit!`);
        window.setTimeout(() => setAutonomousActionToast(null), 4000);
      }

      triggerOutfitReaction(
        slotName,
        isVroidItem
          ? `imported and put on VRoid custom outfit "${file.name}"`
          : `imported and equipped new 3D ${meta.format.toUpperCase()} model "${file.name}"`
      );
    } catch (err) {
      setApiErrorToast(
        err instanceof Error ? err.message : `Failed to import "${file.name}".`
      );
    }
  };

  const handleLinkVaultModelAsSlot = (model: VaultModelMeta, customSlotName?: string) => {
    const slotName =
      customSlotName ||
      `Slot ${activePersona.outfitSlots.length + 1}: ${model.fileName
        .replace(/\.(vrm|glb|xavatar|xwear)$/i, '')
        .replace(/[_-]+/g, ' ')}`;
    const newSlot: OutfitSlot = {
      id: `slot-${Date.now()}`,
      name: slotName,
      modelVaultId: model.id,
      meshVisibility: {},
      materialMods: {},
      yawOffset: 0,
      accessories: [],
      createdAt: Date.now(),
    };

    updateActivePersona((p) => ({
      ...p,
      outfitSlots: [...p.outfitSlots, newSlot],
      activeOutfitSlotId: newSlot.id,
      updatedAt: Date.now(),
    }));

    triggerOutfitReaction(
      slotName,
      `equipped saved 3D model "${model.fileName}" from IndexedDB vault`
    );
  };

  const handleEquipVaultAccessory = (
    meta: VaultAccessoryMeta,
    attachTarget?: AccessoryAttachTarget
  ) => {
    // VRoid custom items are outfit textures, not 3D props: apply them to the matching clothing piece.
    if (meta.format === 'vroidcustomitem' || /\.vroidcustomitem$/i.test(meta.fileName)) {
      void (async () => {
        const rec = await getAccessoryBuffer(meta.id);
        if (rec) await applyVroidBuffer(rec.buffer, meta.fileName, meta.name);
      })();
      return;
    }
    const target = attachTarget ?? meta.defaultTarget;
    const equipped: EquippedAccessory = {
      id: `eq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      vaultAccessoryId: meta.id,
      name: meta.name,
      fileName: meta.fileName,
      format: meta.format,
      visible: true,
      attachTarget: target,
      position: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      scale: 1,
    };

    updateActiveSlot((slot) => ({
      ...slot,
      accessories: [...(slot.accessories || []), equipped],
    }));

    setAutonomousActionToast(`🎀 Equipped: ${meta.name}`);
    window.setTimeout(() => setAutonomousActionToast(null), 3200);
    triggerOutfitReaction(
      activeSlot.name,
      `added 3D ${meta.format.toUpperCase()} accessory "${meta.name}" (${target})`
    );
  };

  const handleImportAccessoryFile = async (
    file: File,
    customName?: string,
    attachTarget?: AccessoryAttachTarget
  ) => {
    try {
      const buffer = await file.arrayBuffer();
      const meta = await saveAccessoryToVault({
        fileName: file.name,
        name: customName,
        buffer,
        defaultTarget: attachTarget,
      });
      setVaultAccessories(await listVaultAccessories());
      handleEquipVaultAccessory(meta, attachTarget ?? meta.defaultTarget);
    } catch (err) {
      setApiErrorToast(
        err instanceof Error
          ? err.message
          : `Failed to import accessory "${file.name}".`
      );
    }
  };

  const handleUpdateEquippedAccessory = (
    accessoryId: string,
    patch: Partial<EquippedAccessory>
  ) => {
    updateActiveSlot((slot) => ({
      ...slot,
      accessories: (slot.accessories || []).map((acc) =>
        acc.id === accessoryId ? { ...acc, ...patch } : acc
      ),
    }));
  };

  const handleRemoveEquippedAccessory = (accessoryId: string) => {
    updateActiveSlot((slot) => ({
      ...slot,
      accessories: (slot.accessories || []).filter((acc) => acc.id !== accessoryId),
    }));
  };

  const handleDeleteVaultAccessory = async (vaultAccessoryId: string) => {
    await deleteVaultAccessory(vaultAccessoryId);
    setVaultAccessories(await listVaultAccessories());
    updateActivePersona((p) => ({
      ...p,
      outfitSlots: p.outfitSlots.map((slot) => ({
        ...slot,
        accessories: (slot.accessories || []).filter(
          (acc) => acc.vaultAccessoryId !== vaultAccessoryId
        ),
      })),
      updatedAt: Date.now(),
    }));
  };

  const handleDeleteSlot = (slotId: string) => {
    updateActivePersona((p) => {
      const remaining = p.outfitSlots.filter((s) => s.id !== slotId);
      if (remaining.length === 0) return p;
      return {
        ...p,
        outfitSlots: remaining,
        activeOutfitSlotId:
          p.activeOutfitSlotId === slotId ? remaining[0].id : p.activeOutfitSlotId,
        updatedAt: Date.now(),
      };
    });
  };

  const handleDeleteVaultModel = async (modelId: string) => {
    await deleteVaultModel(modelId);
    setVaultModels(await listVaultModels());
  };

  const handleToggleCyclingShorts = (enabled: boolean) => {
    updateActiveSlot((slot) => ({
      ...slot,
      cyclingShorts: enabled,
    }));
    triggerOutfitReaction(
      activeSlot.name,
      enabled ? 'equipped cycling safety shorts' : 'removed cycling safety shorts'
    );
  };

  const handleToggleMeshVisibility = (
    meshName: string,
    nextVisible: boolean,
    displayLabel?: string
  ) => {
    const pieceName = displayLabel || meshName;
    updateActiveSlot((slot) => ({
      ...slot,
      meshVisibility: { ...slot.meshVisibility, [meshName]: nextVisible },
    }));
    triggerOutfitReaction(
      activeSlot.name,
      nextVisible ? `put ${pieceName} back on` : `hid / removed ${pieceName}`
    );
  };

  const handleSetAllMeshesVisible = (meshNames: string[]) => {
    updateActiveSlot((slot) => {
      const nextVisibility = { ...slot.meshVisibility };
      for (const name of meshNames) {
        nextVisibility[name] = true;
      }
      return {
        ...slot,
        meshVisibility: nextVisibility,
      };
    });
    triggerOutfitReaction(activeSlot.name, 'turned all clothing & accessory pieces back on');
  };

  const handleResetMeshVisibility = () => {
    updateActiveSlot((slot) => ({
      ...slot,
      meshVisibility: {},
      garmentStyle: 'default',
      garmentPalette: undefined,
    }));
    triggerOutfitReaction(activeSlot.name, 'reset all clothing pieces back to default');
  };

  const handleUpdateMaterialColor = (
    meshName: string,
    colorHex: string,
    swatchLabel?: string,
    displayLabel?: string
  ) => {
    const pieceName = displayLabel || meshName;
    updateActiveSlot((slot) => ({
      ...slot,
      materialMods: {
        ...slot.materialMods,
        [meshName]: {
          ...slot.materialMods[meshName],
          colorHex,
        },
      },
    }));
    triggerOutfitReaction(
      activeSlot.name,
      `recolored ${pieceName} to ${swatchLabel ? `${swatchLabel} (${colorHex})` : colorHex}`
    );
  };

  const handleUploadMaterialTexture = (
    meshName: string,
    file: File,
    displayLabel?: string
  ) => {
    const pieceName = displayLabel || meshName;
    const isVroid = file.name.toLowerCase().endsWith('.vroidcustomitem');

    if (isVroid) {
      void (async () => {
        const tex = await extractVroidTexture(await file.arrayBuffer(), file.name);
        if (tex) {
          await applyVroidTexture(meshName, pieceName, tex, file.name);
        } else {
          setApiErrorToast(`Could not read an outfit texture from "${file.name}".`);
        }
      })();
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;

      const savedTex = await saveTextureToVault({
        fileName: file.name,
        mimeType: file.type || 'image/png',
        dataUrl,
        sizeBytes: file.size,
      });

      updateActiveSlot((slot) => ({
        ...slot,
        materialMods: {
          ...slot.materialMods,
          [meshName]: {
            ...slot.materialMods[meshName],
            textureVaultId: savedTex.id,
            textureDataUrl: dataUrl,
            textureFileName: file.name,
          },
        },
      }));
      triggerOutfitReaction(
        activeSlot.name,
        `applied custom PNG clothing texture "${file.name}" onto ${pieceName}`
      );
    };
    reader.readAsDataURL(file);
  };

  const handleResetMaterialMod = (meshName: string, displayLabel?: string) => {
    const pieceName = displayLabel || meshName;
    const existingVaultId = activeSlot.materialMods[meshName]?.textureVaultId;
    if (existingVaultId) void deleteTextureFromVault(existingVaultId);
    updateActiveSlot((slot) => {
      const nextMods = { ...slot.materialMods };
      delete nextMods[meshName];
      return { ...slot, materialMods: nextMods };
    });
    triggerOutfitReaction(
      activeSlot.name,
      `reset ${pieceName} texture and color back to default`
    );
  };

  const handleImportVrmaFile = async (file: File): Promise<VaultVrmaMeta | null> => {
    const buffer = await file.arrayBuffer();
    const meta = await saveVrmaToVault({ fileName: file.name, buffer });
    setVaultVrmas(await listVaultVrmas());
    return meta;
  };

  const handleDeleteVrma = async (id: string) => {
    await deleteVaultVrma(id);
    setVaultVrmas(await listVaultVrmas());
  };

  const applyVroidTexture = async (
    meshName: string,
    pieceName: string,
    tex: VroidTextureResult,
    fileName: string
  ) => {
    const savedTex = await saveTextureToVault({
      fileName: `${fileName.replace(/\.[^.]+$/, '')}_texture.png`,
      mimeType: tex.mime,
      dataUrl: tex.dataUrl,
      sizeBytes: tex.buffer.byteLength,
    });
    updateActiveSlot((slot) => ({
      ...slot,
      materialMods: {
        ...slot.materialMods,
        [meshName]: {
          ...slot.materialMods[meshName],
          textureVaultId: savedTex.id,
          textureDataUrl: tex.dataUrl,
          textureFileName: fileName,
        },
      },
    }));
    setAutonomousActionToast(`👗 Applied "${fileName}" to ${pieceName}`);
    window.setTimeout(() => setAutonomousActionToast(null), 3500);
    triggerOutfitReaction(
      activeSlot.name,
      `applied VRoid custom outfit texture "${fileName}" onto ${pieceName}`
    );
  };

  const pickMeshForVroidItem = (
    category: string | undefined,
    label: string
  ): MeshDescriptor | undefined => {
    const hay = `${category || ''} ${label}`.toLowerCase();
    const meshes = detectedMeshesRef.current;
    const named = (m: MeshDescriptor, re: RegExp) => re.test(`${m.name} ${m.label}`);
    if (/shoe|boot|foot|sneaker|sock/.test(hay)) {
      return meshes.find((m) => m.category === 'Footwear' || named(m, /shoe|boot|foot/i));
    }
    if (/hair|bang|ahoge/.test(hay)) {
      return meshes.find((m) => m.category === 'Hair' || named(m, /hair/i));
    }
    if (/bottom|skirt|pant|short/.test(hay)) {
      return meshes.find((m) => m.category === 'Bottoms' || named(m, /bottom|skirt/i));
    }
    if (/dress|onepiece|gown|top|shirt|jacket|hoodie|coat|sweater/.test(hay)) {
      return meshes.find((m) => m.category === 'Tops' || named(m, /top|dress|cloth|shirt/i));
    }
    return undefined;
  };

  const applyVroidBuffer = async (buffer: ArrayBuffer, fileName: string, label: string) => {
    const tex = await extractVroidTexture(buffer, fileName);
    if (!tex) {
      setApiErrorToast(`Could not read an outfit texture from "${fileName}".`);
      return;
    }
    const mesh = pickMeshForVroidItem(tex.category, `${label} ${fileName}`);
    if (!mesh) {
      setApiErrorToast(
        `"${label}" is an outfit texture (not a 3D prop). I couldn't tell which clothing piece it belongs to. Open Wardrobe, pick the piece, then Upload texture.`
      );
      return;
    }
    await applyVroidTexture(mesh.name, mesh.label, tex, fileName);
  };

  const handleGenerateStage = async (prompt: string, style?: string) => {
    const clean = prompt.trim();
    if (!clean) return;
    if (isStageGeneratingRef.current) {
      setAutonomousActionToast('🎨 Already painting a stage, one moment...');
      window.setTimeout(() => setAutonomousActionToast(null), 2500);
      return;
    }
    isStageGeneratingRef.current = true;
    setIsStageGenerating(true);
    setAutonomousActionToast('🎨 Painting a new stage...');
    try {
      const currentPersona = studioRef.current.personas.find(
        (p) => p.id === studioRef.current.activePersonaId
      );
      const res = await generateStageScenery({
        prompt: clean,
        style: style as StageSceneryGenParams['style'],
        apiKey: resolveEffectiveApiKey(studioRef.current.settings),
        mood: currentPersona?.mood,
        personaName: currentPersona?.name,
      });
      if (res.ok && res.environment) {
        const env = res.environment;
        updateActivePersona((p) => ({ ...p, customEnvironment: env, updatedAt: Date.now() }));
        const modelBadge = res.llmModelUsed ? ` · directed by ${res.llmModelUsed}` : '';
        setAutonomousActionToast(`🎨 New stage ready: ${clean.slice(0, 44)}${modelBadge}`);
      } else {
        setAutonomousActionToast(`⚠️ Stage painting failed: ${res.error || 'unknown error'}`);
      }
    } finally {
      isStageGeneratingRef.current = false;
      setIsStageGenerating(false);
      window.setTimeout(() => setAutonomousActionToast(null), 4000);
    }
  };
  generateStageRef.current = (p, s) => void handleGenerateStage(p, s);

  const handleSelectEnvironment = (stageEnvironment: StageEnvironmentId) => {
    updateActivePersona((p) => ({
      ...p,
      stageEnvironment,
      updatedAt: Date.now(),
    }));
  };

  const handleUploadCustomEnvironment = async (file: File) => {
    const lower = file.name.toLowerCase();
    const kind: CustomBackdropKind = lower.endsWith('.hdr')
      ? 'hdr'
      : lower.endsWith('.glb')
        ? 'glb'
        : 'image';
    const buffer = await file.arrayBuffer();
    const rec = await saveEnvironmentToVault({
      fileName: file.name,
      kind,
      mimeType: file.type || '',
      buffer,
    });
    updateActivePersona((p) => ({
      ...p,
      customEnvironment: {
        vaultId: rec.id,
        fileName: rec.fileName,
        kind: rec.kind,
      },
      updatedAt: Date.now(),
    }));
  };

  const handleClearCustomEnvironment = () => {
    updateActivePersona((p) => ({
      ...p,
      customEnvironment: null,
      updatedAt: Date.now(),
    }));
  };

  const handleAddMemory = (fact: string) => {
    updateActivePersona((p) => ({
      ...p,
      memoryJournal: [
        ...p.memoryJournal,
        { id: `mem-manual-${Date.now()}`, fact, createdAt: Date.now() },
      ],
      updatedAt: Date.now(),
    }));
  };

  const handleDeleteMemory = (id: string) => {
    updateActivePersona((p) => ({
      ...p,
      memoryJournal: p.memoryJournal.filter((m) => m.id !== id),
      updatedAt: Date.now(),
    }));
  };

  const handleChangeLanguage = (language: VoiceLanguage) => {
    updateActivePersona((p) => ({
      ...p,
      voice: { ...p.voice, language },
      updatedAt: Date.now(),
    }));
  };

  const handleChangeGender = (gender: VoiceGender) => {
    updateActivePersona((p) => {
      const archetype = VOCAL_ARCHETYPES[p.voice.archetype];
      const recommended =
        gender === 'female' ? archetype.recommendedFemale : archetype.recommendedMale;
      const valid = VOICES_BY_GENDER[gender].some((v) => v.id === p.voice.voiceName);
      return {
        ...p,
        voice: {
          ...p.voice,
          gender,
          voiceName: valid ? p.voice.voiceName : recommended,
        },
        updatedAt: Date.now(),
      };
    });
  };

  const handleChangeArchetype = (archetype: VocalArchetype) => {
    const meta = VOCAL_ARCHETYPES[archetype];
    updateActivePersona((p) => ({
      ...p,
      voice: {
        ...p.voice,
        archetype,
        voiceName:
          p.voice.gender === 'female' ? meta.recommendedFemale : meta.recommendedMale,
        pitch: meta.defaultPitch,
        speed: meta.defaultSpeed,
      },
      updatedAt: Date.now(),
    }));
  };

  const handleToggleAutoSpeak = () => {
    updateActivePersona((p) => ({
      ...p,
      voice: { ...p.voice, autoSpeak: !p.voice.autoSpeak },
    }));
  };

  const handleUpdateVoice = (patch: Partial<Persona['voice']>) => {
    updateActivePersona((p) => ({
      ...p,
      voice: { ...p.voice, ...patch },
      updatedAt: Date.now(),
    }));
  };

  const handleResetChatHistory = () => {
    voiceEngine.stop();
    updateActivePersona((p) => {
      const greeting = p.voice.language === 'ja' ? p.greetingJa : p.greetingEn;
      const parsed = parseDialogueResponse(greeting, 'Deadpan');
      return {
        ...p,
        mood: parsed.mood,
        pendingSystemEvents: [],
        lastMemorySummaryMsgCount: 0,
        messages: [
          {
            id: `msg-reset-${Date.now()}`,
            role: 'assistant',
            rawText: greeting,
            segments: parsed.segments,
            spokenText: parsed.spokenText,
            mood: parsed.mood,
            timestamp: Date.now(),
          },
        ],
        updatedAt: Date.now(),
      };
    });
  };

  const handleSavePersona = (saved: Persona) => {
    setStudio((prev) => {
      const exists = prev.personas.some((p) => p.id === saved.id);
      return {
        ...prev,
        personas: exists
          ? prev.personas.map((p) => (p.id === saved.id ? saved : p))
          : [...prev.personas, saved],
      };
    });
  };

  const handleDuplicatePersona = (source: Persona) => {
    const now = Date.now();
    const copy: Persona = {
      ...source,
      id: `persona-copy-${now}`,
      name: `${source.name} (Copy)`,
      isPreset: false,
      outfitSlots: source.outfitSlots.map((s, idx) => ({
        ...s,
        id: `slot-copy-${now}-${idx}`,
      })),
      createdAt: now,
      updatedAt: now,
    };
    copy.activeOutfitSlotId = copy.outfitSlots[0].id;
    setStudio((prev) => ({
      ...prev,
      personas: [...prev.personas, copy],
      activePersonaId: copy.id,
    }));
  };

  const handleDeletePersona = (id: string) => {
    setStudio((prev) => {
      const remaining = prev.personas.filter((p) => p.id !== id);
      if (remaining.length === 0) return prev;
      return {
        ...prev,
        personas: remaining,
        activePersonaId:
          prev.activePersonaId === id ? remaining[0].id : prev.activePersonaId,
      };
    });
  };

  const handleSpeakMessage = (msg: ChatMessage) => {
    void voiceEngine.speakRawDialogue({
      rawText: msg.rawText,
      mood: msg.mood || activePersona.mood,
      voice: activePersona.voice,
      settings: studio.settings,
      personaName: activePersona.name,
      emotionIntensity: activePersona.emotionIntensity,
      hunger: activePersona.brain?.hunger,
      sleepiness: activePersona.brain?.sleepiness,
      boredom: activePersona.brain?.boredom,
      comfort: activePersona.brain?.comfort,
      isSleeping: activePersona.brain?.isSleeping,
      nuancedFeeling: activePersona.brain?.nuancedFeeling,
      empathySoftening: Boolean(activePersona.brain?.carryover?.empathySoftening),
      recentInteractionZone,
    });
  };

  const handleSpeakLatest = () => {
    const latestAssistant = [...activePersona.messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.spokenText);
    if (latestAssistant) {
      handleSpeakMessage(latestAssistant);
    } else {
      handleTestVoice();
    }
  };

  const handleTestVoice = () => {
    const sample =
      activePersona.voice.language === 'ja'
        ? '"べ、別にアンタのためじゃないんだからねっ！" (I-It\'s not like I\'m doing this for you or anything!)'
        : '"Hmph! Don\'t get the wrong idea—I\'m only testing this mic for the studio!"';
    void voiceEngine.speakRawDialogue({
      rawText: sample,
      mood: activePersona.mood,
      voice: activePersona.voice,
      settings: studio.settings,
      personaName: activePersona.name,
      emotionIntensity: activePersona.emotionIntensity,
      hunger: activePersona.brain?.hunger,
      sleepiness: activePersona.brain?.sleepiness,
      boredom: activePersona.brain?.boredom,
      comfort: activePersona.brain?.comfort,
      isSleeping: activePersona.brain?.isSleeping,
      nuancedFeeling: activePersona.brain?.nuancedFeeling,
      empathySoftening: Boolean(activePersona.brain?.carryover?.empathySoftening),
      recentInteractionZone,
    });
  };

  const handleCompleteStartupSetup = async (result: StartupSetupResult) => {
    let uploadedMeta: VaultModelMeta | null = null;
    if (result.uploadedModelFile) {
      const buffer = await result.uploadedModelFile.arrayBuffer();
      uploadedMeta = await saveModelToVault({
        fileName: result.uploadedModelFile.name,
        buffer,
      });
      setVaultModels(await listVaultModels());
    }

    const chosenVaultId = uploadedMeta?.id ?? result.selectedVaultModelId;
    const cleanOwnKey = result.useBuiltInKey ? '' : sanitizeApiKey(result.customApiKey);
    if (!result.useBuiltInKey && cleanOwnKey) {
      saveKeyToLocalStorage(cleanOwnKey);
    }

    const nextSettings: StudioSettings = {
      ...studioRef.current.settings,
      userName: result.userName,
      userHonorific: result.userHonorific,
      useBuiltInKey: result.useBuiltInKey,
      apiKey: result.useBuiltInKey ? '' : cleanOwnKey,
      defaultPosture: result.posture,
      ...(result.validatedModel ? { textModel: result.validatedModel } : {}),
    };

    const now = Date.now();
    setStudio((prev) => ({
      ...prev,
      activePersonaId: result.activePersonaId,
      settings: nextSettings,
      personas: prev.personas.map((p) => {
        if (p.id !== result.activePersonaId || !chosenVaultId) return p;
        const matched = p.outfitSlots.find((s) => s.modelVaultId === chosenVaultId);
        if (matched) {
          return { ...p, activeOutfitSlotId: matched.id, updatedAt: now };
        }
        const modelName =
          uploadedMeta?.fileName ||
          vaultModels.find((m) => m.id === chosenVaultId)?.fileName ||
          'Custom Avatar';
        const newSlot: OutfitSlot = {
          id: `slot-setup-${now}`,
          name: `Slot ${p.outfitSlots.length + 1}: ${modelName
            .replace(/\.(vrm|glb)$/i, '')
            .replace(/[_-]+/g, ' ')}`,
          modelVaultId: chosenVaultId,
          meshVisibility: {},
          materialMods: {},
          yawOffset: 0,
          createdAt: now,
        };
        return {
          ...p,
          outfitSlots: [...p.outfitSlots, newSlot],
          activeOutfitSlotId: newSlot.id,
          updatedAt: now,
        };
      }),
      updatedAt: now,
    }));

    const effectiveKey = resolveEffectiveApiKey(nextSettings);
    hasAutoPromptedAuthRef.current = false;
    setApiErrorToast(null);
    if (effectiveKey) {
      setConnectionMode('live');
      setProviderStatus(
        result.useBuiltInKey
          ? `Live Gemini (${nextSettings.textModel}) · built-in default key`
          : `Live Gemini (${nextSettings.textModel}) · custom API key`
      );
    } else {
      setConnectionMode('demo');
      setProviderStatus('Demo Mode (multi-response offline pool — add key for Live Gemini)');
    }

    markStudioSetupComplete();
    setIsSetupOpen(false);

    if (result.triggerGreeting) {
      const targetPersona =
        studioRef.current.personas.find((p) => p.id === result.activePersonaId) ||
        studioRef.current.personas[0];
      const greetingRaw =
        targetPersona.voice.language === 'ja'
          ? targetPersona.greetingJa
          : targetPersona.greetingEn;
      if (targetPersona && greetingRaw) {
        window.setTimeout(() => {
          void voiceEngine.speakRawDialogue({
            rawText: greetingRaw,
            mood: targetPersona.mood,
            voice: targetPersona.voice,
            settings: nextSettings,
            personaName: targetPersona.name,
            emotionIntensity: targetPersona.emotionIntensity,
          });
        }, 350);
      }
    }
  };

  const handleResetFactoryPresets = () => {
    const fresh = createDefaultStudioState();
    fresh.settings = { ...studio.settings };
    setStudio(fresh);
  };

  const triggerManualRoamBehavior = (behavior: RoamBehavior) => {
    const id = roamCommandSeqRef.current++;
    const targetX =
      behavior === 'peek'
        ? Math.random() < 0.5
          ? -0.92
          : 0.92
        : behavior === 'walk'
          ? (Math.random() - 0.5) * 1.4
          : behavior === 'sit_taskbar'
            ? roamNormX
            : 0;
    const targetY = 0;
    setRoamCommand({ id, targetX, targetY, behavior });
  };

  return (
    <div
      className={`relative flex h-screen w-screen flex-col overflow-hidden text-zinc-100 ${desktopRoamMode ? 'bg-transparent' : 'bg-[#07070c]'
        }`}
    >
      {/* Real API Error Toast Banner */}
      {apiErrorToast && !studio.settings.preferLocalAi && studio.settings.enableGeminiCloud !== false && (
        <div
          role="alert"
          className="fixed left-1/2 top-16 z-[60] flex max-w-2xl -translate-x-1/2 items-center gap-3 rounded-2xl border border-rose-500/50 bg-[#1a0b12]/95 px-4 py-2.5 text-xs text-rose-100 shadow-glass backdrop-blur-xl"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span className="font-mono text-[11px] leading-snug">{apiErrorToast}</span>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="shrink-0 rounded-lg bg-rose-500/25 px-2.5 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/40"
          >
            Fix Key
          </button>
          <button
            type="button"
            onClick={() => setApiErrorToast(null)}
            className="rounded-lg p-1 text-rose-300 hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Autonomous Tool Action Toast */}
      {autonomousActionToast && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-400/45 bg-violet-950/85 px-4 py-1.5 text-xs font-semibold text-violet-100 shadow-glow backdrop-blur-xl">
          <Sparkles className="h-3.5 w-3.5 text-violet-300" />
          <span>{autonomousActionToast}</span>
        </div>
      )}

      {/* Studio Top Toolbar (hidden in transparent Desktop Roam Mode) */}
      {!desktopRoamMode && (
        <TopToolbar
          personas={studio.personas}
          activePersona={activePersona}
          isWardrobeOpen={isWardrobeOpen}
          desktopRoamMode={desktopRoamMode}
          idleCheckInMinutes={studio.settings.idleCheckInMinutes}
          doNotDisturb={studio.settings.doNotDisturb}
          isSpeaking={isSpeaking}
          connectionMode={connectionMode}
          onSelectPersona={(id) => {
            voiceEngine.stop();
            setLastAffinityDelta(null);
            setStudio((prev) => ({ ...prev, activePersonaId: id }));
          }}
          onOpenRoster={() => setIsRosterOpen(true)}
          onToggleWardrobe={() => {
            setIsWardrobeOpen((v) => !v);
            setIsLifeOpen(false);
          }}
          isLifeOpen={isLifeOpen}
          onToggleLife={() => {
            setIsLifeOpen((v) => !v);
            setIsWardrobeOpen(false);
          }}
          onToggleDesktopRoam={() => void toggleDesktopRoamMode(true)}
          onCycleIdleCheckIn={handleCycleIdleCheckIn}
          onChangeLanguage={handleChangeLanguage}
          onChangeGender={handleChangeGender}
          onChangeArchetype={handleChangeArchetype}
          onToggleAutoSpeak={handleToggleAutoSpeak}
          onStopSpeaking={() => voiceEngine.stop()}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSyncWorkspace={handleSyncWorkspaceNow}
          isSyncingWorkspace={isSyncingWorkspace}
        />
      )}

      {/* Main Stage: Full-Screen Transparent Roam Overlay OR Responsive Split-Pane Studio */}
      <main className="flex flex-col md:flex-row flex-1 min-h-0 w-full overflow-hidden">
        <section
          className={`relative min-w-0 transition-all duration-300 ${desktopRoamMode
            ? 'w-full h-full'
            : 'w-full h-[45vh] md:h-full md:w-[65%]'
            }`}
        >
          <StageViewport
            persona={activePersona}
            activeSlot={activeSlot}
            isGenerating={isGenerating}
            isSpeaking={isSpeaking}
            isUserTyping={isUserTyping}
            vaultVrmas={vaultVrmas}
            desktopRoamMode={desktopRoamMode}
            freeRoamEnabled={freeRoamEnabled}
            autoRoamEnabled={autoRoamEnabled}
            posture={studio.settings.defaultPosture ?? 'seated'}
            onChangePosture={(next) => {
              handleUpdateSettings({ defaultPosture: next });
              if (next === 'sleeping') {
                updateActivePersona((p) => ({
                  ...p,
                  brain: { ...p.brain, isSleeping: true },
                }));
              } else {
                updateActivePersona((p) => ({
                  ...p,
                  brain: { ...p.brain, isSleeping: false },
                }));
              }
            }}
            onChangeSleepingPosition={(next) =>
              updateActivePersona((p) => ({
                ...p,
                brain: {
                  ...p.brain,
                  isSleeping: true,
                  sleepingPosition: next,
                },
              }))
            }
            onCrossDisplayEdge={isDesktopApp ? handleCrossDisplayEdge : undefined}
            roamBehavior={roamBehavior}
            roamCommand={roamCommand}
            emoteCommand={emoteCommand}
            gazeCommand={gazeCommand}
            expressionCommand={expressionCommand}
            microTellCommand={microTellCommand}
            onToggleAutoRoam={() => setAutoRoamEnabled((v) => !v)}
            onTriggerBrainImpulse={(reason) => triggerBrainImpulse(reason, true)}
            onCareActivity={handleCareActivity}
            onWakeFromSleep={handleWakeFromSleep}
            onSpeakLatest={handleSpeakLatest}
            onStopSpeaking={() => voiceEngine.stop()}
            recentInteractionZone={recentInteractionZone}
            onOpenMemoryJournal={() => setIsMemoryOpen(true)}
            onRoamStatusChange={({ normX, headScreenX, headScreenY, behavior, isDragging }) => {
              setRoamNormX(normX);
              setHeadScreenPos({ x: headScreenX, y: headScreenY });
              setRoamBehavior(behavior);
              setIsDraggingAvatar(isDragging);
            }}
            onWidgetAvatarClick={() => setWidgetBubbleRequestedAt(Date.now())}
            onWidgetAvatarDropped={() => {
              fireMicroTell('startled');
              setWidgetBubbleRequestedAt(Date.now());
              updateActivePersona((p) => ({
                ...p,
                mood: 'Flustered',
                emotionIntensity: 0.85,
                updatedAt: Date.now(),
              }));
            }}
            onCharacterHoverChange={(hovering) => {
              hoveringAvatarRef.current = hovering;
              setIsHoveringAvatar(hovering);
              syncClickThrough();
            }}
            onMeshesDetected={setDetectedMeshes}
            onImportModelFile={(file) => void handleImportModelFile(file)}
            onImportAccessoryFile={(file) => void handleImportAccessoryFile(file)}
            onImportVrmaFile={handleImportVrmaFile}
            onDeleteVrma={(id) => void handleDeleteVrma(id)}
            onSelectEnvironment={handleSelectEnvironment}
            onUploadCustomEnvironment={(file) => void handleUploadCustomEnvironment(file)}
            onGenerateStage={(p, s) => void handleGenerateStage(p, s)}
            isStageGenerating={isStageGenerating}
            onClearCustomEnvironment={handleClearCustomEnvironment}
            onModelVaultSynced={() => {
              void listVaultModels().then((models) => setVaultModels(models));
            }}
            onOpenWardrobe={() => setIsWardrobeOpen(true)}
            onAvatarInteraction={handleAvatarInteraction}
            onUpdateYawOffset={handleUpdateSlotYawOffset}
            onUpdateEquippedAccessory={handleUpdateEquippedAccessory}
            lifeScene={lifeScene}
            onOutfitIntegrityReport={setLatestIntegrityReport}
          />

          {!desktopRoamMode && (
            <LifeStudioDrawer
              isOpen={isLifeOpen}
              persona={activePersona}
              lifeScene={lifeScene}
              isBusy={isLifeBusy || isGeneratingAiOutfit}
              autoLifeByMood={studio.settings.autoLifeByMood !== false}
              onToggleAutoLifeByMood={(next) =>
                handleUpdateSettings({ autoLifeByMood: next })
              }
              onClose={() => setIsLifeOpen(false)}
              onFollowWhim={() => void handleFollowWhim()}
              onPlanFood={(p, k) => void handlePlanMoodFood(p, k, false)}
              onQuickFood={handleQuickFood}
              onClearDining={() => setLifeScene((prev) => ({ ...prev, dining: null }))}
              onPlanHobby={(p) => void handlePlanHobby(p, false)}
              onQuickHobby={handleQuickHobby}
              onClearHobby={() => setLifeScene((prev) => ({ ...prev, hobby: null }))}
              onStartSchoolStudy={(lvl, sub, autoUni) =>
                void handleStartSchoolStudy(lvl, sub, autoUni, false)
              }
              onLeaveSchool={() =>
                setLifeScene((prev) => ({
                  ...prev,
                  hobby: prev.hobby?.hobbyKind === 'studying' ? null : prev.hobby,
                  destination:
                    prev.destination?.destinationKind === 'highschool_classroom' ||
                    prev.destination?.destinationKind === 'college_campus'
                      ? null
                      : prev.destination,
                }))
              }
              onStartHygiene={(r, h, refresh) =>
                void handleStartHygieneRoutine(r, h, refresh, false)
              }
              onLeaveBathroom={handleLeaveBathroom}
              onPlanDestination={(p, d) => void handlePlanDestination(p, d, false)}
              onQuickDestination={handleQuickDestination}
              onClearDestination={() => setLifeScene((prev) => ({ ...prev, destination: null }))}
            />
          )}

          {!desktopRoamMode && (
            <WardrobeDrawer
              isOpen={isWardrobeOpen}
              persona={activePersona}
              activeSlot={activeSlot}
              detectedMeshes={detectedMeshes}
              vaultModels={vaultModels}
              autoReactOnOutfitChange={studio.settings.autoReactOnOutfitChange}
              onToggleAutoReact={(next) =>
                handleUpdateSettings({ autoReactOnOutfitChange: next })
              }
              onClose={() => setIsWardrobeOpen(false)}
              onSelectSlot={handleSelectSlot}
              onRenameSlot={handleRenameSlot}
              onUpdateYawOffset={handleUpdateSlotYawOffset}
              onImportModelFile={(file, name) => void handleImportModelFile(file, name)}
              onLinkVaultModelAsSlot={handleLinkVaultModelAsSlot}
              onDeleteSlot={handleDeleteSlot}
              onDeleteVaultModel={(id) => void handleDeleteVaultModel(id)}
              onToggleMeshVisibility={handleToggleMeshVisibility}
              onSetAllMeshesVisible={handleSetAllMeshesVisible}
              onResetMeshVisibility={handleResetMeshVisibility}
              onUpdateMaterialColor={handleUpdateMaterialColor}
              onUploadMaterialTexture={handleUploadMaterialTexture}
              onResetMaterialMod={handleResetMaterialMod}
              onToggleCyclingShorts={handleToggleCyclingShorts}
              vaultAccessories={vaultAccessories}
              onImportAccessoryFile={(file, name, target) =>
                void handleImportAccessoryFile(file, name, target)
              }
              onEquipVaultAccessory={handleEquipVaultAccessory}
              onUpdateEquippedAccessory={handleUpdateEquippedAccessory}
              onRemoveEquippedAccessory={handleRemoveEquippedAccessory}
              onDeleteVaultAccessory={(id) => void handleDeleteVaultAccessory(id)}
              onTriggerAiStylist={handleTriggerAiStylist}
              isGeneratingAiOutfit={isGeneratingAiOutfit}
              onGenerateAiOutfit={handleGenerateAiOutfit}
              onDesignOutfitForNow={(occasion) =>
                void handleDesignOutfitForTimeOccasion(occasion, {
                  reuseDailySlot: false,
                  silentReaction: false,
                })
              }
              autoDressByTimeOccasion={studio.settings.autoDressByTimeOccasion !== false}
              onToggleAutoDressByTime={(next) =>
                handleUpdateSettings({ autoDressByTimeOccasion: next })
              }
              autoSwitchVrmModels={studio.settings.autoSwitchVrmModels !== false}
              onToggleAutoSwitchVrmModels={(next) =>
                handleUpdateSettings({ autoSwitchVrmModels: next })
              }
              onSelectVrmModel={handleSelectVrmModel}
              onAiPickVrmModel={(prompt) => void handleAiPickVrmModel(prompt)}
              onGenerateAiVrmType={(prompt) => void handleGenerateAiVrmType(prompt)}
              preferLocalAi={Boolean(studio.settings.preferLocalAi)}
              onToggleProceduralAccessory={handleToggleProceduralAccessory}
              onSelectGarmentStyle={handleSelectGarmentStyle}
              onSelectHairStyle={handleSelectHairStyle}
              onSelectHairColor={handleSelectHairColor}
              onAiPickHairStyle={(prompt) => void handleAiPickHairStyle(prompt)}
              integrityReport={latestIntegrityReport}
            />
          )}
        </section>

        {!desktopRoamMode && (
          <section className="w-full flex-1 md:h-full md:w-[35%] md:min-w-[340px] min-h-0">
            <ChatSidebar
              persona={activePersona}
              isGenerating={isGenerating}
              isSpeaking={isSpeaking}
              connectionMode={connectionMode}
              showAiStudioConnectBanner={hasAiStudioBridge && !studio.settings.apiKey.trim()}
              providerStatus={providerStatus}
              lastAffinityDelta={lastAffinityDelta}
              onSendMessage={(text) => void runAiTurn(text, 'user')}
              onSpeakMessage={handleSpeakMessage}
              onUserTypingChange={setIsUserTyping}
              onResetHistory={handleResetChatHistory}
              onOpenMemoryJournal={() => setIsMemoryOpen(true)}
              onConnectAiStudioKey={() => void handleConnectAiStudioKey()}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onInspectScreen={handleInspectScreen}
            />
          </section>
        )}
      </main>

      {/* Desktop Roam Floating Speech Bubble + Quick Expand-to-Studio Dock */}
      {desktopRoamMode && (
        <FloatingRoamBubble
          persona={activePersona}
          headScreenX={headScreenPos.x}
          headScreenY={headScreenPos.y}
          roamBehavior={roamBehavior}
          isDraggingAvatar={isDraggingAvatar}
          isHoveringAvatar={isHoveringAvatar}
          freeRoamEnabled={freeRoamEnabled}
          isGenerating={isGenerating}
          isSpeaking={isSpeaking}
          bubbleRequestedAt={widgetBubbleRequestedAt}
          noticeActiveWindow={studio.settings.noticeActiveWindow}
          activePcApp={activePcApp}
          isDesktopApp={isDesktopApp}
          displays={connectedDisplays}
          currentDisplayTarget={activeDisplayTarget}
          onMoveToDisplay={handleMoveToDisplay}
          onToggleFreeRoam={() => setFreeRoamEnabled((v) => !v)}
          onCommandBehavior={triggerManualRoamBehavior}
          onExitRoamMode={() => void toggleDesktopRoamMode(false)}
          onSendMessage={(text) => void runAiTurn(text, 'user')}
          onSpeakMessage={handleSpeakMessage}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onPointerHoverInteractive={(over) => {
            hoveringRoamUiRef.current = over;
            syncClickThrough();
          }}
          lifeScene={lifeScene}
          isLifeBusy={isLifeBusy || isGeneratingAiOutfit}
          onFollowWhim={() => void handleFollowWhim()}
          onClearLifeScene={() => {
            setLifeScene({ dining: null, hobby: null, destination: null });
            handleLeaveBathroom();
          }}
        />
      )}

      <PersonaBuilderModal
        isOpen={isRosterOpen}
        personas={studio.personas}
        activePersonaId={activePersona.id}
        vaultModels={vaultModels}
        onClose={() => setIsRosterOpen(false)}
        onSelectPersona={(id) => {
          voiceEngine.stop();
          setLastAffinityDelta(null);
          setStudio((prev) => ({ ...prev, activePersonaId: id }));
        }}
        onSavePersona={handleSavePersona}
        onDuplicatePersona={handleDuplicatePersona}
        onDeletePersona={handleDeletePersona}
        onImportPersonaJson={(imported) => {
          handleSavePersona(imported);
          setStudio((prev) => ({ ...prev, activePersonaId: imported.id }));
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={studio.settings}
        activePersona={activePersona}
        storageBackend={storageBackend}
        vaultModels={vaultModels}
        personaCount={studio.personas.length}
        connectionMode={connectionMode}
        lastApiError={studio.settings.enableGeminiCloud !== false ? apiErrorToast : null}
        onDismissError={() => setApiErrorToast(null)}
        isValidatingKey={isValidatingKey}
        validationMessage={validationMessage}
        hasAiStudioBridge={hasAiStudioBridge}
        onValidateApiKey={handleValidateAndActivateKey}
        onConnectAiStudioKey={() => void handleConnectAiStudioKey()}
        onOpenSetupWizard={() => {
          setIsSettingsOpen(false);
          setIsSetupOpen(true);
        }}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onUpdateVoice={handleUpdateVoice}
        onChangeGender={handleChangeGender}
        onChangeArchetype={handleChangeArchetype}
        onTestVoice={handleTestVoice}
        onSimulatePcContext={triggerPcContextReaction}
        onTestIdleCheckInNow={() =>
          triggerIdleCheckIn(studio.settings.idleCheckInMinutes || 30, true)
        }
        onResetFactoryPresets={handleResetFactoryPresets}
      />

      <StartupSetupModal
        isOpen={isSetupOpen}
        canDismiss={isStudioSetupComplete()}
        settings={studio.settings}
        personas={studio.personas}
        activePersonaId={studio.activePersonaId}
        vaultModels={vaultModels}
        onClose={() => setIsSetupOpen(false)}
        onComplete={handleCompleteStartupSetup}
      />

      <MemoryJournalModal
        isOpen={isMemoryOpen}
        persona={activePersona}
        isSummarizing={isSummarizingMemory}
        onClose={() => setIsMemoryOpen(false)}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onSummarizeNow={() => void triggerMemorySummary(activePersona.id)}
      />
    </div>
  );
};

export default App;
