import { cn } from "cn";
import { frameStyle, type PhotoFrame } from "@/lib/framing";

/**
 * A photo filling its parent (which must be `relative` or positioned, with a size of its own),
 * cropped around its focus point and zoomed as framed (D-103). Without a frame (size unknown),
 * cropped in the middle. The crop is computed by CSS against this box, so one frame suits every
 * shape: cards, banners, square tiles, round pastilles.
 */
export function FramedImage({
  src,
  frame,
  alt = "",
  className,
  imgClassName,
}: {
  src: string;
  frame: PhotoFrame | null | undefined;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <span className={cn("[container-type:size] absolute inset-0 block overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the uploads handler */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={cn(frame ? "framed-photo" : "size-full object-cover", imgClassName)}
        style={frame ? frameStyle(frame) : undefined}
      />
    </span>
  );
}
