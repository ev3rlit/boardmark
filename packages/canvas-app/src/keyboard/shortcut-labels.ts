export function readCurrentPlatform() {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }

  const userAgentPlatform = (
    navigator as Navigator & {
      userAgentData?: {
        platform?: string
      }
    }
  ).userAgentData?.platform

  if (typeof userAgentPlatform === 'string' && userAgentPlatform.length > 0) {
    return userAgentPlatform
  }

  return navigator.platform ?? 'unknown'
}

export function readShortcutModifierLabel(platform = readCurrentPlatform()) {
  return isApplePlatform(platform) ? 'Cmd' : 'Ctrl'
}

export function substituteShortcutModifier(
  template: string,
  platform = readCurrentPlatform()
) {
  return template.replaceAll('$mod', readShortcutModifierLabel(platform))
}

function isApplePlatform(platform: string) {
  const normalized = platform.toLowerCase()

  return normalized.includes('mac') ||
    normalized.includes('iphone') ||
    normalized.includes('ipad') ||
    normalized.includes('ipod')
}
