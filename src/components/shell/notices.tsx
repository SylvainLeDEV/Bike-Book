import Link from "next/link";
import { ArrowRight, Inbox, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import type { ShellNoticeVM } from "@/lib/view-models";

const TONES: Record<ShellNoticeVM["tone"], string> = {
  soon: "bg-soon-soft text-soon-ink",
  late: "bg-late-soft text-late-ink",
  brand: "bg-brand-soft text-brand-ink",
};

/**
 * Messages at the top of every page (D-101): the Garmin key expires soon, has expired or is
 * refused, or activities wait in "À classer". Each links to where it is dealt with.
 */
export function ShellNotices({ notices }: { notices: ShellNoticeVM[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="mb-4 grid gap-2 md:mb-5">
      {notices.map((notice) => {
        const Icon = notice.tone === "brand" ? Inbox : TriangleAlert;
        return (
          <div
            key={notice.message}
            role={notice.tone === "late" ? "alert" : "status"}
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-3 py-2.5 text-[14px] leading-[1.45]",
              TONES[notice.tone],
            )}
          >
            <Icon className="size-[17px] shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 basis-60">{notice.message}</span>
            <Link
              href={notice.href}
              className="inline-flex items-center gap-1 font-semibold underline-offset-3 hover:underline"
            >
              {notice.action}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
