// SPDX-License-Identifier: Apache-2.0
import {
  BadgeCheck, BadgeInfo, BookOpen, BookOpenCheck, BriefcaseBusiness, Building2,
  BusFront, CalendarCheck, CalendarDays, Camera, Castle, ClipboardCheck,
  ClipboardPlus, Compass, FileWarning, Flame, FolderOpen, Gift, Globe,
  GraduationCap, HandHeart, HeartHandshake, HeartPulse, Hospital, House,
  Landmark, LayoutGrid, Lightbulb, ListChecks, Map, MapPin, MapPinHouse,
  MapPinned, Megaphone, MessageCircle, MessagesSquare, Newspaper, ParkingCircle,
  PhoneCall, Pill, Plane, Route, ScanQrCode, School, ShieldAlert, ShieldCheck,
  ShoppingBag, Sprout, Store, Ticket, TrafficCone, TriangleAlert, Tv,
  UsersRound, Wallet, Wind, type LucideIcon,
} from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  BadgeCheck, BadgeInfo, BookOpen, BookOpenCheck, BriefcaseBusiness, Building2,
  BusFront, CalendarCheck, CalendarDays, Camera, Castle, ClipboardCheck,
  ClipboardPlus, Compass, FileWarning, Flame, FolderOpen, Gift, Globe,
  GraduationCap, HandHeart, HeartHandshake, HeartPulse, Hospital, House,
  Landmark, LayoutGrid, Lightbulb, ListChecks, Map, MapPin, MapPinHouse,
  MapPinned, Megaphone, MessageCircle, MessagesSquare, Newspaper, ParkingCircle,
  PhoneCall, Pill, Plane, Route, ScanQrCode, School, ShieldAlert, ShieldCheck,
  ShoppingBag, Sprout, Store, Ticket, TrafficCone, TriangleAlert, Tv,
  UsersRound, Wallet, Wind,
};

export function Icon({ name, size = 24, strokeWidth = 1.8 }: { name: string; size?: number; strokeWidth?: number }) {
  const Component = icons[name] || LayoutGrid;
  return <Component size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}
