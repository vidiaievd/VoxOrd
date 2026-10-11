import { ASRService } from './ASRService';
import { ReactNativeASR } from './ReactNativeASR';

export function createASRService(): ASRService {
  return new ReactNativeASR();
}

export type { ASRService, ASRResult, ASRError, ASRStartOptions } from './ASRService';
export { ReactNativeASR } from './ReactNativeASR';
