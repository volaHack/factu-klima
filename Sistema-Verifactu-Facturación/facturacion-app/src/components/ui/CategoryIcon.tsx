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
  // Los oficios que venden trabajo: salud, despachos, obra y servicios.
  Activity, BookOpen, Brain, Briefcase, Building2, Calculator, Camera, ClipboardCheck, Code, Compass, Droplets, FileCheck, Film, Flower2, Gavel, GraduationCap, HeartPulse, Home, Languages, Megaphone, Palette, PartyPopper, PawPrint, Ruler, Salad, Scale, Scissors, Server, Smile, Sofa, Sparkles, Stethoscope, User, Users,
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

  // --- Oficios de servicios ---
  'Activity': Activity,
  'BookOpen': BookOpen,
  'Brain': Brain,
  'Briefcase': Briefcase,
  'Building2': Building2,
  'Calculator': Calculator,
  'Camera': Camera,
  'ClipboardCheck': ClipboardCheck,
  'Code': Code,
  'Compass': Compass,
  'Droplets': Droplets,
  'FileCheck': FileCheck,
  'Film': Film,
  'Flower2': Flower2,
  'Gavel': Gavel,
  'GraduationCap': GraduationCap,
  'HeartPulse': HeartPulse,
  'Home': Home,
  'Languages': Languages,
  'Megaphone': Megaphone,
  'Palette': Palette,
  'PartyPopper': PartyPopper,
  'PawPrint': PawPrint,
  'Ruler': Ruler,
  'Salad': Salad,
  'Scale': Scale,
  'Scissors': Scissors,
  'Server': Server,
  'Smile': Smile,
  'Sofa': Sofa,
  'Sparkles': Sparkles,
  'Stethoscope': Stethoscope,
  'User': User,
  'Users': Users,
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
