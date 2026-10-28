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
