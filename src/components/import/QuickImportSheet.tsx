"use client";
/**
 * Paste text (e.g. from Apple Notes) → AI extracts people/facts → mini review → save as notes.
 * With `personId`, that person is the note's owner. (Contract stub; the Import-UI track implements it.)
 */
export type QuickImportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId?: string;
  personName?: string;
  initialText?: string;
};

export function QuickImportSheet(_props: QuickImportSheetProps) {
  return null;
}
