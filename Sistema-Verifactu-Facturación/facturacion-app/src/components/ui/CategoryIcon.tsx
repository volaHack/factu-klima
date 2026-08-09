'use client';

// ============================================================
// CategoryIcon — Dynamic Lucide icon renderer by name
// Maps string icon names to Lucide components
// ============================================================

import {
  Apple, Carrot, Milk, Beef, Fish, Snowflake, Croissant,
  Package, Wine, Beer, GlassWater, Coffee, Popcorn,
  Hammer, Cog, Fuel, Wrench, HardHat, Plug, CircuitBoard,
  Truck, ClipboardList, Tag, ScrollText, Box,
  Utensils, ShoppingCart, Star, Zap, Shield, Gem, Flame,
  Pill, Leaf, Shirt, Laptop, Car, Key, Timer,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  // Alimentación
  'Apple': Apple,
  'Carrot': Carrot,
  'Milk': Milk,
  'Beef': Beef,
  'Fish': Fish,
  'Snowflake': Snowflake,
  'Croissant': Croissant,
  'ScrollText': ScrollText,
  'GlassWater': GlassWater,
  'Package': Package,
  'Box': Box,

  // Bebidas / HORECA
  'Beer': Beer,
  'Wine': Wine,
  'Champagne': GlassWater,
  'Coffee': Coffee,
  'Popcorn': Popcorn,
  'Utensils': Utensils,

  // Mayorista
  'Truck': Truck,
  'Tag': Tag,
  'ClipboardList': ClipboardList,
  'ShoppingCart': ShoppingCart,

  // Servicios Industriales
  'Hammer': Hammer,
  'Cog': Cog,
  'Fuel': Fuel,
  'Wrench': Wrench,
  'HardHat': HardHat,
  'Plug': Plug,
  'CircuitBoard': CircuitBoard,

  // Otros / Presets
  'Star': Star,
  'Zap': Zap,
  'Shield': Shield,
  'Gem': Gem,
  'Flame': Flame,
  'Pill': Pill,
  'Leaf': Leaf,
  'Shirt': Shirt,
  'Laptop': Laptop,
  'Car': Car,
  'Key': Key,
  'Timer': Timer,
};

interface CategoryIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function CategoryIcon({ name, size = 16, className, style }: CategoryIconProps) {
  const IconComponent = ICON_MAP[name];

  if (!IconComponent) {
    // Fallback: Package icon for unknown names
    return <Package size={size} className={className} style={style} />;
  }

  return <IconComponent size={size} className={className} style={style} />;
}

export { ICON_MAP };
