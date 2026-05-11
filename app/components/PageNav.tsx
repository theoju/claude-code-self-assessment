import Link from "next/link";

type PageKey = "dashboard" | "methodology" | "probes" | "dimension" | "tip";

interface NavItem {
  key: PageKey;
  label: string;
  href: string;
}

const PRIMARY: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/" },
  { key: "methodology", label: "Methodology", href: "/methodology" },
  { key: "probes", label: "Probes", href: "/methodology/probes" },
];

interface Props {
  current: PageKey;
  // Optional trailing breadcrumb for context pages (dimension detail, tip).
  // The rendered label is non-linked text appended after the primary nav.
  context?: { label: string; parentKey?: PageKey };
}

export default function PageNav({ current, context }: Props) {
  return (
    <nav
      aria-label="Primary"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-6 text-xs uppercase tracking-[0.15em]"
    >
      {PRIMARY.map((item, i) => {
        const active =
          item.key === current ||
          (context?.parentKey === item.key && current !== "dashboard");
        const isLast = i === PRIMARY.length - 1 && !context;
        return (
          <span key={item.key} className="flex items-baseline gap-x-4">
            {active ? (
              <span className="text-[color:var(--color-fg,#e5e7eb)] font-semibold">
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-[color:var(--color-mute)] hover:text-[color:var(--color-accent)] transition-colors"
              >
                {item.label}
              </Link>
            )}
            {!isLast && (
              <span
                aria-hidden="true"
                className="text-[color:var(--color-line)]"
              >
                ·
              </span>
            )}
          </span>
        );
      })}
      {context && (
        <span className="flex items-baseline gap-x-4">
          <span aria-hidden="true" className="text-[color:var(--color-line)]">
            ›
          </span>
          <span className="text-[color:var(--color-fg,#e5e7eb)] font-semibold normal-case tracking-normal text-sm">
            {context.label}
          </span>
        </span>
      )}
    </nav>
  );
}
