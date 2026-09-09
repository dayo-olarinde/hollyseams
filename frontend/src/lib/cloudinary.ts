/**
 * Delivery helper for Cloudinary URLs.
 *
 * We store the ORIGINAL asset URL (full resolution — the detail page and
 * lightbox want it), but list cards only render a ~140px slot. Cloudinary
 * derives resized copies on the fly from the same public_id, so the card
 * requests a ~280px (2x retina) webp/avif thumbnail instead of downloading
 * a 12MP original per row — ~100x fewer bytes and far less decode work on
 * the phone.
 *
 * Original:  .../image/upload/v123/folder/file.jpg      (2–5 MB)
 * Thumbnail: .../image/upload/w_280,f_auto,q_auto/v123/... (~20 KB)
 *
 * `f_auto` negotiates webp/avif, `q_auto` picks the optimal quality.
 * Non-Cloudinary URLs (e.g. seed data on example.com) pass through
 * unchanged — the pattern simply won't match.
 */
export function cloudinaryThumb(url: string): string {
  return url.replace(
    "/image/upload/",
    "/image/upload/w_280,f_auto,q_auto/",
  );
}