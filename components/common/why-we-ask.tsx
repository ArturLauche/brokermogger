"use client";

/**
 * "Why we ask this" disclosure.
 *
 * Data minimisation is a product rule, so every collected field carries this
 * control next to its label. It answers three questions: what the value is
 * used for, whether it is required, and how the user gets rid of it later.
 */
import { CircleHelpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface WhyWeAskProps {
  /** Field name as it reads in a sentence, for example "your email address". */
  field: string;
  /** What the value is used for. */
  purpose: string;
  requirement: "required" | "optional";
  /** How the value can be removed later. */
  deletion: string;
  align?: "start" | "center" | "end";
  className?: string;
}

export function WhyWeAsk({
  field,
  purpose,
  requirement,
  deletion,
  align = "start",
  className,
}: WhyWeAskProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn("text-muted-foreground", className)}
        >
          <CircleHelpIcon aria-hidden="true" />
          <span className="sr-only">Why we ask for {field}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80">
        <PopoverHeader>
          <PopoverTitle>Why we ask for {field}</PopoverTitle>
        </PopoverHeader>
        <p className="text-muted-foreground">{purpose}</p>
        <p>
          <span className="font-medium">
            {requirement === "required" ? "Required." : "Optional."}
          </span>{" "}
          <span className="text-muted-foreground">
            {requirement === "required"
              ? "You cannot continue without this field."
              : "You can leave this field empty."}
          </span>
        </p>
        <div>
          <p className="font-medium">Removing it later</p>
          <p className="text-muted-foreground">{deletion}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
