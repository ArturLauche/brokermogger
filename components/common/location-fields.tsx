"use client";

import { useState } from "react";
import { COUNTRY_NAMES } from "@/lib/jurisdiction/types";
import { normalizeUsState, US_STATES } from "@/lib/jurisdiction/locations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "./form-feedback";

export function LocationFields({
  countryCode,
  region,
  error,
}: {
  countryCode: string;
  region: string;
  error?: string | undefined;
}) {
  const [country, setCountry] = useState(countryCode);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="countryCode">Country of residence</Label>
        <select
          id="countryCode"
          name="countryCode"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:h-10"
        >
          {Object.entries(COUNTRY_NAMES)
            .sort((a, b) => a[1].localeCompare(b[1]))
            .map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Where you live determines which request rules may apply.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="region">
          {country === "US"
            ? "State or District of Columbia"
            : "State or region (optional)"}
        </Label>
        {country === "US" ? (
          <select
            id="region"
            name="region"
            defaultValue={normalizeUsState(region) ?? ""}
            required
            aria-invalid={Boolean(error)}
            aria-describedby="region-error"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base sm:h-10"
          >
            <option value="">Select a state</option>
            {Object.entries(US_STATES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <Input
            key={country}
            id="region"
            name="region"
            defaultValue={country === countryCode ? region : ""}
            maxLength={80}
            autoComplete="address-level1"
            aria-describedby="region-error"
          />
        )}
        <FieldError id="region-error" message={error} />
      </div>
    </div>
  );
}
