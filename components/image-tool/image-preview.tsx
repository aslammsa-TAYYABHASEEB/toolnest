type ImagePreviewProps = {
  url: string;
  filename: string;
};

export function ImagePreview({ url, filename }: ImagePreviewProps) {
  return (
    <div className="image-preview-frame">
      <img src={url} alt={`Preview of ${filename}`} />
    </div>
  );
}
