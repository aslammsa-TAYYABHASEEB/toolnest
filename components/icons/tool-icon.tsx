import {
  Braces,
  Calculator,
  CalendarDays,
  CaseSensitive,
  FileInput,
  FileOutput,
  FileStack,
  FileText,
  Files,
  Image as ImageIcon,
  ImageDown,
  ImageUpscale,
  LayoutGrid,
  ListOrdered,
  Minimize2,
  Percent,
  QrCode,
  RefreshCw,
  RemoveFormatting,
  RotateCw,
  Ruler,
  Scissors,
  Stamp,
  TextSearch,
  Type as TypeIcon,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import {
  DocumentPrivacyIcon,
  ImageToTextIcon,
  PdfToExcelIcon,
  SearchablePdfIcon,
} from "@/components/icons/custom/toolnest-icons";
import type { CategoryIconKey, IconKey, ToolIconKey } from "@/lib/icon-keys";

const iconRegistry = {
  "document-privacy": DocumentPrivacyIcon,
  "searchable-pdf": SearchablePdfIcon,
  "pdf-to-excel": PdfToExcelIcon,
  "image-to-text": ImageToTextIcon,
  "organize-pdf": LayoutGrid,
  "pdf-merge": FileStack,
  "pdf-split": Scissors,
  "jpg-to-pdf": FileInput,
  "pdf-to-jpg": FileOutput,
  "pdf-rotate": RotateCw,
  "pdf-watermark": Stamp,
  "pdf-page-numbers": ListOrdered,
  "pdf-compress": Minimize2,
  "pdf-to-word": FileText,
  "image-resize": ImageUpscale,
  "image-compress": ImageDown,
  "image-convert": RefreshCw,
  "word-counter": TextSearch,
  "qr-code": QrCode,
  "json-formatter": Braces,
  "case-converter": CaseSensitive,
  "remove-extra-spaces": RemoveFormatting,
  "percentage-calculator": Percent,
  "age-calculator": CalendarDays,
  "unit-converter": Ruler,
  "category-pdf": Files,
  "category-image": ImageIcon,
  "category-text": TypeIcon,
  "category-calculators": Calculator,
} satisfies Record<IconKey, ComponentType<LucideProps>>;

type IconProps = {
  className?: string;
  size?: number;
};

function Icon({ icon, className, size = 24 }: IconProps & { icon: IconKey }) {
  const IconComponent = iconRegistry[icon];
  return (
    <IconComponent
      aria-hidden="true"
      className={className}
      focusable="false"
      size={size}
      strokeWidth={2}
    />
  );
}

export function ToolIcon({ icon, ...props }: IconProps & { icon: ToolIconKey }) {
  return <Icon icon={icon} {...props} />;
}

export function CategoryIcon({ icon, ...props }: IconProps & { icon: CategoryIconKey }) {
  return <Icon icon={icon} {...props} />;
}
