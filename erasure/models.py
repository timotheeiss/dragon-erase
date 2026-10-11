from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Label(str, Enum):
    DELETE = "DELETE"        # item is about the person
    REDACT = "REDACT"        # person mentioned inside someone else's item
    RETAIN = "RETAIN"        # may need to be kept for a legal reason; human review
    NO_ACTION = "NO_ACTION"  # false positive, must not be modified


class Platform(str, Enum):
    SLACK = "slack"
    GMAIL = "gmail"
    SALESFORCE = "salesforce"
    NOTION = "notion"
    DRIVE = "drive"


class Subject(BaseModel):
    """The person an erasure request is about, with every known identifier."""

    full_name: str
    aliases: list[str] = Field(default_factory=list)
    emails: list[str] = Field(default_factory=list)
    phones: list[str] = Field(default_factory=list)
    slack_handle: str | None = None
    crm_contact_id: str | None = None


class Record(BaseModel):
    """One item on a simulated platform."""

    id: str
    platform: Platform
    kind: str                      # message, thread, contact, note, invoice, page, image, sheet, doc
    title: str
    content: str = ""              # text body; empty for binary files
    owner: str | None = None       # who the item belongs to
    file: str | None = None        # path (relative to sim root) of a binary payload
    metadata: dict = Field(default_factory=dict)


class Expectation(BaseModel):
    """Ground truth for a seeded record -- used as test assertions."""

    record_id: str
    label: Label
    reason: str
    open_question: str | None = None  # decision the team has not made yet
