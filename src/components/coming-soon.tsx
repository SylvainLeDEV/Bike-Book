import { EmptyState } from "@/components/empty-state";
import { PageBody, Topbar } from "@/components/shell/topbar";

/** A navigation entry whose screen comes with a later feature of phase 1. */
export function ComingSoon({
  eyebrow,
  title,
  art,
  children,
}: {
  eyebrow: string;
  title: string;
  art: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar />
      <PageBody>
        <div className="mb-4">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-1 text-[28px] leading-[1.15] font-[650] tracking-[-0.02em]">{title}</h1>
        </div>
        <EmptyState art={art} title="Bientôt ici">
          {children}
        </EmptyState>
      </PageBody>
    </>
  );
}
