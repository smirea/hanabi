import type { Suit } from '../../game';

export const suitColors: Record<Suit, string> = {
  R: '#e64d5f',
  Y: '#f4c21b',
  G: '#2dc96d',
  B: '#4f8eff',
  W: '#ff7e2e',
  M: '#8b5cf6'
};

export const suitBadgeForeground: Record<Suit, string> = {
  R: '#fff',
  Y: '#101114',
  G: '#101114',
  B: '#fff',
  W: '#101114',
  M: '#fff'
};

export const suitNames: Record<Suit, string> = {
  R: 'red',
  Y: 'yellow',
  G: 'green',
  B: 'blue',
  W: 'orange',
  M: 'multicolor'
};
