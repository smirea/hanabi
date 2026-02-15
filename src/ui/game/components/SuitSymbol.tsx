import {
  Drop,
  Fire,
  Heart,
  Leaf,
  Rainbow,
  Sun,
  type IconProps
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { Suit } from '../../../game';

const suitIcons: Record<Suit, ComponentType<IconProps>> = {
  R: Heart,
  Y: Sun,
  G: Leaf,
  B: Drop,
  W: Fire,
  M: Rainbow
};

export function SuitSymbol({
  suit,
  size = 14,
  weight = 'fill',
  className
}: {
  suit: Suit;
  size?: number;
  weight?: IconProps['weight'];
  className?: string;
}) {
  const Icon = suitIcons[suit];
  return <Icon size={size} weight={weight} className={className} aria-hidden />;
}
