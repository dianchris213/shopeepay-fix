import {
  ArrowLeftRight,
  Banknote,
  Bike,
  Building2,
  Clapperboard,
  Coins,
  CreditCard,
  Droplets,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  Plane,
  PlusCircle,
  Receipt,
  Shield,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  Bus,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const uiIcons: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  transport: Bus,
  bills: Receipt,
  shopping: ShoppingBag,
  entertainment: Clapperboard,
  health: HeartPulse,
  home: Home,
  travel: Plane,
  salary: Landmark,
  invest: TrendingUp,
  gift: Gift,
  coins: Coins,
  wallet: Wallet,
  bank: Building2,
  landmark: Landmark,
  phone: Smartphone,
  cash: Banknote,
  card: CreditCard,
  transfer: ArrowLeftRight,
  topup: PlusCircle,
  shield: Shield,
  bike: Bike,
  zap: Zap,
  water: Droplets,
};

export const accountIconKeys = ["bank", "landmark", "wallet", "phone", "cash", "card"] as const;

export function iconFor(key: string): LucideIcon {
  return uiIcons[key] ?? Wallet;
}
