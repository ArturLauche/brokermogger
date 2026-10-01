"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RequestType } from "@prisma/client";
import { FieldError, FormFeedback } from "@/components/common/form-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { MAX_BROKERS_PER_WORKFLOW } from "@/lib/requests/fairUse";
import { initialActionState } from "@/lib/validation/actionResult";
import { createWorkflow, type WorkflowFields, type WorkflowState } from "./actions";
import { ListNavigation } from "@/components/common/list-navigation";

type BrokerChoice = {
  id: string;
  label: string;
  active: boolean;
  supportedTypes: RequestType[];
};

export function WorkflowForm({
  initial,
  types,
  identifiers,
  brokers,
  directory,
}: {
  initial: WorkflowFields;
  types: RequestType[];
  identifiers: { id: string; label: string }[];
  brokers: BrokerChoice[];
  directory: {
    total: number;
    nextCursor: string | null;
    cursor: string;
    search: string;
    brokerQuery: string;
  };
}) {
  const router = useRouter();
  const [searching, startSearch] = useTransition();
  const [state, action, pending] = useActionState<WorkflowState, FormData>(
    createWorkflow,
    initialActionState(initial)
  );
  const [requestType, setRequestType] = useState(initial.requestType);
  const [selectedIdentifiers, setIdentifiers] = useState(
    initial.identifierIds.split(",").filter(Boolean)
  );
  const [selectedBrokers, setBrokers] = useState(
    initial.brokerIds.split(",").filter(Boolean)
  );
  const [search, setSearch] = useState(directory.search);
  const [selectedChoices, setSelectedChoices] = useState(
    new Map(
      brokers
        .filter((broker) => selectedBrokers.includes(broker.id))
        .map((broker) => [broker.id, broker])
    )
  );
  const toggle = (values: string[], value: string) =>
    values.includes(value) ? values.filter((id) => id !== value) : [...values, value];
  const visibleBrokers = [
    ...new Map(
      [...selectedChoices.values(), ...brokers].map((broker) => [broker.id, broker])
    ).values(),
  ];
  const searchDirectory = () => {
    const query = new URLSearchParams({ search: search.trim() });
    if (directory.brokerQuery) query.set("brokers", directory.brokerQuery);
    startSearch(() => router.push(`/requests/new?${query}`, { scroll: false }));
  };
  return (
    <form action={action} className="flex flex-col gap-8" aria-busy={pending}>
      <input type="hidden" name="profileId" value={initial.profileId} />
      <FormFeedback state={state} />
      {state.existingRequestIds?.length ? (
        <div className="space-y-2">
          <p className="text-sm">Continue an existing request:</p>
          <ul className="list-inside list-disc text-sm">
            {state.existingRequestIds.map((id, index) => (
              <li key={id}>
                <Link className="underline" href={`/requests/${encodeURIComponent(id)}`}>
                  Open request {index + 1}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <fieldset
        className="space-y-2"
        aria-describedby="requestType-hint requestType-error"
        aria-invalid={Boolean(state.fieldErrors.requestType)}
      >
        <legend className="mb-2 text-lg font-semibold">Request type</legend>
        <p id="requestType-hint" className="text-sm text-muted-foreground">
          These options have an applicable published rule and template. Follow-ups and
          escalation preparation belong to an existing request.
        </p>
        {types.length ? (
          types.map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="requestType"
                value={type}
                checked={requestType === type}
                onChange={() => setRequestType(type)}
                disabled={pending}
                className="size-4"
              />
              <span className="capitalize">
                {type === "DELETION" ? "Deletion / erasure" : REQUEST_TYPE_LABELS[type]}
              </span>
            </label>
          ))
        ) : (
          <p className="text-sm">
            No initial request types are published for this location. An instance
            maintainer can review the catalogue.
          </p>
        )}
        <FieldError id="requestType-error" message={state.fieldErrors.requestType} />
      </fieldset>
      <fieldset
        className="space-y-2 border-t pt-6"
        aria-describedby="identifierIds-hint identifierIds-error"
        aria-invalid={Boolean(state.fieldErrors.identifierIds)}
      >
        <legend className="text-lg font-semibold">Identifiers to include</legend>
        <p id="identifierIds-hint" className="text-sm text-muted-foreground">
          Select the details the broker needs to match the person. Only selected
          identifiers are included in the draft.
        </p>
        {identifiers.map((identifier) => (
          <label key={identifier.id} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="identifierId"
              value={identifier.id}
              checked={selectedIdentifiers.includes(identifier.id)}
              onChange={() => setIdentifiers(toggle(selectedIdentifiers, identifier.id))}
              disabled={pending}
              className="size-4 shrink-0"
            />
            <span className="min-w-0 break-words">{identifier.label}</span>
          </label>
        ))}
        {!identifiers.length ? (
          <Link className="text-sm underline" href="/vault">
            Add matching details in the data vault
          </Link>
        ) : null}
        <FieldError id="identifierIds-error" message={state.fieldErrors.identifierIds} />
      </fieldset>
      <fieldset
        className="space-y-3 border-t pt-6"
        aria-describedby="brokerIds-hint brokerIds-error"
        aria-invalid={Boolean(state.fieldErrors.brokerIds)}
      >
        <legend className="text-lg font-semibold">Brokers</legend>
        <p id="brokerIds-hint" className="text-sm text-muted-foreground">
          Choose up to {MAX_BROKERS_PER_WORKFLOW} brokers. Availability for submission is
          checked during review.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="broker-search">Find a broker</Label>
            <Input
              id="broker-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchDirectory();
                }
              }}
              maxLength={100}
              disabled={pending || searching}
              placeholder="Broker name"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={searchDirectory}
            disabled={pending || searching}
          >
            {searching ? "Searching…" : "Search brokers"}
          </Button>
        </div>
        <p className="text-sm" role="status">
          {selectedBrokers.length} selected · {directory.total} matching{" "}
          {directory.total === 1 ? "broker" : "brokers"}. Selections stay available while
          searching or paging.
        </p>
        <div
          className="max-h-80 overflow-y-auto overscroll-contain"
          role="region"
          aria-label="Available brokers"
          tabIndex={0}
        >
          {visibleBrokers.map((broker) => {
            const compatible =
              broker.active &&
              (!broker.supportedTypes.length ||
                broker.supportedTypes.some((type) => type === requestType));
            return (
              <label
                key={broker.id}
                className="flex min-h-11 items-center gap-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="brokerId"
                  value={broker.id}
                  checked={selectedBrokers.includes(broker.id)}
                  onChange={() => {
                    const selected = toggle(selectedBrokers, broker.id);
                    setBrokers(selected);
                    setSelectedChoices((previous) => {
                      const next = new Map(previous);
                      if (selected.includes(broker.id)) next.set(broker.id, broker);
                      else next.delete(broker.id);
                      return next;
                    });
                  }}
                  disabled={
                    pending || (!compatible && !selectedBrokers.includes(broker.id))
                  }
                  aria-describedby={
                    !compatible ? `broker-${broker.id}-compatibility` : undefined
                  }
                  className="size-4 shrink-0"
                />
                <span className="min-w-0 break-words">
                  {broker.label}
                  {!compatible ? (
                    <span
                      id={`broker-${broker.id}-compatibility`}
                      className="block text-muted-foreground"
                    >
                      {broker.active
                        ? "This request type is not listed for your jurisdiction."
                        : "This broker is inactive."}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          {!visibleBrokers.length ? (
            <p className="py-3 text-sm text-muted-foreground">
              No brokers match this search.
            </p>
          ) : null}
        </div>
        <ListNavigation
          path="/requests/new"
          filters={{ search: directory.search, brokers: directory.brokerQuery }}
          cursor={directory.cursor}
          nextCursor={directory.nextCursor}
          label="Broker choices"
        />
        <FieldError id="brokerIds-error" message={state.fieldErrors.brokerIds} />
      </fieldset>
      <Button
        type="submit"
        disabled={
          pending || !types.length || !identifiers.length || !selectedBrokers.length
        }
        className="self-start"
      >
        {pending ? "Preparing drafts…" : "Generate drafts"}
      </Button>
    </form>
  );
}
