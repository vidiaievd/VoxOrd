import { ASRService } from './ASRService';
import { ReactNativeASR } from './ReactNativeASR';

export type ASRTier = 'free' | 'premium';

// Factory — in the future premium tier returned AzureSpeechASR
export function createASRService(tier: ASRTier = 'free'): ASRService {
  switch (tier) {
    case 'premium':
      // TODO: return new AzureSpeechASR();
      return new ReactNativeASR();
    case 'free':
    default:
      return new ReactNativeASR();
  }
}

export type { ASRService, ASRResult, ASRError, ASRStartOptions } from './ASRService';
export { ReactNativeASR } from './ReactNativeASR';
