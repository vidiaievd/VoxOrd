import { ApiError, apiClient } from './client';

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
  /** `PENDING_UPLOAD`, `READY`, `FAILED`, `DELETED`, … — read by `read_aloud` before it restores a take. */
  status?: string;
  /** What the asset belongs to — for a recording, the attempt it answers (plan 70, Q2-A). */
  entityId?: string | null;
  /** Measured by media-service on finalize (recordings only). */
  durationMs?: number | null;
  /** 0..1 loudness, computed on ingest — the waveform of a take read back (plan 70 §3.4). */
  peaks?: number[] | null;
}

export function getMediaAsset(id: string): Promise<MediaAsset> {
  return apiClient.get<MediaAsset>(MEDIA_ASSET_PATH(id));
}

export function deleteMediaAsset(id: string): Promise<void> {
  return apiClient.delete<void>(MEDIA_ASSET_PATH(id));
}

/* ─────────────────────────────────────────────────────────────────────────
 * A student's recording, into media-service — `read_aloud`, plan 70 §3.4.
 *
 * The web's `uploadRecording`, on a phone: ask for a slot, PUT the file to MinIO by the signed
 * URL, finalize. The asset is of kind `submission_recording`, owned by the student and
 * belonging to the attempt (Q2-A) — a teacher hears it only through the queue, never by id.
 * Finalize is where the service measures the stored object and refuses one over the ceilings
 * (180 s, 8 MB), and its code is kept: «too long» and «the network dropped» want different
 * words on the screen.
 *
 * The signed URL points at MinIO directly, so on a device in development `adb reverse
 * tcp:9000` is needed besides the gateway's `tcp:80` (plan 70, «Команды и ловушки»).
 *
 * Contract read 2026-10-07 from media-service's uploads.controller.ts (`POST
 * media/uploads/request`, `POST media/uploads/:assetId/finalize`) and request-upload.dto.ts.
 * ────────────────────────────────────────────────────────────────────── */

const UPLOAD_REQUEST_PATH = '/api/v1/media/uploads/request';
const FINALIZE_PATH = (id: string) => `/api/v1/media/uploads/${id}/finalize`;

/** The kind media-service keeps a student's spoken answer under (plan 70, Q2-A). */
export const RECORDING_ENTITY_TYPE = 'submission_recording';

/**
 * Why a recording did not make it into storage. `code` is media-service's own when it refused
 * the file (`RECORDING_TOO_LONG`, `RECORDING_TOO_LARGE`, `RECORDING_UNREADABLE`,
 * `MIME_TYPE_NOT_ALLOWED`) and null when the request simply failed.
 */
export class RecordingUploadError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(code: string | null, status: number | null) {
    super(code ?? `Recording upload failed${status === null ? '' : ` (${status})`}`);
    this.name = 'RecordingUploadError';
    this.code = code;
    this.status = status;
  }
}

export interface UploadRecordingOptions {
  /** Absolute path of the take on the device. */
  path: string;
  /** As the recorder produced it; the codec parameter is dropped for storage. */
  mimeType: string;
  /** Bytes on disk — declared on the slot request, where the 8 MB ceiling is first applied. */
  size: number;
  /** The attempt the recording answers — the asset's `entityId` (RA-U2). */
  attemptId: string;
  /** A file name for the asset row, e.g. `p1-take-2.m4a`. */
  filename: string;
}

interface RequestUploadResponse {
  assetId: string;
  uploadUrl: string;
}

function asUploadError(e: unknown): RecordingUploadError {
  return e instanceof ApiError
    ? new RecordingUploadError(e.code, e.status)
    : new RecordingUploadError(null, null);
}

export async function uploadRecording({
  path,
  mimeType,
  size,
  attemptId,
  filename,
}: UploadRecordingOptions): Promise<{ assetId: string }> {
  const type = (mimeType.split(';')[0] ?? '').trim().toLowerCase() || 'audio/mp4';

  let slot: RequestUploadResponse;
  try {
    slot = await apiClient.post<RequestUploadResponse>(UPLOAD_REQUEST_PATH, {
      mimeType: type,
      sizeBytes: size,
      originalFilename: filename,
      entityType: RECORDING_ENTITY_TYPE,
      entityId: attemptId,
    });
  } catch (e) {
    throw asUploadError(e);
  }

  try {
    await putFile(slot.uploadUrl, path, type);
  } catch {
    throw new RecordingUploadError(null, null);
  }

  try {
    await apiClient.post<unknown>(FINALIZE_PATH(slot.assetId));
  } catch (e) {
    throw asUploadError(e);
  }

  return { assetId: slot.assetId };
}

/**
 * The file's bytes to a signed URL. React Native reads a local file into a `Blob` through
 * `fetch('file://…')` (the blob module handles `file:` URIs on Android), and `XMLHttpRequest`
 * sends a `Blob` as the request body — the same PUT the web makes.
 */
async function putFile(url: string, path: string, type: string): Promise<void> {
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  const blob = await (await fetch(uri)).blob();
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Presigned upload failed with status ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', type);
    xhr.send(blob);
  });
}
