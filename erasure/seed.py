"""Seed the simulated platforms with synthetic data.

Usage: python -m erasure.seed [--root sim_data]
Writes one JSON file per record under <root>/<platform>/, binary payloads for
the Drive image/spreadsheet, and <root>/expected_labels.json (test ground truth).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from openpyxl import Workbook
from PIL import Image, ImageDraw

from .models import Expectation, Label, Platform, Record
from .subject import DECOY_NAME, SARAH

P = Platform
EMAIL, PHONE = SARAH.emails[0], SARAH.phones[0]


def _image(path: Path, lines: list[str], face: bool) -> None:
    img = Image.new("RGB", (640, 360), "#f4f1ea")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 640, 50], fill="#23395d")
    d.text((16, 18), "Northwind Ventures - Berlin Summit 2026", fill="white")
    if face:  # crude stand-in for a portrait so face detection has a target
        d.ellipse([60, 90, 200, 250], fill="#e0b48f", outline="black")
        d.ellipse([95, 140, 110, 155], fill="black")
        d.ellipse([150, 140, 165, 155], fill="black")
        d.arc([100, 180, 160, 225], 20, 160, fill="black", width=3)
    y = 110
    for line in lines:
        d.text((240, y), line, fill="black")
        y += 24
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def _sheet(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Attendees"
    ws.append(["Name", "Email", "Phone", "Company"])
    ws.append(["Marcus Webb", "marcus.webb@example.com", "+1-555-0111", "Alder Capital"])
    ws.append([SARAH.full_name, EMAIL, PHONE, "Northwind Ventures"])
    ws.append(["Priya Nair", "priya.nair@example.com", "+1-555-0177", "Helix Labs"])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def build(root: Path) -> list[tuple[Record, Expectation]]:
    items: list[tuple[Record, Expectation]] = [
        # ---- Slack
        (Record(id="slack-001", platform=P.SLACK, kind="message", title="#deals",
                owner="marcus.webb",
                content="Heads up: Sarah Chen is moving off the Helix account, loop in Priya instead."),
         Expectation(record_id="slack-001", label=Label.REDACT,
                     reason="Names the subject inside another user's message.",
                     open_question="REDACT vs DELETE if the message were her own.")),
        (Record(id="slack-002", platform=P.SLACK, kind="message", title="#general",
                owner="priya.nair",
                content="Sally said she'd bring the deck to the Berlin summit."),
         Expectation(record_id="slack-002", label=Label.REDACT,
                     reason="Refers to the subject by alias 'Sally'.")),
        (Record(id="slack-003", platform=P.SLACK, kind="message", title="#random",
                owner="marcus.webb",
                content="Lunch at 1pm? The new ramen place opened on 5th."),
         Expectation(record_id="slack-003", label=Label.NO_ACTION,
                     reason="Unrelated message; must stay untouched.")),
        # ---- Gmail
        (Record(id="gmail-001", platform=P.GMAIL, kind="thread",
                title="Intro: Northwind x Helix", owner=EMAIL,
                content=f"From: {EMAIL}\nTo: priya.nair@example.com\n\n"
                        f"Hi Priya, great to meet. My number is {PHONE}. Best, Sarah"),
         Expectation(record_id="gmail-001", label=Label.DELETE,
                     reason="Thread sent by the subject; entirely about her.")),
        (Record(id="gmail-002", platform=P.GMAIL, kind="thread",
                title="Re: Q3 partner list", owner="marcus.webb@example.com",
                content="From: marcus.webb@example.com\nTo: priya.nair@example.com\n\n"
                        "Sarah Chen's contact is sarah.chen@northwind-ventures.example if you need her."),
         Expectation(record_id="gmail-002", label=Label.REDACT,
                     reason="Subject's name and email inside a thread between other people.")),
        # ---- Salesforce
        (Record(id="sf-contact-001", platform=P.SALESFORCE, kind="contact",
                title="Contact: Sarah Chen", owner=SARAH.crm_contact_id,
                content=f"{SARAH.full_name} | {EMAIL} | {PHONE} | Northwind Ventures",
                metadata={"contact_id": SARAH.crm_contact_id}),
         Expectation(record_id="sf-contact-001", label=Label.DELETE,
                     reason="CRM contact record belonging to the subject.")),
        (Record(id="sf-note-001", platform=P.SALESFORCE, kind="note",
                title="Call notes - Helix deal", owner="marcus.webb",
                content="Spoke with Sarah Chen about term sheet timing; she prefers calls after 3pm."),
         Expectation(record_id="sf-note-001", label=Label.REDACT,
                     reason="Note about a deal that mentions the subject.",
                     open_question="REDACT or DELETE?")),
        (Record(id="sf-invoice-001", platform=P.SALESFORCE, kind="invoice",
                title="Invoice INV-2026-0417", owner="finance",
                content=f"Billed to: {SARAH.full_name}, Northwind Ventures. Amount: EUR 12,500.",
                metadata={"contact_id": SARAH.crm_contact_id}),
         Expectation(record_id="sf-invoice-001", label=Label.RETAIN,
                     reason="Financial record; likely subject to statutory retention. Flag for human review.")),
        # ---- Notion
        (Record(id="notion-001", platform=P.NOTION, kind="page",
                title="Partnerships sync - meeting notes", owner="priya.nair",
                content="Attendees: Marcus, Priya, our Berlin partnerships lead.\n"
                        "Action: our Berlin partnerships lead to send the revised MoU by Friday."),
         Expectation(record_id="notion-001", label=Label.REDACT,
                     reason="Indirect, role-only reference that resolves to the subject.")),
        # ---- Drive
        (Record(id="drive-001", platform=P.DRIVE, kind="image",
                title="berlin_summit_badge.png", owner="events",
                file="drive/berlin_summit_badge.png",
                metadata={"ocr_text": ["Sarah Chen", "Northwind Ventures", "Speaker"], "has_face": True}),
         Expectation(record_id="drive-001", label=Label.REDACT,
                     reason="Image shows her name (OCR) and face; mask both, strip EXIF.")),
        (Record(id="drive-002", platform=P.DRIVE, kind="sheet",
                title="summit_attendees.xlsx", owner="events",
                file="drive/summit_attendees.xlsx"),
         Expectation(record_id="drive-002", label=Label.DELETE,
                     reason="Delete only her row; other attendees' rows must stay.")),
        (Record(id="drive-003", platform=P.DRIVE, kind="image",
                title="sara_chen_badge.png", owner="events",
                file="drive/sara_chen_badge.png",
                metadata={"ocr_text": [DECOY_NAME, "Alder Capital", "Guest"], "has_face": True}),
         Expectation(record_id="drive-003", label=Label.NO_ACTION,
                     reason="Different person with a near-miss name; must stay untouched.")),
    ]

    for rec, _ in items:
        out = root / rec.platform.value / f"{rec.id}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(rec.model_dump_json(indent=2))

    _image(root / "drive/berlin_summit_badge.png", ["Sarah Chen", "Northwind Ventures", "SPEAKER"], True)
    _image(root / "drive/sara_chen_badge.png", [DECOY_NAME, "Alder Capital", "GUEST"], True)
    _sheet(root / "drive/summit_attendees.xlsx")

    (root / "expected_labels.json").write_text(
        json.dumps([e.model_dump(mode="json") for _, e in items], indent=2))
    return items


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default="sim_data", type=Path)
    args = ap.parse_args()
    items = build(args.root)
    print(f"Seeded {len(items)} records under {args.root}/")


if __name__ == "__main__":
    main()
