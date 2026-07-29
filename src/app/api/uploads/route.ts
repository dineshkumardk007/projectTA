import { DomainError, clientKey, ok, rateLimit, route, validateSameOrigin } from '@/lib/api';
import { requireShopAccess, requireUser } from '@/lib/auth/guards';
import { getStorageProvider, StorageUnavailableError } from '@/lib/providers/storage';

/**
 * Image upload for shop and product photography.
 *
 * People choose food with their eyes, so this is not decoration — a shop with no
 * photographs converts worse than one with them, however good the menu is.
 *
 * Two rules worth stating, because both are easy to get wrong:
 *
 *  1. **Authorisation is per shop, not per role.** The caller must pass
 *     `requireShopAccess` for the shop they claim to be uploading for, so a
 *     verified merchant cannot post images into a competitor's listing.
 *  2. **The content type is taken from the bytes we received, not from the
 *     client.** A browser will happily label anything `image/png`.
 */

/** Matches the storage layer's own ceiling; checked here to fail before reading. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Magic numbers for the formats the storage layer accepts.
 *
 * Sniffing the leading bytes stops an executable or an HTML file being stored
 * under an image content type and later served back to somebody's browser.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  const startsWith = (...sig: number[]) => sig.every((byte, i) => bytes[i] === byte);

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';

  // RIFF....WEBP
  const ascii = (offset: number, text: string) =>
    [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';

  // ISO-BMFF box: ....ftypavif
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif';

  return null;
}

const FOLDERS = new Set(['shops', 'products']);

export const POST = route(async (request: Request) => {
  validateSameOrigin(request);

  const user = await requireUser(['MERCHANT', 'STAFF', 'ADMIN']);
  // Generous enough for a merchant photographing a menu in one sitting, tight
  // enough that a stolen session cannot fill the bucket.
  await rateLimit(clientKey(request, `upload:${user.id}`), 30, 60_000);

  const form = await request.formData();
  const file = form.get('file');
  const shopId = form.get('shopId');
  const folder = String(form.get('folder') ?? 'shops');

  if (!(file instanceof File)) throw new DomainError('Choose an image to upload.', 422, 'no_file');
  if (typeof shopId !== 'string' || shopId.length === 0) {
    throw new DomainError('Which shop is this image for?', 422, 'no_shop');
  }
  if (!FOLDERS.has(folder)) throw new DomainError('Unknown image type.', 422, 'bad_folder');

  // The gate: proves this caller may act on this shop before anything is stored.
  await requireShopAccess(shopId, user);

  if (file.size > MAX_BYTES) {
    throw new DomainError('Images must be smaller than 5 MB. Try a photo taken at a lower resolution.', 422, 'too_large');
  }

  const body = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageType(body);
  if (!sniffed) {
    throw new DomainError('That file is not a JPEG, PNG, WebP or AVIF image.', 422, 'not_an_image');
  }

  try {
    // `folder` is one of two known constants and the storage layer sanitises the
    // key regardless, so nothing user-supplied reaches a filesystem path.
    const stored = await getStorageProvider().put({
      body,
      contentType: sniffed,
      folder: `${folder}/${shopId}`,
      filename: file.name || 'upload.jpg',
    });

    return ok({ url: stored.url, key: stored.key }, 201);
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      // A configuration problem, not the merchant's fault — say so plainly and
      // let the operator find the instruction in the logs.
      console.error('[uploads] storage is not configured for this environment', error);
      throw new DomainError(
        'Image uploads are not switched on yet. Please ask your administrator to configure image storage.',
        503,
        'storage_unavailable',
      );
    }
    if (error instanceof Error && /JPEG|PNG|WebP|AVIF|smaller than/.test(error.message)) {
      // Thrown by `assertUploadableImage`; already phrased for a person.
      throw new DomainError(error.message, 422, 'rejected_image');
    }
    throw error;
  }
});
