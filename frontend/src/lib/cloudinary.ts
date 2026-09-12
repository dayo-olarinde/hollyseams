export function cloudinaryThumb(url: string): string {
  return url.replace(
    "/image/upload/",
    "/image/upload/w_280,f_auto,q_auto/",
  );
}