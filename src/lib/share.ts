/** Public address of the site for shared links and images (a custom domain if one is set). */
export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin).replace(/\/$/, "");
}

/**
 * Share a link through the phone's share sheet (WhatsApp, Messages, …), or copy it
 * where there is no share sheet (most desktops). Resolves to what happened so the
 * button can say "Shared" / "Copied".
 */
export async function shareLink(data: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      // Closing the share sheet isn't an error worth a fallback.
      if (e instanceof DOMException && e.name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(`${data.text} ${data.url}`);
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Share an image through the share sheet (phones, Safari, Chrome on Mac/Windows), or save it
 * where files can't be shared (e.g. Firefox). Must run straight from a tap: share sheets
 * refuse calls that come after an await, so render the image before the button is pressed.
 */
export async function shareImage(
  blob: Blob,
  data: { filename: string; title: string; text: string },
): Promise<"shared" | "saved" | "failed"> {
  const file = new File([blob], data.filename, { type: blob.type || "image/png" });
  const payload = { files: [file], title: data.title, text: data.text };
  if (typeof navigator.share === "function" && navigator.canShare?.(payload)) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "failed";
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "saved";
  } catch {
    return "failed";
  }
}
