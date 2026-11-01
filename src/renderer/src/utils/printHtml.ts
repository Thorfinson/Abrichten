/**
 * Print an HTML document without opening a window (the desktop app denies every
 * window.open). The document goes into a hidden srcdoc iframe sandboxed without
 * allow-scripts, so markup that slipped through escaping cannot run; it must not
 * need scripts or external resources. allow-same-origin lets us call print() on
 * it, allow-modals lets the print dialog open.
 */
export function printHtml(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-modals allow-same-origin')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.tabIndex = -1
  // zero-sized rather than display:none/visibility:hidden, which can print blank
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  iframe.addEventListener('load', () => {
    try {
      iframe.contentWindow?.print()   // blocks until the print dialog is closed
    } finally {
      iframe.remove()
    }
  }, { once: true })
  iframe.srcdoc = html
  document.body.appendChild(iframe)
}
