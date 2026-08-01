"use client";

import { useEffect, useState, useTransition } from "react";

import { reorderRoute, retryJobInvoice, setJobStatus } from "@/app/actions/jobs";
import { Badge, Button, EmptyState, cx } from "@/components/ui";
import { formatClock } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { JobStatus } from "@/lib/types";

/**
 * The route list. Signature component of the dashboard.
 *
 * A vertical line runs the length of the day with one node per stop: hollow for
 * scheduled, filled green for done, orange ring for the stop in progress. Rows
 * are separated by dashed dividers and every time is mono.
 */

export interface RouteStopView {
  id: string;
  status: JobStatus;
  priceCents: number | null;
  serviceName: string;
  customerName: string;
  customerPhone: string | null;
  propertyLabel: string;
  address: string;
  city: string | null;
  gateCode: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  invoiceId: string | null;
  invoiceError: string | null;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  en_route: "On the way",
  in_progress: "Mowing",
  complete: "Done",
  skipped: "Skipped",
  rain_delay: "Rain delay",
};

/** The next step for each status, and what the button that does it says. */
const NEXT_STEP: Partial<Record<JobStatus, { status: JobStatus; label: string }>> = {
  scheduled: { status: "en_route", label: "Start driving" },
  en_route: { status: "in_progress", label: "Start mowing" },
  in_progress: { status: "complete", label: "Mark done" },
};

function RouteNode({ status }: { status: JobStatus }) {
  const isDone = status === "complete";
  const isActive = status === "in_progress" || status === "en_route";
  const isSkipped = status === "skipped" || status === "rain_delay";

  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative z-10 mt-1 block h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-card",
        isDone && "border-cut bg-cut",
        isActive && "border-orange ring-3 ring-orange/25",
        !isDone && !isActive && !isSkipped && "border-muted/50",
        isSkipped && "border-muted/40 bg-canvas",
      )}
    />
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const tone =
    status === "complete"
      ? "green"
      : status === "in_progress" || status === "rain_delay"
        ? "orange"
        : "quiet";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

export function RouteList({
  date,
  stops: initialStops,
  canReorder,
  canSeeMoney,
}: {
  date: string;
  stops: RouteStopView[];
  canReorder: boolean;
  canSeeMoney: boolean;
}) {
  const [stops, setStops] = useState(initialStops);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Server data wins whenever the page revalidates.
  useEffect(() => setStops(initialStops), [initialStops]);

  function persistOrder(next: RouteStopView[]) {
    setStops(next);
    startTransition(async () => {
      const result = await reorderRoute(
        date,
        next.map((stop) => stop.id),
      );
      if (!result.ok) setNotice(result.message ?? "Could not save the new order");
    });
  }

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= stops.length) return;
    const next = [...stops];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  }

  function advance(stop: RouteStopView, status: JobStatus) {
    setNotice(null);
    startTransition(async () => {
      const result = await setJobStatus(stop.id, status);
      if (result.message) setNotice(result.message);
      if (!result.ok && !result.message) setNotice("Could not update that stop");
    });
  }

  function retryInvoice(stop: RouteStopView) {
    setNotice(null);
    startTransition(async () => {
      const result = await retryJobInvoice(stop.id);
      setNotice(result.message ?? null);
    });
  }

  if (stops.length === 0) {
    return (
      <EmptyState headline="No stops on this day">
        Set a customer up with a recurring service, then generate the schedule from the
        Schedule screen to fill this route.
      </EmptyState>
    );
  }

  return (
    <div>
      {notice ? (
        <p className="border-b border-line bg-orange/5 px-4 py-2.5 text-sm text-orange sm:px-5">
          {notice}
        </p>
      ) : null}

      <ol className={cx("relative", isPending && "opacity-70 transition-opacity")}>
        {/* The route line itself, running behind the nodes. */}
        <span
          aria-hidden="true"
          className="absolute bottom-8 left-[1.6875rem] top-8 w-px bg-line sm:left-[2.1875rem]"
        />

        {stops.map((stop, index) => {
          const next = NEXT_STEP[stop.status];
          const isDone = stop.status === "complete";

          return (
            <li
              key={stop.id}
              draggable={canReorder}
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(event) => {
                if (!canReorder || dragIndex === null) return;
                event.preventDefault();
                setOverIndex(index);
              }}
              onDrop={(event) => {
                if (!canReorder || dragIndex === null) return;
                event.preventDefault();
                move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cx(
                "route-divider px-4 py-4 last:border-b-0 sm:px-5",
                dragIndex === index && "dragging",
                overIndex === index && dragIndex !== index && "drop-target",
              )}
            >
              <div className="flex gap-3 sm:gap-4">
                <div className="flex flex-col items-center gap-1 pt-0.5">
                  <span className="numeric text-xs text-muted">{index + 1}</span>
                  <RouteNode status={stop.status} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <div className="min-w-0">
                      <h3
                        className={cx(
                          "text-base uppercase leading-tight",
                          isDone ? "text-muted" : "text-ink",
                        )}
                      >
                        {stop.customerName}
                      </h3>
                      <p className="text-sm text-muted">
                        {stop.address}
                        {stop.city ? `, ${stop.city}` : ""}
                      </p>
                      {stop.customerPhone ? (
                        <a
                          href={`tel:${stop.customerPhone.replace(/[^\d+]/g, "")}`}
                          className="mono text-cut hover:underline"
                        >
                          {stop.customerPhone}
                        </a>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={stop.status} />
                      {canSeeMoney && stop.priceCents !== null ? (
                        <span className="mono text-ink">{formatCents(stop.priceCents)}</span>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-muted">{stop.serviceName}</p>

                  {(stop.gateCode || stop.notes) && stop.status !== "complete" ? (
                    <div className="mt-2.5 rounded border border-line bg-canvas px-3 py-2">
                      {stop.gateCode ? (
                        <p className="text-sm text-ink">
                          <span className="label pr-1.5">Gate</span>
                          <span className="mono">{stop.gateCode}</span>
                        </p>
                      ) : null}
                      {stop.notes ? (
                        <p className={cx("text-sm text-ink", stop.gateCode && "mt-1")}>
                          {stop.notes}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {stop.completionNotes ? (
                    <p className="mt-2 text-sm text-muted">{stop.completionNotes}</p>
                  ) : null}

                  {canSeeMoney && stop.invoiceError && !stop.invoiceId ? (
                    <p className="mt-2 text-sm text-orange">
                      Invoice not created: {stop.invoiceError}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {stop.startedAt ? (
                      <span className="mono text-muted">
                        Started {formatClock(stop.startedAt)}
                      </span>
                    ) : null}
                    {stop.completedAt ? (
                      <span className="mono text-muted">
                        Done {formatClock(stop.completedAt)}
                      </span>
                    ) : null}

                    <span className="flex-1" />

                    {canReorder ? (
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${stop.customerName} earlier`}
                          disabled={index === 0 || isPending}
                          onClick={() => move(index, index - 1)}
                          className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-cut hover:text-cut disabled:opacity-40"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${stop.customerName} later`}
                          disabled={index === stops.length - 1 || isPending}
                          onClick={() => move(index, index + 1)}
                          className="rounded border border-line px-2 py-1 text-xs text-muted transition hover:border-cut hover:text-cut disabled:opacity-40"
                        >
                          Down
                        </button>
                      </span>
                    ) : null}

                    {stop.status === "complete" && canSeeMoney && !stop.invoiceId ? (
                      <Button
                        tone="alert"
                        disabled={isPending}
                        onClick={() => retryInvoice(stop)}
                      >
                        Create invoice
                      </Button>
                    ) : null}

                    {stop.status !== "complete" && stop.status !== "skipped" ? (
                      <Button
                        tone="ghost"
                        disabled={isPending}
                        onClick={() => advance(stop, "skipped")}
                      >
                        Skip
                      </Button>
                    ) : null}

                    {next ? (
                      <Button disabled={isPending} onClick={() => advance(stop, next.status)}>
                        {next.label}
                      </Button>
                    ) : null}

                    {(stop.status === "complete" || stop.status === "skipped") && canReorder ? (
                      <Button
                        tone="secondary"
                        disabled={isPending}
                        onClick={() => advance(stop, "scheduled")}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {canReorder ? (
        <p className="border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
          Drag a stop, or use Up and Down, to change the order of the day.
        </p>
      ) : null}
    </div>
  );
}
