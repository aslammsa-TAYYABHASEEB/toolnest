export type QrContrastAssessment = {
  ratio: number;
  blocking: boolean;
  warning: string | null;
};

export function isHexColor(value: string) {
  return /^#[\da-f]{6}$/i.test(value);
}
function hexToRgb(value: string) {
  if (!isHexColor(value)) return null;
  return {
    red: Number.parseInt(value.slice(1, 3), 16),
    green: Number.parseInt(value.slice(3, 5), 16),
    blue: Number.parseInt(value.slice(5, 7), 16),
  };
}

function relativeLuminance(value: string) {
  const color = hexToRgb(value);
  if (!color) return null;
  const channels = [color.red, color.green, color.blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function assessQrContrast(
  foreground: string,
  background: string,
): QrContrastAssessment {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) {
    return {
      ratio: 1,
      blocking: true,
      warning: "Enter valid six-digit hex colors.",
    };
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  const ratio = (lighter + 0.05) / (darker + 0.05);

  if (ratio < 1.2) {
    return {
      ratio,
      blocking: true,
      warning: "Foreground and background colors are too similar to create a usable QR code.",
    };
  }
  if (foregroundLuminance >= backgroundLuminance) {
    return {
      ratio,
      blocking: false,
      warning: "QR codes scan most reliably with a dark foreground on a lighter background.",
    };
  }
  if (ratio < 4.5) {
    return {
      ratio,
      blocking: false,
      warning: "Foreground and background colors may be too similar for reliable scanning.",
    };
  }
  return { ratio, blocking: false, warning: null };
}
