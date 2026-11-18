import type { Transition, Variants } from 'framer-motion';

export const spring: Transition = { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 };

export const pageVariants: Variants = {
  initial: { opacity: 0, x: 28, filter: 'blur(4px)' },
  enter: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { ...spring, staggerChildren: 0.06, delayChildren: 0.04 } },
  exit: { opacity: 0, x: -20, filter: 'blur(4px)', transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } },
};

export const item: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  enter: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0 },
};
