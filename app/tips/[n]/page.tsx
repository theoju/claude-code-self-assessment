import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTipContent,
  listTipNumbers,
  renderMarkdown,
  siteHomepage,
} from "@/app/lib/boris-content";
import PageNav from "@/app/components/PageNav";

export const dynamic = "force-static";

export function generateStaticParams() {
  return listTipNumbers().map((n) => ({ n: String(n) }));
}

interface Props {
  params: Promise<{ n: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { n } = await params;
  const tip = getTipContent(parseInt(n, 10));
  if (!tip) return { title: "Tip not found" };
  return { title: `Boris tip ${tip.n} — ${tip.title}` };
}

export default async function TipPage({ params }: Props) {
  const { n: nStr } = await params;
  const n = parseInt(nStr, 10);
  const tip = getTipContent(n);
  if (!tip) notFound();

  const numbers = listTipNumbers();
  const idx = numbers.indexOf(n);
  const prev = idx > 0 ? numbers[idx - 1] : null;
  const next = idx >= 0 && idx < numbers.length - 1 ? numbers[idx + 1] : null;

  const navHint =
    tip.volume != null && tip.label
      ? `Vol ${tip.volume} → ${tip.label} tab`
      : null;
  const externalUrl = siteHomepage();

  return (
    <main className="max-w-[1200px] mx-auto px-8 py-12">
      <PageNav
        current="tip"
        context={{ label: `Tip ${tip.n}`, parentKey: "dashboard" }}
      />

      <header className="mb-12 border-b border-[color:var(--color-line)] pb-8">
        <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
          <span>Boris tip</span>
          <span>·</span>
          <span className="mono">#{tip.n}</span>
          {navHint ? (
            <>
              <span>·</span>
              <span>{navHint}</span>
            </>
          ) : null}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          {tip.title}
        </h1>
        <div className="max-w-3xl">
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-[color:var(--color-mute)] underline decoration-dotted underline-offset-4 hover:text-[color:var(--color-accent)]"
          >
            Open on howborisusesclaudecode.com ↗
          </a>
          {navHint ? (
            <div className="text-xs text-[color:var(--color-mute)] mt-1">
              (the upstream site has no per-tip URL — manually click the{" "}
              <span className="mono text-[color:var(--color-text)]">
                {tip.label}
              </span>{" "}
              tab in volume {tip.volume})
            </div>
          ) : null}
        </div>
      </header>

      <article className="prose-tip leading-relaxed text-[color:var(--color-text)] space-y-4 max-w-3xl">
        {renderMarkdown(tip.contentMd)}
      </article>

      <nav className="mt-12 pt-6 border-t border-[color:var(--color-line)] flex justify-between text-sm max-w-3xl">
        <span>
          {prev != null ? (
            <Link
              href={`/tips/${prev}`}
              className="text-[color:var(--color-mute)] hover:text-[color:var(--color-accent)]"
            >
              ← Tip {prev}
            </Link>
          ) : null}
        </span>
        <span>
          {next != null ? (
            <Link
              href={`/tips/${next}`}
              className="text-[color:var(--color-mute)] hover:text-[color:var(--color-accent)]"
            >
              Tip {next} →
            </Link>
          ) : null}
        </span>
      </nav>
    </main>
  );
}
