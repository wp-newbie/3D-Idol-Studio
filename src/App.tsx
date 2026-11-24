import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import type {
  AutonomousNeedTrigger,
  AutonomousToolLocation,
  BrainThought,
  CareActivityId,
  ChatMessage,
  CustomBackdropKind,
  IdleCheckInMinutes,
  InteractionZone,
  MemoryEntry,
  MeshDescriptor,
  MicroTellCommand,
  MicroTellKind,
  MoodType,
  OutfitSlot,
  PersistedStudioState,
  Persona,
  ProceduralEmoteId,
  RoamBehavior,
  RoamCommand,
  SleepingPosition,
  StageEnvironmentId,
  StudioSettings,
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
  deleteVaultModel,
  deleteVaultVrma,
  listVaultModels,
  listVaultVrmas,
  saveEnvironmentToVault,
  saveModelToVault,
  saveTextureToVault,
  saveVrmaToVault,
} from './storage/modelVault';
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
  pickMoodInnerThought,
  tickBrainNeeds,
} from './services/aiBrainService';
import { STAGE_ENVIRONMENTS } from './stage/stageEnvironments';
import { TopToolbar } from './components/TopToolbar';
import { StageViewport } from './components/StageViewport';
import { ChatSidebar } from './components/ChatSidebar';
import { WardrobeDrawer } from './components/WardrobeDrawer';
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
  const [vaultVrmas, setVaultVrmas] = useState<VaultVrmaMeta[]>([]);
  const [detectedMeshes, setDetectedMeshes] = useState<MeshDescriptor[]>([]);

  const [isWardrobeOpen, setIsWardrobeOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSummarizingMemory, setIsSummarizingMemory] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAffinityDelta, setLastAffinityDelta] = useState<number | null>(null);

  // Desktop Roam Mode (🪟), Auto-Roam & Autonomous Brain State
  const [desktopRoamMode, setDesktopRoamMode] = useState(false);
  const [freeRoamEnabled, setFreeRoamEnabled] = useState(true);
  const [autoRoamEnabled, setAutoRoamEnabled] = useState(true);
  const [roamCommand, setRoamCommand] = useState<RoamCommand | null>(null);
  const [emoteCommand, setEmoteCommand] = useState<{
    id: number;
    emoteId: ProceduralEmoteId;
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
  const microTellSeqRef = useRef(1);
  const sessionStartAtRef = useRef<number>(Date.now());
  const roamBehaviorRef = useRef<RoamBehavior>('idle');
  roamBehaviorRef.current = roamBehavior;
  const lastCursorActiveAtRef = useRef<number>(Date.now());
  const lastPcAppReactedRef = useRef<string | null>(null);
  const lastPcReactionAtRef = useRef<number>(0);
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
      const [{ state, backend }, models, vrmas] = await Promise.all([
        loadStudioState(),
        listVaultModels(),
        listVaultVrmas(),
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
      setHasAiStudioBridge(resolvedKey.hasAiStudioBridge);

      const effectiveKey = resolveEffectiveApiKey(nextState.settings);
      if (effectiveKey) {
        setConnectionMode('live');
        setProviderStatus(
          usingBuiltIn
            ? `Live Gemini (${nextState.settings.textModel}) · built-in default key`
            : `Live Gemini (${nextState.settings.textModel}) · key via ${resolvedKey.source}`
        );
      } else {
        setConnectionMode('demo');
        setProviderStatus('Demo Mode (multi-response offline pool — add key for Live Gemini)');
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
  }, []);

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
      if (!keyToTest) {
        setConnectionMode('demo');
        setValidationMessage(null);
        return false;
      }

      saveKeyToLocalStorage(keyToTest);
      setIsValidatingKey(true);
      setValidationMessage(null);

      try {
        const result = await validateGeminiApiKey({
          apiKey: keyToTest,
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
          setProviderStatus(`Live Gemini (${result.model})`);
          return true;
        }

        setConnectionMode('error');
        const errMsg = result.error || 'Gemini API key validation failed.';
        setApiErrorToast(errMsg);
        setValidationMessage(errMsg);
        setProviderStatus(`API Error — ${errMsg}`);
        return false;
      } finally {
        setIsValidatingKey(false);
      }
    },
    []
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
            sleepingPosition: validPos,
          },
        }));
        const summary = `Shifted sleeping position to ${validPos} (${reason})`;
        setAutonomousActionToast(`💤 Sleep Position: ${validPos.replace(/_/g, ' ')}`);
        window.setTimeout(() => setAutonomousActionToast(null), 3500);
        return summary;
      },
    };
  }, [updateActivePersona]);

  // Core AI Turn Runner (with Gemini Autonomous Tools + Real API Error Surfacing)
  const runAiTurn = useCallback(
    async (promptText: string, role: 'user' | 'system_event') => {
      const currentState = studioRef.current;
      const persona =
        currentState.personas.find((p) => p.id === currentState.activePersonaId) ||
        currentState.personas[0];

      const queuedHiddenNotes =
        role === 'user' && persona.pendingSystemEvents?.length
          ? [...persona.pendingSystemEvents]
          : [];

      const outgoingMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role,
        rawText: promptText,
        segments: [{ kind: 'dialogue', text: promptText }],
        spokenText: '',
        timestamp: Date.now(),
      };

      const personaId = persona.id;
      const userEmpathyCue = role === 'user' && detectUserEmpathyCue(promptText);
      const isNapPrompt = promptText.includes('take a peaceful nap');

      if (role === 'user') {
        lastUserActivityAtRef.current = Date.now();
        if (userEmpathyCue) {
          setMicroTellCommand({ id: microTellSeqRef.current++, kind: 'sigh' });
        }
      }

      setStudio((prev) => ({
        ...prev,
        personas: prev.personas.map((p) =>
          p.id === personaId
            ? {
                ...p,
                brain:
                  role === 'user' && p.brain.isSleeping
                    ? { ...p.brain, isSleeping: false }
                    : p.brain,
                messages: [...p.messages, outgoingMsg],
                pendingSystemEvents: role === 'user' ? [] : p.pendingSystemEvents,
                updatedAt: Date.now(),
              }
            : p
        ),
      }));

      setIsGenerating(true);

      try {
        const reply = await generatePersonaReply({
          persona,
          settings: currentState.settings,
          userPrompt: promptText,
          hiddenSystemNotes: queuedHiddenNotes,
          toolExecutor: buildToolExecutor(),
        });

        lastFailedTurnRef.current = null;
        hasAutoPromptedAuthRef.current = false;
        setApiErrorToast(null);
        setConnectionMode(reply.isFallback ? 'demo' : 'live');
        if (reply.resolvedModel && reply.resolvedModel !== currentState.settings.textModel) {
          handleUpdateSettings({ textModel: reply.resolvedModel });
        }

        const parsed = parseDialogueResponse(reply.rawText, persona.mood);
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

            return {
              ...p,
              mood: parsed.mood,
              emotionIntensity: parsed.emotionIntensity,
              affinity: nextAffinity,
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
      } finally {
        setIsGenerating(false);
      }
    },
    [buildToolExecutor, triggerMemorySummary]
  );

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

      void runAiTurn(effect.prompt, 'system_event');
    },
    [fireMicroTell, runAiTurn, updateActivePersona]
  );

  const handleWakeFromSleep = useCallback(() => {
    handleCareActivity('wake_up');
  }, [handleCareActivity]);

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

      if (
        shouldTriggerAutonomousImpulse &&
        !isGeneratingRef.current &&
        !isSpeakingRef.current &&
        !current.settings.doNotDisturb
      ) {
        triggerBrainImpulse(shouldTriggerAutonomousImpulse, false);
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [hydrated, fireMicroTell, triggerBrainImpulse]);

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
      const systemEvent = `[SYSTEM EVENT: ${userName} just ${actionMap[zone]}. React immediately in your Japanese Tsundere persona!]`;
      void runAiTurn(systemEvent, 'system_event');
    },
    [runAiTurn, updateActivePersona]
  );

  const triggerOutfitReaction = useCallback(
    (outfitName: string, changeSummary: string) => {
      const userName = studioRef.current.settings.userName.trim() || 'Producer';
      const systemEvent = `[SYSTEM EVENT: ${userName} just changed your outfit to "${outfitName}" (${changeSummary}). React immediately in Japanese Tsundere character!]`;

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

  const handleImportModelFile = async (file: File, customSlotName?: string) => {
    const buffer = await file.arrayBuffer();
    const meta = await saveModelToVault({ fileName: file.name, buffer });
    setVaultModels(await listVaultModels());

    const slotName =
      customSlotName ||
      `Slot ${activePersona.outfitSlots.length + 1}: ${file.name
        .replace(/\.(vrm|glb)$/i, '')
        .replace(/[_-]+/g, ' ')}`;
    const newSlot: OutfitSlot = {
      id: `slot-${Date.now()}`,
      name: slotName,
      modelVaultId: meta.id,
      meshVisibility: {},
      materialMods: {},
      yawOffset: 0,
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
      `imported and equipped new 3D ${meta.format.toUpperCase()} model "${file.name}"`
    );
  };

  const handleLinkVaultModelAsSlot = (model: VaultModelMeta, customSlotName?: string) => {
    const slotName =
      customSlotName ||
      `Slot ${activePersona.outfitSlots.length + 1}: ${model.fileName
        .replace(/\.(vrm|glb)$/i, '')
        .replace(/[_-]+/g, ' ')}`;
    const newSlot: OutfitSlot = {
      id: `slot-${Date.now()}`,
      name: slotName,
      modelVaultId: model.id,
      meshVisibility: {},
      materialMods: {},
      yawOffset: 0,
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
    const targetY = behavior === 'sit_taskbar' ? -0.18 : 0;
    setRoamCommand({ id, targetX, targetY, behavior });
  };

  return (
    <div
      className={`relative flex h-screen w-screen flex-col overflow-hidden text-zinc-100 ${
        desktopRoamMode ? 'bg-transparent' : 'bg-[#07070c]'
      }`}
    >
      {/* Real API Error Toast Banner */}
      {apiErrorToast && (
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
          onToggleWardrobe={() => setIsWardrobeOpen((v) => !v)}
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
          className={`relative min-w-0 transition-all duration-300 ${
            desktopRoamMode
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
            onChangePosture={(next) => handleUpdateSettings({ defaultPosture: next })}
            roamBehavior={roamBehavior}
            roamCommand={roamCommand}
            emoteCommand={emoteCommand}
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
            onImportVrmaFile={handleImportVrmaFile}
            onDeleteVrma={(id) => void handleDeleteVrma(id)}
            onSelectEnvironment={handleSelectEnvironment}
            onUploadCustomEnvironment={(file) => void handleUploadCustomEnvironment(file)}
            onClearCustomEnvironment={handleClearCustomEnvironment}
            onModelVaultSynced={() => {
              void listVaultModels().then((models) => setVaultModels(models));
            }}
            onOpenWardrobe={() => setIsWardrobeOpen(true)}
            onAvatarInteraction={handleAvatarInteraction}
          />

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
        lastApiError={apiErrorToast}
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
