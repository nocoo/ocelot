import { Button } from "@nocoo/basalt/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nocoo/basalt/components/dialog";
import { ImageOff, Minimize2, X, ZoomIn } from "lucide-react";
import { useRef } from "react";
import type { LightboxImage, ReaderViewModel } from "../viewmodels/reader";

export function ReaderImage({
  src,
  alt,
  onOpen,
}: {
  src: string;
  alt: string;
  onOpen: (src: string, alt: string) => void;
}) {
  return (
    <Button
      variant="ghost"
      className="reader-image"
      aria-label={`放大图片：${alt || "笔记图片"}`}
      onClick={() => onOpen(src, alt)}
    >
      <img src={src} alt={alt} loading="lazy" decoding="async" />
    </Button>
  );
}

export function ImageLightbox({
  image,
  model,
}: {
  image: LightboxImage | null;
  model: ReaderViewModel;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && model.closeImage()}>
      <DialogContent
        className="ocelot-dialog image-lightbox"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current?.isConnected
            ? returnFocus.current
            : document.getElementById("main-content");
          target?.focus({ preventScroll: true });
        }}
      >
        <div className="lightbox-toolbar">
          <DialogTitle>图片预览</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => model.toggleImageZoom()}
            disabled={image?.failed}
            aria-pressed={image?.zoomed}
            aria-label={image?.zoomed ? "适应窗口" : "查看原图尺寸"}
          >
            {image?.zoomed ? <Minimize2 size={16} /> : <ZoomIn size={16} />}
            {image?.zoomed ? "适应窗口" : "原图尺寸"}
          </Button>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="关闭图片预览">
              <X size={18} />
            </Button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          查看放大的笔记图片；原图尺寸下可以滚动。按 Escape 关闭并返回阅读。
        </DialogDescription>
        <section
          className={`lightbox-stage ${image?.zoomed ? "is-zoomed" : ""}`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The original-size image viewport supports keyboard scrolling.
          tabIndex={0}
          aria-label="图片，可滚动查看原图"
        >
          {image?.failed ? (
            <p className="lightbox-error" role="status">
              <ImageOff size={24} aria-hidden="true" />
              图片暂时无法加载，请关闭后重试。
            </p>
          ) : image ? (
            <img src={image.src} alt={image.alt} onError={() => model.imageFailed()} />
          ) : null}
        </section>
        {image?.alt && <p className="lightbox-caption">{image.alt}</p>}
      </DialogContent>
    </Dialog>
  );
}
