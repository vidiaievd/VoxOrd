import { apiClient } from './client';

const MEDIA_ASSET_PATH = (id: string) => `/api/v1/media/assets/${id}`;

/**
 * `GET /media/assets/:id` (media-service). Confirmed against
 * services/media-service/src/modules/assets/presentation/controllers/
 * assets.controller.ts (`AssetResponseDto`) and the gateway's
 * `location /api/v1/media` prefix block in nginx.dev.conf.
 *
 * `url` is a direct URL for public assets, or a pre-signed MinIO URL with a
 * **1 hour TTL** for private ones (confirmed in `s3-storage.service.ts`) — it
 * carries its own signature, so no Authorization header is needed to fetch
 * the media bytes themselves, only to call this endpoint. This means the URL
 * must NOT be cached long-term: fetch it just-in-time before playback rather
 * than persisting it alongside lesson content.
 */
export interface MediaAsset {
  id: string;
  mimeType: string;
  url: string;
}

export function getMediaAsset(id: string): Promise<MediaAsset> {
  return apiClient.get<MediaAsset>(MEDIA_ASSET_PATH(id));
}
