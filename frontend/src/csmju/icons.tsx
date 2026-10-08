type IconProps = React.SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function PersonIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="4" y="10" width="16" height="10" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4.1M6.5 7.6A16.8 16.8 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.6-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </svg>
  );
}

export function ArrowForwardIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
    </svg>
  );
}

export function ArrowBackIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M19.5 12h-15M11 18.5 4.5 12 11 5.5" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.4} aria-hidden {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 3.5 5 6.2v5.1c0 4.3 2.8 8.2 7 9.2 4.2-1 7-4.9 7-9.2V6.2L12 3.5Z" />
      <path d="m9.2 12.1 2 2 3.6-3.9" />
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3.5" y="3.5" width="7" height="8.5" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="12" width="7" height="8.5" rx="1.5" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function GroupIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.4a6 6 0 0 1 3 5.1" />
    </svg>
  );
}

export function SchoolIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="m12 4 9 4.5-9 4.5-9-4.5L12 4Z" />
      <path d="M6.5 10.8v4.6c0 1.7 2.5 3.1 5.5 3.1s5.5-1.4 5.5-3.1v-4.6" />
      <path d="M21 8.5v5" />
    </svg>
  );
}

export function CampaignIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M4 9.5h3.5L15 5v14l-7.5-4.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
      <path d="M18.5 9.2a4 4 0 0 1 0 5.6" />
      <path d="M7.5 14.5v3a2 2 0 0 0 4 0v-.8" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z" />
    </svg>
  );
}

export function MeetingRoomIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3.5 20.5h17" />
      <path d="M6 20.5v-16a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v16" />
      <path d="M15.5 6.5H17a1 1 0 0 1 1 1v13" />
      <path d="M12 12.5h.01" />
    </svg>
  );
}

export function AddIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} aria-hidden {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} aria-hidden {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} aria-hidden {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

export function NotificationsIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9Z" />
      <path d="M13.7 19a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function DeleteIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M4.5 6.5h15" />
      <path d="M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10.5v6M13.5 10.5v6" />
    </svg>
  );
}

export function TrendingUpIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} aria-hidden {...props}>
      <path d="m4 16.5 5.5-5.5 3.5 3.5L20 7.5" />
      <path d="M15 7.5h5v5" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} aria-hidden {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M14 20H6.5A1.5 1.5 0 0 1 5 18.5v-13A1.5 1.5 0 0 1 6.5 4H14" />
      <path d="M18.5 12H10M15.5 8.5 19 12l-3.5 3.5" />
    </svg>
  );
}

export function MenuBookIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 7.5S10.2 6 7.2 6H3.5v11h4c2.6 0 4.5 1.5 4.5 1.5s1.9-1.5 4.5-1.5h4V6h-3.7C13.8 6 12 7.5 12 7.5Z" />
      <path d="M12 7.5v11" />
    </svg>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M5.5 3.5h13v17l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5L7.7 19l-2.2 1.5v-17Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

export function EventIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
      <path d="M8 13.5h3v3H8z" />
    </svg>
  );
}

export function DescriptionIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5l-5-5Z" />
      <path d="M13.5 3.5v5h5M9 13h6M9 16.5h4" />
    </svg>
  );
}

export function CalendarTodayIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

export function LocationIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function MoreHorizIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.6} aria-hidden {...props}>
      <path d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  );
}

export function AccountCircleIcon(props: IconProps) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.2 18.2a6.2 6.2 0 0 1 11.6 0" />
    </svg>
  );
}
