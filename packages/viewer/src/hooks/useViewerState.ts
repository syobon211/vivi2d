import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RecordingFormat, RecordingState } from "../recorder";
import { loadSettings, type ViewerSettings } from "../settings";
import type { PlatformFaceTrackingMap } from "../tracking/platform-face-channels";
import type { TrackingParameterMap } from "../tracking/face-mapper";
import type { HandTrackingParameterMap } from "../tracking/hand-mapper";
import type { LipSyncMode, Vowel } from "../tracking/lipsync-analyser";
import type { PoseTrackingParameterMap } from "../tracking/pose-mapper";

export interface HudStats {
  fps: number;
  meshes: number;
  vertices: number;
}

export interface UseViewerStateResult {
  loaded: boolean;
  setLoaded: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  modelName: string;
  setModelName: Dispatch<SetStateAction<string>>;
  dragging: boolean;
  setDragging: Dispatch<SetStateAction<boolean>>;

  tracking: boolean;
  setTracking: Dispatch<SetStateAction<boolean>>;
  handTracking: boolean;
  setHandTracking: Dispatch<SetStateAction<boolean>>;
  poseTracking: boolean;
  setPoseTracking: Dispatch<SetStateAction<boolean>>;
  lipSync: boolean;
  setLipSync: Dispatch<SetStateAction<boolean>>;

  bgMode: ViewerSettings["bgMode"];
  setBgMode: Dispatch<SetStateAction<ViewerSettings["bgMode"]>>;
  alwaysOnTop: boolean;
  setAlwaysOnTop: Dispatch<SetStateAction<boolean>>;
  smoothing: number;
  setSmoothing: Dispatch<SetStateAction<number>>;
  selectedCamera: string;
  setSelectedCamera: Dispatch<SetStateAction<string>>;
  lipSyncMode: LipSyncMode;
  setLipSyncMode: Dispatch<SetStateAction<LipSyncMode>>;
  recordingFormat: RecordingFormat;
  setRecordingFormat: Dispatch<SetStateAction<RecordingFormat>>;
  colliderEffects: boolean;
  setColliderEffects: Dispatch<SetStateAction<boolean>>;

  trackingMapRef: RefObject<TrackingParameterMap>;
  platformFaceMapRef: RefObject<PlatformFaceTrackingMap>;
  handTrackingMapRef: RefObject<HandTrackingParameterMap>;
  poseTrackingMapRef: RefObject<PoseTrackingParameterMap>;
  mappedCount: number;
  setMappedCount: Dispatch<SetStateAction<number>>;
  platformFaceMappedCount: number;
  setPlatformFaceMappedCount: Dispatch<SetStateAction<number>>;
  handMappedCount: number;
  setHandMappedCount: Dispatch<SetStateAction<number>>;
  poseMappedCount: number;
  setPoseMappedCount: Dispatch<SetStateAction<number>>;

  // HUD / UI
  showHud: boolean;
  setShowHud: Dispatch<SetStateAction<boolean>>;
  hudStats: HudStats;
  setHudStats: Dispatch<SetStateAction<HudStats>>;
  panelOpen: boolean;
  setPanelOpen: Dispatch<SetStateAction<boolean>>;

  currentVowel: Vowel;
  setCurrentVowel: Dispatch<SetStateAction<Vowel>>;
  recordingState: RecordingState;
  setRecordingState: Dispatch<SetStateAction<RecordingState>>;
  recordingElapsed: number;
  setRecordingElapsed: Dispatch<SetStateAction<number>>;

  gamepadActive: boolean;
  setGamepadActive: Dispatch<SetStateAction<boolean>>;
  midiActive: boolean;
  setMidiActive: Dispatch<SetStateAction<boolean>>;

  smoothingRef: RefObject<number>;
  showHudRef: RefObject<boolean>;

  initialSettings: ViewerSettings;
}

export function useViewerState(): UseViewerStateResult {
  const initialSettings = useRef(loadSettings()).current;

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");
  const [dragging, setDragging] = useState(false);

  const [tracking, setTracking] = useState(false);
  const [handTracking, setHandTracking] = useState(false);
  const [poseTracking, setPoseTracking] = useState(false);
  const [lipSync, setLipSync] = useState(false);

  const [bgMode, setBgMode] = useState<ViewerSettings["bgMode"]>(initialSettings.bgMode);
  const [alwaysOnTop, setAlwaysOnTop] = useState(initialSettings.alwaysOnTop);
  const [smoothing, setSmoothing] = useState(initialSettings.smoothing);
  const [selectedCamera, setSelectedCamera] = useState(initialSettings.cameraDeviceId);
  const [lipSyncMode, setLipSyncMode] = useState<LipSyncMode>(
    initialSettings.lipSyncMode,
  );
  const [recordingFormat, setRecordingFormat] = useState<RecordingFormat>(
    initialSettings.recordingFormat,
  );
  const [colliderEffects, setColliderEffects] = useState(initialSettings.colliderEffects);

  const trackingMapRef = useRef<TrackingParameterMap>({});
  const platformFaceMapRef = useRef<PlatformFaceTrackingMap>({});
  const handTrackingMapRef = useRef<HandTrackingParameterMap>({});
  const poseTrackingMapRef = useRef<PoseTrackingParameterMap>({});
  const [mappedCount, setMappedCount] = useState(0);
  const [platformFaceMappedCount, setPlatformFaceMappedCount] = useState(0);
  const [handMappedCount, setHandMappedCount] = useState(0);
  const [poseMappedCount, setPoseMappedCount] = useState(0);

  const [showHud, setShowHud] = useState(false);
  const [hudStats, setHudStats] = useState<HudStats>({
    fps: 0,
    meshes: 0,
    vertices: 0,
  });
  const [panelOpen, setPanelOpen] = useState(false);

  const [currentVowel, setCurrentVowel] = useState<Vowel>("silent");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const [gamepadActive, setGamepadActive] = useState(false);
  const [midiActive, setMidiActive] = useState(false);

  const smoothingRef = useRef<number>(initialSettings.smoothing);
  const showHudRef = useRef(false);

  useEffect(() => {
    smoothingRef.current = smoothing;
  }, [smoothing]);

  useEffect(() => {
    showHudRef.current = showHud;
  }, [showHud]);

  return {
    loaded,
    setLoaded,
    error,
    setError,
    modelName,
    setModelName,
    dragging,
    setDragging,
    tracking,
    setTracking,
    handTracking,
    setHandTracking,
    poseTracking,
    setPoseTracking,
    lipSync,
    setLipSync,
    bgMode,
    setBgMode,
    alwaysOnTop,
    setAlwaysOnTop,
    smoothing,
    setSmoothing,
    selectedCamera,
    setSelectedCamera,
    lipSyncMode,
    setLipSyncMode,
    recordingFormat,
    setRecordingFormat,
    colliderEffects,
    setColliderEffects,
    trackingMapRef,
    platformFaceMapRef,
    handTrackingMapRef,
    poseTrackingMapRef,
    mappedCount,
    setMappedCount,
    platformFaceMappedCount,
    setPlatformFaceMappedCount,
    handMappedCount,
    setHandMappedCount,
    poseMappedCount,
    setPoseMappedCount,
    showHud,
    setShowHud,
    hudStats,
    setHudStats,
    panelOpen,
    setPanelOpen,
    currentVowel,
    setCurrentVowel,
    recordingState,
    setRecordingState,
    recordingElapsed,
    setRecordingElapsed,
    gamepadActive,
    setGamepadActive,
    midiActive,
    setMidiActive,
    smoothingRef,
    showHudRef,
    initialSettings,
  };
}
