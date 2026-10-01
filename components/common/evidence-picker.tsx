"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  evidenceChoicePageSchema,
  type EvidenceChoicePage,
} from "@/lib/evidence/choices";

/** A bounded chooser keeps old attachments reachable without disturbing an unfinished form. */
export function EvidencePicker({
  requestId,
  id,
  name,
  initialValue = "",
  describedBy,
}: {
  requestId: string;
  id: string;
  name: string;
  initialValue?: string;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState({
    id: initialValue,
    label: initialValue ? `Selected file ${initialValue.slice(0, 8)}` : "",
  });
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState<EvidenceChoicePage | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function load(query: string, nextCursor?: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPending(true);
    setError(false);
    const params = new URLSearchParams({ search: query });
    if (nextCursor) params.set("cursor", nextCursor);
    try {
      const response = await fetch(
        `/api/requests/${encodeURIComponent(requestId)}/evidence?${params}`,
        { signal: current.signal, cache: "no-store" }
      );
      if (!response.ok) throw new Error("File choices unavailable");
      const result = evidenceChoicePageSchema.parse(await response.json());
      if (current.signal.aborted) return;
      setPage(result);
      setCursor(nextCursor);
      setAppliedSearch(query);
    } catch {
      if (!current.signal.aborted) setError(true);
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected.id} />
      <div className="flex flex-wrap items-center gap-3">
        <Dialog
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            if (value) void load(search);
            else controller.current?.abort();
          }}
        >
          <DialogTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-describedby={describedBy}
            >
              {selected.id ? "Change evidence" : "Choose evidence"}
            </Button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
            <DialogHeader className="shrink-0">
              <DialogTitle>Choose request evidence</DialogTitle>
              <DialogDescription>
                Available files for this request. Identity documents and expired files are
                excluded.
              </DialogDescription>
            </DialogHeader>
            <div className="flex shrink-0 items-end gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor={`${id}-search`}>Masked filename</Label>
                <Input
                  id={`${id}-search`}
                  type="search"
                  maxLength={100}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void load(search);
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void load(search)}
              >
                Search
              </Button>
            </div>
            {error ? (
              <div role="alert" className="space-y-3">
                <p>
                  File choices could not be loaded. Your form and selection are preserved.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void load(appliedSearch, cursor)}
                >
                  Try again
                </Button>
              </div>
            ) : pending ? (
              <p role="status">Loading evidence…</p>
            ) : page ? (
              <>
                <p className="shrink-0 text-sm text-muted-foreground">
                  Showing {page.items.length} of {page.total} matching files. Newest
                  first.
                </p>
                {page.items.length ? (
                  <ul
                    aria-label="Available evidence files"
                    tabIndex={0}
                    className="min-h-0 flex-1 divide-y overflow-y-auto focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {page.items.map((file) => (
                      <li key={file.id}>
                        <button
                          type="button"
                          className="min-h-11 w-full px-2 py-3 text-left break-all hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                          onClick={() => {
                            setSelected(file);
                            setOpen(false);
                          }}
                        >
                          {file.label}
                          {selected.id === file.id ? (
                            <span className="ml-2 text-muted-foreground">(selected)</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No available files match this search.</p>
                )}
                {cursor || page.nextCursor ? (
                  <nav
                    aria-label="Evidence choice pages"
                    className="flex shrink-0 flex-wrap gap-3"
                  >
                    {cursor ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void load(appliedSearch)}
                      >
                        First page
                      </Button>
                    ) : null}
                    {page.nextCursor ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void load(appliedSearch, page.nextCursor!)}
                      >
                        Next page
                      </Button>
                    ) : null}
                  </nav>
                ) : null}
              </>
            ) : null}
          </DialogContent>
        </Dialog>
        {selected.id ? (
          <>
            <span className="min-w-0 text-sm break-all">{selected.label}</span>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelected({ id: "", label: "" })}
            >
              Remove attachment
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">No file attached</span>
        )}
      </div>
    </div>
  );
}
