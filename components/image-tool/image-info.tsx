import { formatBytes } from "@/lib/image/process-image";
import { IMAGE_FORMATS, type ImageMetadata } from "@/lib/image/types";

type ImageInfoProps = {
  metadata: ImageMetadata;
  sizeLabel: "File size" | "Original size";
};

export function ImageInfo({ metadata, sizeLabel }: ImageInfoProps) {
  return (
    <dl className="file-facts">
      <div>
        <dt>Filename</dt>
        <dd title={metadata.file.name}>{metadata.file.name}</dd>
      </div>
      <div>
        <dt>Format</dt>
        <dd>{IMAGE_FORMATS[metadata.format].label}</dd>
      </div>
      <div>
        <dt>Dimensions</dt>
        <dd>{metadata.width} × {metadata.height} px</dd>
      </div>
      <div>
        <dt>{sizeLabel}</dt>
        <dd>{formatBytes(metadata.file.size)}</dd>
      </div>
    </dl>
  );
}
