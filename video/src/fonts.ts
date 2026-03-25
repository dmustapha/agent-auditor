import { loadFont as loadSerif } from '@remotion/google-fonts/LibreBaskerville';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

export const { fontFamily: SERIF } = loadSerif('normal', {
  weights: ['400', '700'],
  subsets: ['latin'],
});

export const { fontFamily: MONO } = loadMono('normal', {
  weights: ['400', '600', '700'],
  subsets: ['latin'],
});
