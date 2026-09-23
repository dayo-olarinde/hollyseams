type HapticKind = "tap" | "error";

// navigator.vibrate has no intensity knob — duration is the only lever, so these are
// tuned by feel. Short enough to stay a tick, long enough to clear the motor's spin-up;
// dropping the tap below ~12ms starts reading as no feedback at all.
const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 12,
  error: [18, 55, 18, 55, 18],
};

function isIOS(): boolean {
  // iPadOS 13+ reports itself as a Mac, so touch points are the tell.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * iOS has no usable Vibration API, but since Safari 17.4 toggling a native
 * `<input type="checkbox" switch>` fires the system haptic, so we drive one offscreen.
 *
 * iOS 17.4–26.4 only: Apple patched the programmatic `.click()` in 26.5, so newer iOS needs a
 * real transparent switch rendered under the user's own finger inside each tap target — add
 * that if an iPhone ever has to be supported.
 */
function iosSwitchHaptic(): void {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";

  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.setAttribute("switch", "");
  label.appendChild(toggle);

  document.body.appendChild(label);
  label.click();
  label.remove();
}

/**
 * Best-effort tick for a tap. Silent no-op where unsupported, never throws —
 * note that Firefox (129+, all platforms) no longer ships navigator.vibrate at all,
 * so an Android user in Firefox gets no tick no matter what we pass it.
 */
export function haptic(kind: HapticKind = "tap"): void {
  if (typeof window === "undefined") return;

  try {
    if (isIOS()) {
      iosSwitchHaptic();
    } else if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    // Losing a tick must never break the tap.
  }
}
