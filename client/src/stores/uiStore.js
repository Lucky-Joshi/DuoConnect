import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useUiStore = create(
  persist(
    (set) => ({
      reduceMotion: false,
      lightbox: null,
      forwardMessage: null,
      newChatOpen: false,
      detailsOpen: false,

      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      toggleReduceMotion: () => set((state) => ({ reduceMotion: !state.reduceMotion })),

      openLightbox: (images, index = 0) => set({ lightbox: { images, index } }),
      setLightboxIndex: (index) =>
        set((state) => (state.lightbox ? { lightbox: { ...state.lightbox, index } } : {})),
      closeLightbox: () => set({ lightbox: null }),

      openForward: (message) => set({ forwardMessage: message }),
      closeForward: () => set({ forwardMessage: null }),

      setNewChatOpen: (newChatOpen) => set({ newChatOpen }),
      setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
    }),
    {
      name: 'duo:ui',
      partialize: (state) => ({ reduceMotion: state.reduceMotion }),
    },
  ),
);
