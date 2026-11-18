import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { IconButton } from './Primitives';
import { useUiStore } from '../../stores/uiStore';
import styles from './Lightbox.module.css';

export function Lightbox() {
  const lightbox = useUiStore((state) => state.lightbox);
  const closeLightbox = useUiStore((state) => state.closeLightbox);
  const setIndex = useUiStore((state) => state.setLightboxIndex);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeLightbox();
      if (event.key === 'ArrowRight') {
        setIndex((lightbox.index + 1) % lightbox.images.length);
      }
      if (event.key === 'ArrowLeft') {
        setIndex((lightbox.index - 1 + lightbox.images.length) % lightbox.images.length);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, closeLightbox, setIndex]);

  if (typeof document === 'undefined') return null;

  const current = lightbox?.images[lightbox.index];
  const multiple = (lightbox?.images.length ?? 0) > 1;

  return createPortal(
    <AnimatePresence>
      {lightbox && current ? (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
        >
          <div className={styles.backdrop} onClick={closeLightbox} />

          <div className={styles.topbar}>
            <span className={styles.caption}>
              {current.name || 'Photo'}
              {multiple ? ` · ${lightbox.index + 1} of ${lightbox.images.length}` : ''}
            </span>
            <div className={styles.topActions}>
              <a
                href={current.url}
                target="_blank"
                rel="noreferrer"
                className={styles.download}
                download={current.name}
                aria-label="Download image"
              >
                <Download size={18} />
              </a>
              <IconButton label="Close viewer" onClick={closeLightbox} size="md">
                <X size={19} />
              </IconButton>
            </div>
          </div>

          <motion.img
            key={current.url}
            src={current.url}
            alt={current.name || 'Shared photo'}
            className={styles.image}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
          />

          {multiple ? (
            <>
              <button
                type="button"
                className={styles.navPrev}
                onClick={() =>
                  setIndex((lightbox.index - 1 + lightbox.images.length) % lightbox.images.length)
                }
                aria-label="Previous image"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                type="button"
                className={styles.navNext}
                onClick={() => setIndex((lightbox.index + 1) % lightbox.images.length)}
                aria-label="Next image"
              >
                <ChevronRight size={24} />
              </button>
            </>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
