import type { LucideProps } from "lucide-react";

type CustomIconProps = LucideProps;

function iconProps({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  absoluteStrokeWidth,
  ...props
}: CustomIconProps) {
  const resolvedStrokeWidth = absoluteStrokeWidth && typeof size === "number"
    ? Number(strokeWidth) * 24 / size
    : strokeWidth;

  return {
    ...props,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: resolvedStrokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

export function DocumentPrivacyIcon(props: CustomIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
      <path d="M13 3v5h5" />
      <path d="m13 3 5 5v2" />
      <circle cx="15.5" cy="15.5" r="3.5" />
      <path d="m18 18 3 3" />
      <path d="M7.5 9.5h3M7.5 13h2" />
    </svg>
  );
}

export function PdfToExcelIcon(props: CustomIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
      <path d="M13 3v5h5M13 3l5 5" />
      <rect x="9" y="10" width="12" height="10" rx="1" />
      <path d="M9 14h12M13 10v10M17 10v10" />
    </svg>
  );
}

export function SearchablePdfIcon(props: CustomIconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8 11V9h2M16 9h-2M8 17v2h2M16 19h-2" />
      <path d="M10 12h4M10 15h4" />
    </svg>
  );
}

export function ImageToTextIcon(props: CustomIconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="2" y="5" width="8" height="14" rx="1.5" />
      <circle cx="5" cy="9" r=".75" />
      <path d="m3 17 2.3-2.5 1.8 1.8 1.9-2" />
      <path d="M11.5 12h3m-1.5-1.5 1.5 1.5-1.5 1.5" />
      <path d="M17 8h5M17 12h5M17 16h4" />
    </svg>
  );
}
