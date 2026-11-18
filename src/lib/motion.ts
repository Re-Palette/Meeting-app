import type { Transition, Variants } from 'framer-motion';

// Only transform + opacity are animated: both run on the GPU compositor, so page changes stay at 60fps.
// (Animating filter/blur or layout properties forces a repaint of every glass card on each frame.)
export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const spring: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.7 };

// `transform` is given as a full string (not x/y) so Motion hands it to the browser's Web Animations API,
// which runs on the compositor thread: the slide keeps going even while React renders the new page.
export const pageVariants: Variants = {
  initial: { opacity: 0, transform: 'translate3d(24px, 0, 0)' },
  enter: {
    opacity: 1,
    transform: 'translate3d(0px, 0, 0)',
    transition: { duration: 0.34, ease, staggerChildren: 0.035, delayChildren: 0.02 },
  },
  exit: { opacity: 0, transform: 'translate3d(-16px, 0, 0)', transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
};

export const item: Variants = {
  initial: { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
  enter: { opacity: 1, transform: 'translate3d(0, 0px, 0)', transition: { duration: 0.38, ease } },
  exit: { opacity: 0 },
};
