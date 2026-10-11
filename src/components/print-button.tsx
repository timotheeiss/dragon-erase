"use client";
import { Printer } from "lucide-react";
import { Button } from "./ui/button";
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer size={15} /> Print / save PDF
    </Button>
  );
}
