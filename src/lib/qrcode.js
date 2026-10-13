import QRCode from 'qrcode'

/**
 * Generates a QR code as a PNG data URL. Defaults chosen for real-world
 * printing: high contrast (pure black/white, no brand-orange tinting that
 * would hurt scan reliability), a proper quiet zone, and 'M' error
 * correction — a reasonable default that still scans fine if a corner gets
 * creased or partially covered on a printed flyer.
 */
export async function generateQRDataUrl(text, { size = 512 } = {}) {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 4, // quiet zone in modules — 4 is the QR spec's recommended minimum, required for reliable scanning when printed
    errorCorrectionLevel: 'M',
    color: { dark: '#141413', light: '#ffffff' },
  })
}

export function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
