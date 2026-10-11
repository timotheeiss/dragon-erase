import type { Platform } from "@/lib/types";
export function SourceIcon({
  platform,
  size = 30,
}: {
  platform: Platform;
  size?: number;
}) {
  return (
    <span
      className={`source-icon source-${platform}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {platform === "slack" && (
        <svg viewBox="0 0 24 24" fill="none">
          <path
            stroke="#36C5F0"
            strokeWidth="4"
            strokeLinecap="round"
            d="M9 3v6M3 9h1"
          />
          <path
            stroke="#2EB67D"
            strokeWidth="4"
            strokeLinecap="round"
            d="M21 9h-6M15 3v1"
          />
          <path
            stroke="#ECB22E"
            strokeWidth="4"
            strokeLinecap="round"
            d="M15 21v-6M21 15h-1"
          />
          <path
            stroke="#E01E5A"
            strokeWidth="4"
            strokeLinecap="round"
            d="M3 15h6M9 21v-1"
          />
        </svg>
      )}
      {platform === "gmail" && (
        <svg viewBox="0 0 24 24" fill="none">
          <path stroke="#4285F4" strokeWidth="4" d="M3 7v13" />
          <path stroke="#34A853" strokeWidth="4" d="M21 7v13" />
          <path
            stroke="#EA4335"
            strokeWidth="4"
            strokeLinejoin="round"
            d="M3 5l9 7 9-7"
          />
          <path stroke="#FBBC04" strokeWidth="4" d="M21 5v6" />
          <path stroke="#C5221F" strokeWidth="4" d="M3 5v6" />
        </svg>
      )}
      {platform === "salesforce" && (
        <svg viewBox="0 0 32 24">
          <path
            fill="#0CA7DF"
            d="M7 5a7 7 0 0111-2 6 6 0 018 5c8 1 8 13 0 14H8C-2 22-3 7 7 5Z"
          />
          <text
            x="16"
            y="15"
            textAnchor="middle"
            fill="white"
            fontSize="7"
            fontFamily="Arial"
            fontWeight="700"
          >
            salesforce
          </text>
        </svg>
      )}
      {platform === "notion" && (
        <svg viewBox="0 0 24 24">
          <rect
            x="2"
            y="2"
            width="20"
            height="20"
            rx="3"
            fill="white"
            stroke="#202422"
            strokeWidth="1.7"
          />
          <path d="M6 18V6h3l7 10V6h2v12h-3L8 8v10Z" fill="#202422" />
        </svg>
      )}
      {platform === "drive" && (
        <svg viewBox="0 0 24 24">
          <path fill="#0F9D58" d="M9 2h6L6 18H0Z" />
          <path fill="#F4B400" d="M15 2l9 16h-6L9 2Z" />
          <path fill="#4285F4" d="M0 18l3 5h18l3-5Z" />
        </svg>
      )}
    </span>
  );
}
