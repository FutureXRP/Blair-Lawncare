"use client";

import { useMemo, useState } from "react";

import { Button, Field, Input, Select, cx } from "@/components/ui";
import { formatCents, parseDollarsToCents } from "@/lib/money";

export interface ServiceOption {
  id: string;
  name: string;
  defaultPrice: string;
}

interface Line {
  key: number;
  serviceId: string;
  description: string;
  qty: string;
  price: string;
}

let nextKey = 1;

function blankLine(): Line {
  return { key: nextKey++, serviceId: "", description: "", qty: "1", price: "" };
}

/**
 * Builds the estimate's lines and serializes them into a hidden field. The
 * running total is computed in integer cents, the same way the server does it,
 * so the number on screen is the number that gets saved.
 */
export function EstimateLineEditor({ services }: { services: ServiceOption[] }) {
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  const totalCents = useMemo(() => {
    let total = 0;
    for (const line of lines) {
      const priceCents = parseDollarsToCents(line.price);
      const qty = Number.parseInt(line.qty, 10);
      if (priceCents === null || !Number.isInteger(qty) || qty < 1) continue;
      total += priceCents * qty;
    }
    return total;
  }, [lines]);

  function update(key: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function applyService(key: number, serviceId: string) {
    const service = services.find((option) => option.id === serviceId);
    update(key, {
      serviceId,
      description: service?.name ?? "",
      price: service?.defaultPrice ?? "",
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="hidden"
        name="line_items"
        value={JSON.stringify(
          lines.map((line) => ({
            service_id: line.serviceId || null,
            description: line.description,
            qty: line.qty,
            price: line.price,
          })),
        )}
      />

      {lines.map((line, index) => (
        <div
          key={line.key}
          className={cx(
            "grid gap-3 rounded border border-line bg-canvas px-3 py-3",
            "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_5rem_7rem_auto]",
          )}
        >
          <Field label={index === 0 ? "Service" : ""}>
            <Select
              value={line.serviceId}
              onChange={(event) => applyService(line.key, event.target.value)}
            >
              <option value="">Custom line</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={index === 0 ? "Description" : ""}>
            <Input
              value={line.description}
              onChange={(event) => update(line.key, { description: event.target.value })}
              placeholder="Spring cleanup"
            />
          </Field>

          <Field label={index === 0 ? "Qty" : ""}>
            <Input
              value={line.qty}
              inputMode="numeric"
              onChange={(event) => update(line.key, { qty: event.target.value })}
            />
          </Field>

          <Field label={index === 0 ? "Unit price" : ""}>
            <Input
              value={line.price}
              inputMode="decimal"
              placeholder="325.00"
              onChange={(event) => update(line.key, { price: event.target.value })}
            />
          </Field>

          <div className="flex items-end">
            <button
              type="button"
              aria-label="Remove this line"
              disabled={lines.length === 1}
              onClick={() =>
                setLines((current) => current.filter((item) => item.key !== line.key))
              }
              className="rounded border border-line px-2.5 py-2 text-xs text-muted transition hover:border-orange hover:text-orange disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          tone="secondary"
          onClick={() => setLines((current) => [...current, blankLine()])}
        >
          Add a line
        </Button>
        <span className="flex items-baseline gap-2">
          <span className="label">Total</span>
          <span className="numeric text-2xl text-ink">{formatCents(totalCents)}</span>
        </span>
      </div>
    </div>
  );
}
