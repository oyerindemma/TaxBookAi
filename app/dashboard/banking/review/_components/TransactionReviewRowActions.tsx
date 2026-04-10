"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  disabled?: boolean;
  canEdit?: boolean;
  onOpen: () => void;
  onMarkReviewed: () => void;
  onFlag: () => void;
  onDelete: () => void;
};

export default function TransactionReviewRowActions({
  disabled,
  canEdit,
  onOpen,
  onMarkReviewed,
  onFlag,
  onDelete,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onOpen}>Edit</DropdownMenuItem>
        {canEdit ? (
          <DropdownMenuItem onClick={onMarkReviewed}>Mark reviewed</DropdownMenuItem>
        ) : null}
        {canEdit ? <DropdownMenuItem onClick={onFlag}>Flag</DropdownMenuItem> : null}
        {canEdit ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
