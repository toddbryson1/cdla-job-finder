"use client";

// Print / Save-as-PDF trigger for the carrier brief one-pager. Hidden in
// the printed output itself (print:hidden) so it never appears on the PDF.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
    >
      Save as PDF / Print
    </button>
  );
}
