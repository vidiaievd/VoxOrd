export interface PhonemeResult {
  phoneme: string;
  accuracyScore: number; // 0–100
  startMs: number;
  endMs: number;
}

export interface ASRResult {
  transcript: string;
  confidence: number; // 0.0–1.0
  phonemes?: PhonemeResult[]; // только у продвинутых сервисов
}

export interface ASRError {
  code: string;
  message: string;
}

export interface ASRService {
  isAvailable(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  start(options: ASRStartOptions): void;
  stop(): void;
  destroy(): void;

  onStart?: () => void;
  onResult?: (result: ASRResult) => void;
  onPartial?: (transcript: string) => void;
  onError?: (error: ASRError) => void;
  onEnd?: () => void;
}

export interface ASRStartOptions {
  lang: string;
  contextualStrings?: string[];
  interimResults?: boolean;
}
